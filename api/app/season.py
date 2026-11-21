"""「타임슬립 개미」 게임 엔진 — 서버가 모든 규칙을 가진다(화면은 보여주기만).

한 판 = 26턴(연습 시즌 8턴), 한 턴 = 실제 1주.
  턴 t 의 월요일: 지난주(s+t-1)까지의 종가·언급·공시만 보인다. 지난주 종가로 사고판다.
  [다음 주 ▶]: 이번 주(s+t) 종가로 평가가 바뀐다 → 수익률·멘탈·라이벌 순위 갱신.
미래 정보 차단: 화면에 가는 값은 view() 가 만든다. 다음 주 가격은 턴을 제출해야 계산되고, 진짜 이름·날짜는 끝나야 공개된다.

순수 함수에 가깝게: new_run(seed) → state(dict) / play_turn(state, orders, choice) → (state, week) / view(state) / final(state).
상태는 JSON 하나로 DB 에 저장한다(db.Run.state).
"""
from __future__ import annotations

import hashlib
import json
import math
import random
import re
from pathlib import Path

from .settings import DATA_DIR

SEASON = 26
START_CASH = 10_000_000
HIST = 12                 # 차트에 보여줄 지난 주 수
UNIVERSE = {"KRX": 10, "US": 5, "CRYPTO": 5}
EVENT_TURNS = (3, 7, 11, 15, 19, 23)
MAX_HOLD = 5              # 동시에 담을 수 있는 종목 수
# (매수 수수료, 매도 수수료+세금) — 실제 비율을 단순화
FEES = {"KRX": (0.00015, 0.00215), "US": (0.0025, 0.0025), "CRYPTO": (0.0005, 0.0005)}
MARKET_KO = {"KRX": "국내 주식", "US": "미국 주식", "CRYPTO": "코인"}
LETTERS = "ABCDEFGHJK"

# 시즌 종류: 연습(첫 판, 8주·국내 6종목) · 오늘의 시드 · 자유
MODES = {
    "practice": {"len": 8, "universe": {"KRX": 6}, "events": (3, 6)},
    "daily": {"len": SEASON, "universe": UNIVERSE, "events": EVENT_TURNS},
    "free": {"len": SEASON, "universe": UNIVERSE, "events": EVENT_TURNS},
}

# 내 개미: 특성이 전략을 바꾼다(킥루의 선수 고르기)
CHARS = {
    "office": {"name": "직장인 개미", "cash": 10_000_000, "mental": 70, "salary": 500_000, "perk": "4주마다 월급 +50만 원"},
    "student": {"name": "대학생 개미", "cash": 6_000_000, "mental": 70, "gain_x": 2.0, "perk": "시작 600만 원 · 멘탈 회복 2배"},
    "whale": {"name": "큰손 개미", "cash": 30_000_000, "mental": 70, "loss_x": 1.5, "perk": "시작 3,000만 원 · 손실 때 멘탈 1.5배 깎임"},
    "holder": {"name": "존버 개미", "cash": 10_000_000, "mental": 70, "floor": 20, "fee_x": 2.0, "perk": "멘탈이 20 아래로 안 떨어짐 · 수수료 2배"},
    "trader": {"name": "단타 개미", "cash": 10_000_000, "mental": 70, "fee_x": 0.5, "no_rest": True, "perk": "수수료 절반 · 쉬어도 멘탈 회복 없음"},
    "coin": {"name": "코인 개미", "cash": 10_000_000, "mental": 50, "crypto": True, "perk": "코인 시장이 처음부터 열림 · 시작 멘탈 50"},
}

# 시즌 미션(판마다 3개). 숫자는 정규 시즌 기준, 연습 시즌은 short 값
MISSIONS = {
    "beat2yt": {"label": "유튜버 라이벌 2명 이상 이기기", "icon": "📺"},
    "beat_ix": {"label": "코스피 이기기", "icon": "📊"},
    "calm": {"label": "멘탈 40 아래로 안 떨어지기", "icon": "🧘"},
    "spread": {"label": "3종목 이상 나눠 담은 주 {n}주 이상", "icon": "🧺", "n": 10, "short": 3},
    "nofomo": {"label": "추격 매수 없이 끝내기(거래 3번 이상)", "icon": "🙅"},
    "profit": {"label": "수익률 +{n}% 이상", "icon": "💹", "n": 10, "short": 3},
    "bigwin": {"label": "한 종목으로 +{n}% 찍기", "icon": "🚀", "n": 50, "short": 15},
    "nopanic": {"label": "패닉셀 없이 거래 5번 이상", "icon": "💪"},
    "saver": {"label": "사건에서 투자금 늘리기 {n}번", "icon": "🐷", "n": 2, "short": 1},
}


# ---------------------------------------------------------------- 시즌 팩
class Pack:
    def __init__(self):
        self.data: dict | None = None

    def load(self) -> dict:
        if self.data is None:
            p = Path(DATA_DIR) / "season.json"
            if not p.exists():
                from .datapack import unpack_if_needed
                unpack_if_needed()
            self.data = json.loads(p.read_text())
            self.data["nweeks"] = len(self.data["weeks"])
        return self.data

    @property
    def ok(self) -> bool:
        try:
            self.load()
            return True
        except Exception:
            return False


