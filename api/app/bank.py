"""문제 은행 + 보강 데이터(재무·공시 핵심·뉴스) + AI 판단을 읽어, 단계별로 '보내도 되는 것'만 만든다.

정답(answer)·종목 코드(private)·원문 발췌(_excerpt)·공시 접수번호(_rcept)는
결과 공개 전에는 절대 응답에 넣지 않는다.
"""
from __future__ import annotations

import json
from functools import cached_property

from .masking import generalize_amounts, public_facts
from .settings import DATA_DIR


def case_key(c: dict) -> str:
    return f'{c["private"]["assetId"]}|{c["answer"]["t0"]}'


def _load(name: str, default):
    p = DATA_DIR / name
    return json.loads(p.read_text()) if p.exists() else default


def _harden(cases: list[dict], extra: dict) -> None:
    """화면·AI 로 나가기 전에 검색 단서를 줄인다(masking.public_facts·generalize_amounts).
    원본 파일은 그대로 두고 메모리에서만 바꾼다 → 규칙을 고치면 서버만 다시 켜면 된다."""
    for e in extra.values():
        for d in e.get("docs", {}).values():
            if "facts" in d:
                d["facts"] = public_facts(d["facts"])
        for n in e.get("news", {}).get("before", []):
            n["title"] = generalize_amounts(n["title"])
    for c in cases:
        for v in c["youtube"]["videos"]:
            v["title"] = generalize_amounts(v["title"])
        for d in c["disclosures"]["items"]:
            d["title"] = generalize_amounts(d["title"])
        if c.get("event"):
            c["event"]["title"] = generalize_amounts(c["event"]["title"])


def _unpack_if_needed() -> None:
    """배포 서버: 공개 저장소엔 암호문(data/pack.enc)만 있다 → DATA_KEY 로 풀어서 쓴다(scripts/pack_data.py)"""
    import io
    import os
    import tarfile

    if (DATA_DIR / "bank.json").exists():
        return
    enc = DATA_DIR / "pack.enc"
    key = os.environ.get("DATA_KEY", "").strip()
    if not enc.exists() or not key:
        return
    from cryptography.fernet import Fernet

    raw = Fernet(key.encode()).decrypt(enc.read_bytes())
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        for m in tar.getmembers():
            if m.isfile() and "/" not in m.name and m.name.endswith(".json"):
                (DATA_DIR / m.name).write_bytes(tar.extractfile(m).read())


class Bank:
    def __init__(self):
        _unpack_if_needed()
        raw = _load("bank.json", {"cases": [], "summary": {}})
        self.summary: dict = raw["summary"]
        self.cases: list[dict] = raw["cases"]
        self.by_key: dict[str, dict] = {case_key(c): c for c in self.cases}
        self.extra: dict = _load("extra.json", {})
        _harden(self.cases, self.extra)
        self.ai: dict = _load("ai.json", {})
        self.quality: dict = _load("quality.json", {})  # scripts/quality.py 결과
        self.text: dict = _load("text.json", {})  # scripts/text_analysis.py 결과
        self.ai_eval: list = _load("ai_eval.json", [])  # scripts/ai_eval.py 기록(요약만 내보냄)

    def reload(self):
        self.__init__()

    def get(self, key: str) -> dict:
        return self.by_key[key]

    def has(self, key: str) -> bool:
        return key in self.by_key

    def ex(self, key: str) -> dict:
        return self.extra.get(key, {})

    # ------------------------------------------------------------ 문제 단계
    @staticmethod
    def question(c: dict) -> dict:
        return {"period": c["period"], "market": c["market"], "ret60": c["ret60"]}

    def card(self, key: str, card: str) -> dict:
        c, e = self.get(key), self.ex(key)
        if card == "chart":
            return {"points": [p for p in c["chart"] if p["t"] <= 0]}
        if card == "disclosure":
            docs = e.get("docs", {})
            items = [
                {"kind": d["kind"], "title": d["title"], "daysBefore": d["daysBefore"],
                 "facts": docs.get(d.get("_rcept") or "", {}).get("facts", [])}
                for d in c["disclosures"]["items"]
            ]
            return {"items": items, "stakeReports": c["disclosures"]["stakeReports"]}
        if card == "youtube":
            return c["youtube"]
        if card == "finance":
            f = e.get("finance")
            return {"finance": {k: v for k, v in f.items() if not k.startswith("_")} if f else None}
        if card == "news":
            items = [{"title": n["title"], "source": n["source"], "daysBefore": n.get("daysBefore", 0)}
                     for n in e.get("news", {}).get("before", [])]
            return {"items": items}
        if card == "ai":
            return {
                "intro": "이 시점까지 나온 차트·공시·재무·뉴스·유튜브 자료만 보고 답해요. 근거가 없으면 없다고 말해요.",
                "suggestions": [
                    "최근 실적은 좋아지고 있어?",
                    "최근 공시 중에 중요한 게 있어?",
                    "뉴스 분위기는 어때?",
                    "유튜버들은 왜 그렇게 봤어?",
                    "가장 큰 위험 요인은 뭐야?",
                ],
            }
        raise KeyError(card)

    # ------------------------------------------------------------ 중간 사건
    def event(self, key: str) -> dict | None:
        c = self.get(key)
        ev = c.get("event")
        if not ev:
            return None
        facts = self.ex(key).get("docs", {}).get(ev.get("_rcept") or "", {}).get("facts", [])
        return {
            "t": ev["t"], "type": ev["type"], "kind": ev.get("kind"), "change": ev.get("change"),
            "title": ev["title"], "facts": facts,
            "points": [p for p in c["chart"] if p["t"] <= ev["t"]],
        }

    # ------------------------------------------------------------ 결과 공개
    def reveal(self, key: str) -> dict:
        c, e = self.get(key), self.ex(key)
        return {
            "answer": c["answer"],
            "chart": c["chart"],
            "event": self.event(key),
            "youtube": {"verdict": c["youtube"]["verdict"], "bull": c["youtube"]["bull"], "bear": c["youtube"]["bear"]},
            "ai": self.ai_public(key),
            "newsAfter": e.get("news", {}).get("after", []),
            "ret60": c["ret60"],
            "period": c["period"],
        }

    def ai_public(self, key: str) -> dict | None:
        j = self.ai.get(key)
        if not j or j.get("weight") is None:
            return None
        return {k: j[k] for k in ("weight", "confidence", "reasons", "model") if k in j}

    @cached_property
    def names(self) -> list[str]:
        return _load("names.json", [])


bank = Bank()
