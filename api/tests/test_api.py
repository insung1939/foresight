"""게임 흐름·정답 숨기기·규칙·AI 검증 테스트.

    cd api && ../.venv/bin/python -m pytest -q
"""
import json
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["GEMINI_API_KEY"] = ""  # 실제 호출 금지
os.environ["RATE_LIMIT"] = "0"  # 요청 한도는 아래 단위 테스트로 따로 검사
os.environ["LLM_PROVIDER"] = "gemini"  # 테스트는 로컬 Ollama 도 부르지 않는다(키 없음 = 연결 안 됨)

from fastapi.testclient import TestClient  # noqa: E402

from app import ai, rules  # noqa: E402
from app.bank import bank  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
client.__enter__()  # startup(테이블 생성)


def secrets_of(gid: str, round_no: int) -> list[str]:
    from app.db import Game, Session

    with Session() as s:
        key = s.get(Game, gid).case_ids[round_no]
    c = bank.get(key)
    out = [c["answer"]["name"], c["answer"]["symbol"], c["answer"]["t0"], c["private"]["corpCode"], "_rcept", "_excerpt", "_raw"]
    return out


def assert_hidden(payload: dict, gid: str, round_no: int):
    text = json.dumps(payload, ensure_ascii=False)
    for s in secrets_of(gid, round_no):
        assert s not in text, f"정답 정보가 새어 나감: {s}"


def test_full_game_hides_answers_until_reveal():
    st = client.post("/v1/games").json()
    gid = st["gameId"]
    for r in range(rules.ROUNDS):
        assert st["round"] == r and st["stage"] == "pick"
        assert_hidden(st, gid, r)
        for card in ("chart", "disclosure", "youtube"):
            st = client.post(f"/v1/games/{gid}/cards", json={"card": card}).json()
            assert_hidden(st, gid, r)
        # 4번째 카드는 막힌다
        assert client.post(f"/v1/games/{gid}/cards", json={"card": "news"}).status_code == 409
        # 미래 차트가 오지 않는다
        assert max(p["t"] for p in st["current"]["cards"]["chart"]["points"]) == 0
        st = client.post(f"/v1/games/{gid}/decide", json={"weight": -50 if r % 2 else 70}).json()
        # 리플레이: 하루씩. 매일 그날까지의 주가만 오고 정답은 없다
        while st["stage"] in ("replay", "event"):
            assert_hidden(st, gid, r)
            if st["stage"] == "event":
                ev = st["current"]["event"]
                assert max(p["t"] for p in ev["points"]) == ev["t"] == st["current"]["replay"]["day"]
                st = client.post(f"/v1/games/{gid}/adjust", json={"weight": 0}).json()
                continue
            rp = st["current"]["replay"]
            assert max(p["t"] for p in rp["points"]) == rp["day"]
            if r == 2 and rp["day"] == 3:  # 한 라운드는 중도 매도
                st = client.post(f"/v1/games/{gid}/exit").json()
                assert st["current"]["reveal"]["exitDay"] == 3
                break
            st = client.post(f"/v1/games/{gid}/tick", json={"days": 1}).json()
        assert st["stage"] == "reveal"
        assert st["current"]["reveal"]["answer"]["name"]
        st = client.post(f"/v1/games/{gid}/next").json()
    assert st["done"]
    rep = client.get(f"/v1/games/{gid}/report").json()
    assert len(rep["rounds"]) == rules.ROUNDS and len(rep["track"]) == rules.ROUNDS + 1


def test_stage_guards():
    gid = client.post("/v1/games").json()["gameId"]
    assert client.post(f"/v1/games/{gid}/adjust", json={"weight": 0}).status_code == 409
    assert client.post(f"/v1/games/{gid}/next").status_code == 409
    assert client.post(f"/v1/games/{gid}/decide", json={"weight": 50}).status_code == 400
    assert client.get(f"/v1/games/{gid}/report").status_code == 409
    assert client.get("/v1/games/nope").status_code == 404


