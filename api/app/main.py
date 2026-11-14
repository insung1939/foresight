"""Foresight API.

게임 진행은 서버가 쥔다: 화면은 지금 단계에서 볼 수 있는 것만 받는다.
- 문제: 상황(반기·시장·60일 수익률)만. 카드는 열 때마다 하나씩(라운드당 3장 제한).
- 중간 사건: 첫 판단을 낸 뒤에만.
- 정답·AI 판단·다른 사람 판단: 마지막 판단을 낸 뒤에만.
"""
from __future__ import annotations

import json
import re
import secrets
import statistics
import time
from contextlib import asynccontextmanager
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import random

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as S

from . import ai as ai_mod
from . import auth, rules
from .bank import bank
from .db import AiLog, Game, Play, Session, Survey, User, init_db, now
from .ops import STARTED, OpsMiddleware, perf_summary
from .settings import ALLOWED_ORIGINS, ASK_MAX_CHARS, ASK_PER_ROUND

@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Foresight API",
    version="1.0.0",
    description="실제 과거 상황으로 겨루는 투자 판단 게임. 데이터: hindsight(YouTube·DART·공공데이터포털), DART 재무·원문, Google 뉴스 RSS. AI: Gemini.",
)
app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(OpsMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])

CARDS = ("chart", "disclosure", "youtube", "finance", "news", "ai")


def db():
    with Session() as s:
        yield s


def valid(g: Game) -> bool:
    """문제 은행을 다시 만들면 예전 게임의 문제가 없을 수 있다"""
    return all(bank.has(k) for k in g.case_ids)


def get_game(s: S, gid: str) -> Game:
    g = s.get(Game, gid)
    if not g or not valid(g):
        raise HTTPException(404, "게임을 찾을 수 없어요. 새 게임을 시작해 주세요.")
    return g


def need(g: Game, stage: str):
    if g.stage != stage:
        raise HTTPException(409, f"지금은 할 수 없는 동작이에요(현재 단계: {g.stage}).")


# ------------------------------------------------------------ 상태
def crowd(s: S, key: str, exclude: str | None = None) -> dict:
    q = select(Play.w1, Play.ret, Play.hit).where(Play.case_key == key)
    if exclude:
        q = q.where(Play.game_id != exclude)
    rows = s.execute(q).all()
    dist = Counter(r.w1 for r in rows)
    return {
        "n": len(rows),
        "dist": {str(w): dist.get(w, 0) for w in rules.WEIGHTS},
        "hitRate": round(sum(r.hit for r in rows) / len(rows), 3) if rows else None,
        "avgRet": round(statistics.mean(r.ret for r in rows), 4) if rows else None,
    }


def track(g: Game) -> list[dict]:
    t = [{"me": rules.START_CASH, "youtuber": rules.START_CASH, "kospi": rules.START_CASH, "ai": rules.START_CASH}]
    for p in g.plays:
        c = bank.get(p.case_key)
        prev = t[-1]
        yw = rules.youtuber_weight(c)
        aj = bank.ai_public(p.case_key)
        aw = aj["weight"] if aj else 0
        t.append({
            "me": prev["me"] * (1 + p.ret),
            "youtuber": prev["youtuber"] * (1 + rules.round_return(c, yw, yw)),
            "kospi": prev["kospi"] * (1 + rules.kospi_return(c)),
            "ai": prev["ai"] * (1 + rules.round_return(c, aw, aw)),
        })
    return t


def state(s: S, g: Game) -> dict:
    done = g.stage == "done"
    hist = []
    for p in g.plays:
        c = bank.get(p.case_key)
        hist.append({"round": p.round, "name": c["answer"]["name"], "r20": c["answer"]["r20"], "w1": p.w1, "w2": p.w2,
                     "ret": p.ret, "hit": p.hit, "event": bool(c.get("event")), "opened": p.opened, "exitDay": p.exit_day or 20})
    out = {
        "gameId": g.id, "nickname": g.nickname, "mode": g.mode or "free", "daily": g.daily, "rounds": rules.ROUNDS, "round": g.round, "stage": g.stage, "done": done,
        "weights": list(rules.WEIGHTS), "openLimit": rules.OPEN_LIMIT, "askLimit": ASK_PER_ROUND,
        "track": track(g), "history": hist,
    }
    if done:
        return out
    key = g.case_ids[g.round]
    c = bank.get(key)
    cur = {
        "question": bank.question(c), "opened": g.opened, "w1": g.w1, "w2": g.w2, "asked": g.asked,
        "cards": {k: bank.card(key, k) for k in g.opened},
    }
    ev = c.get("event")
    if g.stage in ("replay", "event"):
        cur["replay"] = {
            "day": g.day,
            "points": [p for p in c["chart"] if p["t"] <= g.day],  # 오늘까지만(미래는 안 보냄)
            "value": rules.value_at(c, g.w1, g.w2, g.day),
            "eventDay": ev["t"] if ev and g.day >= ev["t"] else None,
        }
    if g.stage == "event" or (g.stage in ("replay", "reveal") and ev and (g.stage == "reveal" or g.day >= ev["t"])):
        cur["event"] = bank.event(key)
    if g.stage == "reveal":
        rv = bank.reveal(key)
        ex = g.exit_day or 20
        rv["mine"] = rules.round_return(c, g.w1, g.w2, ex)
        rv["exitDay"] = ex
        rv["hit"] = rules.is_hit(c, g.w1)
        rv["youtuberRet"] = rules.round_return(c, rules.youtuber_weight(c), rules.youtuber_weight(c))
        rv["kospiRet"] = rules.kospi_return(c)
        if rv["ai"]:
            w = rv["ai"]["weight"]
            rv["ai"]["ret"] = rules.round_return(c, w, w)
            rv["ai"]["hit"] = rules.is_hit(c, w)
        if g.w1 != g.w2 or ex < 20:
            rv["holdRet"] = rules.round_return(c, g.w1, g.w1)  # 아무것도 안 바꾸고 20일 들고 있었다면
        rv["crowd"] = crowd(s, key, exclude=g.id)
        cur["reveal"] = rv
    out["current"] = cur
    return out


