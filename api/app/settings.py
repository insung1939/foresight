"""환경변수. 키는 .env 에만 두고 코드·화면에 쓰지 않는다."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # geuttae/
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DATA_DIR / 'geuttae.db'}"
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5175").split(",") if o.strip()]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash").strip()
# 기본 모델이 바쁘거나(503) 한도(429)·시간 초과면 차례로 넘어갈 모델들(쉼표)
GEMINI_FALLBACKS = [m.strip() for m in os.environ.get("GEMINI_FALLBACKS", "gemini-3.5-flash-lite").split(",") if m.strip()]
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "25"))

ASK_PER_ROUND = 3  # 라운드당 AI 질문 수
ASK_MAX_CHARS = 200

# 로그인(선택): Supabase Auth 구글 로그인. 서버는 Supabase 가 발급한 토큰(JWT)만 검증한다.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")  # JWKS(공개키)로 검증
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "").strip()  # 예전 방식(HS256) 프로젝트용, 있으면 우선

# AI 제공자: auto(Gemini 키가 있으면 Gemini, 없으면 로컬 Ollama) · gemini · ollama
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "auto").strip()
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3.5:4b").strip()  # 수업 3주차 로컬 모델
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "90"))