def test_ask_without_key_degrades_gracefully():
    st = client.post("/v1/games").json()
    gid = st["gameId"]
    assert client.post(f"/v1/games/{gid}/ask", json={"question": "실적 어때?"}).status_code == 409  # 카드 안 엶
    client.post(f"/v1/games/{gid}/cards", json={"card": "ai"})
    r = client.post(f"/v1/games/{gid}/ask", json={"question": "실적 어때?"}).json()
    assert "error" in r and r["remaining"] == 3  # 실패는 횟수에서 빼지 않는다


def test_short_and_fee():
    c = {"chart": [{"t": 0, "p": 100, "b": 100}, {"t": 20, "p": 90, "b": 100}], "event": None, "answer": {"r20": -0.1}}
    assert abs(rules.round_return(c, -50, -50) - (0.05 - 0.5 * 0.04 * 20 / 250)) < 1e-9
    assert rules.round_return(c, 0, 0) == 0
    assert rules.is_hit(c, -50) and not rules.is_hit(c, 70)


def test_event_compounding():
    c = {"chart": [{"t": 0, "p": 100, "b": 100}, {"t": 10, "p": 120, "b": 100}, {"t": 20, "p": 60, "b": 100}],
         "event": {"t": 10}, "answer": {"r20": -0.4}}
    # 100% 로 산 뒤 사건일에 0% 로 정리 → +20%
    assert abs(rules.round_return(c, 100, 0) - 0.2) < 1e-9
    # 끝까지 들고 가면 −40%
    assert abs(rules.round_return(c, 100, 100) + 0.4) < 1e-9
    # 사건일에 팔면(중도 매도) +20%, 그 뒤 하락은 피함
    assert abs(rules.round_return(c, 100, 100, exit_day=10) - 0.2) < 1e-9


def test_exit_guards():
    g = client.post("/v1/games").json()
    gid = g["gameId"]
    assert client.post(f"/v1/games/{gid}/exit").status_code == 409  # 판단 전
    st = client.post(f"/v1/games/{gid}/decide", json={"weight": 70}).json()
    assert st["stage"] == "replay" and st["current"]["replay"]["day"] == 0
    assert client.post(f"/v1/games/{gid}/exit").status_code == 409  # 산 날은 못 팖
    st = client.post(f"/v1/games/{gid}/tick", json={"days": 2}).json()
    assert st["current"]["replay"]["day"] == 2 and abs(st["current"]["replay"]["value"] - 1) < 1
    st = client.post(f"/v1/games/{gid}/exit").json()
    rv = st["current"]["reveal"]
    assert rv["exitDay"] == 2 and "holdRet" in rv


def test_ai_check_catches_bad_answers():
    target = {"name": "삼성전자", "aliases": [], "symbol": "005930"}
    ctx = "[F1] 매출 전년 대비 +12.0%"
    ok = ai.check("매출이 12.0% 늘었어요.", ["F1"], {"F1"}, ctx, target)
    assert ok.ok
    assert not ai.check("삼성전자는 좋아요.", ["F1"], {"F1"}, ctx, target).ok  # 이름 노출
    assert not ai.check("매출이 35% 늘었어요.", ["F1"], {"F1"}, ctx, target).ok  # 없는 숫자
    assert not ai.check("지금 사세요.", ["F1"], {"F1"}, ctx, target).ok  # 직접 권유
    assert not ai.check("좋아요.", ["X9"], {"F1"}, ctx, target).ok  # 없는 인용
    assert not ai.check("좋아요.", [], {"F1"}, ctx, target).ok  # 근거 없이 단정


def test_meta_has_no_answers():
    m = client.get("/v1/meta").json()
    text = json.dumps(m, ensure_ascii=False)
    assert "private" not in text and "corpCode" not in text
    assert m["summary"]["cases"] == len(bank.cases)


def test_rounds_never_repeat_company_and_records_are_past_only():
    """한 게임에 같은 종목은 한 번만. 유튜버 과거 성적은 산 날 전 기록이라 정답 수익률과 무관한 값."""
    import random

    from app import rules
    from app.main import bank

    for seed in range(30):
        picked = rules.pick_rounds(bank.cases, random.Random(seed))
        assets = [c["private"]["assetId"] for c in picked]
        assert len(picked) == 10 and len(set(assets)) == 10
    for c in bank.cases:
        for v in c["youtube"]["videos"]:
            r = v.get("record")
            assert r is None or (r["n"] >= 5 and 0 <= r["hit"] <= 1)


