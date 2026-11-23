"""게임 흐름·미래 정보 차단·규칙·AI 검증 테스트.

    cd api && ../.venv/bin/python -m pytest -q
"""
import json
import pytest
import os
import random
import re
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["GEMINI_API_KEY"] = ""  # 실제 호출 금지
os.environ["RATE_LIMIT"] = "0"
os.environ["LLM_PROVIDER"] = "gemini"  # 키 없음 = 연결 안 됨 → 규칙 답

from fastapi.testclient import TestClient  # noqa: E402

from app import ai, season  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
client.__enter__()
P = season.pack.load()


def real_names(st: dict) -> list[str]:
    return [P["assets"][a["i"]]["name"] for a in st["assets"] if len(P["assets"][a["i"]]["name"]) >= 3]


def past_only(st: dict, v: dict) -> bool:
    """턴 t 화면의 차트는 정확히 지난주(s+t-1)에서 끝난다 — 이번 주 이후 종가는 없다"""
    w = st["s"] + v["t"] - 1
    for a, meta in zip(v["assets"], st["assets"]):
        close = P["assets"][meta["i"]]["close"]
        want = [round(c * meta["scale"], 2) for c in close[w - len(a["hist"]) + 1:w + 1]]
        if a["hist"] != want:
            return False
    return True


def play(rid: str, strategy, pick: int = 0) -> dict:
    from app.db import Run, Session

    body = client.get(f"/v1/runs/{rid}").json()
    while not body["view"]["done"]:
        v = body["view"]
        with Session() as s:
            st = s.get(Run, rid).state
        # 미래 정보 차단: 화면의 가격은 모두 지난주까지
        assert past_only(st, v), "미래 가격 노출"
        text = json.dumps(v, ensure_ascii=False)
        for ch in P["channelNames"].values():  # 채널 이름(예: '비트코인 ○○TV')은 종목 정체가 아니다
            text = text.replace(ch, "")
        for n in real_names(st):
            assert n not in text, f"진짜 이름 노출: {n}"
        words = " ".join([x["t"] for a in v["assets"] for x in a["titles"]] + [d for a in v["assets"] for d in a["disc"]] + [h["t"] for h in v["headlines"]])
        m = re.search(r"20\d\d|\b\d{2}\.\d{1,2}\.\d{1,2}|\d+월", words)
        assert not m, f"날짜 노출: {words[max(0, m.start() - 20):m.end() + 20]}"
        if v["pending"]:  # 화면처럼 사건에 먼저 답하고(그 답으로 '이번 주 거래 불가'가 될 수 있다) 주문을 낸다
            v = client.post(f"/v1/runs/{rid}/event", json={"choice": pick}).json()["view"]
        orders = [] if v["skip"] else strategy(v)
        r = client.post(f"/v1/runs/{rid}/turn", json={"orders": orders, "choice": None})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["week"]["t"] == v["t"]
    return body


def buy_hot(v):
    open_ = [a for a in v["assets"] if not a["locked"]]
    a = max(open_, key=lambda a: a["hype"])
    held = {p["k"] for p in v["pos"]}
    if a["k"] in held or len(held) >= v["maxHold"]:
        return [{"k": p["k"], "q": -p["qty"]} for p in v["pos"][:1]]
    q = int(v["cash"] * 0.3 / a["price"])
    return [{"k": a["k"], "q": q}] if q > 0 else []


def test_full_run_daily_hides_future_and_ranks():
    r = client.post("/v1/runs", json={"mode": "daily", "nickname": "테스트개미"}).json()
    v = r["view"]
    assert v["t"] == 0 and v["season"] == season.DAILY_LEN and v["cash"] == season.START_CASH
    assert len(v["assets"]) == sum(season.DAILY_UNIVERSE.values()) + 1  # + 코스피 ETF
    assert v["assets"][0]["code"] == season.ETF_CODE
    end = play(r["id"], buy_hot)
    fin = end["final"]
    assert fin["grade"] in "SABCDF" and 1 <= fin["rank"] <= fin["of"] == 5
    assert len(fin["weeks"]) == season.DAILY_LEN and len(fin["curves"]["me"]) == season.DAILY_LEN + 1
    # 결산에서만 진짜 이름이 나온다
    assert all(x["name"] for x in fin["reveal"])
    # 끝난 판은 더 못 민다
    assert client.post(f"/v1/runs/{r['id']}/turn", json={"orders": []}).status_code == 409
    lb = client.get("/v1/leaderboard").json()
    assert lb["total"] >= 1 and lb["rows"][0]["nickname"]


