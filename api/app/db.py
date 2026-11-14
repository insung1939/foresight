"""DB 테이블 3개: 게임, 라운드 판단, AI 호출 기록. 로컬은 SQLite, 배포는 DATABASE_URL(PostgreSQL)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

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


class Game(Base):
    __tablename__ = "games"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_ids: Mapped[list] = mapped_column(JSON)  # 문제 key 10개(종목|날짜, 서버 전용)
    round: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str] = mapped_column(String(10), default="pick")  # pick · event · reveal · done
    opened: Mapped[list] = mapped_column(JSON, default=list)
    w1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    w2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    asked: Mapped[int] = mapped_column(Integer, default=0)
    round_started: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 랭킹용(완주 때 채움). 닉네임은 선택 — 없으면 '익명 부엉이'
    day: Mapped[int] = mapped_column(Integer, default=0)  # 리플레이 진행 거래일(0~20)
    exit_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 중도 매도한 날(없으면 20)
    decide_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 판단까지 걸린 시간
    mode: Mapped[str] = mapped_column(String(8), default="free")  # free · daily(오늘의 챌린지)
    daily: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)  # 챌린지 날짜 YYYY-MM-DD(KST)
    device: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)  # 기기 표식(챌린지 첫 판만 순위)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # 로그인했으면 Supabase 사용자 id
    nickname: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    final_ret: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    hits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    yt_ret: Mapped[float | None] = mapped_column(Float, nullable=True)
    plays: Mapped[list["Play"]] = relationship(back_populates="game", order_by="Play.round")


class Play(Base):
    __tablename__ = "plays"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    case_key: Mapped[str] = mapped_column(String(40), index=True)
    opened: Mapped[list] = mapped_column(JSON)
    w1: Mapped[int] = mapped_column(Integer)
    w2: Mapped[int] = mapped_column(Integer)
    ret: Mapped[float] = mapped_column(Float)
    hit: Mapped[bool] = mapped_column(Boolean)
    ms: Mapped[int] = mapped_column(Integer)
    exit_day: Mapped[int] = mapped_column(Integer, default=20)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    game: Mapped[Game] = relationship(back_populates="plays")


class AiLog(Base):
    """AI 호출마다 한 줄: 무엇을 물었고, 검증을 통과했는지, 얼마나 걸렸는지(발표 '응답 검증·오류 대응' 근거)"""

    __tablename__ = "ai_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(10))  # ask · judge
    game_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    case_key: Mapped[str] = mapped_column(String(40))
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean)
    checks: Mapped[dict] = mapped_column(JSON, default=dict)  # 검증 항목별 결과
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(40), default="")
    feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 사용자 평가 👍 1 · 👎 -1
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    """로그인한 사람(선택). id = Supabase 사용자 id. 이메일은 저장하지 않는다."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    nickname: Mapped[str | None] = mapped_column(String(20), nullable=True)
    progress: Mapped[dict] = mapped_column(JSON, default=dict)  # XP·배지(화면 progress.ts 와 같은 모양)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Survey(Base):
    """게임을 마친 사람의 짧은 설문(선택). Needs 근거로 쓴다. 자유 서술은 받지 않는다(개인정보가 섞이지 않게)."""

    __tablename__ = "surveys"
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id"), primary_key=True)
    youtube: Mapped[str] = mapped_column(String(10))   # often · sometimes · never — 평소 유튜브를 보고 종목을 고르나
    helpful: Mapped[int] = mapped_column(Integer)      # 1~5 — 판단 연습에 도움이 됐나
    lesson: Mapped[str] = mapped_column(String(10))    # yt · info · hard · fun — 가장 크게 느낀 점
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# 이미 만들어진 DB 에 나중에 추가한 컬럼(간단 마이그레이션: 없으면 ADD COLUMN)
LATER_COLUMNS = {
    "games": {"nickname": "VARCHAR(20)", "final_ret": "FLOAT", "hits": "INTEGER", "yt_ret": "FLOAT",
              "day": "INTEGER DEFAULT 0", "exit_day": "INTEGER", "decide_ms": "INTEGER", "mode": "VARCHAR(8) DEFAULT 'free'",
              "daily": "VARCHAR(10)", "device": "VARCHAR(40)", "user_id": "VARCHAR(64)"},
    "plays": {"exit_day": "INTEGER DEFAULT 20"},
    "ai_logs": {"feedback": "INTEGER"},
}


def init_db():
    from sqlalchemy import inspect, text

    Base.metadata.create_all(engine)
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in LATER_COLUMNS.items():
            have = {c["name"] for c in insp.get_columns(table)}
            for name, typ in cols.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typ}"))
    # 한 라운드는 한 번만 기록(동시 요청 대비 마지막 방어선)
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_plays_game_round ON plays (game_id, round)"))
    except Exception:  # 예전 개발 DB 에 중복이 남아 있으면 건너뛴다(새 DB 에선 항상 생성)
        pass