# ------------------------------------------------------------ 요청 모델
class OpenCard(BaseModel):
    card: str = Field(description="chart · disclosure · youtube · finance · news · ai")


class Decide(BaseModel):
    weight: int = Field(description="-50 · 0 · 30 · 70 · 100")


class NewGame(BaseModel):
    nickname: str | None = Field(default=None, max_length=20, description="랭킹에 보일 이름(선택, 2~12자)")
    mode: str = Field(default="free", description="free(자유 연습) · daily(오늘의 챌린지: 오늘 모두 같은 10문제)")


class Nick(BaseModel):
    nickname: str = Field(max_length=20)


class Ask(BaseModel):
    question: str = Field(min_length=2, max_length=ASK_MAX_CHARS)


# ------------------------------------------------------------ 닉네임·완주 기록
NICK_RE = re.compile(r"^[0-9A-Za-z가-힣 _.\-]{2,12}$")
BANNED = ("시발", "씨발", "병신", "좆", "fuck", "shit", "섹스", "admin", "관리자")


def clean_nick(raw: str | None) -> str | None:
    if raw is None:
        return None
    n = re.sub(r"\s+", " ", raw).strip()
    if not n:
        return None
    if not NICK_RE.match(n):
        raise HTTPException(400, "이름은 한글·영문·숫자 2~12자로 지어 주세요.")
    if any(b in n.lower() for b in BANNED):
        raise HTTPException(400, "다른 이름을 써 주세요.")
    return n


def finalize(g: Game):
    """완주한 게임의 최종 수익률·적중 수·유튜버 수익률을 저장(랭킹을 빠르게 뽑기 위해)"""
    t = track(g)
    g.final_ret = t[-1]["me"] / rules.START_CASH - 1
    g.yt_ret = t[-1]["youtuber"] / rules.START_CASH - 1
    g.hits = sum(1 for p in g.plays if p.hit)


def today_kst() -> str:
    return datetime.now(timezone(timedelta(hours=9))).date().isoformat()


def current_user(request: Request) -> str | None:
    return auth.user_id(request)


def _user_nick(s: S, user: str) -> str | None:
    u = s.get(User, user)
    return u.nickname if u else None


def grade_of(hits: int) -> str:
    return "S" if hits >= 9 else "A" if hits >= 7 else "B" if hits >= 5 else "C" if hits >= 3 else "D"


# ------------------------------------------------------------ 게임
@app.get("/v1/health", tags=["상태"])
def health():
    return {"ok": True, "cases": len(bank.cases), "ai": ai_mod.provider() is not None, "provider": ai_mod.provider(),
            "auth": auth.enabled(), "aiJudged": len(bank.ai), "model": ai_mod.model_name()}


@app.post("/v1/games", tags=["게임"], summary="새 게임 — 문제 10개를 서버가 고른다")
def new_game(request: Request, body: NewGame | None = None, s: S = Depends(db)):
    if len(bank.cases) < rules.ROUNDS:
        raise HTTPException(503, "문제 데이터가 준비되지 않았어요.")
    body = body or NewGame()
    device = (request.headers.get("x-device") or "")[:40] or None
    user = current_user(request)
    mode, day = "free", None
    if body.mode == "daily":
        day = today_kst()
        picked = rules.pick_rounds(bank.cases, random.Random(f"daily-{day}"))  # 날짜가 같으면 모두 같은 문제
        # 같은 기기·계정의 오늘 두 번째 판부터는 순위에 넣지 않는다(답을 알고 다시 하는 것 방지)
        nick0 = clean_nick(body.nickname)
        conds = ([Game.user_id == user] if user else []) + ([Game.device == device] if device else []) + ([Game.nickname == nick0] if nick0 else [])
        again = bool(conds) and (s.scalar(select(func.count(Game.id)).where(Game.daily == day, Game.mode == "daily", or_(*conds))) or 0) > 0
        mode = "replay" if again else "daily"
    else:
        picked = rules.pick_rounds(bank.cases)
    nick = clean_nick(body.nickname) or (_user_nick(s, user) if user else None)
    g = Game(id=secrets.token_urlsafe(12), case_ids=[f'{c["private"]["assetId"]}|{c["answer"]["t0"]}' for c in picked],
             opened=[], round_started=now(), nickname=nick, mode=mode, daily=day, device=device, user_id=user)
    s.add(g)
    s.commit()
    return state(s, g)