def test_same_daily_seed_same_market():
    a = client.post("/v1/runs", json={"mode": "daily"}).json()["view"]
    b = client.post("/v1/runs", json={"mode": "daily"}).json()["view"]
    assert [x["code"] for x in a["assets"]] == [x["code"] for x in b["assets"]]
    assert [x["price"] for x in a["assets"]] == [x["price"] for x in b["assets"]]


def test_hold_cash_twr_is_zero():
    r = client.post("/v1/runs", json={"mode": "free", "markets": ["KRX"]}).json()
    end = play(r["id"], lambda v: [], pick=1)  # 두 번째 선택지에는 자동 매수가 없다
    assert abs(end["final"]["ret"]) < 1e-9


def test_rules_reject_bad_orders():
    r = client.post("/v1/runs", json={"mode": "free", "markets": ["KRX"]}).json()
    v = r["view"]
    a = next(x for x in v["assets"] if not x["locked"])
    coin = next(x for x in v["assets"] if x["market"] == "CRYPTO")
    rid = r["id"]
    too_many = int(v["cash"] / a["price"]) + 10
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": [{"k": a["k"], "q": too_many}]}).status_code == 409
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": [{"k": coin["k"], "q": 1}]}).status_code == 409  # 잠긴 시장
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": [{"k": a["k"], "q": -1}]}).status_code == 409   # 없는 걸 팔기
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": [{"k": "99", "q": 1}]}).status_code == 409
    # 실패한 주문은 상태를 바꾸지 않는다
    assert client.get(f"/v1/runs/{rid}").json()["view"]["cash"] == v["cash"]
    ok = client.post(f"/v1/runs/{rid}/turn", json={"orders": [{"k": a["k"], "q": 10}]}).json()
    assert ok["view"]["pos"][0]["qty"] == 10
    fee = 10 * a["price"] * season.FEES["KRX"][0]
    assert abs((v["cash"] - ok["view"]["cash"]) - (10 * a["price"] + fee)) < 2


def test_max_hold_limit():
    st = season.new_run("free:hold", ["KRX", "US", "CRYPTO"])
    orders = [{"k": str(k), "q": 1} for k in range(season.MAX_HOLD + 1)]
    try:
        season.play_turn(st, orders)
        raise AssertionError("6종목 매수가 통과됨")
    except season.GameError:
        pass
    assert st["pos"] == {} and st["t"] == 0  # 원래대로


def test_event_needs_choice_and_skip_blocks_trades():
    st = season.new_run("free:event", ["KRX"])
    for _ in range(season.EVENT_TURNS[0]):
        season.play_turn(st, [])
    assert st["pending"] is not None
    try:
        season.play_turn(st, [])
        raise AssertionError("사건 선택 없이 진행됨")
    except season.GameError:
        pass
    st["events"][st["pending"]] = "trip"  # 출장: 거래 불가
    season.play_turn(st, [], choice=0)
    assert st["t"] == season.EVENT_TURNS[0] + 1


def test_panic_sell_when_mental_hits_zero():
    st = season.new_run("free:panic", ["KRX"])
    k = "0"
    px = season.price(st, k, st["s"] - 1)
    season.play_turn(st, [{"k": k, "q": int(st["cash"] * 0.9 / px)}])
    st["mental"] = 1
    st["traits"]["fomo"] = 0
    # 떨어지는 주가 올 때까지 진행
    for _ in range(20):
        if st["traits"]["panic"] or st["done"] or not st["pos"]:
            break
        before = st["mental"]
        season.play_turn(st, [], choice=0 if st["pending"] is not None else None)
        if st["mental"] < before:
            break
        st["mental"] = 1
    assert st["traits"]["panic"] >= 1 or st["mental"] > 0


