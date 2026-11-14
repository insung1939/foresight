"""유튜브 제목 텍스트 분석(2주차 텍스트 애널리틱스) → data/text.json

    .venv/bin/python scripts/text_analysis.py

hindsight 의 국내 주식 언급(영상 제목 + 20거래일 뒤 수익률)을 읽기만 한다.

1. 토큰화: 형태소 분석기 없이 한글·영문·숫자 덩어리를 자르고 흔한 조사·어미를 떼는 단순 규칙.
   종목 이름(names.json)과 숫자는 뺀다(어떤 종목인지가 아니라 '어떻게 말했는지'를 보려고).
2. c-TF-IDF: '오른다' 제목 묶음과 '내린다' 제목 묶음을 각각 한 문서로 보고, 묶음 안에서는 자주(TF)·
   다른 묶음에는 드물게(IDF) 나오는 단어를 뽑는다 → 각 논조를 대표하는 말.
3. 자극어 분석: '폭등·떡상·무조건' 같은 자극적인 표현이 들어간 '오른다' 제목과 아닌 제목의
   20거래일 뒤 평균 수익률·적중률을 비교한다.
한계: 규칙 토큰화라 '급등주'와 '급등'을 다른 말로 셀 수 있다. 제목만 보고 본문(영상)은 보지 않는다.
"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

HYPE = ["폭등", "급등", "떡상", "대박", "무조건", "지금 당장", "당장", "마지막 기회", "놓치면", "터진다", "터질", "폭발",
        "10배", "100배", "수직", "상한가", "역대급", "충격", "미쳤", "필수", "확정", "강력"]
JOSA = re.compile(r"(으로|에서|까지|부터|에게|한테|이다|입니다|합니다|하는|하고|했다|에는|은|는|이|가|을|를|의|에|도|로|와|과|만|요)$")
STOP = {"주식", "종목", "투자", "오늘", "이번", "지금", "그리고", "진짜", "정말", "관련", "이유", "전망", "분석", "뉴스", "시장",
        "증시", "코스피", "코스닥", "보다", "다음", "이렇게", "대표", "기업", "그냥", "이제", "라이브", "LIVE", "live", "feat", "ft", "shorts", "Shorts", "EP", "ep", "편", "부", "탄"}


def tokens(title: str, names: set[str]) -> list[str]:
    out = []
    for w in re.findall(r"[가-힣A-Za-z][가-힣A-Za-z0-9]{1,}", title):
        w = JOSA.sub("", w)
        if len(w) < 2 or w in STOP or w in names or w.isdigit():
            continue
        out.append(w)
    return out


def ctfidf(groups: dict[str, list[list[str]]], top: int = 15, min_df: int = 8) -> dict[str, list[dict]]:
    tf = {g: Counter(t for doc in docs for t in doc) for g, docs in groups.items()}
    df = Counter(t for docs in groups.values() for doc in docs for t in set(doc))
    total = sum(len(docs) for docs in groups.values())
    avg_len = sum(sum(c.values()) for c in tf.values()) / len(tf)
    out = {}
    for g, c in tf.items():
        n = sum(c.values()) or 1
        scores = []
        for t, f in c.items():
            if df[t] < min_df:
                continue
            other = sum(tf[o][t] for o in tf if o != g)
            idf = math.log(1 + avg_len / (f + other))
            scores.append((f / n * idf * (f / (f + other)), t, f))
        out[g] = [{"word": t, "n": f, "score": round(s * 1000, 3)} for s, t, f in sorted(scores, reverse=True)[:top]]
    return out


def main():
    url = os.environ["HINDSIGHT_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(url) as conn:
        conn.execute("set transaction read only")
        rows = conn.execute("""
            select e.stance, e.r20, v.title
            from stats.event_returns e
            join mentions.mentions m on m.id = e.mention_id
            join yt.videos v on v.video_id = m.video_id
            where e.market = 'KRX' and e.kind = 'stock' and e.r20 is not null and e.stance in ('bull', 'bear')
        """).fetchall()
        conn.rollback()
    names = set(json.loads((ROOT / "data" / "names.json").read_text()))
    groups = {"bull": [], "bear": []}
    for st, _, title in rows:
        groups[st].append(tokens(title, names))
    keywords = ctfidf(groups)

    def stats(xs):
        return {"n": len(xs), "avg": round(sum(r for r in xs) / len(xs), 4) if xs else None,
                "upShare": round(sum(r > 0 for r in xs) / len(xs), 3) if xs else None}

    bull = [(r20, t) for st, r20, t in rows if st == "bull"]
    hype_r = [r for r, t in bull if any(h in t for h in HYPE)]
    calm_r = [r for r, t in bull if not any(h in t for h in HYPE)]
    by_word = []
    for h in HYPE:
        xs = [r for r, t in bull if h in t]
        if len(xs) >= 30:
            by_word.append({"word": h, **stats(xs)})
    by_word.sort(key=lambda x: x["avg"])
    out = {
        "titles": len(rows), "bull": len(groups["bull"]), "bear": len(groups["bear"]),
        "keywords": keywords,
        "hype": {"lexicon": HYPE, "with": stats(hype_r), "without": stats(calm_r), "byWord": by_word},
        "method": "규칙 토큰화(조사 제거·종목명 제외) + c-TF-IDF(논조 묶음별). 자극어는 사전 매칭.",
    }
    (ROOT / "data" / "text.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k != "keywords"}, ensure_ascii=False, indent=1))
    for g, ks in keywords.items():
        print(g, [k["word"] for k in ks])


if __name__ == "__main__":
    main()