def test_nickname_and_live_leaderboard():
    bad = client.post("/v1/games", json={"nickname": "<script>"})
    assert bad.status_code == 400
    g = client.post("/v1/games", json={"nickname": "테스트 부엉이"}).json()
    gid = g["gameId"]
    assert g["nickname"] == "테스트 부엉이"
    st = g
    while not st["done"]:
        if st["stage"] == "pick":
            st = client.post(f"/v1/games/{gid}/decide", json={"weight": 70}).json()
        elif st["stage"] == "event":
            st = client.post(f"/v1/games/{gid}/adjust", json={"weight": 70}).json()
        elif st["stage"] == "replay":
            st = client.post(f"/v1/games/{gid}/tick", json={"days": 20}).json()
        else:
            st = client.post(f"/v1/games/{gid}/next").json()
    rep = client.get(f"/v1/games/{gid}/report").json()
    assert rep["rank"] >= 1
    live = client.get("/v1/live?scope=all").json()
    assert any(r["nickname"] == "테스트 부엉이" for r in live["leaders"])
    assert live["stats"]["finished"] >= 1
    # 랭킹·피드에는 회사 이름(정답)이 없어야 한다
    text = json.dumps(live, ensure_ascii=False)
    for c in bank.cases:
        assert c["answer"]["name"] not in text
    assert client.post(f"/v1/games/{gid}/nickname", json={"nickname": "새이름"}).json()["nickname"] == "새이름"



def _finish(gid: str):
    st = client.get(f"/v1/games/{gid}").json()
    while not st["done"]:
        if st["stage"] == "pick":
            st = client.post(f"/v1/games/{gid}/decide", json={"weight": 0}).json()
        elif st["stage"] == "event":
            st = client.post(f"/v1/games/{gid}/adjust", json={"weight": 0}).json()
        elif st["stage"] == "replay":
            st = client.post(f"/v1/games/{gid}/tick", json={"days": 20}).json()
        else:
            st = client.post(f"/v1/games/{gid}/next").json()


def test_survey_once_after_finish_and_counted():
    gid = client.post("/v1/games").json()["gameId"]
    early = client.post(f"/v1/games/{gid}/survey", json={"youtube": "often", "helpful": 4, "lesson": "yt"})
    assert early.status_code == 409  # 끝나기 전엔 못 함
    _finish(gid)
    assert client.post(f"/v1/games/{gid}/survey", json={"youtube": "bad", "helpful": 4, "lesson": "yt"}).status_code == 400
    assert client.post(f"/v1/games/{gid}/survey", json={"youtube": "often", "helpful": 9, "lesson": "yt"}).status_code == 422
    assert client.post(f"/v1/games/{gid}/survey", json={"youtube": "often", "helpful": 4, "lesson": "yt"}).json()["ok"]
    assert client.post(f"/v1/games/{gid}/survey", json={"youtube": "often", "helpful": 4, "lesson": "yt"}).status_code == 409
    m = client.get("/v1/meta").json()
    assert m["survey"]["n"] >= 1 and m["survey"]["youtube"]["often"] >= 1


def test_ai_error_kind_and_feedback_guard():
    g = client.post("/v1/games").json()
    gid = g["gameId"]
    client.post(f"/v1/games/{gid}/cards", json={"card": "ai"})
    r = client.post(f"/v1/games/{gid}/ask", json={"question": "최근 공시 요약해 줘"}).json()
    assert r["errorKind"] == "unconfigured" and r["remaining"] == 3  # 실패한 호출은 횟수를 깎지 않는다
    assert client.post("/v1/ai/999999/feedback", json={"vote": 1}).status_code == 404
    assert client.post("/v1/ai/1/feedback", json={"vote": 5}).status_code == 400