def test_random_strategies_never_break_invariants():
    rng = random.Random(1)
    for i in range(15):
        st = season.new_run(f"free:fuzz{i}", ["KRX", "US", "CRYPTO"])
        while not st["done"]:
            v = season.view(st)
            orders = []
            if not v["skip"]:
                for _ in range(rng.randint(0, 3)):
                    a = rng.choice(v["assets"])
                    held = next((p for p in v["pos"] if p["k"] == a["k"]), None)
                    if held and rng.random() < 0.5:
                        orders.append({"k": a["k"], "q": -rng.randint(1, held["qty"])})
                    elif not held and len(v["pos"]) < season.MAX_HOLD:
                        orders.append({"k": a["k"], "q": max(1, int(v["cash"] * 0.2 / a["price"]))})
            try:
                season.play_turn(st, orders, 0 if v["pending"] else None)
            except season.GameError:
                season.play_turn(st, [], 0 if v["pending"] else None)
            assert st["cash"] >= -1 and 0 <= st["mental"] <= 100 and len(st["pos"]) <= season.MAX_HOLD
        fin = season.final(st)
        assert abs(fin["curves"]["me"][-1] - 1 - fin["ret"]) < 1e-3


def test_coach_falls_back_without_ai():
    r = client.post("/v1/runs", json={"mode": "free", "markets": ["KRX"]}).json()
    play(r["id"], lambda v: [])
    c = client.post(f"/v1/runs/{r['id']}/coach").json()
    assert c["source"] == "rule" and len(c["points"]) == 3


def test_coach_check_catches_bad_answers():
    ctx = json.dumps({"수익률(%)": 12.3, "거래 횟수": 14})
    good = {"headline": "버티기 성공", "points": ["수익률 12.3%예요", "거래는 14번", "잘했어요"], "tip": "분산해 보세요"}
    assert all(v for k, v in ai.check(good, ctx).items() if not k.startswith("_"))
    bad = {"headline": "대박", "points": ["수익률 55%", "이 종목 사세요", "x"], "tip": "y"}
    chk = ai.check(bad, ctx)
    assert not chk["numbers"] and not chk["advice"]


def test_meta_has_analysis():
    m = client.get("/v1/meta").json()
    assert m["hype"]["0건"]["n"] > 0 and m["ghosts"]["n"] > 10 and m["pack"]["weeks"] > 26


def test_event_endpoint_applies_before_orders():
    r = client.post("/v1/runs", json={"mode": "free", "markets": ["KRX"]}).json()
    rid = r["id"]
    for _ in range(season.EVENT_TURNS[0]):
        v = client.post(f"/v1/runs/{rid}/turn", json={"orders": []}).json()["view"]
    assert v["pending"]
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": []}).status_code == 409
    e = client.post(f"/v1/runs/{rid}/event", json={"choice": 1}).json()
    assert e["view"]["pending"] is None and e["event"]["choice"] == 1
    assert client.post(f"/v1/runs/{rid}/event", json={"choice": 1}).status_code == 409
    assert client.post(f"/v1/runs/{rid}/turn", json={"orders": []}).status_code == 200


# ---------------------------------------------------------------- 2차: 연습 시즌 · 캐릭터 · 미션 · 빨리 감기 · 개미 비서(RAG)
def test_practice_season_is_short_and_simple():
    r = client.post("/v1/runs", json={"mode": "practice", "char": "office"}).json()
    v = r["view"]
    assert v["season"] == 8 and len(v["assets"]) == 7 and v["markets"] == ["KRX"]  # 6종목 + 코스피 ETF
    assert all(a["market"] == "KRX" for a in v["assets"]) and len(v["missions"]) == 3
    end = play(r["id"], lambda v: [], pick=1)
    assert end["final"]["len"] == 8 and len(end["final"]["weeks"]) == 8 and "stars" in end["final"]


def test_characters_change_rules():
    whale = season.new_run("free:c1", ["KRX"], "free", "whale")
    student = season.new_run("free:c1", ["KRX"], "free", "student")
    coin = season.new_run("free:c1", ["KRX"], "free", "coin")
    assert whale["cash"] == 30_000_000 and student["cash"] == 6_000_000
    assert "CRYPTO" in coin["markets"] and coin["mental"] == 50
    holder = season.new_run("free:c2", ["KRX"], "free", "holder")
    holder["mental"] = 1
    season.play_turn(holder, [])
    assert holder["mental"] >= 20  # 존버 개미는 20 아래로 안 떨어진다
    season.LUCK_BASE, base = 0.0, season.LUCK_BASE  # 운 요소를 끄고 규칙만 본다
    office = season.new_run("free:c3", ["KRX"], "free", "office")
    for _ in range(4):
        season.play_turn(office, [], 1 if office["pending"] is not None else None)
    assert office["deposits"] == 10_000_000 + 500_000  # 4주째 월급
    season.LUCK_BASE = base