pack = Pack()


# ---------------------------------------------------------------- 인생 이벤트(매달 한 번)
# effect: cash(원) · mental · skip(이번 주 거래 불가) · buy_hot(가장 화제인 종목을 자산의 x 만큼 자동 매수)
#         · buy_crypto(가장 화제인 코인) · avg_down(가장 많이 잃은 종목 추가 매수) · rumor(무작위 종목 매수)
EVENTS = [
    {"id": "payday", "icon": "💰", "title": "월급날", "body": "통장에 월급이 들어왔다. 이번 달은 얼마나 굴려 볼까?",
     "choices": [{"label": "100만 원 투자 계좌로", "hint": "현금 +100만", "fx": {"cash": 1_000_000}},
                 {"label": "오늘은 치킨 플렉스", "hint": "멘탈 +10", "fx": {"mental": 10}}]},
    {"id": "leading", "icon": "📲", "title": "리딩방 초대", "body": "모르는 번호가 '수익 인증' 단톡방에 초대했다. 이번 주 화제 종목을 같이 사자고 한다.",
     "choices": [{"label": "들어가서 따라 산다", "hint": "화제 1위 종목을 자산 15% 만큼 자동 매수", "fx": {"buy_hot": 0.15, "mental": 4}},
                 {"label": "차단한다", "hint": "아무 일도 없다", "fx": {}}]},
    {"id": "parents", "icon": "🎂", "title": "부모님 생신", "body": "다음 주가 부모님 생신이다.",
     "choices": [{"label": "용돈 30만 원 드린다", "hint": "현금 −30만, 멘탈 +10", "fx": {"cash": -300_000, "mental": 10}},
                 {"label": "이번엔 바빠서…", "hint": "멘탈 −8", "fx": {"mental": -8}}]},
    {"id": "bonus", "icon": "🎉", "title": "성과급", "body": "회사에서 성과급 200만 원이 나왔다!",
     "choices": [{"label": "전부 투자금으로", "hint": "현금 +200만", "fx": {"cash": 2_000_000}},
                 {"label": "반은 여행 간다", "hint": "현금 +100만, 멘탈 +15", "fx": {"cash": 1_000_000, "mental": 15}}]},
    {"id": "trip", "icon": "✈️", "title": "해외 출장", "body": "팀장님이 이번 주 해외 출장을 가 달라고 한다. 가면 폰을 거의 못 본다.",
     "choices": [{"label": "간다", "hint": "이번 주 거래 불가, 멘탈 +6", "fx": {"skip": True, "mental": 6}},
                 {"label": "핑계 대고 뺀다", "hint": "멘탈 −6", "fx": {"mental": -6}}]},
    {"id": "car", "icon": "🚗", "title": "자동차 수리비", "body": "접촉 사고가 났다. 수리비 80만 원이 나왔다.",
     "choices": [{"label": "현금으로 낸다", "hint": "현금 −80만", "fx": {"cash": -800_000}},
                 {"label": "할부로 나눈다", "hint": "현금 −30만, 멘탈 −6", "fx": {"cash": -300_000, "mental": -6}}]},
    {"id": "algo", "icon": "📺", "title": "알고리즘의 습격", "body": "유튜브가 '지금 안 사면 늦는다' 영상만 추천한다.",
     "choices": [{"label": "밤새 본다", "hint": "멘탈 −10", "fx": {"mental": -10}},
                 {"label": "알림을 끈다", "hint": "멘탈 +6", "fx": {"mental": 6}}]},
    {"id": "coin_friend", "icon": "🪙", "title": "코인으로 10배 번 친구", "body": "동창회에서 코인으로 10배 벌었다는 친구가 술을 샀다.",
     "choices": [{"label": "나도 코인 간다", "hint": "가장 화제인 코인을 자산 20% 만큼 자동 매수", "fx": {"buy_crypto": 0.2}},
                 {"label": "축하만 한다", "hint": "멘탈 −5", "fx": {"mental": -5}}]},
    {"id": "tax", "icon": "🧾", "title": "연말정산 환급", "body": "연말정산 환급금 40만 원이 들어왔다.",
     "choices": [{"label": "투자금에 보탠다", "hint": "현금 +40만", "fx": {"cash": 400_000}},
                 {"label": "맛집 투어", "hint": "현금 +10만, 멘탈 +10", "fx": {"cash": 100_000, "mental": 10}}]},
    {"id": "water", "icon": "💧", "title": "선배의 물타기 조언", "body": "회사 선배가 '떨어질 때 더 사야 평단이 낮아진다'고 한다.",
     "choices": [{"label": "가장 많이 잃은 종목을 더 산다", "hint": "손실 1위 종목을 자산 10% 만큼 추가 매수", "fx": {"avg_down": 0.1}},
                 {"label": "흘려듣는다", "hint": "아무 일도 없다", "fx": {}}]},
    {"id": "vacation", "icon": "🏖️", "title": "휴가", "body": "드디어 휴가다. 시장은 잠시 잊을까?",
     "choices": [{"label": "폰 끄고 쉰다", "hint": "이번 주 거래 불가, 멘탈 +15", "fx": {"skip": True, "mental": 15}},
                 {"label": "휴가지에서도 차트", "hint": "멘탈 −5", "fx": {"mental": -5}}]},
    {"id": "rumor", "icon": "🤫", "title": "찌라시", "body": "'다음 주 대형 호재 공시 뜬다더라'는 메시지가 돌고 있다. 출처는 모른다.",
     "choices": [{"label": "믿고 산다", "hint": "찌라시 종목을 자산 10% 만큼 자동 매수", "fx": {"rumor": 0.1}},
                 {"label": "무시한다", "hint": "아무 일도 없다", "fx": {}}]},
    {"id": "flu", "icon": "🤒", "title": "몸살", "body": "며칠째 몸이 안 좋다.",
     "choices": [{"label": "병원 간다", "hint": "현금 −5만, 멘탈 +6", "fx": {"cash": -50_000, "mental": 6}},
                 {"label": "버틴다", "hint": "멘탈 −10", "fx": {"mental": -10}}]},
    {"id": "savings", "icon": "🏦", "title": "적금 만기", "body": "2년 부은 적금 300만 원이 만기됐다.",
     "choices": [{"label": "투자금으로 옮긴다", "hint": "현금 +300만", "fx": {"cash": 3_000_000}},
                 {"label": "비상금으로 둔다", "hint": "멘탈 +12", "fx": {"mental": 12}}]},
]
EV = {e["id"]: e for e in EVENTS}


