"""「타임슬립 개미」 API.

흐름: POST /v1/runs(새 판) → POST /v1/runs/{id}/turn × 26(한 주씩) → GET /v1/runs/{id}/final(결산·정체 공개)
규칙은 season.py, 화면은 보여주기만 한다. 다음 주 가격·진짜 이름·날짜는 턴을 제출하거나 판이 끝나야 나간다.
"""
from __future__ import annotations

import math
import re
import secrets
import statistics
import time
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session as S

from . import ai as ai_mod
from . import rag
from . import season as game
from .db import AiLog, Run, Session, init_db, now
from .ops import STARTED, OpsMiddleware, perf_summary
from .settings import ALLOWED_ORIGINS

KST = timezone(timedelta(hours=9))


@asynccontextmanager
async def lifespan(_app):
    init_db()
    game.pack.load()
    rag.index.load()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="타임슬립 개미 API",
    version="2.0.0",
    description="실제 과거 시장 26주를 다시 사는 투자 시뮬레이션. 데이터: hindsight(YouTube 언급·주가·DART 공시). AI 코치: Gemini.",
)
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(OpsMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


def db():
    with Session() as s:
        yield s


def today_kst() -> str:
    return datetime.now(KST).date().isoformat()


def get_run(s: S, rid: str) -> Run:
    r = s.get(Run, rid)
    if not r:
        raise HTTPException(404, "게임을 찾을 수 없어요")
    return r


NICK_BAD = re.compile(r"(시발|씨발|병신|개새|좆|fuck|shit)", re.I)


def clean_nick(raw: str | None) -> str | None:
    if not raw:
        return None
    n = re.sub(r"[^0-9A-Za-z가-힣_ ]", "", raw).strip()[:12]
    if not n or NICK_BAD.search(n):
        return None
    return n


def out(r: Run, **extra) -> dict:
    return {"id": r.id, "mode": r.mode, "day": r.day, "nickname": r.nickname, "view": game.view(r.state), **extra}


# ---------------------------------------------------------------- 게임
class NewRun(BaseModel):
    mode: str = Field("daily", pattern="^(daily|free|practice)$", description="daily = 오늘의 시드(모두 같은 시장) · free = 무작위 · practice = 연습 시즌(8주·국내 6종목)")
    char: str = Field("office", pattern="^(office|student|whale|holder|trader|coin)$", description="내 개미(특성이 다르다)")
    markets: list[str] | None = Field(None, description="거래할 수 있는 시장(KRX·US·CRYPTO). 오늘의 시드는 무시하고 모두 연다")
    nickname: str | None = None


class Order(BaseModel):
    k: str = Field(..., description="종목 번호(view.assets[].k)")
    q: int = Field(..., description="수량. 사면 +, 팔면 −")


class Turn(BaseModel):
    orders: list[Order] = Field(default_factory=list, max_length=20)
    choice: int | None = Field(None, description="이번 주 사건이 있으면 고른 선택지 번호")


class Nick(BaseModel):
    nickname: str


@app.get("/v1/health", tags=["상태"])
def health():
    return {"ok": True, "pack": game.pack.ok, "ai": ai_mod.provider() or "off", "uptime": int(time.time() - STARTED)}


@app.post("/v1/runs", tags=["게임"], summary="새 판 — 시장 구간·종목·코드네임·라이벌을 시드로 정한다")
def new_run(request: Request, body: NewRun | None = None, s: S = Depends(db)):
    body = body or NewRun()
    rid = secrets.token_urlsafe(12)
    day = today_kst() if body.mode == "daily" else None
    seed = f"daily:{day}" if day else f"{body.mode}:{rid}"
    markets = None if day else body.markets
    st = game.new_run(seed, markets, body.mode, body.char, nonce=rid)
    r = Run(id=rid, mode=body.mode, day=day, device=(request.headers.get("x-device") or "")[:40] or None,
            nickname=clean_nick(body.nickname), state=st, char=st["char"])
    s.add(r)
    s.commit()
    return out(r)


@app.get("/v1/runs/{rid}", tags=["게임"], summary="진행 상태(새로고침·이어하기)")
def get_state(rid: str, s: S = Depends(db)):
    r = get_run(s, rid)
    return out(r, final=game.final(r.state) if r.done else None)


@app.post("/v1/runs/{rid}/turn", tags=["게임"], summary="한 주 진행: 주문(+사건 선택) 제출 → 이번 주 결과와 다음 주 화면")
def turn(rid: str, body: Turn, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    try:
        week = game.play_turn(st, [o.model_dump() for o in body.orders], body.choice)
    except game.GameError as e:
        raise HTTPException(409, str(e)) from e
    r.state = st
    r.turn = st["t"]
    r.updated_at = now()
    fin = _finish(s, r, st)
    s.commit()
    return out(r, week=week, final=fin)


def _finish(s: S, r: Run, st: dict) -> dict | None:
    """판이 끝났으면 결산을 계산해 분석용 열을 채운다(Supabase 에 쌓여 데이터 페이지 분석에 쓰인다)"""
    fin = None
    if st["done"] and not r.done:
        fin = game.final(st)
        r.done, r.ret, r.grade, r.title, r.finished_at = True, fin["ret"], fin["grade"], fin["title"]["name"], now()
        r.stars, r.fomo, r.trades = fin["stars"], st["traits"]["fomo"], st["traits"]["trades"]
        r.beat_yt = sum(1 for b in fin["board"] if b["who"] == "yt" and b["ret"] < fin["ret"])
        r.beat_ix = fin["ret"] > next(b["ret"] for b in fin["board"] if b["who"] == "index")
        if r.mode == "daily" and r.device:
            first = s.scalar(select(func.count()).select_from(Run).where(
                Run.day == r.day, Run.device == r.device, Run.ranked.is_(True)))
            r.ranked = not first
        elif r.mode == "daily":
            r.ranked = True
    return fin


class Pick(BaseModel):
    card: int = Field(..., ge=0, le=2)


@app.post("/v1/runs/{rid}/luck", tags=["게임"], summary="행운 카드: 시즌 시작에 뒤집힌 카드 3장 중 1장(운 요소)")
def luck(rid: str, body: Pick, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    try:
        card = game.pick_luck(st, body.card)
    except game.GameError as e:
        raise HTTPException(409, str(e)) from e
    r.state, r.updated_at = st, now()
    s.commit()
    return out(r, card=card)


class RulesIn(BaseModel):
    rules: dict[str, bool] = Field(default_factory=dict, description="stop · take · dca · cap")


@app.post("/v1/runs/{rid}/rules", tags=["게임"], summary="전략 카드(자동 규칙) 켜고 끄기: 자동 손절·익절·적립식·몰빵 방지")
def rules(rid: str, body: RulesIn, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    if st["done"]:
        raise HTTPException(409, "끝난 판이에요")
    game.set_rules(st, body.rules)
    r.state, r.updated_at = st, now()
    s.commit()
    return out(r)


@app.get("/v1/rules", tags=["게임"], summary="전략 카드·행운 카드·멘탈 구간 설명")
def rules_info():
    return {"rules": game.RULES, "luck": game.LUCK,
            "tiers": [game.mental_tier(x) | {"from": x} for x in (80, 50, 30, 0)]}


class Skip(BaseModel):
    weeks: int = Field(4, ge=1, le=8)


@app.post("/v1/runs/{rid}/skip", tags=["게임"], summary="빨리 감기: 주문 없이 최대 n주(사건·패닉·끝에서 멈춤)")
def skip(rid: str, body: Skip, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    try:
        weeks = game.play_weeks(st, body.weeks)
    except game.GameError as e:
        raise HTTPException(409, str(e)) from e
    if not weeks:
        raise HTTPException(409, "지금은 넘길 수 없어요(사건에 먼저 답해 주세요)")
    r.state, r.turn, r.updated_at = st, st["t"], now()
    fin = _finish(s, r, st)
    s.commit()
    return out(r, weeks=weeks, final=fin)


@app.get("/v1/chars", tags=["게임"], summary="고를 수 있는 내 개미와 특성")
def chars():
    return [{"id": k, "name": v["name"], "perk": v["perk"], "cash": v["cash"], "mental": v["mental"]} for k, v in game.CHARS.items()]


class Choice(BaseModel):
    choice: int = Field(..., ge=0, le=3)


@app.post("/v1/runs/{rid}/event", tags=["게임"], summary="이번 주 사건에 답하기(주문 전에) → 바뀐 화면과 자동 매매 내역")
def event(rid: str, body: Choice, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    try:
        res = game.choose(st, body.choice)
    except game.GameError as e:
        raise HTTPException(409, str(e)) from e
    r.state = st
    r.updated_at = now()
    s.commit()
    return out(r, event=res)


@app.get("/v1/runs/{rid}/final", tags=["게임"], summary="결산: 순위·등급·칭호·코드네임 정체 공개·곡선")
def final(rid: str, s: S = Depends(db)):
    r = get_run(s, rid)
    try:
        return {"id": r.id, "nickname": r.nickname, "mode": r.mode, "day": r.day, **game.final(r.state),
                "place": _place(s, r)}
    except game.GameError as e:
        raise HTTPException(409, str(e)) from e


@app.post("/v1/runs/{rid}/nickname", tags=["랭킹"], summary="랭킹에 보일 이름")
def nickname(rid: str, body: Nick, s: S = Depends(db)):
    r = get_run(s, rid)
    n = clean_nick(body.nickname)
    if not n:
        raise HTTPException(422, "이름은 한글·영문·숫자 12자까지예요")
    r.nickname = n
    s.commit()
    return {"nickname": n}


# ---------------------------------------------------------------- AI 코치
def coach_summary(st: dict, fin: dict) -> dict:
    t = fin["title"]
    return {
        "수익률(%)": round(fin["ret"] * 100, 1), "순위": f"{fin['rank']}/{fin['of']}", "등급": fin["grade"], "칭호": t["name"],
        "라이벌 수익률(%)": {b["name"]: round(b["ret"] * 100, 1) for b in fin["board"] if b["who"] != "me"},
        "거래 횟수": t["stats"]["trades"], "추격 매수 횟수": t["stats"]["fomo"], "패닉셀 횟수": t["stats"]["panic"],
        "평균 현금 비중(%)": round(t["stats"]["cashRatio"] * 100), "최대 종목 비중 평균(%)": round(t["stats"]["concentration"] * 100),
        "크게 잃고 판 횟수": t["stats"]["cut"], "크게 벌고 판 횟수": t["stats"]["take"],
        "최저 멘탈": min(fin["mental"] or [70]), "인생 이벤트 선택": [
            f"{game.EV[e]['title']}: {game.EV[e]['choices'][c]['label']}" for e, c in st["traits"]["events"]],
    }


def coach_fallback(fin: dict) -> dict:
    t = fin["title"]
    st = t["stats"]
    pts = [t["why"]]
    pts.append(f"거래 {st['trades']}번, 추격 매수 {st['fomo']}번이었어요." if st["fomo"] else f"거래 {st['trades']}번, 추격 매수는 없었어요.")
    pts.append("라이벌 유튜버보다 앞섰어요." if fin["rank"] == 1 else "유튜버 라이벌을 다 이기진 못했어요. 그들도 맞히는 건 절반 정도예요.")
    tip = "다음 판엔 화제 1위 종목을 사기 전에 한 주만 기다려 보세요." if st["fomo"] >= 2 else "다음 판엔 종목을 3개 이상 나눠 담아 보세요."
    return {"headline": f"{t['icon']} {t['name']}", "points": pts, "tip": tip, "source": "rule"}


@app.post("/v1/runs/{rid}/coach", tags=["AI"], summary="AI 코치: 내 거래 습관 세 줄 돌아보기(검증 통과한 답만, 실패하면 규칙 답)")
def coach(rid: str, s: S = Depends(db)):
    r = get_run(s, rid)
    if not r.done:
        raise HTTPException(409, "판을 끝내면 코치를 부를 수 있어요")
    if r.coach:
        return r.coach
    fin = game.final(r.state)
    summary = coach_summary(r.state, fin)
    t0 = time.perf_counter()
    try:
        resp, chk, usage, _ = ai_mod.coach(summary)
        ans = {**resp, "source": "ai", "model": usage.model or ai_mod.model_name()}
        s.add(AiLog(run_id=rid, kind="coach", ok=True, checks={k: v for k, v in chk.items() if not k.startswith("_")},
                    answer=str(resp), latency_ms=usage.latency_ms, tokens_in=usage.tokens_in,
                    tokens_out=usage.tokens_out, model=ans["model"]))
    except (ai_mod.LLMUnavailable, ValueError) as e:
        ans = coach_fallback(fin)
        s.add(AiLog(run_id=rid, kind="coach", ok=False, checks={"error": type(e).__name__, "detail": str(e)[:200]},
                    latency_ms=int((time.perf_counter() - t0) * 1000), model=ai_mod.model_name()))
    r.coach = ans
    s.commit()
    return ans


# ---------------------------------------------------------------- 개미 비서(시점 제한 RAG)
class AskIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=120)
    k: str | None = Field(None, description="지금 보고 있는 종목 번호(그 종목 자료를 먼저 찾는다)")


def _ago(n: int) -> str:
    return "지난주" if n <= 0 else f"{n + 1}주 전"


@app.post("/v1/runs/{rid}/ask", tags=["AI"], summary="개미 비서: 지금까지 나온 영상·공시만 찾아(pgvector) Gemini 가 출처와 함께 답한다. 시즌당 3번")
def ask(rid: str, body: AskIn, s: S = Depends(db)):
    r = get_run(s, rid)
    st = dict(r.state)
    if st["done"]:
        raise HTTPException(409, "끝난 판이에요")
    if st.get("asks", 0) >= game._ask_limit(st):
        raise HTTPException(409, f"이번 시즌 질문 {game._ask_limit(st)}번을 다 썼어요")
    if not rag.index.ready:
        raise HTTPException(503, "개미 비서가 아직 준비 중이에요")
    p = game.pack.load()
    wmax = st["s"] + st["t"] - 1
    pool = {a["i"]: str(k) for k, a in enumerate(st["assets"])}
    focus = st["assets"][int(body.k)]["i"] if body.k and body.k.isdigit() and int(body.k) < len(st["assets"]) else None
    t0 = time.perf_counter()
    try:
        qv, _ = rag.embed_query(body.question, rag.index.model)
    except Exception:
        qv = rag.keyword_vector(body.question)
    docs = rag.index.search(qv, list(pool), wmax, focus)
    cites = []
    for i, d in enumerate(docs, 1):
        code = st["assets"][int(pool[d["a"]])]["code"]
        txt = game._code_title(st, d["t"])
        kind = "공시" if d["k"] == "disc" else "유튜브"
        ch = game._ch_name(d["ch"]) if d["ch"] else ""
        meta = f"채널 {ch}" + (" · 낙관적 제목" if d["st"] == "b" else "") if d["k"] == "yt" else ""
        cites.append({"id": f"D{i}", "code": code, "k": pool[d["a"]], "kind": kind, "ago": _ago(wmax - d["w"]),
                      "text": txt, "ch": ch, "score": round(float(d["score"]), 3),
                      "_line": f"D{i} | 종목 {code} | {_ago(wmax - d['w'])} | {kind}{f' ({meta})' if meta else ''} | {txt}"})
    focus_code = st["assets"][int(body.k)]["code"] if focus is not None else None
    n_focus = sum(1 for c in cites if c["code"] == focus_code)
    context = (f"[지금 보고 있는 종목] {focus_code} — 이 종목 자료 {n_focus}건. 이 종목 자료가 없으면 그 사실을 먼저 말하고, 다른 종목 자료는 참고로만.\n"
               if focus_code else "") + "\n".join(c["_line"] for c in cites)
    # 진짜 이름: 이번 판 종목만이 아니라 모든 종목 이름을 막는다(사용자가 짐작한 이름을 되풀이해도 정답 힌트가 되므로)
    banned = sorted({a["name"] for a in p["assets"][:p["etf"]] if len(a["name"]) >= 2} | {"삼성", "하이닉스", "현대", "카카오", "네이버"})
    ans: dict
    ok = False
    try:
        if not cites:
            raise ValueError("검색 결과 없음")
        resp, chk, usage, attempts = ai_mod.ask(body.question, context, {c["id"] for c in cites}, banned, focus_code if n_focus else None)
        used = [c for c in cites if c["id"] in set(resp.get("cites", []))]
        ans = {"answer": resp["answer"], "cites": used, "source": "ai", "model": usage.model or ai_mod.model_name()}
        ok = True
        row = AiLog(run_id=rid, kind="ask", question=body.question, ok=True, docs=len(cites), attempts=attempts,
                    checks={k: v for k, v in chk.items() if not k.startswith("_")}, answer=resp["answer"],
                    latency_ms=int((time.perf_counter() - t0) * 1000), tokens_in=usage.tokens_in, tokens_out=usage.tokens_out, model=ans["model"])
        s.add(row)
        s.flush()
        ans["logId"] = row.id
    except (ai_mod.LLMUnavailable, ValueError) as e:
        reason = getattr(e, "kind", "check") if isinstance(e, ai_mod.LLMUnavailable) else ("empty" if not cites else "check")
        msg = {"check": "AI 답이 검증(출처·숫자·권유·실명)을 통과하지 못해서, 찾은 자료만 보여드릴게요.",
               "quota": "AI 무료 사용량이 잠깐 찼어요. 찾은 자료만 보여드릴게요.",
               "busy": "AI가 바빠요. 찾은 자료만 보여드릴게요.", "timeout": "AI 답이 늦어져서, 찾은 자료만 보여드릴게요.",
               "empty": "지금까지 나온 자료에서 관련된 내용을 찾지 못했어요."}.get(reason, "AI에 연결하지 못해서, 찾은 자료만 보여드릴게요.")
        ans = {"answer": msg, "cites": cites[:3], "source": "search", "reason": reason}
        s.add(AiLog(run_id=rid, kind="ask", question=body.question, ok=False, docs=len(cites),
                    checks={"error": type(e).__name__, "detail": str(e)[:200]}, latency_ms=int((time.perf_counter() - t0) * 1000), model=ai_mod.model_name()))
    if ok:
        st["asks"] = st.get("asks", 0) + 1
        r.state = st
    s.commit()
    for c in ans["cites"]:
        c.pop("_line", None)
    return {**ans, "left": game._ask_limit(st) - st.get("asks", 0), "searched": len(cites), "backend": rag.index.backend}


class Vote(BaseModel):
    vote: int = Field(..., ge=-1, le=1)


@app.post("/v1/ai/{log_id}/feedback", tags=["AI"], summary="AI 답변 평가(👍/👎)")
def ai_feedback(log_id: int, body: Vote, s: S = Depends(db)):
    row = s.get(AiLog, log_id)
    if not row:
        raise HTTPException(404, "기록이 없어요")
    row.feedback = body.vote
    s.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 랭킹
def _place(s: S, r: Run) -> dict | None:
    if not (r.done and r.mode == "daily" and r.ranked):
        return None
    q = select(func.count()).select_from(Run).where(Run.day == r.day, Run.ranked.is_(True))
    total = s.scalar(q)
    better = s.scalar(q.where(Run.ret > r.ret))
    return {"rank": better + 1, "total": total, "top": round((better + 1) / total, 3)}


@app.get("/v1/leaderboard/days", tags=["랭킹"], summary="지난 날짜별 오늘의 시드(참여 수·1등) — 최근 30일")
def leaderboard_days(s: S = Depends(db)):
    rows = s.execute(select(Run.day, func.count(), func.max(Run.ret)).where(Run.ranked.is_(True), Run.day.is_not(None))
                     .group_by(Run.day).order_by(Run.day.desc()).limit(30)).all()
    out_ = []
    for day, n, best in rows:
        top = s.scalars(select(Run).where(Run.day == day, Run.ranked.is_(True)).order_by(Run.ret.desc()).limit(1)).first()
        out_.append({"day": day, "n": n, "best": best, "winner": (top.nickname or "익명 개미") if top else None,
                     "char": top.char if top else None})
    return {"days": out_, "today": today_kst()}


@app.get("/v1/leaderboard/all", tags=["랭킹"], summary="명예의 전당: 모든 날짜를 통틀어 상위 30")
def leaderboard_all(s: S = Depends(db)):
    rows = s.scalars(select(Run).where(Run.ranked.is_(True)).order_by(Run.ret.desc()).limit(30)).all()
    return {"rows": [{"rank": i + 1, "nickname": r.nickname or "익명 개미", "ret": r.ret, "grade": r.grade, "title": r.title,
                      "char": r.char, "day": r.day} for i, r in enumerate(rows)]}


@app.get("/v1/leaderboard", tags=["랭킹"], summary="오늘의 시드 랭킹(기기당 첫 완주만)")
def leaderboard(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), s: S = Depends(db)):
    day = day or today_kst()
    rows = s.scalars(select(Run).where(Run.day == day, Run.ranked.is_(True)).order_by(Run.ret.desc()).limit(50)).all()
    total = s.scalar(select(func.count()).select_from(Run).where(Run.day == day, Run.ranked.is_(True)))
    rets = s.scalars(select(Run.ret).where(Run.day == day, Run.ranked.is_(True))).all()
    yt_beat = None
    if rows:
        fin0 = game.final(rows[0].state)
        yt = [b["ret"] for b in fin0["board"] if b["who"] == "yt"]
        ix = next(b["ret"] for b in fin0["board"] if b["who"] == "index")
        yt_beat = {"youtubers": yt, "index": ix,
                   "beatAll": round(sum(1 for x in rets if x > max(yt + [ix])) / len(rets), 3)}
    return {
        "day": day, "total": total,
        "rows": [{"rank": i + 1, "nickname": r.nickname or "익명 개미", "ret": r.ret, "grade": r.grade, "title": r.title, "char": r.char}
                 for i, r in enumerate(rows)],
        "median": round(statistics.median(rets), 5) if rets else None,
        "bench": yt_beat,
    }


# ---------------------------------------------------------------- 데이터·분석(데이터 페이지)
_analysis: dict | None = None


def analysis() -> dict:
    """시즌 팩으로 미리 계산하는 분석(서버 시작 뒤 한 번). 화제성은 다음 주 수익을 예측하나?"""
    global _analysis
    if _analysis:
        return _analysis
    p = game.pack.load()
    f0, n = p["feedFrom"], p["nweeks"]
    buckets = {"0건": [], "1~2건": [], "3~9건": [], "10건 이상": []}
    after_jump, after_drop, all_next = [], [], []
    for a in p["assets"]:
        c = a["close"]
        for w in range(f0, n - 1):
            nxt = c[w + 1] / c[w] - 1
            m = a["m"][w][0]
            key = "0건" if m == 0 else "1~2건" if m <= 2 else "3~9건" if m <= 9 else "10건 이상"
            buckets[key].append(nxt)
            all_next.append(nxt)
            prev = c[w] / c[w - 1] - 1
            if prev >= 0.15:
                after_jump.append(nxt)
            elif prev <= -0.15:
                after_drop.append(nxt)

    def summ(xs):
        return {"n": len(xs), "mean": round(statistics.fmean(xs), 5) if xs else None,
                "median": round(statistics.median(xs), 5) if xs else None,
                "win": round(sum(1 for x in xs if x > 0) / len(xs), 4) if xs else None}

    ix0, ix1 = p["index"][f0], p["index"][-1]
    ghosts = []
    for ch in p["channels"]:
        v = 1.0
        for w in range(f0 + 1, n):
            v *= 1 + ch["r"][w]
        ghosts.append({"name": ch["name"], "ret": round(v - 1, 4), "weeks": sum(1 for x in ch["n"][f0 + 1:] if x), "cat": ch.get("cat")})
    ghosts.sort(key=lambda g: -g["ret"])
    # 공개 분석에서는 채널을 익명(채널 A·B…)으로: 기계적으로 따라 산 가상 성적이 특정 채널 평가로 읽히지 않게
    order = sorted(ghosts, key=lambda g: g["name"])
    alias = {g["name"]: f"{'코인' if g['cat'] == 'crypto' else '주식'} 채널 {i + 1:02d}" for i, g in enumerate(order)}
    for g in ghosts:
        g["name"] = alias[g["name"]]
    kospi = round(ix1 / ix0 - 1, 4)
    hist = Counter()
    for g in ghosts:
        b = max(-100, min(300, math.floor(g["ret"] * 100 / 25) * 25))
        hist[b] += 1
    by_market = Counter(a["market"] for a in p["assets"])
    _analysis = {
        "hype": {k: summ(v) for k, v in buckets.items()}, "all": summ(all_next),
        "momentum": {"afterJump": summ(after_jump), "afterDrop": summ(after_drop)},
        "ghosts": {"kospi": kospi, "n": len(ghosts), "beat": sum(1 for g in ghosts if g["ret"] > kospi),
                   "top": ghosts[:5], "bottom": ghosts[-5:], "hist": sorted(hist.items())},
        "pack": {"weeks": n, "playable": n - game.SEASON - f0 - 1, "from": p["weeks"][f0], "to": p["weeks"][-1],
                 "assets": dict(Counter(a["market"] for a in p["assets"][:p["etf"]])), "channels": len(p["channels"]), "builtAt": p["builtAt"]},
        "quality": {
            "channelsAll": p["source"]["channels"], "ghosts": len(p["channels"]),
            "ghostRule": "시즌 동안 '오른다' 언급이 있는 주가 8주 이상인 채널만 고스트로(언급이 드문 채널은 성적이 0%로 왜곡되므로)",
            "poolRule": "피드 시작 8주 전부터 마지막 주까지 주봉이 빠짐없이 있는 종목만(상장폐지·거래정지로 끊긴 종목 제외). 빈 주는 직전 종가로 채움",
            "weeksWithTitles": sum(1 for a in p["assets"][:p["etf"]] for t in a["titles"][f0:] if t),
            "assetWeeks": p["etf"] * (n - f0),
            "ragIndexed": len(rag.index.docs), "ragTotal": rag.index.total,
            "masking": "제목·공시: 종목명·별칭(대소문자 무시) → 코드네임, 다른 종목·그룹·사람·직함·가격·날짜·분기·영문 제품 코드·공장/단지 이름 → ○○. 테스트가 매 턴 진짜 이름·날짜 노출을 검사",
        },
        "source": p["source"],
    }
    return _analysis


@app.get("/v1/meta", tags=["데이터"], summary="데이터 출처 규모·화제성 분석·유튜버 고스트 성적·플레이 통계·응답 속도")
def meta(s: S = Depends(db)):
    runs = s.scalar(select(func.count()).select_from(Run))
    done = s.scalar(select(func.count()).select_from(Run).where(Run.done.is_(True)))
    rets = s.scalars(select(Run.ret).where(Run.done.is_(True))).all()
    grades = Counter(s.scalars(select(Run.grade).where(Run.done.is_(True))).all())
    titles = Counter(s.scalars(select(Run.title).where(Run.done.is_(True))).all())
    turns = Counter(s.scalars(select(Run.turn)).all())
    reach = [sum(c for t, c in turns.items() if t >= k) for k in (1, 5, 13, 20, 26)]
    coach_rows = s.execute(select(AiLog.ok, AiLog.latency_ms).where(AiLog.kind == "coach")).all()
    ask_rows = s.execute(select(AiLog.ok, AiLog.latency_ms, AiLog.attempts).where(AiLog.kind == "ask")).all()
    fin_rows = s.execute(select(Run.ret, Run.fomo, Run.beat_yt, Run.beat_ix, Run.char, Run.trades)
                         .where(Run.done.is_(True), Run.fomo.is_not(None), Run.mode != "practice")).all()
    fomo_b: dict[str, list[float]] = {"0번": [], "1~2번": [], "3번 이상": []}
    by_char: dict[str, list[float]] = {}
    for ret, fomo, _, _, ch, _ in fin_rows:
        fomo_b["0번" if fomo == 0 else "1~2번" if fomo <= 2 else "3번 이상"].append(ret)
        by_char.setdefault(ch or "office", []).append(ret)
    players = {
        "n": len(fin_rows),
        "beatIndex": round(sum(1 for x in fin_rows if x[3]) / len(fin_rows), 3) if fin_rows else None,
        "beatYt": dict(Counter(x[2] for x in fin_rows)),
        "fomo": {k: {"n": len(v), "median": round(statistics.median(v), 4) if v else None} for k, v in fomo_b.items()},
        "chars": {k: {"n": len(v), "median": round(statistics.median(v), 4)} for k, v in by_char.items()},
    }
    return {
        **analysis(),
        "plays": {"runs": runs, "done": done, "median": round(statistics.median(rets), 5) if rets else None,
                  "grades": dict(grades), "titles": dict(titles.most_common(8)),
                  "funnel": [{"turn": k, "n": v} for k, v in zip((1, 5, 13, 20, 26), reach)]},
        "coach": {"n": len(coach_rows), "ok": sum(1 for o, _ in coach_rows if o),
                  "p50": statistics.median([m for _, m in coach_rows]) if coach_rows else None, "provider": ai_mod.provider() or "off"},
        "ask": {"n": len(ask_rows), "ok": sum(1 for o, _, _ in ask_rows if o), "retried": sum(1 for _, _, a in ask_rows if a > 1),
                "p50": statistics.median([m for _, m, _ in ask_rows]) if ask_rows else None},
        "rag": {"docs": len(rag.index.docs), "backend": rag.index.backend, "model": rag.index.model, "dim": rag.index.dim, "window": rag.WINDOW},
        "players": players,
        "perf": perf_summary(),
    }