def test_skip_stops_at_event_and_counts_weeks():
    r = client.post("/v1/runs", json={"mode": "free", "markets": ["KRX"]}).json()
    j = client.post(f"/v1/runs/{r['id']}/skip", json={"weeks": 8}).json()
    assert len(j["weeks"]) == season.EVENT_TURNS[0] and j["view"]["pending"]  # 첫 사건에서 멈춘다
    assert client.post(f"/v1/runs/{r['id']}/skip", json={"weeks": 4}).status_code == 409


def test_missions_are_judged_at_the_end():
    st = season.new_run("free:m", ["KRX"], "free", "office")
    st["missions"] = ["calm", "nofomo", "profit"]
    while not st["done"]:
        season.play_turn(st, [], 1 if st["pending"] is not None else None)
    fin = season.final(st)
    states = {m["id"]: m["state"] for m in fin["missions"]}
    assert states["nofomo"] == "fail"  # 거래 3번 미만
    assert states["profit"] == "fail"  # 현금만: 0%
    assert fin["stars"] == sum(1 for m in fin["missions"] if m["state"] == "done") + {"S": 2, "A": 2, "B": 1}.get(fin["grade"], 0) + (season.GOAL_STARS if fin["goal"]["hit"] else 0)


def test_rag_search_never_returns_future_docs():
    from app import rag
    import numpy as np

    idx = rag.Index()
    idx.docs = [{"id": i, "a": 1, "w": w, "k": "yt", "t": f"제목{w}", "ch": "", "st": "n", "v": 0} for i, w in enumerate(range(20, 40))]
    m = np.random.default_rng(0).normal(size=(20, 8)).astype(np.float32)
    idx.emb = m / np.linalg.norm(m, axis=1, keepdims=True)
    idx.backend = "memory"
    got = idx.search(idx.emb[-1], [1], wmax=30, focus=1)
    assert got and all(d["w"] <= 30 and d["w"] >= 30 - rag.WINDOW + 1 for d in got)
    assert all(d["w"] <= 30 for d in idx.search(None, [1], wmax=30, focus=1))  # 임베딩 없을 때도


def test_ask_check_allows_quotes_but_blocks_advice_and_names():
    ctx = "D1 · 지난주 · 유튜브 · [반도체 A] 이 주식 사라"
    ok = {"answer": "유튜버들은 '이 주식 사라'고 했어요.", "cites": ["D1"]}
    assert all(v for k, v in ai.check_ask(ok, ctx, "q", {"D1"}, ["삼성전자"]).items() if not k.startswith("_"))
    bad = {"answer": "삼성전자는 지금 사세요. 30% 오릅니다.", "cites": ["D9"]}
    chk = ai.check_ask(bad, ctx, "q", {"D1"}, ["삼성전자"])
    assert not chk["advice"] and not chk["names"] and not chk["cites"] and not chk["numbers"]


def test_ask_check_requires_the_asked_stock():
    ctx = "D1 | 종목 자동차 A | 지난주 | 유튜브 | 반도체 A 자동차 A 업고"
    off = {"answer": "반도체 A 가 화제였어요.", "cites": ["D1"]}
    assert not ai.check_ask(off, ctx, "q", {"D1"}, [], focus="자동차 A")["focus"]
    on = {"answer": "자동차 A 는 반도체 A 와 함께 언급됐어요.", "cites": ["D1"]}
    assert ai.check_ask(on, ctx, "q", {"D1"}, [], focus="자동차 A")["focus"]



# ---------------------------------------------------------------- 3차: ETF · 전략 카드 · 행운 · 멘탈 구간 · 단서 지우기
def test_etf_tracks_the_index():
    st = season.new_run("free:etf", ["KRX"], "free", "office", nonce="x")
    px0 = season.price(st, "0", st["s"] - 1)
    season.play_turn(st, [{"k": "0", "q": int(st["cash"] * 0.9 / px0)}])
    P_ = season.pack.load()
    ix = P_["index"][st["s"]] / P_["index"][st["s"] - 1] - 1
    assert abs(st["hist"][0]["r"] - ix * 0.9) < 0.01  # 90% 를 담았으니 지수의 약 90%