@app.post("/v1/games/{gid}/nickname", tags=["랭킹"], summary="랭킹에 보일 이름 바꾸기")
def set_nickname(gid: str, body: Nick, s: S = Depends(db)):
    g = get_game(s, gid)
    g.nickname = clean_nick(body.nickname)
    s.commit()
    _live_cache.clear()
    return {"nickname": g.nickname}


@app.get("/v1/games/{gid}", tags=["게임"], summary="진행 상태(새로고침·다른 기기에서 이어하기)")
def get_state(gid: str, s: S = Depends(db)):
    return state(s, get_game(s, gid))


@app.post("/v1/games/{gid}/cards", tags=["게임"], summary="정보 카드 한 장 열기(라운드당 3장)")
def open_card(gid: str, body: OpenCard, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "pick")
    if body.card not in CARDS:
        raise HTTPException(400, "없는 카드예요.")
    if body.card not in g.opened:
        if len(g.opened) >= rules.OPEN_LIMIT:
            raise HTTPException(409, f"카드는 {rules.OPEN_LIMIT}장까지만 열 수 있어요.")
        g.opened = [*g.opened, body.card]
        s.commit()
    return state(s, g)


@app.post("/v1/games/{gid}/ask", tags=["AI"], summary="AI 애널리스트에게 질문(그 시점 자료만 근거)")
def ask(gid: str, body: Ask, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "pick")
    if "ai" not in g.opened:
        raise HTTPException(409, "AI 애널리스트 카드를 먼저 열어 주세요.")
    if g.asked >= ASK_PER_ROUND:
        raise HTTPException(409, f"이번 라운드 질문 {ASK_PER_ROUND}번을 다 썼어요.")
    key = g.case_ids[g.round]
    c = bank.get(key)
    q = body.question.strip()
    s.commit()  # 모델을 기다리는 동안(최대 수십 초) DB 연결을 풀에 돌려준다 — 다른 사람 요청이 막히지 않게
    try:
        resp, chk, usage, attempts = ai_mod.ask(c, bank.ex(key), q)
    except ai_mod.LLMUnavailable as e:
        s.add(AiLog(kind="ask", game_id=g.id, case_key=key, question=q, ok=False, checks={"call": e.kind, "detail": str(e)},
                    model=ai_mod.model_name()))
        s.commit()
        return {"error": str(e), "errorKind": e.kind, "retryAfter": e.retry_after, "remaining": ASK_PER_ROUND - g.asked}
    g.asked += 1
    log = AiLog(kind="ask", game_id=g.id, case_key=key, question=q, answer=resp["answer"], ok=chk.ok, checks=chk.items,
                attempts=attempts, latency_ms=usage.latency_ms, tokens_in=usage.tokens_in, tokens_out=usage.tokens_out,
                model=usage.model or ai_mod.model_name())
    s.add(log)
    s.commit()
    return {**resp, "checks": chk.items, "attempts": attempts, "latencyMs": usage.latency_ms, "logId": log.id,
            "remaining": ASK_PER_ROUND - g.asked}


class Vote(BaseModel):
    vote: int = Field(description="1 = 도움 됨 👍 · -1 = 별로 👎")


@app.post("/v1/ai/{log_id}/feedback", tags=["AI"], summary="AI 답변 평가(👍/👎). 검증 통과율과 함께 품질 근거로 쓴다")
def ai_feedback(log_id: int, body: Vote, s: S = Depends(db)):
    if body.vote not in (1, -1):
        raise HTTPException(400, "vote 는 1 또는 -1")
    log = s.get(AiLog, log_id)
    if not log or log.kind != "ask":
        raise HTTPException(404, "답변을 찾을 수 없어요.")
    log.feedback = body.vote
    s.commit()
    return {"ok": True}


@app.post("/v1/games/{gid}/decide", tags=["게임"], summary="첫 판단(비중) → 20일 리플레이 시작")
def decide(gid: str, body: Decide, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "pick")
    if body.weight not in rules.WEIGHTS:
        raise HTTPException(400, "비중은 -50 · 0 · 30 · 70 · 100 중 하나예요.")
    started = g.round_started if g.round_started.tzinfo else g.round_started.replace(tzinfo=timezone.utc)
    g.decide_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    g.w1 = g.w2 = body.weight
    g.day, g.exit_day, g.stage = 0, None, "replay"
    s.commit()
    return state(s, g)


class Tick(BaseModel):
    days: int = Field(default=1, ge=1, le=20, description="며칠 넘길지(속보가 있으면 그날에서 멈춤)")


