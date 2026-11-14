"""운영 품질: 응답 시간 측정 · 요청 한도 · 보안 헤더.

- 응답 시간: 경로(라우트 틀)별 최근 500건의 지연을 메모리에 모아 p50·p95 를 낸다 → /v1/meta 'perf'.
- 요청 한도: IP 별 1분 창. AI 질문은 비용이 드니 가장 엄격하게. 넘으면 429 + Retry-After.
- 보안 헤더: 내용 추측 금지, 다른 사이트 iframe 금지, 리퍼러 최소화. 게임 응답은 캐시하지 않는다.
서버 한 대(Render 무료)를 가정한 단순 구현이다. 여러 대로 늘리면 Redis 같은 공유 저장소가 필요하다.
"""
from __future__ import annotations

import asyncio
import os
import re
import statistics
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# ------------------------------------------------------------ 응답 시간
_lat: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))
_count: dict[str, int] = defaultdict(int)
STARTED = time.time()


def perf_summary() -> list[dict]:
    out = []
    for path, xs in _lat.items():
        if not xs:
            continue
        s = sorted(xs)
        out.append({"path": path, "n": _count[path], "p50": round(statistics.median(s), 1),
                    "p95": round(s[min(len(s) - 1, int(len(s) * 0.95))], 1), "max": round(s[-1], 1)})
    return sorted(out, key=lambda r: -r["n"])


# ------------------------------------------------------------ 요청 한도
LIMITS = {  # (규칙 이름, 1분에 허용 횟수) — 한 사람(IP + 기기 표식) 기준
    "ask": 12,       # AI 질문: 게임당 라운드 3번 제한과 별도로, 여러 게임을 만들어 비용을 쓰는 것을 막는다
    "new": 20,       # 새 게임
    "write": 600,    # 그 밖의 POST(카드·판단·리플레이 하루 진행 — 2배속이면 1분에 160번 안팎)
    "ask_all": 60,   # AI 질문 서버 전체(비용 상한)
}
_hits: dict[tuple[str, str], deque] = defaultdict(deque)
ENABLED = os.environ.get("RATE_LIMIT", "1") != "0"  # 테스트에서만 끈다


def _rule(method: str, path: str) -> str | None:
    if method != "POST":
        return None
    if path.endswith("/ask"):
        return "ask"
    if path.rstrip("/") == "/v1/games":
        return "new"
    return "write"


def client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for")  # Render·Vercel 은 프록시 뒤라 실제 IP 가 여기 있다
    return fwd.split(",")[0].strip() if fwd else (req.client.host if req.client else "?")


def client_key(req: Request) -> str:
    """한도를 셀 단위: IP + 기기 표식. 강의실처럼 한 IP(같은 와이파이)에 여러 명이어도 서로 막지 않게.
    둘 다 위조할 수 있지만, 비용이 드는 AI 는 서버 전체 상한(ask_all)과 게임당 3번 제한이 따로 막는다."""
    return f"{client_ip(req)}|{(req.headers.get('x-device') or '')[:40]}"


def check_limit(rule: str, ip: str, now: float) -> int | None:
    """한도 안이면 None, 넘었으면 몇 초 뒤 다시 되는지"""
    q = _hits[(rule, ip)]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= LIMITS[rule]:
        return int(60 - (now - q[0])) + 1
    q.append(now)
    return None


def reset_limits():
    _hits.clear()


# ------------------------------------------------------------ 게임별 잠금
# 같은 게임에 요청이 동시에 오면(연타·스크립트) '확인 → 변경' 사이에 끼어들어 카드 4장 이상, 라운드 중복 기록이 생긴다.
# 게임 id 별로 한 번에 하나씩만 처리한다(서버 한 대 가정). DB 에는 (game_id, round) 유니크 인덱스로 한 번 더 막는다.
_GAME_POST = re.compile(r"^/v1/games/([^/]+)/")
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(gid: str) -> asyncio.Lock:
    if len(_locks) > 5000:  # 오래된 잠금 정리(사용 중이 아닌 것만)
        for k in [k for k, v in _locks.items() if not v.locked()][:2500]:
            _locks.pop(k, None)
    return _locks.setdefault(gid, asyncio.Lock())


class OpsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        m = _GAME_POST.match(request.url.path) if request.method == "POST" else None
        if m:
            async with _lock_for(m.group(1)):
                return await self._handle(request, call_next)
        return await self._handle(request, call_next)

    async def _handle(self, request: Request, call_next):
        t = time.perf_counter()
        rule = _rule(request.method, request.url.path) if ENABLED else None
        if rule:
            now = time.monotonic()
            wait = check_limit(rule, client_key(request), now)
            if wait is None and rule == "ask":
                wait = check_limit("ask_all", "*", now)
            if wait is not None:
                return JSONResponse({"detail": f"요청이 너무 많아요. {wait}초 뒤에 다시 해 주세요."}, status_code=429,
                                    headers={"Retry-After": str(wait)})
        resp = await call_next(request)
        route = request.scope.get("route")
        key = f"{request.method} {getattr(route, 'path', request.url.path)}"
        ms = (time.perf_counter() - t) * 1000
        if route is not None:
            _lat[key].append(ms)
            _count[key] += 1
        resp.headers["X-Response-Time"] = f"{ms:.1f}ms"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/v1/games"):
            resp.headers["Cache-Control"] = "no-store"
        return resp