# ---------------------------------------------------------------- 만들기
def _rng(seed: str) -> random.Random:
    return random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))


def _nice(x: float) -> float:
    """가격 기준값을 보기 좋은 숫자로(유효숫자 2자리)"""
    e = 10 ** max(0, int(math.log10(x)) - 1)
    return round(x / e) * e


def new_run(seed: str, markets: list[str] | None = None, mode: str = "free", char: str = "office") -> dict:
    p = pack.load()
    rng = _rng(seed)
    cfg = MODES.get(mode, MODES["free"])
    L = cfg["len"]
    ch = CHARS.get(char, CHARS["office"])
    n, f0 = p["nweeks"], p["feedFrom"]
    s = rng.randint(f0 + 2, n - L)  # 턴 t 의 가격 주 = s+t, 첫 거래 가격 = s-1 종가
    markets = [m for m in (markets or list(UNIVERSE)) if m in UNIVERSE] or ["KRX"]
    if mode == "practice":
        markets = ["KRX"]
    elif ch.get("crypto") and "CRYPTO" not in markets:
        markets = [*markets, "CRYPTO"]

    # 종목 고르기: 시즌 동안 화제가 된 종목일수록 잘 뽑힌다(피드가 살아 있게)
    chosen = []
    for m, k in cfg["universe"].items():
        cand = [i for i, a in enumerate(p["assets"]) if a["market"] == m]
        w = [1 + math.sqrt(sum(p["assets"][i]["m"][x][0] for x in range(s - 1, s + L))) for i in cand]
        picked: list[int] = []
        while len(picked) < k and cand:
            j = rng.choices(range(len(cand)), weights=w)[0]
            picked.append(cand.pop(j))
            w.pop(j)
        chosen += picked
    # 코드네임: 업종 + 글자(판마다 섞임)
    count: dict[str, int] = {}
    assets = []
    order = chosen[:]
    rng.shuffle(order)
    for i in order:
        a = p["assets"][i]
        c = count.get(a["sector"], 0)
        count[a["sector"]] = c + 1
        base = a["close"][s - 1]
        target = _nice(math.exp(rng.uniform(math.log(4_000), math.log(180_000))))
        assets.append({"i": i, "code": f"{a['sector']} {LETTERS[c]}", "scale": target / base})
    # 라이벌 유튜버 3명: 시즌 동안 '오른다' 언급이 꾸준했던 채널 중에서
    active = [c for c in range(len(p["channels"])) if sum(1 for x in p["channels"][c]["n"][s:s + L] if x) >= max(3, L // 3)]
    rivals = rng.sample(active, k=min(3, len(active)))
    deck = [e["id"] for e in EVENTS]
    rng.shuffle(deck)
    if mode == "practice":  # 연습 시즌은 쉬운 사건부터
        deck = [d for d in ["payday", "bonus", "trip", "leading"] if d in EV][:len(cfg["events"])]
    missions = rng.sample(list(MISSIONS), 3)
    return {
        "v": 2, "seed": seed, "s": s, "t": 0, "len": L, "mode": mode, "char": char if char in CHARS else "office",
        "eventTurns": list(cfg["events"]), "markets": markets,
        "assets": assets, "rivals": rivals, "events": deck[:len(cfg["events"])], "missions": missions, "asks": 0,
        "cash": ch["cash"], "pos": {}, "mental": ch["mental"], "twr": 1.0, "deposits": ch["cash"],
        "hist": [], "traits": {"trades": 0, "fomo": 0, "panic": 0, "cut": 0, "take": 0, "chase_coin": 0,
                               "hold_weeks": 0, "cash_ratio": 0.0, "max_w": 0.0, "events": [],
                               "min_m": ch["mental"], "spread": 0, "max_gain": 0.0, "saves": 0},
        "done": False, "skip": False, "pending": None,
    }


def slen(st: dict) -> int:
    return st.get("len", SEASON)


def _char(st: dict) -> dict:
    return CHARS.get(st.get("char", "office"), CHARS["office"])


def _fee(st: dict, market: str, side: int) -> float:
    return FEES[market][side] * _char(st).get("fee_x", 1.0)


# ---------------------------------------------------------------- 시세 도우미
def _a(st: dict, key: str) -> tuple[dict, dict]:
    idx = int(key)
    meta = st["assets"][idx]
    return meta, pack.load()["assets"][meta["i"]]


def price(st: dict, key: str, week: int) -> float:
    meta, a = _a(st, key)
    return a["close"][week] * meta["scale"]


def value(st: dict, week: int) -> float:
    return st["cash"] + sum(q["qty"] * price(st, k, week) for k, q in st["pos"].items())


def _code_title(st: dict, text: str) -> str:
    """⟦i⟧ 토큰 → 이번 판 코드네임(없는 종목은 ○○)"""
    m = {a["i"]: a["code"] for a in st["assets"]}
    out = re.sub(r"⟦(\d+)⟧", lambda g: m.get(int(g.group(1)), "○○"), text)
    return re.sub(r"○○(\s*[,·/]?\s*○○)+", "○○", out)


def _hype_rank(st: dict, week: int) -> list[str]:
    p = pack.load()
    keys = [str(k) for k in range(len(st["assets"]))]
    return sorted(keys, key=lambda k: -p["assets"][st["assets"][int(k)]["i"]]["m"][week][0])


# ---------------------------------------------------------------- 턴 진행
class GameError(ValueError):
    pass


def _buy(st: dict, key: str, qty: int, week: int, note: list, auto: bool = False) -> None:
    meta, a = _a(st, key)
    if a["market"] not in st["markets"]:
        if auto:
            return
        raise GameError(f"아직 잠긴 시장이에요({MARKET_KO[a['market']]})")
    px = price(st, key, week)
    fee = _fee(st, a["market"], 0)
    if auto:  # 자동 매수는 가진 현금 안에서만
        qty = min(qty, int(st["cash"] / (px * (1 + fee))))
    if qty <= 0:
        return
    cost = qty * px * (1 + fee)
    if cost > st["cash"] + 1:
        raise GameError("현금이 부족해요")
    if key not in st["pos"] and len(st["pos"]) >= MAX_HOLD:
        if auto:
            return
        raise GameError(f"동시에 담을 수 있는 종목은 {MAX_HOLD}개예요")
    pos = st["pos"].setdefault(key, {"qty": 0, "cost": 0.0, "since": st["t"]})
    pos["cost"] = (pos["cost"] * pos["qty"] + qty * px) / (pos["qty"] + qty)
    pos["qty"] += qty
    st["cash"] -= cost
    st["traits"]["trades"] += 1
    note.append({"k": key, "q": qty, "px": round(px, 2), "auto": auto})


def _sell(st: dict, key: str, qty: int, week: int, note: list) -> None:
    meta, a = _a(st, key)
    pos = st["pos"].get(key)
    if not pos or qty <= 0:
        raise GameError("가진 수량보다 많이 팔 수 없어요")
    qty = min(qty, pos["qty"])
    px = price(st, key, week)
    st["cash"] += qty * px * (1 - _fee(st, a["market"], 1))
    gain = px / pos["cost"] - 1
    tr = st["traits"]
    tr["trades"] += 1
    tr["hold_weeks"] += (st["t"] - pos["since"]) * qty / max(pos["qty"], 1)
    if gain <= -0.15:
        tr["cut"] += 1
    elif gain >= 0.1:
        tr["take"] += 1
    pos["qty"] -= qty
    if pos["qty"] <= 0:
        del st["pos"][key]
    note.append({"k": key, "q": -qty, "px": round(px, 2), "gain": round(gain, 4)})


def _apply_event(st: dict, choice: int, week: int, note: list) -> dict:
    eid = st["events"][st["pending"]]
    ev = EV[eid]
    if not 0 <= choice < len(ev["choices"]):
        raise GameError("선택지를 골라 주세요")
    fx = ev["choices"][choice]["fx"]
    v = value(st, week)
    st["cash"] += fx.get("cash", 0)
    if fx.get("cash", 0) > 0:
        st["deposits"] += fx["cash"]
        st["traits"]["saves"] = st["traits"].get("saves", 0) + 1
    st["mental"] = max(0, min(100, st["mental"] + fx.get("mental", 0)))
    st["skip"] = bool(fx.get("skip"))
    p = pack.load()

    def auto_buy(key: str | None, share: float):
        if key is None:
            return
        _buy(st, key, int(v * share / price(st, key, week)), week, note, auto=True)

    rank = [k for k in _hype_rank(st, week) if p["assets"][st["assets"][int(k)]["i"]]["market"] in st["markets"]]
    if fx.get("buy_hot"):
        auto_buy(rank[0] if rank else None, fx["buy_hot"])
        st["traits"]["fomo"] += 1
    if fx.get("buy_crypto"):
        coins = [k for k in _hype_rank(st, week) if p["assets"][st["assets"][int(k)]["i"]]["market"] == "CRYPTO"]
        coins = coins if "CRYPTO" in st["markets"] else rank  # 코인이 잠겨 있으면 가장 화제인 종목으로
        auto_buy(coins[0] if coins else None, fx["buy_crypto"])
        st["traits"]["chase_coin"] += 1
    if fx.get("avg_down") and st["pos"]:
        worst = min(st["pos"], key=lambda k: price(st, k, week) / st["pos"][k]["cost"])
        auto_buy(worst, fx["avg_down"])
    if fx.get("rumor"):
        auto_buy(_rng(st["seed"] + eid).choice(rank) if rank else None, fx["rumor"])
    # 현금이 마이너스면 보유 종목을 비율대로 팔아 메운다
    while st["cash"] < 0 and st["pos"]:
        k = max(st["pos"], key=lambda k: st["pos"][k]["qty"] * price(st, k, week))
        need = math.ceil(-st["cash"] / price(st, k, week) / 0.99)
        _sell(st, k, min(need, st["pos"][k]["qty"]), week, note)
    st["cash"] = max(st["cash"], 0)
    st["traits"]["events"].append([eid, choice])
    st["pending"] = None
    return {"id": eid, "choice": choice}


def choose(st: dict, choice: int) -> dict:
    """이번 주 사건에 답한다(주문 전에). 반환 = {id, choice, trades(자동 매매)}"""
    if st["done"] or st["pending"] is None:
        raise GameError("지금 답할 사건이 없어요")
    note: list = []
    ev = _apply_event(st, choice, st["s"] + st["t"] - 1, note)
    return {**ev, "trades": note}


def play_turn(st: dict, orders: list[dict], choice: int | None = None) -> dict:
    """한 주 진행. orders = [{"k": "3", "q": 10(살 때 +, 팔 때 −)}]. 반환 = 이번 주 결과(week)."""
    if st["done"]:
        raise GameError("이미 끝난 게임이에요")
    s, t = st["s"], st["t"]
    trade_w, next_w = s + t - 1, s + t
    p = pack.load()
    note: list = []
    event = None
    if st["pending"] is not None:
        if choice is None:
            raise GameError("이번 주 사건에 먼저 답해 주세요")
        event = _apply_event(st, choice, trade_w, note)
    if st["skip"] and orders:
        raise GameError("이번 주는 거래할 수 없어요")
    if len(orders) > 20:
        raise GameError("한 주 주문은 20건까지예요")

    hot = set(_hype_rank(st, trade_w)[:2])
    sells = [o for o in orders if int(o["q"]) < 0]
    buys = [o for o in orders if int(o["q"]) > 0]
    for o in sells + buys:
        k = str(o["k"])
        if not k.isdigit() or int(k) >= len(st["assets"]):
            raise GameError("없는 종목이에요")
    snapshot = json.dumps(st)
    try:
        for o in sells:
            _sell(st, str(o["k"]), -int(o["q"]), trade_w, note)
        fomo = 0
        for o in buys:
            k = str(o["k"])
            _buy(st, k, int(o["q"]), trade_w, note)
            a = p["assets"][st["assets"][int(k)]["i"]]
            prev = a["close"][trade_w - 1]
            if k in hot or (prev and a["close"][trade_w] / prev - 1 >= 0.15):
                fomo += 1
        st["traits"]["fomo"] += fomo
    except GameError:
        st.clear()
        st.update(json.loads(snapshot))
        raise

    # 시장이 움직인다
    before = value(st, trade_w)
    after = value(st, next_w)
    r = after / before - 1 if before > 0 else 0.0
    st["twr"] *= 1 + r
    n_trades = len([x for x in note if not x.get("auto")])
    dm, why = 0, []
    if r <= -0.10:
        dm -= 18
        why.append(["큰 손실", -18])
    elif r <= -0.05:
        dm -= 10
        why.append(["손실", -10])
    elif r <= -0.02:
        dm -= 4
        why.append(["작은 손실", -4])
    elif r >= 0.05:
        dm += 6
        why.append(["큰 수익", 6])
    elif r >= 0.02:
        dm += 3
        why.append(["수익", 3])
    ch = _char(st)
    if n_trades == 0 and not ch.get("no_rest"):
        dm += 4
        why.append(["한 주 쉬기", 4])
    if n_trades > 3:
        dm -= (n_trades - 3) * 2
        why.append([f"잦은 매매({n_trades}번)", -(n_trades - 3) * 2])
    if orders and fomo:
        dm -= fomo * 3
        why.append([f"추격 매수 {fomo}번", -fomo * 3])
    if len(st["pos"]) >= 3:
        dm += 1
        why.append(["나눠 담기", 1])
    if ch.get("gain_x") and dm > 0:
        why.append([f"{ch['name']} 회복 ×{ch['gain_x']:g}", round(dm * (ch["gain_x"] - 1))])
        dm = round(dm * ch["gain_x"])
    if ch.get("loss_x") and dm < 0:
        why.append([f"{ch['name']} 멘탈 ×{ch['loss_x']:g}", round(dm * (ch["loss_x"] - 1))])
        dm = round(dm * ch["loss_x"])
    st["mental"] = max(ch.get("floor", 0), min(100, st["mental"] + dm))
    panic = False
    if st["mental"] <= 0 and st["pos"]:
        panic = True
        st["traits"]["panic"] += 1
        st["t"] += 0  # 같은 턴 안에서 정리
        for k in list(st["pos"]):
            _sell(st, k, st["pos"][k]["qty"], next_w, note)
        st["mental"] = 35
    elif st["mental"] <= 0:
        st["mental"] = 20

    # 기록
    w = after if not panic else value(st, next_w)
    tr = st["traits"]
    tr["cash_ratio"] += st["cash"] / w if w else 1
    tr["min_m"] = min(tr.get("min_m", 100), st["mental"])
    if len(st["pos"]) >= 3:
        tr["spread"] = tr.get("spread", 0) + 1
    for k, q in st["pos"].items():
        tr["max_gain"] = max(tr.get("max_gain", 0.0), price(st, k, next_w) / q["cost"] - 1)
    if st["pos"] and w:
        tr["max_w"] += max(q["qty"] * price(st, k, next_w) for k, q in st["pos"].items()) / w
    movers = sorted(
        ((k, p["assets"][st["assets"][int(k)]["i"]]["close"][next_w] / p["assets"][st["assets"][int(k)]["i"]]["close"][trade_w] - 1)
         for k in range(len(st["assets"]))), key=lambda x: -x[1])
    mine = {k: round(price(st, k, next_w) / price(st, k, trade_w) - 1, 4) for k in st["pos"]}
    week = {
        "t": t, "r": round(r, 5), "value": round(w), "mental": st["mental"], "dm": dm, "why": why, "panic": panic,
        "trades": note, "event": event, "mine": mine,
        "top": [[str(k), round(x, 4)] for k, x in movers[:3]], "bottom": [[str(k), round(x, 4)] for k, x in movers[-2:]],
        "index": round(p["index"][next_w] / p["index"][trade_w] - 1, 5),
        "rivals": [round(p["channels"][c]["r"][next_w], 5) for c in st["rivals"]],
    }
    st["hist"].append({"r": week["r"], "v": week["value"], "m": st["mental"], "n": n_trades})
    st["t"] += 1
    st["skip"] = False
    salary = _char(st).get("salary", 0)
    if salary and not st["done"] and st["t"] % 4 == 0 and st["t"] < slen(st):
        st["cash"] += salary
        st["deposits"] += salary
        week["salary"] = salary
    ets = st.get("eventTurns", list(EVENT_TURNS))
    if st["t"] >= slen(st):
        st["done"] = True
    elif st["t"] in ets:
        st["pending"] = ets.index(st["t"])
    return week


def play_weeks(st: dict, n: int) -> list[dict]:
    """빨리 감기: 주문 없이 최대 n 주. 사건이 오거나 끝나면 멈춘다"""
    out = []
    for _ in range(max(1, min(n, 8))):
        if st["done"] or st["pending"] is not None:
            break
        out.append(play_turn(st, []))
        if out[-1]["panic"]:
            break
    return out


# ---------------------------------------------------------------- 화면에 보낼 것(미래 정보 없음)
def _rival_twr(st: dict, c: int, upto: int) -> float:
    p = pack.load()
    v = 1.0
    for w in range(st["s"], upto):
        v *= 1 + p["channels"][c]["r"][w]
    return v


def _index_twr(st: dict, upto: int) -> float:
    p = pack.load()
    return p["index"][upto - 1] / p["index"][st["s"] - 1]


def view(st: dict) -> dict:
    p = pack.load()
    s, t = st["s"], min(st["t"], slen(st))
    w = s + t - 1  # 지금 보이는 마지막 주
    assets = []
    for k, meta in enumerate(st["assets"]):
        a = p["assets"][meta["i"]]
        hist = [round(c * meta["scale"], 2) for c in a["close"][max(0, w - HIST + 1):w + 1]]
        m, mp = a["m"][w], a["m"][w - 1]
        assets.append({
            "k": str(k), "code": meta["code"], "sector": a["sector"], "market": a["market"],
            "locked": a["market"] not in st["markets"],
            "price": hist[-1], "chg": round(hist[-1] / hist[-2] - 1, 5), "hist": hist,
            "hype": m[0], "hypePrev": mp[0], "bull": m[1], "bear": m[2],
            "titles": [{"t": _code_title(st, x["t"]), "ch": _ch_name(x["ch"]), "st": x["st"], "v": x["v"]} for x in a["titles"][w]],
            "disc": a["disc"][w][:2],
        })
    rivals = [{"name": p["channels"][c]["name"], "twr": round(_rival_twr(st, c, s + t), 5),
               "picks": p["channels"][c]["n"][w]} for c in st["rivals"]]
    ix = [round(x / p["index"][s - 1] * 1000, 1) for x in p["index"][max(0, w - HIST + 1):w + 1]]
    pending = None
    if st["pending"] is not None and not st["done"]:
        ev = EV[st["events"][st["pending"]]]
        pending = {"id": ev["id"], "icon": ev["icon"], "title": ev["title"], "body": ev["body"],
                   "choices": [{"label": c["label"], "hint": c["hint"]} for c in ev["choices"]]}
    pos = []
    for k, q in st["pos"].items():
        px = price(st, k, w)
        pos.append({"k": k, "qty": q["qty"], "cost": round(q["cost"], 2), "price": round(px, 2),
                    "value": round(q["qty"] * px), "gain": round(px / q["cost"] - 1, 4)})
    v = value(st, w)
    return {
        "t": st["t"], "season": slen(st), "mode": st.get("mode", "free"), "char": st.get("char", "office"),
        "perk": _char(st)["perk"], "missions": missions_of(st), "asksLeft": ASKS - st.get("asks", 0),
        "done": st["done"], "skip": st["skip"],
        "cash": round(st["cash"]), "value": round(v), "twr": round(st["twr"], 5), "mental": st["mental"],
        "deposits": st["deposits"], "pos": pos, "assets": assets, "index": ix,
        "rivals": rivals, "kospi": round(_index_twr(st, s + t), 5),
        "pending": pending, "hist": st["hist"], "markets": st["markets"], "maxHold": MAX_HOLD,
        "fees": {m: {"buy": f[0], "sell": f[1]} for m, f in FEES.items()},
        "headlines": _headlines(st, w),
    }


_CH: dict[str, str] = {}


def _ch_name(cid: str) -> str:
    if not _CH:
        _CH.update({c["id"]: c["name"] for c in pack.load()["channels"]})
        # 고스트로 못 들어간 채널 이름도 쓰려면 팩에 따로 둔다(없으면 '어느 유튜버')
        _CH.update(pack.load().get("channelNames", {}))
    return _CH.get(cid, "어느 유튜버")


def _headlines(st: dict, w: int) -> list[dict]:
    p = pack.load()
    items = []
    for k, meta in enumerate(st["assets"]):
        for x in p["assets"][meta["i"]]["titles"][w]:
            items.append((x["v"], str(k), x))
    items.sort(key=lambda z: -z[0])
    seen, out = set(), []
    for v, k, x in items:
        t = _code_title(st, x["t"])
        if t in seen:
            continue
        seen.add(t)
        out.append({"k": k, "t": t, "ch": _ch_name(x["ch"]), "st": x["st"], "v": v})
        if len(out) >= 5:
            break
    return out


# ---------------------------------------------------------------- 미션
ASKS = 3  # 개미 비서에게 물을 수 있는 횟수(시즌당)


def missions_of(st: dict, board: list | None = None) -> list[dict]:
    """미션 진행: done(달성) · fail(실패 확정) · ing(진행 중). board 가 있으면 결산(최종 판정)"""
    tr, short = st["traits"], st.get("mode") == "practice"
    end = board is not None
    out = []
    for mid in st.get("missions", []):
        m = MISSIONS[mid]
        n = m.get("short" if short else "n", m.get("n"))
        label = m["label"].format(n=n)
        state = "ing"
        if mid == "beat2yt" and end:
            me = next(b["ret"] for b in board if b["who"] == "me")
            state = "done" if sum(1 for b in board if b["who"] == "yt" and b["ret"] < me) >= 2 else "fail"
        elif mid == "beat_ix" and end:
            me = next(b["ret"] for b in board if b["who"] == "me")
            state = "done" if me > next(b["ret"] for b in board if b["who"] == "index") else "fail"
        elif mid == "calm":
            state = "fail" if tr.get("min_m", 100) < 40 else ("done" if end else "ing")
        elif mid == "spread":
            state = "done" if tr.get("spread", 0) >= n else ("fail" if end else "ing")
        elif mid == "nofomo":
            state = "fail" if tr["fomo"] else ("done" if end and tr["trades"] >= 3 else "fail" if end else "ing")
        elif mid == "profit":
            state = ("done" if st["twr"] - 1 >= n / 100 else "fail") if end else "ing"
        elif mid == "bigwin":
            state = "done" if tr.get("max_gain", 0) >= n / 100 else ("fail" if end else "ing")
        elif mid == "nopanic":
            state = "fail" if tr["panic"] else ("done" if tr["trades"] >= 5 and end else "fail" if end else "ing")
        elif mid == "saver":
            state = "done" if tr.get("saves", 0) >= n else ("fail" if end else "ing")
        out.append({"id": mid, "icon": m["icon"], "label": label, "state": state})
    return out


# ---------------------------------------------------------------- 결산
def title_of(st: dict) -> dict:
    tr, n = st["traits"], max(1, len(st["hist"]))
    trades_per = tr["trades"] / n
    cash_ratio = tr["cash_ratio"] / n
    conc = tr["max_w"] / n
    ret = st["twr"] - 1
    rules = [
        (tr["panic"] >= 1, "패닉셀러", "😱", "멘탈이 바닥나 모두 던진 적이 있어요. 손실을 견딜 만큼만 담는 게 먼저예요."),
        (tr["fomo"] >= 5, "FOMO 장인", "🔥", "화제가 된 종목, 이미 크게 오른 종목을 자주 따라 샀어요."),
        (trades_per >= 3, "단타의 민족", "⚡", "한 주에 세 번 넘게 사고팔았어요. 수수료와 멘탈이 같이 닳아요."),
        (tr["trades"] <= 4 and ret > 0, "존버의 신", "🗿", "거의 건드리지 않고 버텨서 이겼어요."),
        (tr["trades"] <= 4, "방치형 개미", "💤", "거의 거래하지 않았어요. 버티기와 방치는 한 끗 차이예요."),
        (conc >= 0.7, "몰빵러", "🎯", "한 종목 비중이 70%를 넘는 날이 많았어요."),
        (cash_ratio >= 0.6, "현금 수호자", "🛡️", "현금을 60% 넘게 들고 있었어요. 잃지 않았지만 기회도 적었어요."),
        (tr["chase_coin"] >= 1 and ret < 0, "코인 탐험가", "🪙", "코인 바람에 올라탔다가 쓴맛을 봤어요."),
        (tr["take"] > tr["cut"] * 2 and tr["take"] >= 2, "익절 장인", "💎", "오른 종목을 제때 챙겼어요."),
        (tr["cut"] > tr["take"] and tr["cut"] >= 2, "칼손절러", "✂️", "크게 잃은 종목을 미련 없이 정리했어요."),
        (True, "균형 잡힌 개미", "🐜", "분산과 보유 기간이 고른 편이었어요."),
    ]
    for ok, name, icon, why in rules:
        if ok:
            return {"name": name, "icon": icon, "why": why,
                    "stats": {"trades": tr["trades"], "fomo": tr["fomo"], "cashRatio": round(cash_ratio, 3),
                              "concentration": round(conc, 3), "cut": tr["cut"], "take": tr["take"], "panic": tr["panic"]}}
    raise AssertionError


def grade_of(ret: float, rank: int) -> str:
    if rank == 1 and ret >= 0.15:
        return "S"
    if rank == 1 and ret > 0:
        return "A"
    if rank <= 3 and ret > 0:
        return "B"
    if ret >= 0:
        return "C"
    if ret >= -0.15:
        return "D"
    return "F"


def final(st: dict) -> dict:
    if not st["done"]:
        raise GameError("아직 끝나지 않았어요")
    p = pack.load()
    s = st["s"]
    end = s + slen(st)
    me = st["twr"] - 1
    board = [{"who": "me", "name": "나", "ret": round(me, 5)}]
    for c in st["rivals"]:
        board.append({"who": "yt", "name": p["channels"][c]["name"], "ret": round(_rival_twr(st, c, end) - 1, 5)})
    board.append({"who": "index", "name": "코스피 그냥 들고 있기", "ret": round(_index_twr(st, end) - 1, 5)})
    board.sort(key=lambda x: -x["ret"])
    rank = next(i for i, b in enumerate(board, 1) if b["who"] == "me")
    ms = missions_of(st, board)
    stars = sum(1 for m in ms if m["state"] == "done") + {"S": 2, "A": 2, "B": 1}.get(grade_of(me, rank), 0)
    reveal = []
    for k, meta in enumerate(st["assets"]):
        a = p["assets"][meta["i"]]
        reveal.append({"k": str(k), "code": meta["code"], "name": a["name"], "market": a["market"],
                       "ret": round(a["close"][end - 1] / a["close"][s - 1] - 1, 4)})
    reveal.sort(key=lambda x: -x["ret"])
    curves = {"me": [1.0], "index": [1.0], "rivals": [[1.0] for _ in st["rivals"]]}
    v = 1.0
    for h in st["hist"]:
        v *= 1 + h["r"]
        curves["me"].append(round(v, 4))
    for i, c in enumerate(st["rivals"]):
        x = 1.0
        for w in range(s, end):
            x *= 1 + p["channels"][c]["r"][w]
            curves["rivals"][i].append(round(x, 4))
    for w in range(s, end):
        curves["index"].append(round(p["index"][w] / p["index"][s - 1], 4))
    return {
        "ret": round(me, 5), "value": st["hist"][-1]["v"] if st["hist"] else st["deposits"], "deposits": st["deposits"],
        "grade": grade_of(me, rank), "rank": rank, "of": len(board), "board": board,
        "title": title_of(st), "reveal": reveal, "curves": curves, "missions": ms, "stars": stars,
        "mode": st.get("mode", "free"), "char": st.get("char", "office"), "len": slen(st),
        "rivalNames": [p["channels"][c]["name"] for c in st["rivals"]],
        "period": {"from": p["weeks"][s], "to": p["weeks"][end - 1]},
        "weeks": [h["r"] for h in st["hist"]], "mental": [h["m"] for h in st["hist"]],
    }
