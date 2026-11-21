"""개미 비서의 검색(시점 제한 RAG).

문서 = 종목-주별 가려진 유튜브 제목·공시 제목(scripts/build_season.py → build_rag.py 가 임베딩).
검색 조건을 SQL 단계에서 건다: 이번 판 종목(a = any) AND 지금 보이는 주 이하(w <= 지금) AND 최근 12주.
→ 미래 문서는 모델에 아예 가지 않는다.

저장소
- PostgreSQL + pgvector(Supabase, 로컬 docker): rag_docs 표, emb vector(256), 코사인 거리(<=>) 정렬
- 그 밖(SQLite·pgvector 없음): 메모리 numpy 로 같은 조건 검색(개발·테스트용)
"""
from __future__ import annotations

import base64
import json
import logging
import time

import httpx
import numpy as np
from sqlalchemy import text

from .db import engine
from .settings import DATA_DIR, GEMINI_API_KEY

log = logging.getLogger("rag")
WINDOW = 12  # 최근 몇 주까지 찾나


class Index:
    def __init__(self):
        self.docs: list[dict] = []
        self.emb: np.ndarray | None = None
        self.model = ""
        self.dim = 256
        self.backend = "off"
        self.total = 0

    def load(self) -> None:
        p = DATA_DIR / "rag.json"
        if not p.exists():
            log.warning("data/rag.json 없음 → 개미 비서 검색 꺼짐")
            return
        raw = json.loads(p.read_text())
        self.docs, self.model, self.dim = raw["docs"], raw["model"], raw["dim"]
        self.total = raw.get("total", len(self.docs))
        q = np.frombuffer(base64.b64decode(raw["emb"]), dtype=np.int8).reshape(len(self.docs), self.dim)
        m = q.astype(np.float32)
        self.emb = m / (np.linalg.norm(m, axis=1, keepdims=True) + 1e-9)
        self.backend = "memory"
        if engine.dialect.name == "postgresql":
            try:
                self._sync_pg()
                self.backend = "pgvector"
            except Exception as e:  # pgvector 가 없거나 권한이 없으면 메모리로
                log.warning("pgvector 사용 못 함 → 메모리 검색: %s", e)

    def _sync_pg(self) -> None:
        """rag_docs 표가 지금 색인과 다르면(모델·문서 수) 다시 채운다"""
        sig = f"{self.model}:{self.dim}:{len(self.docs)}"
        with engine.begin() as c:
            c.execute(text("create extension if not exists vector"))
            c.execute(text(f"""create table if not exists rag_docs (
                id int primary key, a int not null, w int not null, k text, t text, ch text, st text, v int,
                emb vector({self.dim}) not null)"""))
            c.execute(text("create index if not exists rag_docs_aw on rag_docs (a, w)"))
            c.execute(text("create table if not exists rag_meta (k text primary key, v text)"))
            have = c.execute(text("select v from rag_meta where k='sig'")).scalar()
            if have == sig:
                return
            c.execute(text("truncate rag_docs"))
            rows = [{"id": d["id"], "a": d["a"], "w": d["w"], "k": d["k"], "t": d["t"], "ch": d["ch"], "st": d["st"],
                     "v": d["v"], "e": "[" + ",".join(f"{x:.4f}" for x in self.emb[i]) + "]"} for i, d in enumerate(self.docs)]
            for i in range(0, len(rows), 1000):
                c.execute(text("insert into rag_docs (id,a,w,k,t,ch,st,v,emb) values (:id,:a,:w,:k,:t,:ch,:st,:v,cast(:e as vector))"),
                          rows[i:i + 1000])
            c.execute(text("insert into rag_meta (k,v) values ('sig', :s) on conflict (k) do update set v = excluded.v"), {"s": sig})
        log.info("rag_docs 를 채웠어요: %s", sig)

    @property
    def ready(self) -> bool:
        return self.emb is not None

    def search(self, qv: np.ndarray | None, assets: list[int], wmax: int, focus: int | None, k: int = 8) -> list[dict]:
        """(문서, 점수) 상위 k. focus 종목이 있으면 그 종목 문서를 먼저 6개, 나머지 종목에서 2개.
        점수 = 의미 유사도 + 최근성 가산(최근 주일수록 최대 +0.08). 질문 임베딩이 없으면(한도 초과 등) 최근 순."""
        wmin = wmax - WINDOW + 1
        plan = [([focus], 6), ([a for a in assets if a != focus], 2)] if focus is not None else [(assets, k)]
        out: list[dict] = []
        for pool, n in plan:
            if not pool or n <= 0:
                continue
            if qv is None:
                cand = self._recent(pool, wmin, wmax, n)
            else:
                cand = self._pg(qv, pool, wmin, wmax, n * 3) if self.backend == "pgvector" else self._mem(qv, pool, wmin, wmax, n * 3)
                for d in cand:
                    d["score"] = float(d["score"]) + 0.08 * (d["w"] - wmin) / max(1, WINDOW - 1)
                cand = sorted(cand, key=lambda d: -d["score"])[:n]
            out += cand
        return out

    def _recent(self, pool, wmin, wmax, n) -> list[dict]:
        ds = [d for d in self.docs if d["a"] in pool and wmin <= d["w"] <= wmax]
        ds.sort(key=lambda d: (-d["w"], -d["v"]))
        return [{**d, "score": 0.0} for d in ds[:n]]

    def _mem(self, qv, pool, wmin, wmax, n) -> list[dict]:
        idx = [i for i, d in enumerate(self.docs) if d["a"] in pool and wmin <= d["w"] <= wmax]
        if not idx:
            return []
        sims = self.emb[idx] @ qv
        top = np.argsort(-sims)[:n]
        return [{**self.docs[idx[j]], "score": float(sims[j])} for j in top]

    def _pg(self, qv, pool, wmin, wmax, n) -> list[dict]:
        vec = "[" + ",".join(f"{x:.5f}" for x in qv) + "]"
        with engine.connect() as c:
            rows = c.execute(text("""select id,a,w,k,t,ch,st,v, 1 - (emb <=> cast(:q as vector)) as score from rag_docs
                                     where a = any(:pool) and w between :wmin and :wmax
                                     order by emb <=> cast(:q as vector) limit :n"""),
                             {"q": vec, "pool": list(pool), "wmin": wmin, "wmax": wmax, "n": n}).mappings().all()
        return [dict(r) for r in rows]