def test_rate_limit_and_security_headers():
    from app import ops

    ops.reset_limits()
    now = 1000.0
    assert all(ops.check_limit("ask", "1.2.3.4", now + i * 0.1) is None for i in range(ops.LIMITS["ask"]))
    wait = ops.check_limit("ask", "1.2.3.4", now + 2)
    assert wait is not None and 0 < wait <= 60
    assert ops.check_limit("ask", "5.6.7.8", now + 2) is None  # 다른 IP 는 영향 없음
    assert ops.check_limit("ask", "1.2.3.4", now + 61) is None  # 1분 지나면 풀림
    h = client.get("/v1/health").headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY" and "x-response-time" in h
    assert client.post("/v1/games").headers["cache-control"] == "no-store"
    perf = client.get("/v1/meta").json()["perf"]["routes"]
    assert any(r["path"] == "POST /v1/games" and r["p95"] >= r["p50"] for r in perf)



def test_bank_quality_no_future_info_no_leaks():
    """문제 은행 전체: 미래 정보 0건, 회사 이름 노출 0건, 정답과 차트 일치(scripts/quality.py 와 같은 검사)"""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from quality import audit

    q = audit({"cases": bank.cases, "summary": bank.summary}, bank.extra)
    assert q["futureViolations"] == 0, q["future"]
    assert q["leaks"] == 0, q["leakSamples"]
    assert q["answerMismatch"] == 0
    assert q["absoluteAmounts"] == 0  # '1조 656억' 같은 검색 단서는 구간으로


def test_public_facts_allowlist():
    from app.masking import generalize_amounts, public_fact

    assert public_fact("계약상대", "한국지역난방공사") is None  # 상대방 이름은 빼고
    assert public_fact("체결계약명", "평택캠퍼스 2단지 조성 공사") is None
    assert public_fact("계약금액 총액(원)", "약 10,656억 원")["value"] == "조 원대"
    assert public_fact("매출액대비(%)", "6.37")["value"] == "6.37"
    assert public_fact("증자방식", "제3자배정증자")["value"] == "제3자배정증자"
    assert "559억" not in generalize_amounts("A사 559억 계약 체결")


def test_daily_challenge_same_questions_and_first_play_only_ranked():
    h = {"X-Device": "dev-test-1"}
    a = client.post("/v1/games", json={"mode": "daily", "nickname": "챌린저"}, headers=h).json()
    b = client.post("/v1/games", json={"mode": "daily"}, headers={"X-Device": "dev-test-2"}).json()
    again = client.post("/v1/games", json={"mode": "daily"}, headers=h).json()
    assert a["mode"] == "daily" and b["mode"] == "daily" and again["mode"] == "replay"  # 같은 기기 두 번째 판은 순위 제외
    from app.db import Game, Session

    with Session() as s:
        assert s.get(Game, a["gameId"]).case_ids == s.get(Game, b["gameId"]).case_ids  # 모두 같은 문제
    _finish(a["gameId"])
    live = client.get("/v1/live?scope=daily").json()
    assert live["scope"] == "daily" and any(r["nickname"] == "챌린저" for r in live["leaders"])


