"""「타임슬립 개미」 게임 엔진 — 서버가 모든 규칙을 가진다(화면은 보여주기만).

한 판 = 12턴(자유·오늘의 시드) · 8턴(연습 시즌), 한 턴 = 실제 1주.
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

# 후기: 26주는 너무 길어서 끝까지 안 한다 → 메인(자유)도 12주. 옛 판(len 없음)은 26주로 본다
SEASON = 12
OLD_SEASON = 26
START_CASH = 10_000_000
HIST = 12                 # 차트에 보여줄 지난 주 수
UNIVERSE = {"KRX": 10, "US": 5, "CRYPTO": 5}
EVENT_TURNS = (3, 7, 10)
# 오늘의 시드는 짧고 가볍게(후기: '너무 길고 머리를 많이 쓴다') — 12주 · 국내 6 + 미국 3 + 코인 3
DAILY_LEN = 12
DAILY_UNIVERSE = {"KRX": 6, "US": 3, "CRYPTO": 3}
MAX_HOLD = 5              # 동시에 담을 수 있는 종목 수(공매도 포함)
# 공매도: 빌려서 지금 팔고, 나중에 사서 갚는다. 떨어지면 벌고 오르면 잃는다(손실 끝이 없다 → 한도·강제 청산)
SHORT_CAP = 0.5           # 공매도 총액은 총자산의 50%까지
SHORT_STOP = 0.5          # 공매도한 값보다 50% 넘게 오르면 강제로 갚는다(마진콜)
# (매수 수수료, 매도 수수료+세금) — 실제 비율을 단순화
FEES = {"KRX": (0.00015, 0.00215), "US": (0.0025, 0.0025), "CRYPTO": (0.0005, 0.0005)}
MARKET_KO = {"KRX": "국내 주식", "US": "미국 주식", "CRYPTO": "코인"}
LETTERS = "ABCDEFGHJK"

# 시즌 종류: 연습(첫 판, 8주·국내 6종목) · 오늘의 시드(12주·12종목, 모두 같은 시장) · 자유(12주·20종목, 무작위 시장)
MODES = {
    "practice": {"len": 8, "universe": {"KRX": 6}, "events": (3, 6)},
    "daily": {"len": DAILY_LEN, "universe": DAILY_UNIVERSE, "events": (3, 7, 10)},
    "free": {"len": SEASON, "universe": UNIVERSE, "events": EVENT_TURNS},
}
# 자유 플레이는 기간을 고른다(후기: '12주·24주 중 고를 수 있으면') — 기본 12주
FREE_LENS = {12: EVENT_TURNS, 24: (3, 7, 11, 15, 19, 22)}

# 내 개미: 특성이 전략을 바꾼다(킥루의 선수 고르기)
CHARS = {
    "office": {"name": "직장인 개미", "cash": 10_000_000, "mental": 70, "salary": 500_000, "perk": "시작 1,000만 원 · 4주마다 월급 +50만 원"},
    "student": {"name": "대학생 개미", "cash": 6_000_000, "mental": 70, "gain_x": 2.0, "star_bonus": 1, "perk": "시작 600만 원 · 멘탈 회복 2배 · 끝내면 별 +1"},
    "whale": {"name": "큰손 개미", "cash": 30_000_000, "mental": 70, "loss_x": 1.5, "event_x": 3, "slip": 0.003,
              "perk": "시작 3,000만 원 · 인생 사건(월급·성과급·수리비 등)에서 오가는 돈이 3배 · 큰돈이라 살 때 0.3% 비싸게 · 잃으면 멘탈이 1.5배로 깎임"},
    "holder": {"name": "존버 개미", "cash": 10_000_000, "mental": 70, "floor": 20, "fee_x": 2.0, "perk": "시작 1,000만 원 · 멘탈이 20 아래로 안 떨어짐 · 수수료 2배"},
    "trader": {"name": "단타 개미", "cash": 10_000_000, "mental": 70, "fee_x": 0.5, "no_rest": True, "perk": "시작 1,000만 원 · 수수료 절반 · 쉬어도 멘탈 회복 없음"},
    "coin": {"name": "코인 개미", "cash": 10_000_000, "mental": 50, "crypto": True, "fee_market": {"CRYPTO": 0.0, "KRX": 2.0, "US": 2.0},
             "perk": "시작 1,000만 원 · 코인 시장이 처음부터 열림 · 코인 수수료 0 · 주식 수수료 2배 · 시작 멘탈 50"},
}

# 행운 카드: 시즌 시작에 뒤집힌 카드 3장 중 1장(무엇이 나올지는 운) — 발라트로의 조커처럼 쉬운 한 줄 효과
LUCK = {
    "nofee": {"icon": "🎟️", "name": "수수료 면제권", "desc": "이번 시즌 사고팔 때 수수료 0원"},
    "steel": {"icon": "🛡️", "name": "강철 멘탈", "desc": "시작 멘탈 +25, 멘탈 하한 10"},
    "vip": {"icon": "🐳", "name": "범고래 VIP", "desc": "범고래 박사 질문 +3번"},
    "seed": {"icon": "💵", "name": "비상금 발견", "desc": "현금 +300만 원"},
    "stars": {"icon": "🌟", "name": "별똥별", "desc": "미션 별 2배"},
    "golden": {"icon": "🐜", "name": "황금 개미", "desc": "매주 20% 확률로 보너스 +50만 원"},
}
LUCK_BASE = 0.08  # 누구에게나 매주 8% 확률로 작은 행운(🍀)

# 자동 규칙(전략 카드): 정해 두면 매주 서버가 알아서 지킨다 → 빨리 감기와 같이 쓰면 깊이와 속도가 함께
RULES = {
    "stop": {"name": "자동 손절", "desc": "손실이 10% 넘으면 전부 정리한다(공매도는 갚는다)", "v": -0.10},
    "take": {"name": "자동 익절", "desc": "수익이 20% 넘으면 절반 정리한다", "v": 0.20},
    "dca": {"name": "적립식", "desc": "매주 현금 50만 원어치 코스피 ETF 를 산다", "v": 500_000},
    "cap": {"name": "몰빵 방지", "desc": "한 종목이 자산의 40%를 넘으면 넘는 만큼 판다", "v": 0.40},
}
ETF_CODE = "코스피 ETF"


def mental_tier(m: int) -> dict:
    """멘탈 구간 효과: 높으면 유리, 낮으면 판단이 흐려진다(유혹·확인·비용)"""
    if m >= 80:
        return {"id": "calm", "name": "침착", "icon": "😎", "fee_x": 0.0, "desc": "이번 주 수수료 0원"}
    if m >= 50:
        return {"id": "ok", "name": "보통", "icon": "🙂", "fee_x": 1.0, "desc": ""}
    if m >= 30:
        return {"id": "anxious", "name": "불안", "icon": "😐", "fee_x": 1.0, "desc": "화제 종목이 자꾸 눈에 밟혀요"}
    return {"id": "shaky", "name": "흔들림", "icon": "😰", "fee_x": 1.5, "desc": "손이 떨려 수수료 1.5배 · 사고팔 때 한 번 더 확인"}


# 시즌 미션(판마다 3개). 숫자는 정규 시즌 기준, 연습 시즌은 short 값
# 시즌 목표: 라이벌 유튜버 한 명을 정해 이기면 별 +2 (동생 후기 '돈 모아서 뭐 하는지 모르겠다')
GOAL_STARS = 2
# 중간 보상: 수익률이 이 선을 처음 넘는 순간 가구 상자(별) — 결산까지 기다리지 않게
MILES = [(0.05, 1), (0.10, 1), (0.20, 2), (0.35, 3)]
MILES_SHORT = [(0.02, 1), (0.05, 1), (0.10, 2), (0.20, 3)]  # 8주 연습 시즌
MILES_MID = [(0.03, 1), (0.07, 1), (0.14, 2), (0.25, 3)]    # 12주 오늘의 시드


def miles_of(st: dict) -> list:
    L = slen(st)
    return MILES_SHORT if L <= 8 else MILES_MID if L <= 12 else MILES


MISSIONS = {
    "beat2yt": {"label": "유튜버 라이벌 2명 이상 이기기", "icon": "📺"},
    "beat_ix": {"label": "코스피 이기기", "icon": "📊"},
    "calm": {"label": "멘탈 40 아래로 안 떨어지기", "icon": "🧘"},
    "spread": {"label": "3종목 이상 나눠 담은 주 {n}주 이상", "icon": "🧺", "n": 10, "mid": 5, "short": 3},
    "nofomo": {"label": "추격 매수 없이 끝내기(거래 3번 이상)", "icon": "🙅"},
    "profit": {"label": "수익률 +{n}% 이상", "icon": "💹", "n": 10, "mid": 5, "short": 3},
    "bigwin": {"label": "한 종목으로 +{n}% 찍기", "icon": "🚀", "n": 50, "mid": 25, "short": 15},
    "nopanic": {"label": "패닉셀 없이 거래 5번 이상", "icon": "💪"},
    "saver": {"label": "사건에서 투자금 늘리기 {n}번", "icon": "🐷", "n": 2, "mid": 1, "short": 1},
}


# ---------------------------------------------------------------- 시즌 팩
class Pack:
    def __init__(self):
        self.data: dict | None = None

    def relink(self, st: dict) -> dict:
        """저장된 판의 종목 번호(i)를 지금 팩의 번호로 다시 맞춘다(id 기준). id 가 없는 옛 판은 그대로(팩은 순서를 지키며 갱신)"""
        p = self.load()
        ix = p.setdefault("_byid", {a["id"]: i for i, a in enumerate(p["assets"])})
        for a in st.get("assets", []):
            if "id" in a and a["id"] in ix:
                a["i"] = ix[a["id"]]
        return st

    def load(self) -> dict:
        if self.data is None:
            p = Path(DATA_DIR) / "season.json"
            if not p.exists():
                from .datapack import unpack_if_needed
                unpack_if_needed()
            self.data = json.loads(p.read_text())
            self.data["nweeks"] = n = len(self.data["weeks"])
            self.data["etf"] = len(self.data["assets"])  # 코스피 ETF = 지수를 그대로 따라가는 가상 종목(언급·공시 없음)
            self.data["assets"].append({"id": "INDEX:KOSPI", "name": "코스피 지수 ETF", "market": "KRX", "sector": "지수",
                                        "close": self.data["index"], "m": [[0, 0, 0]] * n, "titles": [[]] * n, "disc": [[]] * n})
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


def new_run(seed: str, markets: list[str] | None = None, mode: str = "free", char: str = "office", nonce: str = "", weeks: int | None = None) -> dict:
    p = pack.load()
    rng = _rng(seed)
    cfg = MODES.get(mode, MODES["free"])
    if mode == "free" and weeks in FREE_LENS:
        cfg = {**cfg, "len": weeks, "events": FREE_LENS[weeks]}
    L = cfg["len"]
    ch = CHARS.get(char, CHARS["office"])
    n, f0 = p["nweeks"], p["feedFrom"]
    lo, hi = f0 + 2, n - L
    if mode == "practice":  # 연습은 화제가 많았던 구간에서(광장이 썰렁하지 않게)
        krx = [a for a in p["assets"][:p["etf"]] if a["market"] == "KRX"]
        heat = sorted(range(lo, hi + 1), key=lambda x: -sum(a["m"][w][0] for a in krx for w in range(x - 1, x + L)))
        s = rng.choice(heat[:max(3, len(heat) // 4)])
    else:
        s = rng.randint(lo, hi)  # 턴 t 의 가격 주 = s+t, 첫 거래 가격 = s-1 종가
    markets = [m for m in (markets or list(UNIVERSE)) if m in UNIVERSE] or ["KRX"]
    if mode == "practice":
        markets = ["KRX"]
    elif ch.get("crypto") and "CRYPTO" not in markets:
        markets = [*markets, "CRYPTO"]

    # 종목 고르기: 시즌 동안 화제가 된 종목일수록 잘 뽑힌다(피드가 살아 있게)
    chosen = []
    for m, k in cfg["universe"].items():
        cand = [i for i, a in enumerate(p["assets"][:p["etf"]]) if a["market"] == m]
        pw = 1.0 if mode == "practice" else 0.5  # 연습은 화제 종목 위주
        w = [1 + sum(p["assets"][i]["m"][x][0] for x in range(s - 1, s + L)) ** pw for i in cand]
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
    assets.append({"i": p["etf"], "code": ETF_CODE, "scale": 10_000 / p["index"][s - 1]})  # 코스피 ETF 는 늘 맨 앞
    for i in order:
        a = p["assets"][i]
        c = count.get(a["sector"], 0)
        count[a["sector"]] = c + 1
        base = a["close"][s - 1]
        target = _nice(math.exp(rng.uniform(math.log(4_000), math.log(180_000))))
        assets.append({"i": i, "code": f"{a['sector']} {LETTERS[c]}", "scale": target / base})
    for a in assets:  # 종목 id 도 적어 둔다 → 주간 자동 갱신으로 팩의 순서가 바뀌어도 판이 같은 종목을 가리킨다(relink)
        a["id"] = p["assets"][a["i"]]["id"]
    # 라이벌 유튜버 3명: 시즌 동안 '오른다' 언급이 꾸준했던 채널 중에서
    active = [c for c in range(len(p["channels"])) if sum(1 for x in p["channels"][c]["n"][s:s + L] if x) >= max(3, L // 3)]
    rivals = rng.sample(active, k=min(3, len(active)))
    deck = [e["id"] for e in EVENTS]
    rng.shuffle(deck)
    if mode == "practice":  # 연습 시즌은 쉬운 사건부터
        deck = [d for d in ["payday", "bonus", "trip", "leading"] if d in EV][:len(cfg["events"])]
    missions = rng.sample(list(MISSIONS), 3)
    goal = _rng(f"{seed}|goal").randrange(len(rivals)) if rivals else 0  # 목표 라이벌은 무작위(결과를 보고 고르지 않는다)
    luck = _rng(f"{seed}|{nonce}|luck").sample(list(LUCK), 3)  # 카드 3장(판마다 다르게)
    return {
        "v": 2, "seed": seed, "s": s, "t": 0, "len": L, "mode": mode, "char": char if char in CHARS else "office",
        "eventTurns": list(cfg["events"]), "markets": markets,
        "assets": assets, "rivals": rivals, "events": deck[:len(cfg["events"])], "missions": missions, "asks": 0, "goal": goal, "miles": [],
        "cash": ch["cash"], "pos": {}, "mental": ch["mental"], "twr": 1.0, "deposits": ch["cash"],
        "hist": [], "traits": {"trades": 0, "fomo": 0, "panic": 0, "cut": 0, "take": 0, "chase_coin": 0, "shorts": 0, "margin": 0,
                               "hold_weeks": 0, "cash_ratio": 0.0, "max_w": 0.0, "events": [],
                               "min_m": ch["mental"], "spread": 0, "max_gain": 0.0, "saves": 0},
        "done": False, "skip": False, "pending": None, "nonce": nonce,
        "luckCards": luck, "luck": None, "rules": {}, "chase": {},
    }


def slen(st: dict) -> int:
    return st.get("len", OLD_SEASON)


def _char(st: dict) -> dict:
    return CHARS.get(st.get("char", "office"), CHARS["office"])


def _fee(st: dict, market: str, side: int) -> float:
    if st.get("luck") == "nofee":
        return 0.0
    ch = _char(st)
    x = ch.get("fee_x", 1.0) * ch.get("fee_market", {}).get(market, 1.0) * mental_tier(st["mental"])["fee_x"]
    return FEES[market][side] * x + (ch.get("slip", 0.0) if side == 0 else 0.0)


def _ask_limit(st: dict) -> int:
    return ASKS + (3 if st.get("luck") == "vip" else 0)


def pick_luck(st: dict, idx: int) -> dict:
    """행운 카드 한 장 뒤집기(시즌 처음, 첫 주 전에 한 번)"""
    if st.get("luck") or st["t"] > 0 or not st.get("luckCards"):
        raise GameError("지금은 카드를 뽑을 수 없어요")
    if not 0 <= idx < len(st["luckCards"]):
        raise GameError("카드를 골라 주세요")
    lid = st["luckCards"][idx]
    st["luck"] = lid
    if lid == "steel":
        st["mental"] = min(100, st["mental"] + 25)
    if lid == "seed":
        st["cash"] += 3_000_000
        st["deposits"] += 3_000_000
    return {"id": lid, **LUCK[lid], "others": [{"id": x, **LUCK[x]} for x in st["luckCards"] if x != lid]}


def set_rules(st: dict, rules: dict) -> dict:
    st["rules"] = {k: bool(v) for k, v in rules.items() if k in RULES and v}
    return st["rules"]


# ---------------------------------------------------------------- 시세 도우미
def _a(st: dict, key: str) -> tuple[dict, dict]:
    idx = int(key)
    meta = st["assets"][idx]
    return meta, pack.load()["assets"][meta["i"]]


def price(st: dict, key: str, week: int) -> float:
    meta, a = _a(st, key)
    return a["close"][week] * meta["scale"]


def value(st: dict, week: int) -> float:
    """총자산 = 현금 + 보유 평가액 − 공매도 갚을 돈(qty 가 음수라 저절로 빠진다)"""
    return st["cash"] + sum(q["qty"] * price(st, k, week) for k, q in st["pos"].items())


def gain_of(q: dict, px: float) -> float:
    """내 쪽에서 본 수익률: 보유는 오르면 +, 공매도는 떨어지면 +"""
    g = px / q["cost"] - 1
    return g if q["qty"] > 0 else -g


def short_used(st: dict, week: int) -> float:
    return sum(-q["qty"] * price(st, k, week) for k, q in st["pos"].items() if q["qty"] < 0)


def longs(st: dict) -> list[str]:
    return [k for k, q in st["pos"].items() if q["qty"] > 0]


# 코드네임을 뚫는 단서: 영문 제품·기술 코드(HBM4·H100·ALT-B4)와 공장·단지 이름(대산단지·평택캠퍼스)
_CODE_WORD = re.compile(r"\b[A-Za-z]*[A-Z][A-Za-z]*\d[\w-]*\b|\b[A-Z]{3,}\b")
_ALLOWED = {"ETF", "CEO", "IPO", "PER", "PBR", "ROE", "EPS", "FOMC", "CPI", "PPI", "GDP", "USA", "ESS", "GPU", "CPU", "IT",
            "TV", "PB", "WM", "KOSPI", "KOSDAQ", "NASDAQ", "SPAC", "MSCI", "AI", "EV", "DART", "LIVE", "NEWS", "TOP", "BEST",
            "FED", "IMF", "OPEC", "NATO", "USD", "KRW", "MTS", "HTS", "ISA", "IRP", "VIP", "PICK", "SNS", "MZ", "CES"}
_PLACE = re.compile(r"[가-힣]{2,4}(단지|공장|캠퍼스|사업장|산단|팹|제철소|조선소|연구소)")


# 숫자 단서: '86K'·'3800선'·'5,000선'·'24만'·'12.1조'·'7,300억'·'112달러' 는 시점(언제인지)이나 회사를 알려 준다.
# 회사 이름을 가려도 '언제'를 모르면 다음 주 가격은 알 수 없다 → 시점을 알려 주는 숫자를 가리는 게 핵심이다.
_NUM_CLUE = re.compile(
    r"\b\d+(?:\.\d+)?\s?[Kk]\b"                                    # 86K
    r"|\d[\d,]*(?:\.\d+)?\s*(?:조|억|만|천)(?:\s*\d[\d,]*\s*(?:억|만|천))?\s*(?:원|달러|불)?"  # 12.1조 원, 1조 6천억, 24만
    r"|\d[\d,]*(?:\.\d+)?\s*(?:달러|불)"                                # 112달러
    r"|[$＄]\s?\d[\d,.]*"                                            # $95
    r"|\d[\d,]{2,}\s*(?:선|p|P|포인트)(?![가-힣])"                         # 3800선, 23000p
    r"|(?<=코스피 )\d[\d,]{2,}|(?<=코스닥 )\d[\d,]{2,}|(?<=○○ )\d[\d,]{3,}(?=\s)"
)
# 팩에 없는 회사·인물(제목에 자주 나와 회사·시점을 드러내는 것) — 데이터 전수 검사로 찾은 것 위주
_EXTRA_NAMES = re.compile(
    r"마이클\s?세일러|세일러|스트래티지|마이크로스트래티지|비트마인|아이렌|바이낸스|블랙록|마이크론|뉴스케일\s?파워|뉴스케일|팔란[디티]어|"
    r"젠슨\s?황|일론\s?머스크|머스크|이재용|최태원|정의선|구광모|폴\s?앳킨스|마운자로|위고비|폭스콘|TSMC|브로드컴|퀄컴|"
    r"엔비디아|테슬라|구글|아마존|넷플릭스|삼전|하닉|하이닉스|엔솔|현차|샌디스크|코어위브|네비우스|리게티|콸컴|스페이스\s?X"
)
_PERSON = re.compile(r"[가-힣]{3}(?=\s?(?:차장|연구원|팀장|부장|애널리스트|기자|교수|박사|작가))")


def _scrub(text: str) -> str:
    text = _CODE_WORD.sub(lambda g: g.group(0) if g.group(0).upper() in _ALLOWED else "○○", text)
    text = _PLACE.sub(lambda g: "○○" + g.group(1), text)
    text = _EXTRA_NAMES.sub("○○", text)
    text = _PERSON.sub("○○○", text)
    return _NUM_CLUE.sub(lambda g: re.sub(r"\d[\d,.]*", "○", g.group(0)), text)


def _code_title(st: dict, text: str) -> str:
    """⟦i⟧ 토큰 → 이번 판 코드네임(없는 종목은 ○○), 회사를 좁혀 주는 단서도 지운다"""
    m = {a["i"]: a["code"] for a in st["assets"]}
    out = _scrub(re.sub(r"⟦(\d+)⟧", lambda g: f"⟦{g.group(1)}⟧", text))
    out = re.sub(r"⟦(\d+)⟧", lambda g: m.get(int(g.group(1)), "○○"), out)
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
    held = st["pos"].get(key)
    if held and held["qty"] < 0:  # 공매도 갚기(사서 돌려준다)
        if auto:
            return  # 사건·규칙의 자동 매수는 공매도 종목을 건드리지 않는다
        _cover(st, key, qty, week, note)
        return
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


def _cover(st: dict, key: str, qty: int, week: int, note: list, rule: str | None = None) -> None:
    meta, a = _a(st, key)
    pos = st["pos"][key]
    qty = min(qty, -pos["qty"])
    if qty <= 0:
        return
    px = price(st, key, week)
    cost = qty * px * (1 + _fee(st, a["market"], 0))
    if cost > st["cash"] + 1 and not rule:
        raise GameError("공매도를 갚을 현금이 부족해요")
    st["cash"] -= cost
    gain = gain_of(pos, px)
    tr = st["traits"]
    tr["trades"] += 1
    if gain <= -0.15:
        tr["cut"] += 1
    elif gain >= 0.1:
        tr["take"] += 1
    pos["qty"] += qty
    if pos["qty"] >= 0:
        del st["pos"][key]
    note.append({"k": key, "q": qty, "px": round(px, 2), "gain": round(gain, 4), "cover": True, **({"auto": True, "rule": rule} if rule else {})})


def _short(st: dict, key: str, qty: int, week: int, note: list) -> None:
    """공매도: 빌려서 지금 판다. 받은 돈은 현금으로 들어오고, 갚을 의무(음수 수량)가 생긴다"""
    meta, a = _a(st, key)
    if a["market"] not in st["markets"]:
        raise GameError(f"아직 잠긴 시장이에요({MARKET_KO[a['market']]})")
    if qty <= 0:
        return
    pos = st["pos"].get(key)
    if pos and pos["qty"] > 0:
        raise GameError("가진 종목은 공매도 대신 '팔기'를 써요")
    if not pos and len(st["pos"]) >= MAX_HOLD:
        raise GameError(f"동시에 담을 수 있는 종목은 {MAX_HOLD}개예요(공매도 포함)")
    px = price(st, key, week)
    if short_used(st, week) + qty * px > SHORT_CAP * value(st, week) + 1:
        raise GameError(f"공매도는 총자산의 {int(SHORT_CAP * 100)}%까지만 할 수 있어요")
    st["cash"] += qty * px * (1 - _fee(st, a["market"], 1))
    pos = st["pos"].setdefault(key, {"qty": 0, "cost": 0.0, "since": st["t"]})
    pos["cost"] = (pos["cost"] * -pos["qty"] + qty * px) / (-pos["qty"] + qty)
    pos["qty"] -= qty
    st["traits"]["trades"] += 1
    st["traits"]["shorts"] = st["traits"].get("shorts", 0) + 1
    note.append({"k": key, "q": -qty, "px": round(px, 2), "short": True})


def _close(st: dict, key: str, week: int, note: list, rule: str | None = None, part: float = 1.0) -> None:
    """보유든 공매도든 정리(규칙·패닉·마진콜용)"""
    q = st["pos"][key]
    n = abs(q["qty"]) if part >= 1 else abs(q["qty"]) // 2
    if n <= 0:
        return
    if q["qty"] > 0:
        _sell(st, key, n, week, note)
        if rule:
            note[-1].update(auto=True, rule=rule)
    else:
        _cover(st, key, n, week, note, rule=rule or "close")


def _sell(st: dict, key: str, qty: int, week: int, note: list) -> None:
    meta, a = _a(st, key)
    pos = st["pos"].get(key)
    if pos and pos["qty"] < 0:
        raise GameError("공매도한 종목은 '갚기'로 정리해요")
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
    fx = dict(ev["choices"][choice]["fx"])
    if fx.get("cash"):
        fx["cash"] = fx["cash"] * _char(st).get("event_x", 1)
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
    if fx.get("avg_down") and longs(st):
        worst = min(longs(st), key=lambda k: price(st, k, week) / st["pos"][k]["cost"])
        auto_buy(worst, fx["avg_down"])
    if fx.get("rumor"):
        auto_buy(_rng(st["seed"] + eid).choice(rank) if rank else None, fx["rumor"])
    # 현금이 마이너스면 보유 종목을 비율대로 팔아 메운다
    while st["cash"] < 0 and longs(st):
        k = max(longs(st), key=lambda k: st["pos"][k]["qty"] * price(st, k, week))
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

    hot = set(_hype_rank(st, trade_w)[:2]) - {"0"}  # 코스피 ETF 는 추격 매수가 아니다
    sells = [o for o in orders if int(o["q"]) < 0 and not o.get("s")]
    shorts = [o for o in orders if int(o["q"]) < 0 and o.get("s")]
    buys = [o for o in orders if int(o["q"]) > 0]
    for o in sells + shorts + buys:
        k = str(o["k"])
        if not k.isdigit() or int(k) >= len(st["assets"]):
            raise GameError("없는 종목이에요")
    snapshot = json.dumps(st)
    try:
        for o in sells:
            _sell(st, str(o["k"]), -int(o["q"]), trade_w, note)
        for o in shorts:
            _short(st, str(o["k"]), -int(o["q"]), trade_w, note)
        fomo = 0
        for o in buys:
            k = str(o["k"])
            covering = k in st["pos"] and st["pos"][k]["qty"] < 0
            _buy(st, k, int(o["q"]), trade_w, note)
            if covering:
                continue  # 공매도 갚기는 추격 매수가 아니다
            a = p["assets"][st["assets"][int(k)]["i"]]
            prev = a["close"][trade_w - 1]
            if k in hot or (k != "0" and prev and a["close"][trade_w] / prev - 1 >= 0.15):
                fomo += 1
                st.setdefault("chase", {})[k] = True  # 추격 매수 표시: 다음 주에 떨어지면 '물림'으로 멘탈이 깎인다
        st["traits"]["fomo"] += fomo
    except GameError:
        st.clear()
        st.update(json.loads(snapshot))
        raise

    # 자동 규칙(전략 카드) — 내 주문 다음에 서버가 지킨다
    _apply_rules(st, trade_w, note)

    # 시장이 움직인다
    before = value(st, trade_w)
    after = value(st, next_w)
    r = after / before - 1 if before > 0 else 0.0
    # 공매도 마진콜: 공매도한 값보다 50% 넘게 오르면 이번 주 종가로 강제로 갚는다
    margin = [k for k, q in st["pos"].items() if q["qty"] < 0 and price(st, k, next_w) >= q["cost"] * (1 + SHORT_STOP)]
    for k in margin:
        _close(st, k, next_w, note, rule="margin")
        st["traits"]["margin"] = st["traits"].get("margin", 0) + 1
    st["twr"] *= 1 + r
    n_trades = len([x for x in note if not x.get("auto")])
    dm, why = 0, []
    # 추격 매수는 '산 순간'이 아니라 '물렸을 때' 아프다(벌면 벌점 없음)
    bitten = [k for k in list(st.get("chase", {})) if k in st["pos"] and price(st, k, next_w) < price(st, k, trade_w)]
    st["chase"] = {}
    if bitten:
        dm -= 4 * len(bitten)
        why.append([f"추격 매수 물림 {len(bitten)}개", -4 * len(bitten)])
    if margin:
        dm -= 8 * len(margin)
        why.append([f"공매도 강제 청산 {len(margin)}개", -8 * len(margin)])
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
    if len(st["pos"]) >= 3:
        dm += 1
        why.append(["나눠 담기", 1])
    if ch.get("gain_x") and dm > 0:
        why.append([f"{ch['name']} 회복 ×{ch['gain_x']:g}", round(dm * (ch["gain_x"] - 1))])
        dm = round(dm * ch["gain_x"])
    if ch.get("loss_x") and dm < 0:
        why.append([f"{ch['name']} 멘탈 ×{ch['loss_x']:g}", round(dm * (ch["loss_x"] - 1))])
        dm = round(dm * ch["loss_x"])
    floor = max(ch.get("floor", 0), 10 if st.get("luck") == "steel" else 0)
    st["mental"] = max(floor, min(100, st["mental"] + dm))
    panic = False
    if st["mental"] <= 0 and st["pos"]:
        panic = True
        st["traits"]["panic"] += 1
        st["t"] += 0  # 같은 턴 안에서 정리
        for k in sorted(st["pos"], key=lambda k: st["pos"][k]["qty"] < 0):  # 보유부터 팔고 공매도를 갚는다
            _close(st, k, next_w, note, rule="panic")
        st["mental"] = 35
    elif st["mental"] <= 0:
        st["mental"] = 20

    # 기록
    w = after if not panic else value(st, next_w)
    tr = st["traits"]
    tr["cash_ratio"] += min(1.0, max(0.0, st["cash"] / w)) if w else 1
    tr["min_m"] = min(tr.get("min_m", 100), st["mental"])
    if len(st["pos"]) >= 3:
        tr["spread"] = tr.get("spread", 0) + 1
    for k, q in st["pos"].items():
        tr["max_gain"] = max(tr.get("max_gain", 0.0), gain_of(q, price(st, k, next_w)))
    if st["pos"] and w:
        tr["max_w"] += max(abs(q["qty"]) * price(st, k, next_w) for k, q in st["pos"].items()) / w
    movers = sorted(
        ((k, p["assets"][st["assets"][int(k)]["i"]]["close"][next_w] / p["assets"][st["assets"][int(k)]["i"]]["close"][trade_w] - 1)
         for k in range(len(st["assets"]))), key=lambda x: -x[1])
    # 내 종목의 이번 주 손익률(공매도는 떨어져야 +)
    mine = {k: round((price(st, k, next_w) / price(st, k, trade_w) - 1) * (1 if q["qty"] > 0 else -1), 4) for k, q in st["pos"].items()}
    week = {
        "t": t, "r": round(r, 5), "value": round(w), "mental": st["mental"], "dm": dm, "why": why, "panic": panic,
        "trades": note, "event": event, "mine": mine,
        "top": [[str(k), round(x, 4)] for k, x in movers[:3]], "bottom": [[str(k), round(x, 4)] for k, x in movers[-2:]],
        "index": round(p["index"][next_w] / p["index"][trade_w] - 1, 5),
        "rivals": [round(p["channels"][c]["r"][next_w], 5) for c in st["rivals"]],
        "luck": _weekly_luck(st, t),
    }
    hit = [at for at, _ in miles_of(st) if st["twr"] - 1 >= at and at not in st.setdefault("miles", [])]
    st["miles"] += hit
    week["miles"] = [{"at": at, "stars": n} for at, n in miles_of(st) if at in hit]
    st["hist"].append({"r": week["r"], "v": week["value"], "m": st["mental"], "n": n_trades})
    st["t"] += 1
    st["skip"] = False
    salary = _char(st).get("salary", 0)
    if salary and not st["done"] and st["t"] % 4 == 0 and st["t"] < slen(st):
        st["cash"] += salary
        st["deposits"] += salary
        week["salary"] = salary
    ets = st.get("eventTurns", [3, 7, 11, 15, 19, 23])  # 옛 26주 판
    if st["t"] >= slen(st):
        st["done"] = True
    elif st["t"] in ets:
        st["pending"] = ets.index(st["t"])
    return week


def _apply_rules(st: dict, week: int, note: list) -> None:
    rules = st.get("rules") or {}
    if not rules or st.get("skip"):
        return
    for k in list(st["pos"]):
        q = st["pos"][k]
        gain = gain_of(q, price(st, k, week))
        if rules.get("stop") and gain <= RULES["stop"]["v"]:
            _close(st, k, week, note, rule="stop")
        elif rules.get("take") and gain >= RULES["take"]["v"] and abs(q["qty"]) >= 2:
            _close(st, k, week, note, rule="take", part=0.5)
    if rules.get("dca"):
        px = price(st, "0", week)
        qty = int(min(RULES["dca"]["v"], st["cash"]) / (px * (1 + _fee(st, "KRX", 0))))
        etf_short = "0" in st["pos"] and st["pos"]["0"]["qty"] < 0
        if qty > 0 and not etf_short and ("0" in st["pos"] or len(st["pos"]) < MAX_HOLD):
            _buy(st, "0", qty, week, note, auto=True)
            note[-1]["rule"] = "dca"
    if rules.get("cap"):
        v = value(st, week)
        for k in list(st["pos"]):
            q = st["pos"][k]
            over = abs(q["qty"]) * price(st, k, week) - v * RULES["cap"]["v"]
            if over > 0:
                n = min(math.ceil(over / price(st, k, week)), abs(q["qty"]))
                if n > 0 and q["qty"] > 0:
                    _sell(st, k, n, week, note)
                    note[-1].update(auto=True, rule="cap")
                elif n > 0:
                    _cover(st, k, n, week, note, rule="cap")


def _weekly_luck(st: dict, t: int) -> dict | None:
    """🍀 주간 행운(운 요소). 판마다 다른 난수(nonce)라 새로고침으로 바꿀 수 없다"""
    rng = _rng(f"{st['seed']}|{st.get('nonce', '')}|w{t}")
    if st.get("luck") == "golden" and rng.random() < 0.20:
        st["cash"] += 500_000
        st["deposits"] += 500_000
        return {"icon": "🐜", "text": "황금 개미가 +50만 원을 물어 왔어요!", "cash": 500_000}
    roll = rng.random()
    if roll < LUCK_BASE:
        kind = rng.choice(["cash", "cash", "mental"])
        if kind == "cash":
            amt = rng.choice([100_000, 200_000, 300_000, 500_000])
            st["cash"] += amt
            st["deposits"] += amt
            text = rng.choice(["길에서 주운 복권이 당첨됐어요", "중고거래로 안 쓰던 물건을 팔았어요", "회사 경품 추첨에 당첨됐어요", "잊고 있던 적금 이자가 들어왔어요"])
            return {"icon": "🍀", "text": f"{text} +{amt // 10_000}만 원", "cash": amt}
        st["mental"] = min(100, st["mental"] + 10)
        return {"icon": "🍀", "text": "푹 자고 일어났더니 개운해요 · 멘탈 +10", "mental": 10}
    return None


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
            "disc": [],  # 공시는 화면에서 원문을 열어 볼 수 없어 뺐다(눌러도 아무것도 없는 정보는 혼란만 준다)
        })
    rivals = [{"name": p["channels"][c]["name"], "twr": round(_rival_twr(st, c, s + t), 5),
               "picks": p["channels"][c]["n"][w]} for c in st["rivals"]]
    ix = [round(x / p["index"][s - 1] * 1000, 1) for x in p["index"][max(0, w - HIST + 1):w + 1]]
    pending = None
    if st["pending"] is not None and not st["done"]:
        ev = EV[st["events"][st["pending"]]]
        pending = {"id": ev["id"], "icon": ev["icon"], "title": ev["title"], "body": ev["body"],
                   "choices": [{"label": c["label"], "hint": _event_hint(st, c["hint"])} for c in ev["choices"]]}
    pos = []
    for k, q in st["pos"].items():
        px = price(st, k, w)
        pos.append({"k": k, "qty": q["qty"], "cost": round(q["cost"], 2), "price": round(px, 2),
                    "value": round(q["qty"] * px), "gain": round(gain_of(q, px), 4), "short": q["qty"] < 0})
    v = value(st, w)
    return {
        "t": st["t"], "season": slen(st), "mode": st.get("mode", "free"), "char": st.get("char", "office"),
        "perk": _char(st)["perk"], "missions": missions_of(st), "asksLeft": _ask_limit(st) - st.get("asks", 0),
        "tier": mental_tier(st["mental"]), "rules": st.get("rules", {}),
        "luck": ({"id": st["luck"], **LUCK[st["luck"]]} if st.get("luck") else None),
        "luckPick": bool(st.get("luckCards")) and not st.get("luck") and st["t"] == 0,
        "etf": "0",
        "done": st["done"], "skip": st["skip"],
        "cash": round(st["cash"]), "value": round(v), "twr": round(st["twr"], 5), "mental": st["mental"],
        "deposits": st["deposits"], "pos": pos, "assets": assets, "index": ix,
        "rivals": rivals, "kospi": round(_index_twr(st, s + t), 5),
        "goal": {"i": st.get("goal", 0), "stars": GOAL_STARS} if rivals else None,
        "miles": [{"at": at, "stars": n, "hit": at in st.get("miles", [])} for at, n in miles_of(st)],
        "pending": pending, "hist": st["hist"], "markets": st["markets"], "maxHold": MAX_HOLD,
        "short": {"cap": SHORT_CAP, "used": round(short_used(st, w)), "stop": SHORT_STOP},
        # 실제로 매길 수수료(캐릭터·멘탈 구간·행운 카드·큰손 슬리피지 반영) — 화면의 '최대' 계산이 서버와 같도록
        "fees": {m: {"buy": round(_fee(st, m, 0), 6), "sell": round(_fee(st, m, 1), 6)} for m in FEES},
        "headlines": _headlines(st, w),
    }


def _event_hint(st: dict, hint: str) -> str:
    x = _char(st).get("event_x", 1)
    if x == 1:
        return hint
    return re.sub(r"현금 ([+−-])(\d+)만", lambda g: f"현금 {g.group(1)}{int(g.group(2)) * x}만({_char(st)['name']} ×{x})", hint)


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
    tr, L = st["traits"], slen(st)
    size = "short" if L <= 8 else "mid" if L <= 12 else "n"
    end = board is not None
    out = []
    for mid in st.get("missions", []):
        m = MISSIONS[mid]
        n = m.get(size, m.get("n"))
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
        out.append({"id": mid, "icon": m["icon"], "label": label, "state": state, **_mission_now(st, mid, n)})
    return out


def _mission_now(st: dict, mid: str, n) -> dict:
    """미션 진행 상황을 숫자로(후기: '패닉셀 없이 거래 5번'인데 지금 몇 번 했는지 안 보인다)
    now = 화면에 보일 한 줄, cur/goal = 진행 바(없으면 None)"""
    tr = st["traits"]
    me = st["twr"] - 1
    w = st["s"] + min(st["t"], slen(st))
    if mid == "beat2yt":
        beat = sum(1 for c in st["rivals"] if _rival_twr(st, c, w) - 1 < me)
        return {"now": f"지금 이기는 유튜버 {beat}명 / 3명", "cur": beat, "goal": 2}
    if mid == "beat_ix":
        ix = _index_twr(st, w) - 1
        return {"now": f"나 {me * 100:+.1f}% · 코스피 {ix * 100:+.1f}%", "cur": None, "goal": None}
    if mid == "calm":
        return {"now": f"지금 멘탈 {st['mental']} · 가장 낮았을 때 {tr.get('min_m', 100)}", "cur": None, "goal": None}
    if mid == "spread":
        return {"now": f"{tr.get('spread', 0)}주 / {n}주", "cur": tr.get("spread", 0), "goal": n}
    if mid == "nofomo":
        return {"now": f"거래 {tr['trades']}번 / 3번 · 추격 매수 {tr['fomo']}번", "cur": min(tr["trades"], 3), "goal": 3}
    if mid == "profit":
        return {"now": f"지금 {me * 100:+.1f}% / 목표 +{n}%", "cur": max(0.0, round(me * 100, 1)), "goal": n}
    if mid == "bigwin":
        g = tr.get("max_gain", 0) * 100
        return {"now": f"한 종목 최고 {g:+.0f}% / 목표 +{n}%", "cur": max(0, round(g)), "goal": n}
    if mid == "nopanic":
        return {"now": f"거래 {tr['trades']}번 / 5번 · 패닉셀 {tr['panic']}번", "cur": min(tr["trades"], 5), "goal": 5}
    if mid == "saver":
        return {"now": f"{tr.get('saves', 0)}번 / {n}번", "cur": tr.get("saves", 0), "goal": n}
    return {"now": "", "cur": None, "goal": None}


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
        (tr.get("margin", 0) >= 1, "곰의 눈물", "🐻", "공매도한 종목이 크게 올라 강제로 갚았어요. 공매도는 손실에 끝이 없어요."),
        (tr.get("shorts", 0) >= 3 and ret > 0, "공매도 사냥꾼", "🐻", "떨어질 종목에 걸어서 벌었어요. 하락장에서도 길이 있어요."),
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
                    "stats": {"trades": tr["trades"], "fomo": tr["fomo"], "shorts": tr.get("shorts", 0), "cashRatio": round(cash_ratio, 3),
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
    mstars = sum(1 for m in ms if m["state"] == "done") * (2 if st.get("luck") == "stars" else 1)
    goal = None
    if st["rivals"]:
        gi = min(st.get("goal", 0), len(st["rivals"]) - 1)
        gc = st["rivals"][gi]
        gret = round(_rival_twr(st, gc, end) - 1, 5)
        goal = {"name": p["channels"][gc]["name"], "ret": gret, "hit": me > gret, "stars": GOAL_STARS}
    # 중간 상자 별은 화면이 받는 순간 바로 넣어 줬으니 여기 stars 에는 더하지 않는다(mileStars 는 보여 주기용)
    mile_stars = sum(n for at, n in miles_of(st) if at in st.get("miles", []))
    stars = (mstars + {"S": 2, "A": 2, "B": 1}.get(grade_of(me, rank), 0) + _char(st).get("star_bonus", 0)
             + (GOAL_STARS if goal and goal["hit"] else 0))
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
        "title": title_of(st), "reveal": reveal, "curves": curves, "missions": ms, "stars": stars, "goal": goal, "mileStars": mile_stars,
        "mode": st.get("mode", "free"), "char": st.get("char", "office"), "len": slen(st),
        "rivalNames": [p["channels"][c]["name"] for c in st["rivals"]],
        "period": {"from": p["weeks"][s], "to": p["weeks"][end - 1]},
        "weeks": [h["r"] for h in st["hist"]], "mental": [h["m"] for h in st["hist"]],
    }
