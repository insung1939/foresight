"""hindsight DB → 게임 문제 은행(data/bank.json).

    .venv/bin/python scripts/build_bank.py [--size 150] [--seed 7]

한 문제(case) = 한 종목 × 한 사건일(T0). T0 는 hindsight 기준 "영상을 본 사람이 처음 거래할 수 있는 날"이고,
플레이어는 T0 종가에 산다고 가정한다. 정답은 T0+20거래일 종가 수익률.

원칙
- 문제 화면에 나가는 정보는 전부 T0 종가 시점까지의 것만 쓴다(차트·공시·유튜버 제목).
- 회사 이름·별칭·종목코드·가격 숫자·날짜는 가리고, 가린 뒤에도 이름이 남으면 그 문제는 버린다.
- 유튜버 판단이 분명한 경우(낙관 수 ≠ 비관 수)만 쓴다. 중립 언급은 제목 카드에만 보인다.
- 오른 문제·내린 문제·보합 문제를 섞어, '안 산다'만 골라도 이기는 게임이 되지 않게 한다.
- 중간 사건(event)은 T0+5~14거래일 사이에 실제로 있었던 주요 공시나 하루 ±8% 급등락만 쓴다.

hindsight DB 는 읽기만 한다(연결 1개, 읽기 전용 트랜잭션).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from masking import leaks, name_terms
from masking import mask as _mask

ROOT = Path(__file__).resolve().parents[1]
PRE = 60          # 차트에 보여줄 T0 이전 거래일 수(T0 포함)
HORIZON = 20      # 정답 기간
EVENT_WINDOW = (5, 14)
SHOCK = 0.08      # 하루 등락 이 이상이면 중간 사건
MAJOR_KINDS = {"자금조달", "주요사항", "계약", "실적"}
UP, DOWN = 0.05, -0.05  # 버킷 경계
EVENT_SHARE = 0.4       # 중간 사건이 붙는 문제 비율

ap = argparse.ArgumentParser()
ap.add_argument("--size", type=int, default=500)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--month-cap", type=float, default=0.2, help="한 달에서 뽑는 문제 비율 상한")
ap.add_argument("--asset-gap", type=int, default=60, help="같은 종목을 다시 쓰려면 산 날이 이만큼(일) 떨어져야")
ap.add_argument("--asset-max", type=int, default=4, help="한 종목 최대 문제 수")
ap.add_argument("--out", default=str(ROOT / "data" / "bank.json"))
args = ap.parse_args()
rng = random.Random(args.seed)

load_dotenv(ROOT / ".env")
url = os.environ["HINDSIGHT_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")


# ---------------------------------------------------------------- 1. 읽기
def fetch(conn, sql, params=None):
    return conn.execute(sql, params or ()).fetchall()


with psycopg.connect(url) as conn:
    conn.execute("set transaction read only")

    assets = {
        r[0]: {"name": r[1], "aliases": r[2] or [], "symbol": r[3], "corp": r[4]}
        for r in fetch(conn, "select asset_id, name, aliases, symbol, corp_code from market.assets "
                             "where market='KRX' and asset_type='stock'")
    }
    # 마스킹용: 국내 종목 이름 전체(다른 종목 이름도 힌트가 되므로 가린다)
    all_names = fetch(conn, "select name, aliases from market.assets where market='KRX' and asset_type in ('stock','etf')")

    rows = fetch(conn, """
        select e.asset_id, e.t0_date, e.stance, e.r20, e.x20, v.title, v.view_count, v.published_at, v.channel_id
        from stats.event_returns e
        join mentions.mentions m on m.id = e.mention_id
        join yt.videos v on v.video_id = m.video_id
        where e.market = 'KRX' and e.kind = 'stock' and e.r20 is not null
    """)
    cand_assets = sorted({r[0] for r in rows if r[0] in assets})
    price_rows = fetch(conn, "select asset_id, trade_date, close, volume from market.prices "
                             "where asset_id = any(%s) or asset_id = 'INDEX:KOSPI' order by asset_id, trade_date",
                       (cand_assets,))
    disc_rows = fetch(conn, "select asset_id, rcept_dt, report_nm, kind, rcept_no from market.disclosures "
                            "where asset_id = any(%s) order by rcept_dt", (cand_assets,))
    source = {k: fetch(conn, f"select count(*) from {t}")[0][0] for k, t in {
        "channels": "yt.channels", "videos": "yt.videos", "mentions": "mentions.mentions",
        "prices": "market.prices", "disclosures": "market.disclosures"}.items()}
    total_events = fetch(conn, "select count(*) from stats.event_returns")[0][0]
    source["through"] = fetch(conn, "select max(trade_date) from market.prices")[0][0].isoformat()
    conn.rollback()

print(f"언급 {len(rows):,} · 종목 {len(cand_assets)} · 시세 {len(price_rows):,} · 공시 {len(disc_rows):,}")

prices: dict[str, list[tuple[date, float, float]]] = defaultdict(list)
for a, d, c, v in price_rows:
    if c is not None:
        prices[a].append((d, float(c), float(v or 0)))
kospi = {d: c for d, c, _ in prices.pop("INDEX:KOSPI")}
kospi_dates = sorted(kospi)

discs: dict[str, list[tuple[date, str, str]]] = defaultdict(list)
rcept: dict[tuple[str, date, str], str] = {}
for a, d, nm, k, no in disc_rows:
    discs[a].append((d, nm, k))
    rcept[(a, d, nm)] = no

groups: dict[tuple[str, date], list] = defaultdict(list)
for a, t0, stance, r20, x20, title, views, pub, ch in rows:
    if a in assets:
        groups[(a, t0)].append({"stance": stance, "r20": r20, "x20": x20, "title": title,
                                "views": views or 0, "pub": pub, "ch": ch})


# ---------------------------------------------------------------- 1-2. 유튜버 과거 성적(산 날 전에 결과가 확정된 언급만)
# 언급의 결과(20거래일 뒤 수익률)는 그 언급 t0 + 20거래일이 지나야 알 수 있다.
# 문제의 산 날 T0 보다 '결과 확정일'이 앞선 언급만 성적에 넣는다 → 미래 정보 없음.
def trading_after(d: date, n: int) -> date:
    i = bisect_left(kospi_dates, d)
    return kospi_dates[min(i + n, len(kospi_dates) - 1)] if i + n < len(kospi_dates) else date.max


track: dict[str, list[tuple[date, int]]] = defaultdict(list)   # channel → [(결과 확정일, 맞음 1/0)]
for a, t0, stance, r20, x20, title, views, pub, ch in rows:
    if stance == "neutral" or r20 is None or t0 is None:
        continue
    track[ch].append((trading_after(t0, HORIZON), int((stance == "bull") == (r20 > 0))))
track_dates: dict[str, list[date]] = {}
track_cum: dict[str, list[int]] = {}
for ch, xs in track.items():
    xs.sort()
    track_dates[ch] = [d for d, _ in xs]
    cum, acc = [0], 0
    for _, h in xs:
        acc += h
        cum.append(acc)
    track_cum[ch] = cum


def record(ch: str, t0: date) -> dict | None:
    """T0 전에 결과가 확정된 이 유튜버의 방향 언급 수·적중률. 5번 미만이면 None."""
    ds = track_dates.get(ch)
    if not ds:
        return None
    n = bisect_left(ds, t0)
    if n < 5:
        return None
    return {"n": n, "hit": round(track_cum[ch][n] / n, 3)}


# hindsight 전체 통계(결과 공개·리포트용, 기간 전체)
def side_stats(side: str) -> dict:
    xs = [r20 for _, _, st, r20, *_ in rows if st == side and r20 is not None]
    win = sum((r > 0) if side == "bull" else (r < 0) for r in xs)
    srt = sorted(xs)
    return {"n": len(xs), "avg": round(sum(xs) / max(len(xs), 1), 4),
            "median": round(srt[len(srt) // 2], 4) if srt else 0, "hit": round(win / max(len(xs), 1), 3)}


ch_final = []
for ch, xs in track.items():
    if len(xs) >= 30:
        ch_final.append({"n": len(xs), "hit": round(sum(h for _, h in xs) / len(xs), 3)})
ch_final.sort(key=lambda c: -c["hit"])
hindsight = {"bull": side_stats("bull"), "bear": side_stats("bear"),
             "channels": ch_final, "eventReturns": total_events}


# ---------------------------------------------------------------- 2. 가리기
NAME_TERMS = name_terms(all_names)
PERIODIC_RE = re.compile(r"(분기|반기|사업)보고서")
(ROOT / "data" / "names.json").write_text(json.dumps(NAME_TERMS, ensure_ascii=False))  # 서버·보강 스크립트용


def mask(text: str, target: dict, others: bool = True) -> str:
    return _mask(text, target, NAME_TERMS, others=others)


def clean_report(nm: str) -> str:
    nm = re.sub(r"^\[[^\]]*\]", "", nm)
    return re.sub(r"\s*\(\d{4}\.\d{2}\)", "", nm).strip()


# ---------------------------------------------------------------- 3. 문제 만들기
def kospi_at(d: date) -> float:
    i = bisect_left(kospi_dates, d)
    if i < len(kospi_dates) and kospi_dates[i] == d:
        return kospi[d]
    return kospi[kospi_dates[max(i - 1, 0)]]


def half(d: date) -> str:
    return f"{d.year}년 {'상반기' if d.month <= 6 else '하반기'}"


def build(asset_id: str, t0: date, ms: list) -> dict | None:
    series = prices.get(asset_id) or []
    dates = [s[0] for s in series]
    i = bisect_left(dates, t0)
    if i >= len(dates) or dates[i] != t0 or i < PRE - 1 or i + HORIZON >= len(dates):
        return None
    win = series[i - PRE + 1: i + HORIZON + 1]
    base = win[PRE - 1][1]
    base_k = kospi_at(t0)
    pre_vol = [v for _, _, v in win[:PRE]]
    avg_vol = sum(pre_vol) / len(pre_vol) or 1.0
    points = []
    for j, (d, c, v) in enumerate(win):
        points.append({"t": j - (PRE - 1),
                       "p": round(c / base * 100, 2),
                       "v": round(v / avg_vol, 2),
                       "b": round(kospi_at(d) / base_k * 100, 2)})
    r20 = win[-1][1] / base - 1
    k20 = kospi_at(win[-1][0]) / base_k - 1
    if abs(r20 - ms[0]["r20"]) > 0.005:   # hindsight 계산과 어긋나면 버린다(액면분할 등)
        return None
    if max(abs(win[j][1] / win[j - 1][1] - 1) for j in range(1, len(win))) > 0.35:
        return None

    target = assets[asset_id]
    bull = sum(m["stance"] == "bull" for m in ms)
    bear = sum(m["stance"] == "bear" for m in ms)
    if bull == bear:
        return None

    # 유튜버 카드: 조회수 높은 순 최대 4개, 채널은 문제 안에서만 A·B·C 로
    ch_code: dict[str, str] = {}
    vids = []
    t0_dt = datetime.combine(t0, datetime.min.time(), tzinfo=timezone.utc)
    sided = sorted([m for m in ms if m["stance"] != "neutral"], key=lambda m: -m["views"])[:3]
    rest = sorted([m for m in ms if m["stance"] == "neutral"], key=lambda m: -m["views"])
    for m in (sided + rest)[:4]:
        title = mask(m["title"], target)
        if leaks(title, target) or "A사" not in title:
            return None
        code = ch_code.setdefault(m["ch"], "ABCDEFG"[len(ch_code)])
        pub = m["pub"] if m["pub"].tzinfo else m["pub"].replace(tzinfo=timezone.utc)
        vids.append({"channel": f"유튜버 {code}", "title": title, "stance": m["stance"],
                     "views": m["views"], "daysBefore": max((t0_dt - pub).days, 0),
                     "record": record(m["ch"], t0)})

    # 공시 카드: T0 이전 30일(T0 당일 포함), 지분 보고는 건수로 묶는다
    pre_disc, stake = [], 0
    for d, nm, k in discs.get(asset_id, []):
        if t0 - timedelta(days=30) <= d <= t0:
            if k == "지분":
                stake += 1
            else:
                title = mask(clean_report(nm), target, others=False)
                if leaks(title, target):
                    return None
                pre_disc.append({"kind": k, "title": title, "daysBefore": (t0 - d).days,
                                 "_rcept": rcept.get((asset_id, d, nm))})
    pre_disc = sorted(pre_disc, key=lambda x: (x["kind"] == "기타", x["daysBefore"]))[:6]
    pre_disc.sort(key=lambda x: x["daysBefore"])

    # 중간 사건: T0+5~14거래일 첫 주요 공시 또는 급등락
    event = None
    post_dates = [w[0] for w in win[PRE - 1:]]
    for k in range(EVENT_WINDOW[0], EVENT_WINDOW[1] + 1):
        d_prev, d_k = post_dates[k - 1], post_dates[k]
        hits = [(nm, kd) for d, nm, kd in discs.get(asset_id, [])
                if d_prev < d <= d_k and kd in MAJOR_KINDS and "결과" not in nm
                and not PERIODIC_RE.search(nm)]
        if hits:
            nm, kd = hits[0]
            ev_rcept = next((rcept.get((asset_id, d, n)) for d, n, _ in discs[asset_id] if n == nm and d_prev < d <= d_k), None)
            event = {"t": k, "type": "disclosure", "kind": kd, "_rcept": ev_rcept,
                     "title": mask(clean_report(nm), target, others=False)}
            break
        chg = win[PRE - 1 + k][1] / win[PRE - 2 + k][1] - 1
        if abs(chg) >= SHOCK:
            event = {"t": k, "type": "shock", "change": round(chg, 4),
                     "title": f"하루 만에 {chg:+.1%} {'급등' if chg > 0 else '급락'}"}
            break

    post_disc = [{"date": d.isoformat(), "kind": k, "title": clean_report(nm)}
                 for d, nm, k in discs.get(asset_id, [])
                 if post_dates[0] < d <= post_dates[-1] and k in MAJOR_KINDS]

    ret60 = win[PRE - 1][1] / win[0][1] - 1
    return {
        "period": half(t0),
        "market": "국내 주식",
        "ret60": round(ret60, 4),
        "chart": points,                     # t ≤ 0 은 문제, t > 0 은 결과 공개용
        "youtube": {"bull": bull, "bear": bear,
                    "neutral": sum(m["stance"] == "neutral" for m in ms),
                    "verdict": "bull" if bull > bear else "bear",
                    "videos": vids},
        "disclosures": {"items": pre_disc, "stakeReports": stake},
        "event": event,
        "private": {"assetId": asset_id, "corpCode": target["corp"]},  # 서버 전용
        "answer": {"name": target["name"], "symbol": target["symbol"], "t0": t0.isoformat(),
                   "r20": round(r20, 4), "kospi20": round(k20, 4), "x20": round(r20 - k20, 4),
                   "after": post_disc[:6]},
    }


built = []
for (a, t0), ms in groups.items():
    c = build(a, t0, ms)
    if c:
        c["_asset"] = a
        c["_n"] = len(ms)
        built.append(c)


# ---------------------------------------------------------------- 4. 고르기
def bucket(c):
    r = c["answer"]["r20"]
    return "up" if r >= UP else "down" if r <= DOWN else "flat"


print(f"문제 후보 {len(built):,}", {b: sum(bucket(c) == b for c in built) for b in ("up", "down", "flat")}, "종목", len({c["_asset"] for c in built}))


quota = {"up": round(args.size * 0.4), "down": round(args.size * 0.4)}
quota["flat"] = args.size - quota["up"] - quota["down"]
rng.shuffle(built)
# 언급 많은 문제를 먼저(같으면 무작위)
built.sort(key=lambda c: -min(c["_n"], 4))
picked, used_months = [], defaultdict(int)
used_assets: dict[str, list[date]] = defaultdict(list)   # 같은 종목은 산 날이 args.asset_gap 일 이상 떨어져야
count = defaultdict(int)
for c in built:
    b = bucket(c)
    t0 = date.fromisoformat(c["answer"]["t0"])
    month = c["answer"]["t0"][:7]
    if count[b] >= quota[b] or used_months[month] >= args.size * args.month_cap:
        continue
    if len(used_assets[c["_asset"]]) >= args.asset_max or any(abs((t0 - d).days) < args.asset_gap for d in used_assets[c["_asset"]]):
        continue
    picked.append(c)
    used_assets[c["_asset"]].append(t0)
    used_months[month] += 1
    count[b] += 1

# 중간 사건은 전체의 EVENT_SHARE 만 남긴다(공시 사건 우선)
with_ev = [c for c in picked if c["event"]]
with_ev.sort(key=lambda c: (c["event"]["type"] != "disclosure", rng.random()))
for c in with_ev[round(args.size * EVENT_SHARE):]:
    c["event"] = None
rng.shuffle(picked)
for n, c in enumerate(picked, 1):
    c["id"] = f"c{n:03d}"
    c["bucket"] = bucket(c)
    c.pop("_asset"); c.pop("_n")

yt_right = sum((c["youtube"]["verdict"] == "bull") == (c["answer"]["r20"] > 0) for c in picked)
summary = {
    "cases": len(picked),
    "buckets": dict(count),
    "withEvent": sum(c["event"] is not None for c in picked),
    "youtubeHitRate": round(yt_right / max(len(picked), 1), 3),
    "candidates": len(built),
    "krxMentions": len(rows),
    "hindsight": hindsight,
    "withRecord": sum(any(v["record"] for v in c["youtube"]["videos"]) for c in picked),
    "source": source,
}
out = {"version": 1, "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
       "rules": {"pre": PRE, "horizon": HORIZON, "eventWindow": EVENT_WINDOW, "shock": SHOCK},
       "summary": summary, "cases": picked}
Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str))
print(json.dumps(summary, ensure_ascii=False))
print(f"→ {args.out} ({Path(args.out).stat().st_size / 1024:.0f} KB)")
