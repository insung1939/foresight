"""게임 흐름·미래 정보 차단·규칙·AI 검증 테스트.

    cd api && ../.venv/bin/python -m pytest -q
"""
import json
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
        choice = pick if v["pending"] else None
        orders = [] if v["skip"] else strategy(v)
        r = client.post(f"/v1/runs/{rid}/turn", json={"orders": orders, "choice": choice})
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
    assert v["t"] == 0 and v["season"] == 26 and v["cash"] == season.START_CASH
    assert len(v["assets"]) == sum(season.UNIVERSE.values())
    end = play(r["id"], buy_hot)
    fin = end["final"]
    assert fin["grade"] in "SABCDF" and 1 <= fin["rank"] <= fin["of"] == 5
    assert len(fin["weeks"]) == 26 and len(fin["curves"]["me"]) == 27
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
    assert v["season"] == 8 and len(v["assets"]) == 6 and v["markets"] == ["KRX"]
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
    office = season.new_run("free:c3", ["KRX"], "free", "office")
    for _ in range(4):
        season.play_turn(office, [], 1 if office["pending"] is not None else None)
    assert office["deposits"] == 10_000_000 + 500_000  # 4주째 월급


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
    assert fin["stars"] == sum(1 for m in fin["missions"] if m["state"] == "done") + {"S": 2, "A": 2, "B": 1}.get(fin["grade"], 0)


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