@app.post("/v1/games/{gid}/tick", tags=["게임"], summary="리플레이 하루(또는 며칠) 진행. 속보 날엔 event 로 멈추고, 20일째면 정답 공개")
def tick(gid: str, body: Tick | None = None, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "replay")
    c = bank.get(g.case_ids[g.round])
    ev = c.get("event")
    target = min(20, g.day + (body.days if body else 1))
    if ev and g.day < ev["t"] <= target:  # 속보: 그날 종가에서 멈추고 비중을 다시 고르게
        g.day, g.stage = ev["t"], "event"
    else:
        g.day = target
        if g.day >= 20:
            g.exit_day = 20
            _finish_round(s, g)
    s.commit()
    return state(s, g)


@app.post("/v1/games/{gid}/adjust", tags=["게임"], summary="속보 뒤 비중 조정 → 리플레이 계속")
def adjust(gid: str, body: Decide, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "event")
    if body.weight not in rules.WEIGHTS:
        raise HTTPException(400, "비중은 -50 · 0 · 30 · 70 · 100 중 하나예요.")
    g.w2 = body.weight
    g.stage = "replay"
    s.commit()
    return state(s, g)


@app.post("/v1/games/{gid}/exit", tags=["게임"], summary="지금 팔기(중도 매도): 오늘 종가로 정리하고 정답 공개")
def exit_now(gid: str, s: S = Depends(db)):
    g = get_game(s, gid)
    if g.stage not in ("replay", "event"):
        raise HTTPException(409, "리플레이 중에만 팔 수 있어요.")
    if g.day < 1:
        raise HTTPException(409, "산 날에는 팔 수 없어요. 하루 뒤부터 돼요.")
    if g.w1 == 0 and (g.w2 or 0) == 0:
        raise HTTPException(409, "들고 있는 게 없어요.")
    g.exit_day = g.day
    _finish_round(s, g)
    s.commit()
    return state(s, g)


def _finish_round(s: S, g: Game):
    key = g.case_ids[g.round]
    c = bank.get(key)
    ex = g.exit_day or 20
    s.add(Play(game_id=g.id, round=g.round, case_key=key, opened=g.opened, w1=g.w1, w2=g.w2,
               ret=rules.round_return(c, g.w1, g.w2, ex), hit=rules.is_hit(c, g.w1), ms=g.decide_ms or 0, exit_day=ex))
    g.stage = "reveal"


@app.post("/v1/games/{gid}/next", tags=["게임"], summary="다음 라운드로(마지막이면 끝)")
def next_round(gid: str, s: S = Depends(db)):
    g = get_game(s, gid)
    need(g, "reveal")
    if g.round + 1 >= rules.ROUNDS:
        g.stage = "done"
        g.finished_at = now()
        finalize(g)
        _live_cache.clear()
    else:
        g.round += 1
        g.stage, g.opened, g.w1, g.w2, g.asked, g.round_started = "pick", [], None, None, 0, now()
        g.day, g.exit_day, g.decide_ms = 0, None, None
    s.commit()
    s.refresh(g)
    return state(s, g)


@app.get("/v1/games/{gid}/report", tags=["게임"], summary="10라운드 결과 리포트")
def report(gid: str, s: S = Depends(db)):
    g = get_game(s, gid)
    if g.stage != "done":
        raise HTTPException(409, "아직 끝나지 않은 게임이에요.")
    rounds = []
    for p in g.plays:
        c = bank.get(p.case_key)
        aj = bank.ai_public(p.case_key)
        rounds.append({
            "round": p.round, "opened": p.opened, "w1": p.w1, "w2": p.w2, "ret": p.ret, "hit": p.hit, "ms": p.ms, "exitDay": p.exit_day or 20,
            "period": c["period"], "ret60": c["ret60"], "chart": c["chart"], "answer": c["answer"],
            "event": bool(c.get("event")), "youtube": {"verdict": c["youtube"]["verdict"]},
            "ai": {"weight": aj["weight"], "hit": rules.is_hit(c, aj["weight"])} if aj else None,
        })
    t = track(g)
    # 다른 플레이어와 비교: 끝낸 게임들의 최종 수익률 분포에서 내 위치
    finals = _final_returns(s, daily=g.daily if g.mode == "daily" else None)
    mine = t[-1]["me"] / rules.START_CASH - 1
    better = sum(1 for x in finals if x < mine)
    if g.final_ret is None:
        finalize(g)
        s.commit()
    rank = sum(1 for x in finals if x > mine) + 1
    return {
        "gameId": g.id, "nickname": g.nickname, "rank": rank, "mode": g.mode or "free", "daily": g.daily,
        "rounds": rounds, "track": t,
        "players": {"n": len(finals), "beatShare": round(better / len(finals), 3) if finals else None,
                    "avgHit": _avg_hit(s)},
    }


def _final_returns(s: S, daily: str | None = None) -> list[float]:
    out = []
    q = select(Game).where(Game.stage == "done")
    if daily:
        q = q.where(Game.daily == daily, Game.mode == "daily")
    for g in s.scalars(q):
        if not valid(g):
            continue
        v = 1.0
        for p in g.plays:
            v *= 1 + p.ret
        out.append(v - 1)
    return out


def _avg_hit(s: S) -> float | None:
    n = s.scalar(select(func.count(Play.id)))
    if not n:
        return None
    return round((s.scalar(select(func.count(Play.id)).where(Play.hit.is_(True))) or 0) / n, 3)


