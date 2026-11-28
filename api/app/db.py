"""DB 테이블 2개: 판(runs)과 AI 호출 기록. 로컬은 SQLite, 배포는 DATABASE_URL(PostgreSQL)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .settings import DATABASE_URL


def now() -> datetime:
    return datetime.now(timezone.utc)


url = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1) if DATABASE_URL.startswith("postgresql://") else DATABASE_URL
engine = create_engine(
    url,
    pool_pre_ping=True,
    **({"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_size": 3, "max_overflow": 4, "pool_timeout": 10}),
)
Session = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Run(Base):
    """한 판(26주). 게임 상태 전체는 state(JSON) 하나 — 규칙은 season.py 에 있다."""

    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    mode: Mapped[str] = mapped_column(String(8), default="free")          # daily(오늘의 시드) · free
    day: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)  # 오늘의 시드 날짜(KST)
    device: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    nickname: Mapped[str | None] = mapped_column(String(20), nullable=True)
    state: Mapped[dict] = mapped_column(JSON)
    turn: Mapped[int] = mapped_column(Integer, default=0)
    done: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ret: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    title: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)  # 그날 그 기기의 첫 완주만 순위
    coach: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    char: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)  # 내 개미
    stars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    beat_yt: Mapped[int | None] = mapped_column(Integer, nullable=True)   # 이긴 유튜버 수(0~3)
    beat_ix: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # 코스피를 이겼나
    fomo: Mapped[int | None] = mapped_column(Integer, nullable=True)      # 추격 매수 횟수
    trades: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClientErr(Base):
    """화면(브라우저)에서 난 오류 — 신뢰성 지표('지난 7일 화면 오류 n건'). 개인정보 없이 메시지·경로만"""
    __tablename__ = "client_errors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    kind: Mapped[str] = mapped_column(String(16), default="error")  # error · rejection · render
    msg: Mapped[str] = mapped_column(String(300), default="")
    path: Mapped[str] = mapped_column(String(80), default="")


class AiLog(Base):
    """AI 호출마다 한 줄(코치·개미 비서): 검증 통과 여부·지연·토큰·검색 문서 수(발표 '응답 검증·오류 대응' 근거)"""

    __tablename__ = "ai_calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(8), default="coach")  # coach · ask
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    docs: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 👍 1 · 👎 -1
    ok: Mapped[bool] = mapped_column(Boolean)
    checks: Mapped[dict] = mapped_column(JSON, default=dict)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# 이미 만들어진 DB 에 나중에 추가한 컬럼(간단 마이그레이션: 없으면 ADD COLUMN)
LATER = {"runs": {"char": "VARCHAR(10)", "stars": "INTEGER", "beat_yt": "INTEGER", "beat_ix": "BOOLEAN",
                  "fomo": "INTEGER", "trades": "INTEGER"}}


def init_db():
    from sqlalchemy import inspect, text

    Base.metadata.create_all(engine)
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in LATER.items():
            have = {c["name"] for c in insp.get_columns(table)}
            for name, typ in cols.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typ}"))