def test_chase_penalty_only_when_it_falls():
    st = season.new_run("free:chase", ["KRX"], "free", "office", nonce="y")
    season.LUCK_BASE, base = 0.0, season.LUCK_BASE
    P_ = season.pack.load()
    hot = next(k for k in season._hype_rank(st, st["s"] - 1) if k != "0" and P_["assets"][st["assets"][int(k)]["i"]]["market"] == "KRX")
    px = season.price(st, hot, st["s"] - 1)
    w = season.play_turn(st, [{"k": hot, "q": int(st["cash"] * 0.5 / px)}])
    fell = w["mine"].get(hot, 0) < 0
    assert any("물림" in x[0] for x in w["why"]) == fell
    season.LUCK_BASE = base


def test_rules_auto_trade():
    st = season.new_run("free:rules", ["KRX"], "free", "office", nonce="z")
    season.set_rules(st, {"dca": True, "cap": True, "bogus": True})
    assert st["rules"] == {"dca": True, "cap": True}
    P_ = season.pack.load()
    k = next(str(i) for i in range(1, len(st["assets"])) if P_["assets"][st["assets"][i]["i"]]["market"] == "KRX")
    px = season.price(st, k, st["s"] - 1)
    w = season.play_turn(st, [{"k": k, "q": int(st["cash"] * 0.9 / px)}])
    rules = {x.get("rule") for x in w["trades"]}
    assert "cap" in rules  # 90% 몰빵 → 40% 넘는 만큼 자동 매도
    assert "0" in st["pos"] or "dca" in rules


def test_luck_card_once_and_effects():
    st = season.new_run("free:luck", ["KRX"], "free", "office", nonce="n1")
    assert len(st["luckCards"]) == 3
    st["luckCards"] = ["seed", "vip", "steel"]
    card = season.pick_luck(st, 0)
    assert card["id"] == "seed" and st["cash"] == 13_000_000
    try:
        season.pick_luck(st, 1)
        raise AssertionError("두 번 뽑힘")
    except season.GameError:
        pass
    st2 = season.new_run("free:luck", ["KRX"], "free", "office", nonce="n1")
    st2["luckCards"] = ["vip", "nofee", "stars"]
    season.pick_luck(st2, 0)
    assert season._ask_limit(st2) == season.ASKS + 3


def test_mental_tiers_change_fees():
    st = season.new_run("free:tier", ["KRX"], "free", "office", nonce="t")
    st["mental"] = 90
    assert season._fee(st, "KRX", 1) == 0  # 침착: 수수료 0
    st["mental"] = 20
    assert season._fee(st, "KRX", 1) > season.FEES["KRX"][1]  # 흔들림: 수수료 1.5배


def test_scrub_removes_product_codes_and_places():
    out = season._scrub("HBM4 수혜 ⟦3⟧ 대산단지 투입, ETF 와 AI 는 그대로")
    assert "HBM4" not in out and "대산" not in out and "ETF" in out and "AI" in out and "⟦3⟧" in out



def test_leaderboard_marks_my_run_and_renames_it():
    h = {"X-Device": "dev-test-1"}
    r = client.post("/v1/runs", json={"mode": "daily"}, headers=h).json()
    while True:
        v = client.get(f"/v1/runs/{r['id']}").json()["view"]
        if v["done"]:
            break
        if v["pending"]:
            client.post(f"/v1/runs/{r['id']}/event", json={"choice": 1})
        client.post(f"/v1/runs/{r['id']}/skip", json={"weeks": 8})
    day = client.get("/v1/leaderboard", headers=h).json()["day"]
    rows = client.get("/v1/leaderboard", headers=h).json()["rows"]
    assert any(x["me"] for x in rows)
    assert not any(x["me"] for x in client.get("/v1/leaderboard", headers={"X-Device": "someone-else"}).json()["rows"])
    assert client.post("/v1/leaderboard/nickname", json={"day": day, "nickname": "인성갬이"}, headers=h).json()["nickname"] == "인성갬이"
    assert client.post("/v1/leaderboard/nickname", json={"day": day, "nickname": "x"}, headers={"X-Device": "nobody"}).status_code == 404