# ------------------------------------------------------------ 데이터·분석 페이지
@app.get("/v1/meta", tags=["데이터"], summary="데이터 출처 규모·문제 은행 분석·플레이 통계·AI 검증 통계")
def meta(s: S = Depends(db)):
    cases = bank.cases
    mean = lambda xs: round(statistics.mean(xs), 4) if xs else None  # noqa: E731

    def r20(c):
        return c["answer"]["r20"]

    bins = [("60일 하락", lambda r: r < 0), ("0~20% 상승", lambda r: 0 <= r < 0.2),
            ("20~50% 상승", lambda r: 0.2 <= r < 0.5), ("50% 넘게 상승", lambda r: r >= 0.5)]
    chase = []
    for label, f in bins:
        cs = [c for c in cases if f(c["ret60"])]
        chase.append({"label": label, "n": len(cs), "avg": mean([r20(c) for c in cs]),
                      "upShare": round(sum(r20(c) > 0 for c in cs) / len(cs), 3) if cs else None})
    ev = [c for c in cases if c.get("event")]
    events = []
    for label, f in [("공시 사건", lambda e: e["type"] == "disclosure"), ("급등 뒤", lambda e: e["type"] == "shock" and e["change"] > 0),
                     ("급락 뒤", lambda e: e["type"] == "shock" and e["change"] < 0)]:
        cs = [c for c in ev if f(c["event"])]
        events.append({"label": label, "n": len(cs),
                       "avg": mean([rules.at(c, 20)["p"] / rules.at(c, c["event"]["t"])["p"] - 1 for c in cs])})
    conf = {f"{v}_{'up' if up else 'down'}": sum(1 for c in cases if c["youtube"]["verdict"] == v and (r20(c) > 0) == up)
            for v in ("bull", "bear") for up in (True, False)}
    edges = [-9, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 9]
    hist = [sum(1 for c in cases if edges[i] <= r20(c) < edges[i + 1]) for i in range(8)]

    # AI 판단의 성적(문제 은행 전체)
    judged = [(c, bank.ai_public(f'{c["private"]["assetId"]}|{c["answer"]["t0"]}')) for c in cases]
    judged = [(c, j) for c, j in judged if j]
    ai_stats = {
        "n": len(judged),
        "hitRate": round(sum(rules.is_hit(c, j["weight"]) for c, j in judged) / len(judged), 3) if judged else None,
        "dist": dict(Counter(str(j["weight"]) for _, j in judged)),
        "youtubeHitRate": bank.summary.get("youtubeHitRate"),
    }

    # 플레이 기록(실제 사용자)
    plays = s.scalars(select(Play)).all()
    by_card = defaultdict(lambda: [0, 0])
    for p in plays:
        for k in p.opened:
            by_card[k][0] += 1
            by_card[k][1] += p.hit
    logs = s.scalars(select(AiLog).where(AiLog.kind == "ask")).all()
    called = [x for x in logs if "call" not in x.checks]
    play_stats = {
        "games": s.scalar(select(func.count(Game.id)).where(Game.stage == "done")) or 0,
        "plays": len(plays),
        "hitRate": round(sum(p.hit for p in plays) / len(plays), 3) if plays else None,
        "shortShare": round(sum(p.w1 < 0 for p in plays) / len(plays), 3) if plays else None,
        "cards": {k: {"opened": v[0], "hitRate": round(v[1] / v[0], 3)} for k, v in by_card.items()},
        "avgMs": int(statistics.mean(p.ms for p in plays)) if plays else None,
    }
    ai_ops = {
        "asks": len(logs),
        "passed": sum(1 for x in called if x.ok),
        "retried": sum(1 for x in called if x.ok and x.attempts > 1),  # 다시 물어서 통과한 것(숨긴 것은 제외)
        "fallback": sum(1 for x in called if not x.ok),
        "unavailable": len(logs) - len(called),
        "unavailableKinds": dict(Counter((x.checks or {}).get("call", "?") for x in logs if "call" in (x.checks or {}))),
        "thumbsUp": sum(1 for x in logs if x.feedback == 1),
        "thumbsDown": sum(1 for x in logs if x.feedback == -1),
        "avgTokensIn": int(statistics.mean(x.tokens_in for x in called)) if called else None,
        "avgTokensOut": int(statistics.mean(x.tokens_out for x in called)) if called else None,
        "avgLatencyMs": int(statistics.mean(x.latency_ms for x in called)) if called else None,
    }
    from .bank import case_key
    live_extra = [bank.extra.get(case_key(c), {}) for c in cases]  # 지금 문제 은행에 있는 문제만 센다
    return {
        "summary": bank.summary, "confusion": conf, "chase": chase, "events": events, "histogram": hist,
        "ai": ai_stats, "plays": play_stats, "aiOps": ai_ops,
        "survey": survey_stats(s),
        "funnel": funnel_stats(s),
        "aiEval": [h["summary"] for h in bank.ai_eval][-5:],
        "aiProvider": ai_mod.provider(), "aiModel": ai_mod.model_name(),
        "quality": bank.quality,
        "text": bank.text,
        "perf": {"routes": perf_summary(), "uptimeSec": int(time.time() - STARTED)},
        "enrich": {
            "finance": sum(1 for e in live_extra if e.get("finance")),
            "docs": sum(len(e.get("docs", {})) for e in live_extra),
            "facts": sum(len(d.get("facts", [])) for e in live_extra for d in e.get("docs", {}).values()),
            "news": sum(len(e.get("news", {}).get("before", [])) for e in live_extra),
        },
    }


