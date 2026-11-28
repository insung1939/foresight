"""RAG 문서 임베딩 → data/rag.json (개미 비서가 쓰는 검색 색인)

    .venv/bin/python scripts/build_rag.py               # 오늘 무료 한도 안에서(기본 950건) 중요한 문서부터 임베딩
    .venv/bin/python scripts/build_rag.py --budget 0    # 새로 부르지 않고 캐시만으로 rag.json 다시 만들기

무료 한도: Gemini 임베딩은 모델마다 하루 약 1,000건. 그래서 '중요한 문서부터' 하루 예산만큼 임베딩하고,
다음 날 다시 돌리면 캐시에 없는 다음 순서 문서를 이어서 넣는다(색인이 날마다 자란다). 임베딩이 없는 문서는 색인에서 빠진다.
중요도: 종목마다 조회수 높은 영상 제목(주가 다양하게) → 나머지. (공시는 게임에서 빼서 색인에도 넣지 않는다)

- 입력: data/rag_docs.json(build_season.py 가 만듦) — 종목-주별 가려진 영상 제목·공시 제목
- 임베딩: Gemini EMBED_MODEL(기본 gemini-embedding-2), RETRIEVAL_DOCUMENT, 256차원(마트료시카 축소) → 정규화 → int8
- 출력: data/rag.json {model, dim, docs, emb(base64 int8)} — 서버가 시작할 때 Supabase pgvector 표(rag_docs)에 넣는다
- 캐시: data/cache/emb/<model>.jsonl (문장 해시 → 벡터), 다시 돌리면 새 문장만 부른다
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from pathlib import Path

import httpx
import numpy as np
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
KEY = os.environ["GEMINI_API_KEY"]
MODEL = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
KEY_DISC = ("공급계약", "실적", "증자", "자기주식", "최대주주", "주요경영사항", "합병", "분할", "전환사채", "신주인수권", "소송", "영업정지", "상장")
DIM = 256
API = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents"
CACHE = ROOT / "data" / "cache" / "emb" / f"{MODEL}-{DIM}.jsonl"


def doc_text(d: dict) -> str:
    """임베딩할 문장: 종류 + 본문(⟦i⟧ 토큰은 '이 종목'으로 — 판마다 코드네임이 달라서)"""
    import re
    t = re.sub(r"⟦\d+⟧", "이 종목", d["t"])
    return ("공시: " if d["k"] == "disc" else "유튜브 영상 제목: ") + t


def priority(docs: list[dict]) -> list[int]:
    """임베딩할 순서(문서 번호). 핵심 공시 → 종목별 인기 제목(주 다양) → 나머지"""
    from collections import defaultdict
    first = [i for i, d in enumerate(docs) if d["k"] == "disc" and any(k in d["t"] for k in KEY_DISC)]
    by_asset = defaultdict(list)
    for i, d in enumerate(docs):
        if d["k"] == "yt":
            by_asset[d["a"]].append(i)
    rounds: list[list[int]] = []
    for a, idx in by_asset.items():
        idx.sort(key=lambda i: -docs[i]["v"])
        seen_w, picked = set(), []
        for i in idx:  # 같은 주 제목은 뒤로(주를 고르게)
            if docs[i]["w"] // 2 not in seen_w:
                seen_w.add(docs[i]["w"] // 2)
                picked.append(i)
        rest = [i for i in idx if i not in set(picked)]
        for r, i in enumerate(picked + rest):
            while len(rounds) <= r:
                rounds.append([])
            rounds[r].append(i)
    order = first + [i for rnd in rounds for i in rnd]
    seen = set(order)
    return order + [i for i in range(len(docs)) if i not in seen]


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=int, default=950, help="오늘 새로 임베딩할 최대 문장 수(무료 한도 ~1,000/일)")
    args = ap.parse_args()
    # 공시는 화면에서 원문을 열어 볼 수 없어 게임에서 뺐다 → 색인도 영상 제목만
    docs = [d for d in json.loads((ROOT / "data" / "rag_docs.json").read_text()) if d["k"] == "yt"]
    texts = [doc_text(d) for d in docs]
    hashes = [hashlib.sha1(t.encode()).hexdigest()[:16] for t in texts]
    have: dict[str, list[float]] = {}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    if CACHE.exists():
        for line in CACHE.read_text().splitlines():
            h, v = json.loads(line)
            have[h] = v
    # 자동 갱신(GitHub Actions)처럼 캐시가 없는 곳에서도 색인이 줄지 않게: 지난 색인(rag.json)의 벡터를 그대로 이어받는다
    prev = ROOT / "data" / "rag.json"
    if prev.exists():
        try:
            old = json.loads(prev.read_text())
            if old.get("model") == MODEL and old.get("dim") == DIM:
                q = np.frombuffer(base64.b64decode(old["emb"]), dtype=np.int8).reshape(-1, DIM).astype(np.float32) / 127
                n0 = len(have)
                for d, v in zip(old["docs"], q):
                    have.setdefault(hashlib.sha1(doc_text(d).encode()).hexdigest()[:16], v.tolist())
                print(f"지난 색인에서 이어받음 {len(have) - n0:,}개", flush=True)
        except (ValueError, KeyError) as e:
            print(f"지난 색인을 못 읽음({e}) → 캐시만 사용", flush=True)
    todo, seen = [], set()
    for i in priority(docs):
        h = hashes[i]
        if h in have or h in seen:
            continue
        seen.add(h)
        todo.append((h, texts[i]))
    todo = todo[:args.budget]
    print(f"문서 {len(docs):,} · 캐시 {len(have):,} · 오늘 새로 {len(todo):,} ({MODEL})", flush=True)
    client = httpx.Client(timeout=60, headers={"x-goog-api-key": KEY})
    with CACHE.open("a") as f:
        i, wait = 0, 1.0
        while i < len(todo):
            batch = todo[i:i + 100]
            body = {"requests": [{"model": f"models/{MODEL}", "content": {"parts": [{"text": t}]},
                                  "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": DIM} for _, t in batch]}
            r = client.post(API, json=body)
            if r.status_code == 429 and "PerDay" in r.text:
                print("  오늘 무료 한도를 다 썼어요 → 지금까지 한 것으로 색인을 만들고 내일 이어서", flush=True)
                break
            if r.status_code in (429, 500, 503):
                wait = min(wait * 2, 60)
                print(f"  {r.status_code} → {wait:.0f}초 쉬고 다시", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            for (h, _), e in zip(batch, r.json()["embeddings"]):
                have[h] = e["values"]
                f.write(json.dumps([h, e["values"]]) + "\n")
            f.flush()
            i += len(batch)
            wait = 1.0
            if i % 2000 < 100:
                print(f"  {i:,}/{len(todo):,}", flush=True)
            time.sleep(0.7)
    keep = [i for i, h in enumerate(hashes) if h in have]
    docs = [{**docs[i], "id": n} for n, i in enumerate(keep)]
    m = np.array([have[hashes[i]] for i in keep], dtype=np.float32)
    m /= np.linalg.norm(m, axis=1, keepdims=True) + 1e-9
    q = np.clip(np.round(m * 127), -127, 127).astype(np.int8)
    out = {"model": MODEL, "dim": DIM, "docs": docs, "emb": base64.b64encode(q.tobytes()).decode(), "total": len(texts)}
    (ROOT / "data" / "rag.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"→ data/rag.json 문서 {len(docs):,}개 ({(ROOT / 'data' / 'rag.json').stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