def test_login_optional_and_me():
    """로그인은 선택: 토큰 없이도 게임. 토큰이 있으면 게임이 계정에 붙고 /v1/me 에서 전적이 보인다."""
    import jwt as pyjwt

    from app import auth

    auth.SUPABASE_JWT_SECRET = "test-secret-for-hs256-must-be-long-enough-0123456789"
    try:
        assert client.get("/v1/me").status_code == 401  # 로그인 필요
        bad = {"Authorization": "Bearer nope"}
        assert client.get("/v1/me", headers=bad).status_code == 401
        assert client.post("/v1/games", headers=bad).status_code == 200  # 틀린 토큰이면 손님으로 진행
        tok = pyjwt.encode({"sub": "user-123", "aud": "authenticated"}, auth.SUPABASE_JWT_SECRET, algorithm="HS256")
        h = {"Authorization": f"Bearer {tok}"}
        assert client.put("/v1/me", json={"nickname": "로그인 부엉이"}, headers=h).json()["nickname"] == "로그인 부엉이"
        guest = client.post("/v1/games").json()["gameId"]  # 로그인 전 판
        _finish(guest)
        assert client.post("/v1/me/claim", json={"gameIds": [guest]}, headers=h).json()["claimed"] == 1
        g = client.post("/v1/games", headers=h).json()
        assert g["nickname"] == "로그인 부엉이"
        _finish(g["gameId"])
        m = client.get("/v1/me", headers=h).json()
        assert m["stats"]["games"] == 2 and m["user"]["nickname"] == "로그인 부엉이"
        merged = client.post("/v1/me/progress", json={"progress": {"xpByGame": {"a": 30, "b": 20}, "badges": {"first_hit": {"at": "2026-01-02", "game": "a"}}}}, headers=h).json()["progress"]
        again = client.post("/v1/me/progress", json={"progress": {"xpByGame": {"a": 30}, "badges": {"first_hit": {"at": "2026-01-01", "game": "c"}}}}, headers=h).json()["progress"]
        assert merged["xp"] == 50 and again["xp"] == 50  # 같은 게임은 한 번만
        assert again["badges"]["first_hit"]["at"] == "2026-01-01"  # 먼저 딴 날짜
    finally:
        auth.SUPABASE_JWT_SECRET = ""


def test_concurrent_requests_cannot_double_count():
    """연타·동시 요청: 카드는 3장까지만, 한 라운드는 한 번만 기록(게임별 잠금 + 유니크 인덱스)"""
    from concurrent.futures import ThreadPoolExecutor

    from app.db import Play, Session

    gid = client.post("/v1/games").json()["gameId"]
    cards = ["chart", "disclosure", "youtube", "finance", "news", "ai"]
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda c: client.post(f"/v1/games/{gid}/cards", json={"card": c}), cards))
    st = client.get(f"/v1/games/{gid}").json()
    assert len(st["current"]["opened"]) == 3 and len(st["current"]["cards"]) == 3
    client.post(f"/v1/games/{gid}/decide", json={"weight": 100})
    client.post(f"/v1/games/{gid}/tick", json={"days": 2})
    with ThreadPoolExecutor(8) as ex:
        codes = list(ex.map(lambda _: client.post(f"/v1/games/{gid}/exit").status_code, range(8)))
    assert codes.count(200) == 1  # 나머지는 409(이미 끝난 라운드)
    with Session() as s:
        assert len(s.query(Play).filter(Play.game_id == gid, Play.round == 0).all()) == 1


def test_progress_payload_is_validated():
    import jwt as pyjwt

    from app import auth

    auth.SUPABASE_JWT_SECRET = "test-secret-for-hs256-must-be-long-enough-0123456789"
    try:
        h = {"Authorization": "Bearer " + pyjwt.encode({"sub": "user-xp", "aud": "authenticated"}, auth.SUPABASE_JWT_SECRET, algorithm="HS256")}
        r = client.post("/v1/me/progress", json={"progress": {"xpByGame": {"a": 1e9}}}, headers=h).json()["progress"]
        assert r["xp"] <= 800  # 게임당 상한
        assert client.post("/v1/me/progress", json={"progress": {"xpByGame": {"a": "많이"}}}, headers=h).status_code == 400
    finally:
        auth.SUPABASE_JWT_SECRET = ""



def test_ai_check_v2_normalizes_cites_and_blocks_other_stocks():
    """평가 v1 실패 사례로 추가한 검사: 묶어 쓴 근거 id 정리, 자료에 없는 다른 종목 언급 차단"""
    assert ai.norm_cites(["[C1]", "D1,D2", "F1"]) == ["C1", "D1", "D2", "F1"]
    ids = {"C1", "F1"}
    ok = ai.check("A사는 매출이 늘었어요.", ["F1"], ids, "F1 매출 증가", {"name": "가나다", "aliases": [], "symbol": "000000"})
    assert ok.ok
    bad = ai.check("반면 삼성전자는 실적이 좋아요.", ["F1"], ids, "F1 매출 증가", {"name": "가나다", "aliases": [], "symbol": "000000"})
    assert not bad.ok and "others" in bad.items