# ------------------------------------------------------------ 설문(Needs 근거)
class SurveyIn(BaseModel):
    youtube: str = Field(description="often · sometimes · never — 평소 유튜브를 보고 종목을 고르나")
    helpful: int = Field(ge=1, le=5, description="판단 연습에 도움이 됐나(1~5)")
    lesson: str = Field(description="yt · info · hard · fun — 가장 크게 느낀 점")


@app.post("/v1/games/{gid}/survey", tags=["설문"], summary="게임을 마친 뒤 짧은 설문(선택, 게임당 한 번)")
def survey(gid: str, body: SurveyIn, s: S = Depends(db)):
    g = get_game(s, gid)
    if g.stage != "done":
        raise HTTPException(409, "게임을 끝낸 뒤에 답할 수 있어요.")
    if body.youtube not in ("often", "sometimes", "never") or body.lesson not in ("yt", "info", "hard", "fun"):
        raise HTTPException(400, "선택지에 없는 답이에요.")
    if s.get(Survey, gid):
        raise HTTPException(409, "이미 답했어요. 고마워요!")
    s.add(Survey(game_id=gid, youtube=body.youtube, helpful=body.helpful, lesson=body.lesson))
    s.commit()
    return {"ok": True}


def funnel_stats(s: S) -> dict:
    """이용 흐름: 어디까지 하고 그만두나(라운드별 남은 게임), 한 판 걸리는 시간, 판을 거듭하면 나아지나"""
    games = [g for g in s.scalars(select(Game)).all() if valid(g)]
    n_plays = {g.id: len(g.plays) for g in games}
    started = len(games)
    reached = [sum(1 for g in games if n_plays[g.id] >= r) for r in range(1, rules.ROUNDS + 1)]
    done = [g for g in games if g.stage == "done" and g.finished_at and g.created_at]
    mins = sorted((_aware(g.finished_at) - _aware(g.created_at)).total_seconds() / 60 for g in done)
    plays = [p for g in games for p in g.plays]
    # 같은 사람(계정 또는 기기)의 n번째 완주 게임 적중 수
    by_who: dict[str, list[Game]] = defaultdict(list)
    for g in done:
        who = g.user_id or g.device
        if who:
            by_who[who].append(g)
    nth: dict[int, list[int]] = defaultdict(list)
    for gs in by_who.values():
        for i, g in enumerate(sorted(gs, key=lambda x: _aware(x.finished_at)), 1):
            nth[min(i, 4)].append(sum(p.hit for p in g.plays))
    return {
        "started": started, "reached": reached, "finished": len(done),
        "medianMin": round(mins[len(mins) // 2], 1) if mins else None,
        "exitShare": round(sum((p.exit_day or 20) < 20 for p in plays) / len(plays), 3) if plays else None,
        "learning": [{"nth": k, "games": len(v), "avgHits": round(statistics.mean(v), 2)} for k, v in sorted(nth.items())],
    }


def survey_stats(s: S) -> dict:
    rows = s.scalars(select(Survey)).all()
    return {
        "n": len(rows),
        "youtube": dict(Counter(r.youtube for r in rows)),
        "lesson": dict(Counter(r.lesson for r in rows)),
        "helpful": round(statistics.mean(r.helpful for r in rows), 2) if rows else None,
        "helpfulDist": {str(k): sum(1 for r in rows if r.helpful == k) for k in range(1, 6)},
    }


# ------------------------------------------------------------ 실시간 랭킹·대시보드
_live_cache: dict[str, tuple[float, dict]] = {}
KST = timezone(timedelta(hours=9))
ANON = "익명 부엉이"


def _aware(d: datetime | None) -> datetime | None:
    return None if d is None else (d if d.tzinfo else d.replace(tzinfo=timezone.utc))


@app.get("/v1/live", tags=["랭킹"], summary="실시간 랭킹·대시보드(2초 캐시). scope=today(한국 시간 오늘) · all")
def live(scope: str = "today", s: S = Depends(db)):
    scope = scope if scope in ("all", "today", "daily") else "today"
    hit = _live_cache.get(scope)
    if hit and time.monotonic() - hit[0] < 2:
        return hit[1]
    now_ = datetime.now(timezone.utc)
    since = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc) if scope == "today" else None

    q = select(Game)
    if scope == "daily":
        q = q.where(Game.daily == today_kst(), Game.mode == "daily")  # 오늘의 챌린지: 모두 같은 문제, 기기당 첫 판만
    elif since:
        q = q.where(Game.created_at >= since)
    games = [g for g in s.scalars(q).all() if valid(g)]
    for g in games:  # 예전에 끝난 게임은 기록이 비어 있을 수 있다
        if g.stage == "done" and g.final_ret is None:
            finalize(g)
    s.commit()
    done = [g for g in games if g.stage == "done"]
    playing = [g for g in games if g.stage != "done" and _aware(g.round_started) and now_ - _aware(g.round_started) < timedelta(minutes=10)]
    pq = select(Play)
    if since:
        pq = pq.where(Play.created_at >= since)
    plays = [p for p in s.scalars(pq).all() if bank.has(p.case_key)]

    def row(g: Game) -> dict:
        return {"id": g.id[:6], "nickname": g.nickname or ANON, "ret": round(g.final_ret or 0, 4), "hits": g.hits or 0,
                "grade": grade_of(g.hits or 0), "beatYt": (g.final_ret or 0) >= (g.yt_ret or 0),
                "at": _aware(g.finished_at).isoformat() if g.finished_at else None}

    by_ret = sorted(done, key=lambda g: (-(g.final_ret or 0), -(g.hits or 0)))
    by_hit = sorted(done, key=lambda g: (-(g.hits or 0), -(g.final_ret or 0)))
    feed = []
    for g in sorted(done, key=lambda g: _aware(g.finished_at) or now_, reverse=True)[:8]:
        feed.append({"kind": "finish", **row(g)})
    names = {g.id: g.nickname or ANON for g in games}
    for p in sorted(plays, key=lambda p: _aware(p.created_at), reverse=True)[:30]:
        if p.hit and p.ret >= 0.08:  # 맞히고 8% 넘게 번 라운드만(맞혀도 잃은 경우는 소식에서 뺀다)
            feed.append({"kind": "bighit", "nickname": names.get(p.game_id, ANON), "ret": round(p.ret, 4), "short": p.w1 < 0,
                         "round": p.round + 1, "at": _aware(p.created_at).isoformat()})
    feed.sort(key=lambda x: x["at"] or "", reverse=True)

    cards = Counter(k for p in plays for k in p.opened)
    card_hits = Counter(k for p in plays if p.hit for k in p.opened)
    edges = [-1, -0.3, -0.1, 0, 0.1, 0.3, 99]
    rets = [g.final_ret or 0 for g in done]
    out = {
        "scope": scope, "at": now_.isoformat(), "daily": today_kst(),
        "stats": {
            "started": len(games), "finished": len(done), "playing": len(playing), "rounds": len(plays),
            "hitRate": round(sum(p.hit for p in plays) / len(plays), 3) if plays else None,
            "shortShare": round(sum(p.w1 < 0 for p in plays) / len(plays), 3) if plays else None,
            "avgRet": round(statistics.mean(rets), 4) if rets else None,
            "beatYtShare": round(sum((g.final_ret or 0) >= (g.yt_ret or 0) for g in done) / len(done), 3) if done else None,
        },
        "leaders": [row(g) for g in by_ret[:10]],
        "sharp": [row(g) for g in by_hit[:5]],
        "feed": feed[:12],
        "cards": {k: {"opened": cards[k], "hitRate": round(card_hits[k] / cards[k], 3) if cards[k] else None} for k in CARDS},
        "histogram": [{"lo": edges[i], "hi": edges[i + 1], "n": sum(1 for r in rets if edges[i] <= r < edges[i + 1])} for i in range(len(edges) - 1)],
        "grades": dict(Counter(grade_of(g.hits or 0) for g in done)),
    }
    _live_cache[scope] = (time.monotonic(), out)
    return out


# ------------------------------------------------------------ 로그인한 사람(선택): 내 전적·성장 기록
MAX_GAME_XP = 800  # 한 판 최대(라운드 10 × 최대 65 + 완주 100) 근처. 넘는 값은 깎는다


def _clean_progress(p: dict) -> dict:
    """화면이 보낸 기록 검사: 모양이 틀리면 400, 게임당 XP 는 상한까지"""
    try:
        xp = {str(k)[:40]: max(0, min(int(v), MAX_GAME_XP)) for k, v in (p.get("xpByGame") or {}).items()}
        badges = {str(k)[:30]: {"at": str(v.get("at", ""))[:40], "game": str(v.get("game", ""))[:40]}
                  for k, v in (p.get("badges") or {}).items() if isinstance(v, dict)}
        paid = {str(k)[:40]: [int(x) for x in v][:12] for k, v in (p.get("paid") or {}).items()}
        nums = {k: max(0, min(int(p.get(k, 0) or 0), 100000)) for k in ("games", "rounds", "hits")}
    except (TypeError, ValueError, AttributeError) as e:
        raise HTTPException(400, "기록 모양이 이상해요.") from e
    return {**nums, "xpByGame": xp, "badges": badges, "paid": paid}


def merge_progress(a: dict, b: dict) -> dict:
    """기기 기록과 계정 기록 합치기. 같은 게임의 보상은 한 번만(게임 id 기준), 배지는 먼저 딴 날짜."""
    a, b = a or {}, b or {}
    badges = dict(a.get("badges", {}))
    for k, v in (b.get("badges") or {}).items():
        if k not in badges or str(v.get("at", "")) < str(badges[k].get("at", "")):
            badges[k] = v
    paid: dict = {}
    for src in (a.get("paid") or {}, b.get("paid") or {}):
        for gid, rs in src.items():
            paid[gid] = sorted(set(paid.get(gid, [])) | set(int(x) for x in rs))
    xp_by: dict = {}
    for src in (a.get("xpByGame") or {}, b.get("xpByGame") or {}):
        for gid, x in src.items():
            xp_by[gid] = max(xp_by.get(gid, 0), int(x))
    mx = lambda k: max(int(a.get(k, 0) or 0), int(b.get(k, 0) or 0))  # noqa: E731
    return {"xp": sum(xp_by.values()), "games": mx("games"), "rounds": mx("rounds"), "hits": mx("hits"),
            "badges": badges, "paid": paid, "xpByGame": xp_by}


def _me(s: S, request: Request) -> User:
    uid = auth.user_id(request, required=True)
    u = s.get(User, uid)
    if not u:
        u = User(id=uid, progress={})
        s.add(u)
        s.commit()
    return u


class ProgressIn(BaseModel):
    progress: dict


class MeIn(BaseModel):
    nickname: str = Field(max_length=20)


class Claim(BaseModel):
    gameIds: list[str] = Field(default_factory=list, max_length=50)


HABIT = {"chart": "차트파", "disclosure": "공시파", "youtube": "유튜브파", "finance": "숫자파", "news": "뉴스파", "ai": "AI파"}


@app.get("/v1/me", tags=["내 기록"], summary="로그인한 사람의 프로필·성장 기록·모든 게임 전적")
def me(request: Request, s: S = Depends(db)):
    u = _me(s, request)
    games = s.scalars(select(Game).where(Game.user_id == u.id, Game.stage == "done").order_by(Game.finished_at)).all()
    games = [g for g in games if valid(g)]
    rows, plays = [], []
    for g in games:
        if g.final_ret is None:
            finalize(g)
        cards = Counter(k for p in g.plays for k in p.opened)
        top = cards.most_common(1)[0] if cards else None
        rows.append({"id": g.id, "at": _aware(g.finished_at).isoformat() if g.finished_at else None, "mode": g.mode or "free",
                     "ret": round(g.final_ret or 0, 4), "ytRet": round(g.yt_ret or 0, 4), "hits": g.hits or 0, "grade": grade_of(g.hits or 0),
                     "habit": HABIT[top[0]] if top and top[1] >= 8 else "골고루파", "shorts": sum(p.w1 < 0 for p in g.plays),
                     "exits": sum((p.exit_day or 20) < 20 for p in g.plays)})
        plays += g.plays
    s.commit()
    card_n = Counter(k for p in plays for k in p.opened)
    card_hit = Counter(k for p in plays if p.hit for k in p.opened)
    stats = {
        "games": len(rows), "rounds": len(plays),
        "hitRate": round(sum(p.hit for p in plays) / len(plays), 3) if plays else None,
        "bestRet": max((r["ret"] for r in rows), default=None),
        "avgRet": round(statistics.mean(r["ret"] for r in rows), 4) if rows else None,
        "beatYt": sum(r["ret"] >= r["ytRet"] for r in rows),
        "shortShare": round(sum(p.w1 < 0 for p in plays) / len(plays), 3) if plays else None,
        "exitShare": round(sum((p.exit_day or 20) < 20 for p in plays) / len(plays), 3) if plays else None,
        "cards": {k: {"opened": card_n[k], "hitRate": round(card_hit[k] / card_n[k], 3) if card_n[k] else None} for k in CARDS},
    }
    return {"user": {"id": u.id[:8], "nickname": u.nickname}, "progress": u.progress or {}, "stats": stats, "games": rows[::-1][:50]}


@app.put("/v1/me", tags=["내 기록"], summary="닉네임 바꾸기")
def me_update(body: MeIn, request: Request, s: S = Depends(db)):
    u = _me(s, request)
    u.nickname = clean_nick(body.nickname)
    s.commit()
    return {"nickname": u.nickname}


@app.post("/v1/me/progress", tags=["내 기록"], summary="이 기기의 XP·배지를 계정 기록과 합치기 → 합친 결과")
def me_progress(body: ProgressIn, request: Request, s: S = Depends(db)):
    if len(json.dumps(body.progress)) > 60_000:
        raise HTTPException(413, "기록이 너무 커요.")
    u = _me(s, request)
    u.progress = merge_progress(u.progress or {}, _clean_progress(body.progress))
    u.updated_at = now()
    s.commit()
    return {"progress": u.progress}


@app.post("/v1/me/claim", tags=["내 기록"], summary="로그인 전에 이 기기에서 한 게임을 내 계정으로 옮기기")
def me_claim(body: Claim, request: Request, s: S = Depends(db)):
    u = _me(s, request)
    n = 0
    for gid in body.gameIds:
        g = s.get(Game, gid)
        if g and g.user_id is None:
            g.user_id = u.id
            if not g.nickname and u.nickname:
                g.nickname = u.nickname
            n += 1
    s.commit()
    return {"claimed": n}
