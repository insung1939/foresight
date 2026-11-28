"""hindsight DB → 시즌 팩(data/season.json). 「타임슬립 개미」의 시장 전체.

    .venv/bin/python scripts/build_season.py      # ~30초(업종 조회는 data/cache 에 저장)

담는 것(모두 주 단위, 주 = 월~일, 종가 = 그 주 마지막 거래일 종가):
- weeks        : 주 시작일(월요일) 목록
- assets       : 게임에 나올 수 있는 종목 풀(국내·미국·코인). 업종(코드네임용), 주별 종가, 주별 언급 수(낙관/비관),
                 주별 대표 유튜브 제목(이름을 ⟦i⟧ 토큰으로 바꿔 둠), 주별 공시 제목
- index        : 코스피 주별 종가
- channels     : 유튜버 51명. 주별 "지난주에 '오른다'고 한 종목을 이번 주 똑같이 나눠 샀다면"의 수익률(고스트 포트폴리오)
- source       : 원천 데이터 규모(데이터 페이지용)

hindsight DB 는 읽기만 한다. 결과에 미래 가격이 들어 있으므로 서버만 갖고, 화면에는 주차별로 공개한다(api/app/season.py).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import psycopg
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from app.masking import mask, name_terms  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache" / "sector.json"
OUT = ROOT / "data" / "season.json"
KST = timezone(timedelta(hours=9))

POOL_KRX, POOL_US, POOL_CRYPTO = 110, 30, 30
FEED_FROM = date(2025, 10, 13)  # 유튜브 언급이 충분히 쌓인 첫 주(월요일)
TITLES_PER_WEEK = 2

load_dotenv(ROOT / ".env")
url = os.environ["HINDSIGHT_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ---------------------------------------------------------------- 1. 읽기
with psycopg.connect(url) as conn:
    conn.execute("set transaction read only")
    q = lambda s, p=None: conn.execute(s, p or ()).fetchall()  # noqa: E731
    assets = {r[0]: {"name": r[1], "aliases": r[2] or [], "symbol": r[3], "market": r[4], "type": r[5], "corp": r[6]}
              for r in q("select asset_id, name, aliases, symbol, market, asset_type, corp_code from market.assets")}
    mentions = q("""select m.asset_id, m.channel_id, m.stance, m.published_at, v.title, coalesce(v.view_count,0)
                    from mentions.mentions m join yt.videos v on v.video_id = m.video_id""")
    prices = q("select asset_id, trade_date, close from market.prices where close is not null order by asset_id, trade_date")
    discs = q("select asset_id, rcept_dt, report_nm, kind from market.disclosures")
    channels = {r[0]: {"name": r[1], "subs": r[2] or 0, "category": r[3]}
                for r in q("select channel_id, title, subscriber_count, category from yt.channels")}
    source = {k: q(f"select count(*) from {t}")[0][0] for k, t in {
        "channels": "yt.channels", "videos": "yt.videos", "mentions": "mentions.mentions",
        "prices": "market.prices", "disclosures": "market.disclosures", "assets": "market.assets"}.items()}
    source["through"] = q("select max(trade_date) from market.prices")[0][0].isoformat()
    conn.rollback()
print(f"종목 {len(assets)} · 언급 {len(mentions):,} · 시세 {len(prices):,} · 공시 {len(discs):,}")

# ---------------------------------------------------------------- 2. 주봉
weekly: dict[str, dict[date, float]] = defaultdict(dict)
for a, d, c in prices:
    weekly[a][monday(d)] = float(c)  # 정렬돼 있으므로 마지막 값 = 그 주 마지막 종가
last = max(monday(d) for _, d, _ in prices[-2000:])
# 아직 금요일 장이 안 끝난 주(주 중간에 돌린 경우)는 빼야 '그 주 종가'가 틀리지 않는다 → 주간 자동 갱신은 일요일에 돈다
if max(d for _, d, _ in prices[-2000:]) < last + timedelta(days=4):
    last -= timedelta(days=7)
WEEKS = []
w = monday(min(d for _, d, _ in prices)) + timedelta(days=7)
while w <= last:
    WEEKS.append(w)
    w += timedelta(days=7)
WI = {w: i for i, w in enumerate(WEEKS)}


def series(a: str) -> list[float | None]:
    out, prev = [], None
    for w in WEEKS:
        v = weekly[a].get(w, prev)
        out.append(v)
        prev = v
    return out


ser = {a: series(a) for a in weekly}
feed0 = WI[FEED_FROM]
print(f"주 {len(WEEKS)}개({WEEKS[0]} ~ {WEEKS[-1]}), 피드 시작 {feed0}주차")


def full(a: str) -> bool:
    s = ser.get(a)
    return bool(s) and all(v is not None and v > 0 for v in s[feed0 - 8:])


# ---------------------------------------------------------------- 3. 종목 풀
def pub_week(ts: datetime) -> date:
    return monday(ts.astimezone(KST).date())


mcount = Counter(m[0] for m in mentions)


def pick(market: str, types: tuple, n: int) -> list[str]:
    c = [a for a, v in assets.items() if v["market"] == market and v["type"] in types and full(a)]
    return sorted(c, key=lambda a: -mcount[a])[:n]


pool = pick("KRX", ("stock",), POOL_KRX) + pick("US", ("stock",), POOL_US) + pick("CRYPTO", ("crypto",), POOL_CRYPTO)
# 주간 자동 갱신: 진행 중·끝난 판이 종목을 번호로 가리키므로 지난 팩의 종목·순서를 그대로 지킨다.
# 지난 종목은 (거래가 멈춰도 마지막 종가로 채워) 남기고, 빠진 자리만 새 종목으로 채워 뒤에 붙인다.
_prev = ROOT / "data" / "season.json"
if _prev.exists() and "--fresh" not in sys.argv:
    old_ids = [x["id"] for x in json.loads(_prev.read_text())["assets"]]
    kept = [a for a in old_ids if a in assets and ser.get(a) and ser[a][-1] is not None]
    lost = [a for a in old_ids if a not in kept]
    want = {"KRX": POOL_KRX, "US": POOL_US, "CRYPTO": POOL_CRYPTO}
    have = Counter(assets[a]["market"] for a in kept)
    extra = []
    for mk, n in want.items():
        extra += [a for a in pool if assets[a]["market"] == mk and a not in kept][: max(0, n - have[mk])]
    if lost:
        print(f"  지난 팩에서 데이터가 사라진 종목 {len(lost)}개: {lost}  → 새 종목 {len(extra)}개로 채움(뒤에 붙임)")
    pool = kept + extra
    for a in pool:  # 거래가 멈춘 종목: 앞쪽 빈 값은 첫 종가로
        s0 = ser[a]
        first = next((v for v in s0 if v is not None), None)
        ser[a] = [v if v is not None else first for v in s0]
print(f"풀 {len(pool)}종목")

# ---------------------------------------------------------------- 4. 업종(코드네임: '반도체 A')
# 업종 캐시: 로컬은 data/cache, 자동 갱신(GitHub Actions)은 pack.enc 에 같이 묶인 data/sector.json 에서 이어받는다
_sc = CACHE if CACHE.exists() else ROOT / "data" / "sector.json"
sector_cache = json.loads(_sc.read_text()) if _sc.exists() else {}
DART_KEY = os.environ.get("DART_KEY", "")
KSIC = [  # (접두사, 업종) — 긴 접두사부터 본다
    ("2927", "반도체장비"), ("2922", "반도체장비"), ("2928", "로봇"), ("2929", "로봇"), ("283", "전선"), ("281", "전력기기"),
    ("2611", "반도체"), ("2612", "반도체"), ("2629", "반도체"), ("2621", "디스플레이"), ("2622", "전자부품"),
    ("2620", "전자부품"), ("262", "전자부품"), ("264", "통신장비"), ("263", "IT하드웨어"), ("265", "가전"),
    ("2820", "2차전지"), ("28202", "2차전지"), ("282", "2차전지"), ("28", "전기장비"), ("27", "정밀기기"),
    ("211", "바이오"), ("212", "제약"), ("21", "제약"), ("204", "화학"), ("20", "화학"), ("22", "화학"),
    ("301", "자동차"), ("302", "자동차"), ("303", "자동차부품"), ("30", "자동차"), ("311", "조선"),
    ("313", "방산·항공"), ("252", "방산·항공"), ("29", "기계"), ("24", "철강·금속"), ("25", "금속"),
    ("35", "전력·에너지"), ("19", "정유"), ("41", "건설"), ("42", "건설"), ("10", "식품"), ("11", "식품"),
    ("12", "담배"), ("13", "섬유·의류"), ("14", "섬유·의류"), ("46", "유통"), ("47", "유통"),
    ("5821", "게임"), ("582", "소프트웨어"), ("62", "소프트웨어"), ("63", "인터넷"), ("61", "통신"),
    ("59", "엔터·미디어"), ("60", "엔터·미디어"), ("90", "엔터·미디어"), ("64992", "지주사"),
    ("715", "지주사"), ("641", "은행"), ("649", "금융"), ("65", "보험"), ("66", "증권"), ("661", "증권"),
    ("64", "금융"), ("70", "바이오"), ("72", "IT서비스"), ("73", "서비스"), ("49", "운송"), ("50", "해운"),
    ("51", "항공"), ("52", "물류"), ("55", "여행·레저"), ("56", "여행·레저"), ("68", "부동산"),
    ("86", "헬스케어"), ("23", "소재"), ("17", "소재"), ("16", "소재"), ("32", "생활용품"), ("33", "생활용품"),
]


NAME_SECTOR = {"삼성전자": "반도체", "LG전자": "가전", "한화시스템": "방산·항공", "현대로템": "방산·항공",
               "두산에너빌리티": "원전", "에코프로": "2차전지", "한전기술": "원전", "원익IPS": "반도체장비",
               "기가비스": "반도체장비", "필옵틱스": "반도체장비", "현대무벡스": "로봇", "대동기어": "기계"}


def ksic_sector(code: str) -> str:
    for p, s in sorted(KSIC, key=lambda x: -len(x[0])):
        if code.startswith(p):
            return s
    return "기타"


US_SECTOR = {
    "AAPL": "미국 빅테크", "MSFT": "미국 빅테크", "GOOGL": "미국 빅테크", "AMZN": "미국 빅테크", "META": "미국 빅테크",
    "NVDA": "미국 반도체", "AMD": "미국 반도체", "AVGO": "미국 반도체", "TSM": "미국 반도체", "INTC": "미국 반도체",
    "QCOM": "미국 반도체", "ARM": "미국 반도체", "SMCI": "미국 반도체", "TSLA": "미국 전기차", "RIVN": "미국 전기차",
    "PLTR": "미국 소프트웨어", "ORCL": "미국 소프트웨어", "CRM": "미국 소프트웨어", "ADBE": "미국 소프트웨어",
    "IONQ": "미국 양자", "RKLB": "미국 우주", "BA": "미국 항공", "COIN": "미국 코인주", "MSTR": "미국 코인주",
    "LLY": "미국 제약", "NVO": "미국 제약", "PFE": "미국 제약", "JNJ": "미국 제약", "HIMS": "미국 헬스케어",
    "JPM": "미국 금융", "V": "미국 결제", "MA": "미국 결제", "BRK-B": "미국 금융", "NFLX": "미국 미디어",
    "DIS": "미국 미디어", "UBER": "미국 플랫폼", "COST": "미국 유통", "WMT": "미국 유통", "NKE": "미국 소비재",
    "SBUX": "미국 소비재", "XOM": "미국 에너지",
}
BIG_COIN = {"BTC", "ETH", "XRP", "SOL"}
MEME_COIN = {"DOGE", "SHIB", "TRUMP", "PEPE", "BONK", "WIF"}

client = httpx.Client(timeout=20)
for a in pool:
    v = assets[a]
    if v["market"] == "KRX":
        if a not in sector_cache and v["corp"] and DART_KEY:
            try:
                r = client.get("https://opendart.fss.or.kr/api/company.json",
                               params={"crtfc_key": DART_KEY, "corp_code": v["corp"]}).json()
                sector_cache[a] = r.get("induty_code", "")
                time.sleep(0.12)
            except Exception as e:  # 네트워크 실패는 '기타'로
                print("업종 조회 실패", a, e)
        v["sector"] = NAME_SECTOR.get(v["name"]) or ksic_sector(sector_cache.get(a, "") or "")
    elif v["market"] == "US":
        v["sector"] = US_SECTOR.get(v["symbol"], "미국 주식")
    else:
        s = v["symbol"].replace("KRW-", "")
        v["sector"] = "대형 코인" if s in BIG_COIN else "밈코인" if s in MEME_COIN else "알트코인"
CACHE.parent.mkdir(parents=True, exist_ok=True)
CACHE.write_text(json.dumps(sector_cache, ensure_ascii=False, indent=0))
(ROOT / "data" / "sector.json").write_text(json.dumps(sector_cache, ensure_ascii=False, indent=0))
print("업종", Counter(assets[a]["sector"] for a in pool).most_common())

# ---------------------------------------------------------------- 5. 제목 가리기: 풀 종목 → ⟦i⟧, 나머지 종목 → ○○
PI = {a: i for i, a in enumerate(pool)}
pool_terms = sorted(
    ((t, i) for a, i in PI.items() for t in {assets[a]["name"], *assets[a]["aliases"], assets[a]["symbol"].replace("KRW-", "")}
     if t and len(t) >= 2),
    key=lambda x: -len(x[0]))
others = name_terms([(v["name"], v["aliases"]) for a, v in assets.items() if a not in PI])
ASCII = re.compile(r"[A-Za-z0-9]")
# 그룹 이름·총수 이름은 종목을 좁혀 주므로 따로 가린다(대소문자 무시)
GROUP = re.compile(r"(삼성|현대|SK|LG|한화|두산|포스코|POSCO|롯데|카카오|네이버|셀트리온|에코프로|HD|정의선|이재용|최태원|구광모|김승연|서정진|이건희)",
                   re.I)


# 시점 단서: 26.02.12 · 2/12 · 26년 · 2026 · CES2026 · 3월 · 1분기 · 추석·설날 → 기간을 짐작하지 못하게
WHEN = [
    (re.compile(r"\[?\(?\b\d{2}[./]\s?\d{1,2}[./]\s?\d{1,2}\.?\s*(\([월화수목금토일]\))?\)?\]?"), ""),
    (re.compile(r"20\d{2}\s*년?"), ""),
    (re.compile(r"(?<![\d.])\d{2}\s*년(?!\s*(만|째|간|동안))"), ""),
    (re.compile(r"\d{1,2}\s*월(?!\s*(급|세))"), "○월"),
    (re.compile(r"[1-4]\s*분기"), "○분기"),
    (re.compile(r"(상|하)반기"), "○반기"),
    (re.compile(r"(추석|설날|설 연휴|크리스마스|연말|연초|새해|신년|산타)"), "○○"),
    (re.compile(r"\b\d{1,2}/\d{1,2}\b"), ""),
    (re.compile(r"[\[(]\s*(○월)?\s*[월화수목금토일]?\s*[\])]"), ""),
]


def when(text: str) -> str:
    for rx, rep in WHEN:
        text = rx.sub(rep, text)
    # 짝 잃은 괄호 정리: '오전 방송] 제목' → '오전 방송 · 제목'
    out, depth = [], {"[": 0, "(": 0}
    for ch in text:
        if ch in "[(":
            depth[ch] += 1
        elif ch in "])":
            o = "[" if ch == "]" else "("
            if depth[o] == 0:
                out.append(" ·")
                continue
            depth[o] -= 1
        out.append(ch)
    text = re.sub(r"\[\s*\]|\(\s*\)", "", "".join(out))
    return re.sub(r"\s{2,}", " ", text).strip(" ,/-·|")


def tokenise(title: str) -> str:
    low = title.lower()
    for t, i in pool_terms:
        tl, start = t.lower(), 0
        while (j := low.find(tl, start)) >= 0:
            k = j + len(t)
            if t.isascii() and ((j > 0 and ASCII.match(title[j - 1])) or (k < len(title) and ASCII.match(title[k]))):
                start = k
                continue
            title = title[:j] + f"⟦{i}⟧" + title[k:]
            low = title.lower()
            start = j + 3
    title = mask(title, {"name": "", "aliases": [], "symbol": ""}, others)
    title = GROUP.sub("○○", title)
    title = when(title)
    return re.sub(r"○○(\s*[,·/]?\s*○○)+", "○○", title)


# ---------------------------------------------------------------- 6. 주별 언급·제목·공시
mc = defaultdict(lambda: [0, 0])                        # (a, wi) → [bull, bear]
best: dict[tuple, list] = defaultdict(list)             # (a, wi) → [(views, title, channel)]
bulls: dict[tuple, set] = defaultdict(set)              # (channel, wi) → {asset}
for a, ch, st, pub, title, views in mentions:
    wi = WI.get(pub_week(pub))
    if wi is None:
        continue
    if st == "bull":
        bulls[(ch, wi)].add(a)
    if a in PI:
        mc[(a, wi)][0 if st == "bull" else 1] += st != "neutral"
        mc[(a, wi)].append(1)  # 전체 언급 수 = len - 2
        best[(a, wi)].append((views, title, ch, st))

CLUE = re.compile(r"[A-Za-z]{3,}|[가-힣]+(맙|닙|셉트|주)\b|\d{2,}")


def clean_disc(nm: str) -> str:
    """공시 제목: 보고서 이름 + (짧고 단서 없는 괄호 설명만). 회사 이름·약 이름·영문 코드는 버린다"""
    nm = re.sub(r"\s+", " ", nm).strip()
    base, _, rest = nm.partition("(")
    base = re.sub(r"^\[[^\]]*\]", "", base).strip()
    detail = rest.rsplit(")", 1)[0].strip() if rest else ""
    detail = tokenise(detail) if detail else ""
    if detail and len(detail) <= 28 and not CLUE.search(detail) and "⟦" not in detail and "○○" not in detail:
        return f"{base} ({detail})"
    return base


disc = defaultdict(list)
for a, d, nm, kind in discs:
    wi = WI.get(monday(d))
    if a in PI and wi is not None and len(disc[(a, wi)]) < 3:
        disc[(a, wi)].append(clean_disc(nm))

out_assets = []
for a in pool:
    v = assets[a]
    n = len(WEEKS)
    ms, titles, ds = [], [], []
    for wi in range(n):
        c = mc.get((a, wi))
        ms.append([len(c) - 2, c[0], c[1]] if c else [0, 0, 0])
        seen, tl = set(), []
        for views, t, ch, st in sorted(best.get((a, wi), []), key=lambda x: -x[0]):
            mt = tokenise(t)
            if len(mt) < 8 or mt in seen:
                continue
            seen.add(mt)
            tl.append({"t": mt, "ch": ch, "st": st[0], "v": views})
            if len(tl) >= TITLES_PER_WEEK:
                break
        titles.append(tl)
        ds.append(disc.get((a, wi), []))
    out_assets.append({"id": a, "name": v["name"], "market": v["market"], "sector": v["sector"],
                       "close": [round(x, 6) for x in ser[a]], "m": ms, "titles": titles, "disc": ds})

# ---------------------------------------------------------------- 7. 유튜버 고스트: 지난주 '오른다'고 한 종목을 이번 주 똑같이 나눠 산다
def wret(a: str, wi: int) -> float | None:
    s = ser.get(a)
    if not s or wi == 0 or not s[wi] or not s[wi - 1]:
        return None
    return s[wi] / s[wi - 1] - 1


out_ch = []
for ch, info in channels.items():
    rets, picks = [], []
    for wi in range(len(WEEKS)):
        held = [a for a in bulls.get((ch, wi - 1), ()) if wret(a, wi) is not None]
        r = sum(wret(a, wi) for a in held) / len(held) if held else 0.0
        rets.append(round(max(-0.9, r), 5))
        picks.append(len(held))
    active = sum(1 for p in picks[feed0:] if p)
    if active >= 8:
        out_ch.append({"id": ch, "name": info["name"], "subs": info["subs"], "cat": info["category"],
                       "r": rets, "n": picks})
print(f"고스트 유튜버 {len(out_ch)}명")

pack = {
    "version": 1,
    "builtAt": datetime.now(KST).isoformat(timespec="seconds"),
    "weeks": [w.isoformat() for w in WEEKS],
    "feedFrom": feed0,
    "index": [round(x, 2) for x in ser["INDEX:KOSPI"]],
    "assets": out_assets,
    "channels": out_ch,
    "channelNames": {k: v["name"] for k, v in channels.items()},
    "source": source,
}
OUT.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")))

# ---------------------------------------------------------------- 8. RAG 문서(개미 비서가 찾아 읽는 것): 종목-주별 영상 제목 최대 4개 + 공시
rag, seen_all = [], set()
for a in pool:
    ai = PI[a]
    for wi in range(feed0 - 4, len(WEEKS)):
        n_t = 0
        for views, t, ch, st in sorted(best.get((a, wi), []), key=lambda x: -x[0]):
            mt = tokenise(t)
            if len(mt) < 8 or (ai, mt) in seen_all:
                continue
            seen_all.add((ai, mt))
            rag.append({"a": ai, "w": wi, "k": "yt", "t": mt, "ch": ch, "st": st[0], "v": views})
            n_t += 1
            if n_t >= 4:
                break
        for d in disc.get((a, wi), []):
            rag.append({"a": ai, "w": wi, "k": "disc", "t": d, "ch": "", "st": "n", "v": 0})
for i, d in enumerate(rag):
    d["id"] = i
(ROOT / "data" / "rag_docs.json").write_text(json.dumps(rag, ensure_ascii=False, separators=(",", ":")))
print(f"RAG 문서 {len(rag):,}개 → data/rag_docs.json (임베딩: scripts/build_rag.py)")
print(f"→ {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")
