"""AI 애널리스트(질문 답변)와 AI 판단(비중 결정). 모델: Gemini (REST).

오답 대응 설계
1. 자료 제한: 그 문제의 T0 이전 자료만 id 를 붙여 넘긴다(C1 차트, F1 재무, D 공시, N 뉴스, Y 유튜브).
2. 형식 강제: JSON 스키마로만 답하게 한다.
3. 검증 6가지(아래 check): 형식 · 인용 id 실재 · 회사 이름 노출 · 숫자 출처 · 직접 권유 · 근거 없는 단정.
4. 실패하면 무엇이 틀렸는지 알려 주고 1번 다시 묻는다. 그래도 실패하면 '검증 실패' 대체 답을 준다.
5. 모든 호출을 ai_logs 에 남긴다(검증 결과·지연·토큰).
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field

import httpx

from .masking import leaks, mask
from .settings import GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER, LLM_TIMEOUT, OLLAMA_MODEL, OLLAMA_TIMEOUT, OLLAMA_URL

API = "https://generativelanguage.googleapis.com/v1beta/models"


class LLMUnavailable(Exception):
    """호출 자체가 실패. kind 로 화면 문구를 나눈다: unconfigured · quota · timeout · busy · network · model"""

    def __init__(self, msg: str, kind: str = "network", retry_after: int | None = None):
        super().__init__(msg)
        self.kind = kind
        self.retry_after = retry_after


# ------------------------------------------------------------ 자료 만들기
def pct(x: float | None, d: int = 1) -> str:
    return "자료 없음" if x is None else f"{x * 100:+.{d}f}%"


def build_docs(case: dict, extra: dict) -> list[dict]:
    pre = [p for p in case["chart"] if p["t"] <= 0]
    kospi = pre[-1]["b"] / pre[0]["b"] - 1
    high = max(p["p"] for p in pre)
    last5 = sum(p["v"] for p in pre[-5:]) / 5
    r20 = pre[-1]["p"] / pre[-21]["p"] - 1
    docs = [{
        "id": "C1", "label": "차트",
        "text": f"최근 60거래일 주가 {pct(case['ret60'])}, 같은 기간 코스피 {pct(kospi)}, 최근 20거래일 {pct(r20)}, "
                f"60일 고점 대비 {pct(100 / high - 1)}, 최근 5거래일 거래량은 평소의 {last5:.1f}배.",
    }]
    f = extra.get("finance")
    if f:
        parts = [f"{f['report']}({f['basis']}, 산 날 {f['daysBefore']}일 전 공시) 기준",
                 f"매출 규모 {f['revenueBand']}" if f.get("revenueBand") else "",
                 f"매출 전년 같은 기간 대비 {pct(f.get('revenueGrowth'))}" if f.get("revenueGrowth") is not None else "",
                 f"영업이익률 {pct(f.get('opMargin'))}" if f.get("opMargin") is not None else "",
                 f"영업이익 전년 대비 {pct(f.get('opGrowth'))}" if f.get("opGrowth") is not None else "",
                 f"영업이익 {f['opTurn']}" if f.get("opTurn") else "",
                 f"순이익 {f['netTurn']}" if f.get("netTurn") else ("순손실" if f.get("netLoss") else ""),
                 f"부채비율 {f['debtRatio'] * 100:.0f}%" if f.get("debtRatio") is not None else ""]
        docs.append({"id": "F1", "label": "재무", "text": ", ".join(p for p in parts if p) + "."})
    dd = extra.get("docs", {})
    for i, d in enumerate(case["disclosures"]["items"], 1):
        facts = dd.get(d.get("_rcept") or "", {}).get("facts", [])
        ft = "; ".join(f"{x['label']}: {x['value']}" for x in facts)
        docs.append({"id": f"D{i}", "label": "공시", "text": f"{d['daysBefore']}일 전 [{d['kind']}] {d['title']}" + (f" — {ft}" if ft else "")})
    if case["disclosures"]["stakeReports"]:
        docs.append({"id": "D0", "label": "공시", "text": f"30일 동안 임원·대주주 지분 변동 보고 {case['disclosures']['stakeReports']}건."})
    for i, n in enumerate(extra.get("news", {}).get("before", []), 1):
        docs.append({"id": f"N{i}", "label": "뉴스", "text": f"{n.get('daysBefore', 0)}일 전 {n['source']}: {n['title']}"})
    y = case["youtube"]
    docs.append({"id": "Y0", "label": "유튜브", "text": f"그날 영상 논조: 오른다 {y['bull']}개, 내린다 {y['bear']}개, 중립 {y['neutral']}개."})
    stance = {"bull": "오른다", "bear": "내린다", "neutral": "중립"}
    for i, v in enumerate(y["videos"], 1):
        rec = v.get("record")
        tail = f", 이 유튜버의 산 날 전 방향 예측 {rec['n']}번 중 적중 {round(rec['hit'] * 100)}%" if rec else ", 이 유튜버의 과거 기록 부족"
        docs.append({"id": f"Y{i}", "label": "유튜브", "text": f"[{stance[v['stance']]}] {v['title']} (조회 {v['views']}회{tail})"})
    return docs


def docs_text(docs: list[dict]) -> str:
    return "\n".join(f"[{d['id']}] ({d['label']}) {d['text']}" for d in docs)


# ------------------------------------------------------------ 검증
NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
ADVICE_RE = re.compile(r"사세요|파세요|사라|팔아라|매수하세요|매도하세요|담으세요|추천(합니다|해요|드려요)|무조건")


def _norm(n: str) -> str:
    n = n.replace(",", "")
    return n.rstrip("0").rstrip(".") if "." in n else n


@dataclass
class Check:
    ok: bool = True
    items: dict = field(default_factory=dict)

    def fail(self, name: str, why: str):
        self.ok = False
        self.items[name] = why


ID_RE = re.compile(r"\b[A-Z]\d{1,2}\b")


def norm_cites(raw) -> list[str]:
    """'[C1]', 'D1,D2,D3' 처럼 묶어 쓴 근거를 id 목록으로(형식만 정리, 없는 id 는 검사에서 걸린다)"""
    out: list[str] = []
    for r in raw or []:
        found = ID_RE.findall(str(r)) or [str(r).strip()]
        out += [x for x in found if x and x not in out]
    return out[:8]


_others: list[str] | None = None


def other_names() -> list[str]:
    """다른 상장사 이름(3글자 이상만 — '대상'처럼 흔한 낱말과 겹치는 짧은 이름은 뺀다)"""
    global _others
    if _others is None:
        try:
            from .bank import bank

            _others = sorted({n for n in bank.names if len(n) >= 3 and re.search(r"[가-힣A-Za-z]", n)}, key=len, reverse=True)
        except Exception:
            _others = []
    return _others


def check(text: str, cites: list[str], ids: set[str], context: str, target: dict, question: str = "",
          grounded: bool = True) -> Check:
    ch = Check()
    bad = [c for c in cites if c not in ids]
    if bad:
        ch.fail("citations", f"없는 자료 id {bad}")
    if leaks(text, target):
        ch.fail("leak", "회사 이름이나 종목 코드가 들어 있음")
    allowed = {_norm(x) for x in NUM_RE.findall(context + " " + question)}
    unknown = [x for x in NUM_RE.findall(text) if len(_norm(x)) > 1 and _norm(x) not in allowed]
    if unknown:
        ch.fail("numbers", f"자료에 없는 숫자 {unknown[:5]}")
    if ADVICE_RE.search(text):
        ch.fail("advice", "직접 매수·매도 권유 표현")
    # 7) 자료에 없는 다른 종목 이야기(평가 v1 에서 '삼성전자랑 비교' 질문에 지어낸 비교가 나와 추가)
    mentioned = [n for n in other_names() if n in text and n not in context]
    if mentioned:
        ch.fail("others", f"자료에 없는 다른 종목 언급 {mentioned[:3]}")
    if grounded and not cites:
        ch.fail("grounding", "근거 자료 id 없이 단정함")
    if not ch.items:
        ch.items = {"citations": "ok", "leak": "ok", "numbers": "ok", "advice": "ok", "grounding": "ok", "others": "ok"}
    return ch


# ------------------------------------------------------------ Gemini 호출
@dataclass
class Usage:
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0


def _retry_after(r) -> int | None:
    """429·503 응답에서 다시 시도할 시간(초). 헤더나 본문(RetryInfo.retryDelay '12s')에 있다"""
    h = r.headers.get("retry-after")
    if h and h.isdigit():
        return int(h)
    m = re.search(r'"retryDelay"\s*:\s*"(\d+)', r.text or "")
    return int(m.group(1)) if m else None


# ------------------------------------------------------------ 제공자 고르기(클라우드 Gemini · 로컬 Ollama)
_ollama_ok: tuple[float, bool] = (0.0, False)


def ollama_alive() -> bool:
    """로컬 Ollama 가 켜져 있고 모델이 있나(60초 캐시)"""
    global _ollama_ok
    if time.time() - _ollama_ok[0] < 60:
        return _ollama_ok[1]
    try:
        tags = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=1.5).json()
        ok = any(m.get("name") == OLLAMA_MODEL for m in tags.get("models", []))
    except Exception:
        ok = False
    _ollama_ok = (time.time(), ok)
    return ok


def provider() -> str | None:
    """지금 쓸 제공자. auto 면 Gemini 키 → 로컬 Ollama 순서"""
    if LLM_PROVIDER == "gemini":
        return "gemini" if GEMINI_API_KEY else None
    if LLM_PROVIDER == "ollama":
        return "ollama" if ollama_alive() else None
    if GEMINI_API_KEY:
        return "gemini"
    return "ollama" if ollama_alive() else None


def model_name() -> str:
    p = provider()
    return GEMINI_MODEL if p == "gemini" else f"ollama/{OLLAMA_MODEL}" if p == "ollama" else GEMINI_MODEL


def llm(system: str, user: str, schema: dict, usage: Usage, temperature: float = 0.2) -> dict:
    p = provider()
    if p == "ollama":
        return ollama(system, user, schema, usage, temperature)
    return gemini(system, user, schema, usage, temperature)


def _json_schema(s: dict) -> dict:
    """Gemini 식 스키마(OBJECT·STRING…) → 표준 JSON Schema(object·string…)"""
    out = {k: v for k, v in s.items() if k not in ("type", "properties", "items")}
    if "type" in s:
        out["type"] = s["type"].lower()
    if "properties" in s:
        out["properties"] = {k: _json_schema(v) for k, v in s["properties"].items()}
    if "items" in s:
        out["items"] = _json_schema(s["items"])
    return out


def ollama(system: str, user: str, schema: dict, usage: Usage, temperature: float = 0.2) -> dict:
    """로컬 LLM(Ollama). 출력 형식은 JSON Schema 로 강제, 생각 모드는 끔(속도)"""
    body = {"model": OLLAMA_MODEL, "stream": False, "think": False, "format": _json_schema(schema),
            "options": {"temperature": temperature, "num_predict": 450, "repeat_penalty": 1.15},  # 작은 모델의 말 반복 방지
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    t = time.perf_counter()
    try:
        r = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=OLLAMA_TIMEOUT)
    except httpx.TimeoutException as e:
        raise LLMUnavailable("답이 너무 오래 걸려요", "timeout") from e
    except httpx.HTTPError as e:
        raise LLMUnavailable("로컬 AI 에 연결하지 못했어요", "network") from e
    usage.latency_ms += int((time.perf_counter() - t) * 1000)
    if r.status_code >= 400:
        raise LLMUnavailable(f"모델 오류 {r.status_code}", "model")
    data = r.json()
    usage.tokens_in += data.get("prompt_eval_count", 0) or 0
    usage.tokens_out += data.get("eval_count", 0) or 0
    text = (data.get("message") or {}).get("content", "")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)  # 앞뒤 군더더기가 붙은 경우 JSON 부분만
        try:
            return json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError as e:
            raise ValueError("JSON 형식이 아님") from e


def gemini(system: str, user: str, schema: dict, usage: Usage, temperature: float = 0.2) -> dict:
    if not GEMINI_API_KEY:
        raise LLMUnavailable("AI 연결이 아직 설정되지 않았어요", "unconfigured")  # 키도 로컬 모델도 없을 때
    gen = {"temperature": temperature, "responseMimeType": "application/json", "responseSchema": schema, "maxOutputTokens": 1024}
    if GEMINI_MODEL.startswith("gemini-2.5-flash"):
        gen["thinkingConfig"] = {"thinkingBudget": 0}  # 응답 속도 우선
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": gen}
    t = time.perf_counter()
    try:
        r = httpx.post(f"{API}/{GEMINI_MODEL}:generateContent", json=body, timeout=LLM_TIMEOUT,
                       headers={"x-goog-api-key": GEMINI_API_KEY})
    except httpx.TimeoutException as e:
        raise LLMUnavailable("답이 너무 오래 걸려요", "timeout") from e
    except httpx.HTTPError as e:
        raise LLMUnavailable("AI 서버에 연결하지 못했어요", "network") from e
    usage.latency_ms += int((time.perf_counter() - t) * 1000)
    if r.status_code == 429:
        raise LLMUnavailable("무료 사용량 한도에 걸렸어요", "quota", _retry_after(r))
    if r.status_code in (500, 502, 503, 504):
        raise LLMUnavailable("AI 서버가 바빠요", "busy", _retry_after(r) or 10)
    if r.status_code >= 400:
        raise LLMUnavailable(f"모델 오류 {r.status_code}", "model")
    data = r.json()
    meta = data.get("usageMetadata", {})
    usage.tokens_in += meta.get("promptTokenCount", 0)
    usage.tokens_out += meta.get("candidatesTokenCount", 0)
    try:
        return json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise ValueError("JSON 형식이 아님") from e


# ------------------------------------------------------------ 1) 질문 답변
ASK_SYSTEM = """너는 투자 판단 게임 'Foresight'의 AI 애널리스트다. 플레이어는 이름이 가려진 회사 'A사'를 지금 살지 고민 중이다.
규칙:
1. 아래 [자료]에 있는 내용만 근거로 답한다. 자료에 없는 사실, 숫자, 앞으로 일어날 일은 말하지 않는다.
2. 회사는 'A사'로만 부른다. 실제 회사 이름이나 종목을 추측해서 말하지 않는다.
3. 근거로 쓴 자료의 id(예: F1, D2, N3)를 citations 에 넣는다.
4. 자료로 답할 수 없으면 grounded 를 false 로 하고 answer 를 '확인된 근거가 없어요.'로 시작한다.
5. 사라·팔아라 같은 직접 권유는 하지 않는다. 판단은 플레이어가 한다.
6. 숫자는 자료에 적힌 그대로 쓴다. 계산해서 새 숫자를 만들지 않는다.
7. 다른 회사·종목과 비교해 달라거나 앞으로의 주가를 묻는 질문은 자료로 답할 수 없다. grounded 를 false 로 하고 '확인된 근거가 없어요.'로 시작한 뒤, 자료에서 확인되는 사실만 짧게 덧붙인다. 자료에 없는 회사 이름은 쓰지 않는다.
8. citations 에는 id 하나씩 넣는다(예: ["F1", "D2"]). 대괄호나 쉼표로 묶지 않는다.
9. 2~4문장, 쉬운 말, '~요' 체."""

ASK_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "answer": {"type": "STRING"},
        "citations": {"type": "ARRAY", "items": {"type": "STRING"}},
        "grounded": {"type": "BOOLEAN"},
    },
    "required": ["answer", "citations", "grounded"],
}


def ask(case: dict, extra: dict, question: str) -> tuple[dict, Check, Usage, int]:
    """(응답, 검증, 사용량, 시도 횟수). 키가 없거나 호출 실패면 LLMUnavailable."""
    docs = build_docs(case, extra)
    ctx = docs_text(docs)
    ids = {d["id"] for d in docs}
    target = {"name": case["answer"]["name"], "aliases": [], "symbol": case["answer"]["symbol"]}
    usage = Usage()
    user = f"[자료]\n{ctx}\n\n[질문]\n{question}"
    last: Check | None = None
    for attempt in (1, 2):
        try:
            out = llm(ASK_SYSTEM, user, ASK_SCHEMA, usage)
        except ValueError:
            last = Check(False, {"format": "JSON 형식이 아님"})
            continue
        text = str(out.get("answer", "")).strip()[:700]
        cites = norm_cites(out.get("citations", []))[:6]
        grounded = bool(out.get("grounded", True))
        last = check(text, cites, ids, ctx, target, question, grounded)
        if last.ok:
            return _cited({"answer": text, "citations": cites, "grounded": grounded}, docs), last, usage, attempt
        user += f"\n\n[이전 답변이 검증에 실패함: {json.dumps(last.items, ensure_ascii=False)}. 규칙을 지켜 다시 답하라.]"
    fallback = {
        "answer": "답을 만들었지만 자료와 맞는지 검증하지 못해서 보여 드리지 않아요. 질문을 조금 바꿔 다시 물어봐 주세요.",
        "citations": [], "grounded": False, "fallback": True,
    }
    return fallback, last or Check(False, {"format": "응답 없음"}), usage, 2


def _cited(resp: dict, docs: list[dict]) -> dict:
    by = {d["id"]: d for d in docs}
    resp["sources"] = [{"id": c, "label": by[c]["label"], "text": by[c]["text"][:120]} for c in resp["citations"] if c in by]
    return resp


# ------------------------------------------------------------ 2) AI 판단(문제마다 미리)
JUDGE_SYSTEM = """너는 투자 판단 게임 'Foresight'에 참가한 AI 플레이어다. 이름이 가려진 회사 'A사'를 오늘 종가에 얼마나 담을지 정한다.
보유 기간은 20거래일이다. 비중은 -50(공매도 50%), 0, 30, 70, 100 중 하나.
규칙:
1. [자료]만 근거로 판단한다. 회사를 추측하지 않고 'A사'로만 부른다.
2. reasons 는 2~3개, 각각 근거 자료 id 를 cite 에 하나만 넣는다(예: "F1"). 대괄호·쉼표로 묶지 않는다. 숫자는 자료에 적힌 그대로 쓴다.
3. confidence 는 0~1 사이, 자료가 엇갈리면 낮게.
4. 유튜버 의견도 자료의 하나일 뿐, 그대로 따르지 않아도 된다."""

JUDGE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "weight": {"type": "STRING", "enum": ["-50", "0", "30", "70", "100"]},
        "confidence": {"type": "NUMBER"},
        "reasons": {
            "type": "ARRAY",
            "items": {"type": "OBJECT", "properties": {"text": {"type": "STRING"}, "cite": {"type": "STRING"}},
                      "required": ["text", "cite"]},
        },
    },
    "required": ["weight", "confidence", "reasons"],
}


def judge(case: dict, extra: dict) -> tuple[dict | None, Check, Usage, int]:
    docs = build_docs(case, extra)
    ctx = docs_text(docs)
    ids = {d["id"] for d in docs}
    target = {"name": case["answer"]["name"], "aliases": [], "symbol": case["answer"]["symbol"]}
    usage = Usage()
    user = f"[자료]\n{ctx}\n\n비중을 정하라."
    last: Check | None = None
    for attempt in (1, 2):
        try:
            out = llm(JUDGE_SYSTEM, user, JUDGE_SCHEMA, usage, temperature=0.1)
        except ValueError:
            last = Check(False, {"format": "JSON 형식이 아님"})
            continue
        reasons = [{"text": str(r.get("text", ""))[:200], "cite": (norm_cites([r.get("cite", "")]) or [""])[0]} for r in out.get("reasons", [])][:3]
        text = " ".join(r["text"] for r in reasons)
        last = check(text, [r["cite"] for r in reasons], ids, ctx, target)
        try:
            w = int(out["weight"])
        except (KeyError, ValueError):
            last.fail("format", "비중 값이 이상함")
            w = None
        if last.ok and w is not None:
            conf = max(0.0, min(1.0, float(out.get("confidence", 0.5))))
            by = {d["id"]: d for d in docs}
            for r in reasons:
                r["source"] = by[r["cite"]]["label"]
                r["text"] = mask(r["text"], target, [], others=False, strip_tail=False)
            return {"weight": w, "confidence": round(conf, 2), "reasons": reasons}, last, usage, attempt
        user += f"\n\n[이전 답이 검증에 실패함: {json.dumps(last.items, ensure_ascii=False)}. 다시 답하라.]"
    return None, last or Check(False, {"format": "응답 없음"}), usage, 2