index = Index()


def embed_query(question: str, model: str) -> tuple[np.ndarray, int]:
    """질문 임베딩(RETRIEVAL_QUERY). (벡터, 걸린 ms)"""
    import os
    if not GEMINI_API_KEY or os.environ.get("RAG_EMBED") == "0":  # 평가 때 임베딩 한도를 아끼려고 끌 수 있다
        raise RuntimeError("embedding off")
    t0 = time.perf_counter()
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent",
                   json={"content": {"parts": [{"text": question}]}, "taskType": "RETRIEVAL_QUERY", "outputDimensionality": index.dim},
                   headers={"x-goog-api-key": GEMINI_API_KEY}, timeout=15)
    r.raise_for_status()
    v = np.array(r.json()["embedding"]["values"], dtype=np.float32)
    return v / (np.linalg.norm(v) + 1e-9), int((time.perf_counter() - t0) * 1000)


def keyword_vector(question: str) -> np.ndarray | None:
    """임베딩 API 를 못 쓸 때: 질문 단어가 들어간 문서들의 평균 벡터(간이 검색). 없으면 None → 최근 순"""
    words = [w for w in question.replace("?", " ").split() if len(w) >= 2]
    hits = [i for i, d in enumerate(index.docs) if any(w in d["t"] for w in words)][:200]
    if not hits or index.emb is None:
        return None
    v = index.emb[hits].mean(axis=0)
    return v / (np.linalg.norm(v) + 1e-9)
