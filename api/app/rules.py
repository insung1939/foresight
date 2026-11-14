"""게임 규칙(서버 기준). 화면(apps/web/src/lib/game.ts)과 같은 식을 쓴다.

비중 w: −50(공매도 50%) · 0 · 30 · 70 · 100
- 매수: 수익 = w × 주가 수익률
- 공매도: 빌려서 판 만큼 손익이 반대 + 대차 수수료(연 4%, 거래일 250일 기준 일할)
- 중간 사건이 있으면 사건일 종가에 비중을 바꾼다(앞 구간 결과를 이어서 복리)
- 20일 리플레이 중 아무 날에나 '지금 팔기'(중도 매도) → 그날 종가로 정리, 그 뒤는 현금
- 적중은 처음 판단(w1)의 방향으로만 본다(팔 시점과 무관)
"""
from __future__ import annotations

import random

ROUNDS = 10
START_CASH = 10_000_000
WEIGHTS = (-50, 0, 30, 70, 100)
OPEN_LIMIT = 3
EVENT_ROUNDS = 3
BORROW_FEE = 0.04  # 연
TRADING_DAYS = 250


def at(case: dict, t: int) -> dict:
    return next(p for p in case["chart"] if p["t"] == t)


def fee(w: int, days: int) -> float:
    return (max(-w, 0) / 100) * BORROW_FEE * days / TRADING_DAYS


def value_at(case: dict, w1: int, w2: int, day: int) -> float:
    """산 날(=1)부터 day 거래일째 종가까지 내 돈이 몇 배가 됐나. 사건이 있으면 사건일에 w1 → w2 로 갈아탄다."""
    day = max(0, min(day, 20))
    ev = case.get("event")
    te = ev["t"] if ev else None
    p = lambda t: at(case, t)["p"]  # noqa: E731
    if te is None or day <= te:
        return 1 + (w1 / 100) * (p(day) / 100 - 1) - fee(w1, day)
    v = 1 + (w1 / 100) * (p(te) / 100 - 1) - fee(w1, te)
    return v * (1 + (w2 / 100) * (p(day) / p(te) - 1) - fee(w2, day - te))


def round_return(case: dict, w1: int, w2: int, exit_day: int = 20) -> float:
    """라운드 수익률. exit_day 에 팔면(중도 매도) 그 뒤는 현금."""
    return value_at(case, w1, w2, exit_day) - 1


def is_hit(case: dict, w1: int) -> bool:
    return w1 >= 70 if case["answer"]["r20"] > 0 else w1 <= 30


def youtuber_weight(case: dict) -> int:
    return 100 if case["youtube"]["verdict"] == "bull" else 0


def kospi_return(case: dict) -> float:
    return at(case, 20)["b"] / 100 - 1


def _asset(c: dict) -> str | None:
    return (c.get("private") or {}).get("assetId")


def pick_rounds(cases: list[dict], rng: random.Random | None = None) -> list[dict]:
    """오른 4 · 내린 4 · 보합 2, 그중 중간 사건 EVENT_ROUNDS 개. 첫 라운드는 사건 없는 문제. 한 게임에 같은 종목은 한 번만."""
    rng = rng or random.Random()
    left = {"up": 4, "down": 4, "flat": 2}
    out: list[dict] = []

    def take(pool, n):
        for c in pool:
            if n <= 0:
                break
            if left[c["bucket"]] > 0 and c not in out and _asset(c) not in {_asset(o) for o in out}:
                out.append(c)
                left[c["bucket"]] -= 1
                n -= 1

    ev = [c for c in cases if c.get("event")]
    no = [c for c in cases if not c.get("event")]
    rng.shuffle(ev)
    rng.shuffle(no)
    take(ev, EVENT_ROUNDS)
    take(no, ROUNDS - len(out))
    rest = list(cases)
    rng.shuffle(rest)
    take(rest, ROUNDS - len(out))
    rng.shuffle(out)
    first = next((i for i, c in enumerate(out) if not c.get("event")), 0)
    out[0], out[first] = out[first], out[0]
    return out