def test_max_buy_never_rejected_for_any_character_or_mood():
    """화면의 '최대'(현금 ÷ 가격 × (1+표시 수수료))가 어떤 캐릭터·멘탈에서도 서버에서 통과해야 한다"""
    for char in season.CHARS:
        for mental in (90, 60, 40, 15):
            st = season.new_run(f"free:max{char}{mental}", ["KRX", "US", "CRYPTO"], "free", char, nonce="m")
            st["mental"] = mental
            v = season.view(st)
            for a in v["assets"]:
                if a["locked"]:
                    continue
                q = int((v["cash"] * 0.9995) / (a["price"] * (1 + v["fees"][a["market"]]["buy"])))
                trial = json.loads(json.dumps(st))
                season.play_turn(trial, [{"k": a["k"], "q": q}])  # GameError 면 테스트 실패


def test_season_goal_and_mid_season_boxes():
    st = season.new_run("free:goal", ["KRX", "US", "CRYPTO"], "free", "office", nonce="g")
    v = season.view(st)
    assert v["goal"]["stars"] == season.GOAL_STARS and 0 <= v["goal"]["i"] < len(v["rivals"])
    assert st["len"] == 12  # 후기: 26주는 너무 길다 → 메인(자유)도 12주
    assert [m["at"] for m in v["miles"]] == [a for a, _ in season.MILES_MID] and not any(m["hit"] for m in v["miles"])
    # 수익률이 선을 넘으면 그 주 결과에 상자가 한 번만 나온다
    st["twr"] = 1.12
    w = season.play_turn(st, [])
    got = {m["at"] for m in w["miles"]}
    if st["twr"] - 1 >= 0.07:
        assert {0.03, 0.07} <= got
    again = season.play_turn(st, [])
    assert not ({m["at"] for m in again["miles"]} & got)
    while not st["done"]:
        season.play_turn(st, [], 0 if st.get("pending") is not None else None)
    f = season.final(st)
    assert f["goal"]["hit"] == (f["ret"] > f["goal"]["ret"])
    assert f["mileStars"] == sum(n for a, n in season.MILES_MID if a in st["miles"])


def test_short_selling_rules():
    """공매도: 받은 돈은 현금으로, 총자산은 그대로(수수료만큼 빠짐) · 한도 50% · 가진 종목은 공매도 불가 · 갚기"""
    st = season.new_run("short-test", mode="free", char="office")
    w = st["s"] - 1
    v0 = season.value(st, w)
    k = "1"
    px = season.price(st, k, w)
    qty = int(v0 * 0.3 / px)
    note: list = []
    season._short(st, k, qty, w, note)
    assert st["pos"][k]["qty"] == -qty and st["cash"] > v0
    assert abs(season.value(st, w) - v0) < v0 * 0.01  # 공매도만으로 자산이 늘지 않는다
    with pytest.raises(season.GameError):
        season._short(st, "2", int(v0 * 0.3 / season.price(st, "2", w)), w, note)  # 한도 50% 초과
    with pytest.raises(season.GameError):
        season._sell(st, k, 1, w, note)  # 공매도 종목은 팔기 대신 갚기
    season._buy(st, k, qty, w, note)  # 갚기
    assert k not in st["pos"]


def test_short_turn_and_view():
    st = season.new_run("short-turn", mode="free", char="office")
    week = season.play_turn(st, [{"k": "1", "q": -10, "s": True}])
    v = season.view(st)
    p = next(x for x in v["pos"] if x["k"] == "1")
    assert p["short"] and p["qty"] == -10 and v["short"]["used"] > 0
    assert "1" in week["mine"]


def test_free_season_length_choice():
    """자유 플레이는 12주(기본)·24주를 고를 수 있다. 이상한 값은 기본 12주, 다른 모드는 무시"""
    assert season.new_run("len:a", mode="free")["len"] == 12
    st = season.new_run("len:b", mode="free", weeks=24)
    assert st["len"] == 24 and len(st["events"]) == 6 and st["eventTurns"][-1] < 24
    assert [m["at"] for m in season.view(st)["miles"]] == [a for a, _ in season.MILES]
    assert season.new_run("len:c", mode="free", weeks=99)["len"] == 12
    assert season.new_run("len:d", mode="practice", weeks=24)["len"] == 8
    r = client.post("/v1/runs", json={"mode": "free", "weeks": 24}).json()
    assert r["view"]["season"] == 24
    while not st["done"]:
        season.play_turn(st, [], 0 if st.get("pending") is not None else None)
    assert season.final(st)["len"] == 24
