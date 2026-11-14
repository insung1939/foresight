"""문제 은행 품질 점검 → data/quality.json (데이터 페이지 '데이터 품질', 테스트에서도 같은 함수를 쓴다)

    .venv/bin/python scripts/quality.py

점검하는 것
1. 미래 정보 차단: 뉴스는 산 날 15:30(KST) 전, 재무는 산 날 전날까지 접수, 영상·공시는 산 날까지.
2. 이름 가리기: 화면에 나가는 모든 글(영상 제목·공시·핵심 항목·뉴스·사건)에 회사 이름·코드가 남았는지.
3. 정답 일관성: 차트 20일째 값과 정답 수익률이 같은지(시세 계산 오류 검사).
4. 채움률: 문제마다 재무·뉴스·공시 핵심·유튜버 성적이 있는지.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from app.masking import leaks  # noqa: E402
import re  # noqa: E402

CLUE_AMOUNT = re.compile(r"\d[\d,.]*\s*(조|억)")  # 구간으로 바뀌지 않은 절대 금액

KST = timezone(timedelta(hours=9))


def audit(bank: dict, extra: dict) -> dict:
    cases = bank["cases"]
    v = {"newsAfterCutoff": 0, "financeNotBefore": 0, "videoAfterT0": 0, "disclosureAfterT0": 0}
    amounts = 0  # 화면 글에 남은 절대 금액(검색 단서)
    texts = 0
    leak_items: list[str] = []
    mismatch = 0
    cov = {"finance": 0, "news": 0, "facts": 0, "record": 0, "event": 0}
    for c in cases:
        a = c["answer"]
        key = f'{c["private"]["assetId"]}|{a["t0"]}'
        e = extra.get(key, {})
        t0 = datetime.fromisoformat(a["t0"])
        cutoff = datetime(t0.year, t0.month, t0.day, 15, 30, tzinfo=KST)
        target = {"name": a["name"], "symbol": a["symbol"], "aliases": []}

        def look(t: str | None):
            nonlocal texts
            if not t:
                return
            nonlocal amounts
            texts += 1
            if leaks(t, target):
                leak_items.append(f"{key}: {t[:40]}")
            if CLUE_AMOUNT.search(t):
                amounts += 1

        # 1) 미래 정보
        news = e.get("news", {}).get("before", [])
        for n in news:
            at = n.get("at")
            if at and datetime.fromisoformat(at) >= cutoff:
                v["newsAfterCutoff"] += 1
            look(n["title"])
            look(n.get("source"))
        f = e.get("finance")
        if f and f.get("daysBefore", 1) < 1:
            v["financeNotBefore"] += 1
        for vid in c["youtube"]["videos"]:
            if vid["daysBefore"] < 0:
                v["videoAfterT0"] += 1
            look(vid["title"])
        for d in c["disclosures"]["items"]:
            if d["daysBefore"] < 0:
                v["disclosureAfterT0"] += 1
            look(d["title"])
        for doc in e.get("docs", {}).values():
            for ft in doc.get("facts", []):
                look(f'{ft["label"]} {ft["value"]}')
        if c.get("event"):
            cov["event"] += 1
            look(c["event"]["title"])

        # 3) 정답 일관성
        p20 = next(p["p"] for p in c["chart"] if p["t"] == 20)
        if abs(p20 / 100 - 1 - a["r20"]) > 0.002:
            mismatch += 1

        # 4) 채움률
        cov["finance"] += bool(f)
        cov["news"] += bool(news)
        cov["facts"] += any(doc.get("facts") for doc in e.get("docs", {}).values())
        cov["record"] += any(vid.get("record") for vid in c["youtube"]["videos"])

    n = len(cases)
    return {
        "cases": n,
        "future": v,
        "futureViolations": sum(v.values()),
        "textsChecked": texts,
        "leaks": len(leak_items),
        "leakSamples": leak_items[:5],
        "answerMismatch": mismatch,
        "absoluteAmounts": amounts,
        "coverage": {k: {"n": x, "share": round(x / n, 3) if n else 0} for k, x in cov.items()},
        "buckets": bank["summary"].get("buckets"),
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    # 서버가 실제로 내보내는 모양(이름 가리기 + 단서 줄이기 적용 뒤)으로 점검한다
    from app.bank import Bank

    b = Bank()
    q = audit({"cases": b.cases, "summary": b.summary}, b.extra)
    (ROOT / "data" / "quality.json").write_text(json.dumps(q, ensure_ascii=False, indent=1))
    print(json.dumps(q, ensure_ascii=False, indent=1))
