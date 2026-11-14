"""로그인(선택). 구글 로그인은 화면에서 Supabase Auth 로 하고, 서버는 그 토큰만 검증한다.

- 비밀번호·구글 토큰을 서버가 다루지 않는다. 저장하는 건 Supabase 사용자 id(sub)와 플레이어가 정한 닉네임뿐(이메일 저장 안 함).
- 검증: SUPABASE_JWT_SECRET 이 있으면 HS256, 없으면 SUPABASE_URL 의 JWKS(공개키, ES256/RS256).
- 로그인 안 해도 게임은 그대로. 로그인하면 게임·레벨·배지가 계정에 붙어 기기를 바꿔도 남는다.
"""
from __future__ import annotations

import jwt
from fastapi import HTTPException, Request

from .settings import SUPABASE_JWT_SECRET, SUPABASE_URL

_jwks: jwt.PyJWKClient | None = None


def enabled() -> bool:
    return bool(SUPABASE_JWT_SECRET or SUPABASE_URL)


def _decode(token: str) -> dict:
    if SUPABASE_JWT_SECRET:
        return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    key = _jwks.get_signing_key_from_jwt(token)
    return jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated")


def user_id(request: Request, required: bool = False) -> str | None:
    """로그인한 사용자 id. 토큰이 없거나 틀리면: required 면 401, 아니면 손님(None)."""
    h = request.headers.get("authorization", "")
    if not h.lower().startswith("bearer ") or not enabled():
        if required:
            raise HTTPException(401, "로그인이 필요해요.")
        return None
    try:
        claims = _decode(h[7:].strip())
    except Exception as e:  # 만료·위조·키 없음
        if required:
            raise HTTPException(401, "로그인이 만료됐어요. 다시 로그인해 주세요.") from e
        return None
    sub = claims.get("sub")
    if not sub and required:
        raise HTTPException(401, "로그인 정보가 이상해요.")
    return sub
