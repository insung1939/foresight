"""AI 코치 — 시즌이 끝나면 내 거래 기록을 읽고 세 줄로 돌아본다. 모델: Gemini(REST), 키가 없으면 로컬 Ollama.

오답 대응 설계
1. 자료 제한: 결산 숫자(수익률·순위·성향 통계·이벤트 선택)만 넘긴다. 시장 전망이나 종목 추천은 할 수 없게 한다.
2. 형식 강제: JSON 스키마로만 답하게 한다.
3. 검증 3가지(check): 숫자 출처(넘긴 숫자만) · 직접 권유 금지 · 길이.
4. 실패하면 무엇이 틀렸는지 알려 주고 1번 다시 묻는다. 그래도 실패하면 규칙으로 만든 대체 답을 준다.
5. 모든 호출을 coach_logs 에 남긴다(검증 결과·지연·토큰).
"""
from __future__ import annotations

import json
import re
import time

import httpx

from .settings import GEMINI_API_KEY, GEMINI_FALLBACKS, GEMINI_MODEL, LLM_PROVIDER, LLM_TIMEOUT, OLLAMA_MODEL, OLLAMA_TIMEOUT, OLLAMA_URL

API = "https://generativelanguage.googleapis.com/v1beta/models"


class LLMUnavailable(Exception):
    """호출 자체가 실패. kind: unconfigured · quota · timeout · busy · network · model"""

    def __init__(self, msg: str, kind: str = "network", retry_after: int | None = None):
        super().__init__(msg)
        self.kind = kind
        self.retry_after = retry_after


class Usage:
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    model: str = ""  # 실제로 답한 모델(대체 모델로 넘어갔으면 그 이름)


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


def llm(system: str, user: str, schema: dict, usage: Usage, temperature: float = 0.2, fast: bool = False) -> dict:
    p = provider()
    if p == "ollama":
        return ollama(system, user, schema, usage, temperature)
    return gemini(system, user, schema, usage, temperature, fast)


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


def gemini(system: str, user: str, schema: dict, usage: Usage, temperature: float = 0.2, fast: bool = False) -> dict:
    """Gemini 호출. 기본 모델이 바쁨(5xx)·한도(429)·시간 초과면 GEMINI_FALLBACKS 로 차례로 넘어간다."""
    if not GEMINI_API_KEY:
        raise LLMUnavailable("AI 연결이 아직 설정되지 않았어요", "unconfigured")  # 키도 로컬 모델도 없을 때
    last: LLMUnavailable | None = None
    order = [GEMINI_MODEL, *[m for m in GEMINI_FALLBACKS if m != GEMINI_MODEL]]
    if fast:  # 게임 중 질문은 기다리게 하면 안 된다 → 가벼운 모델 먼저
        order = [*[m for m in GEMINI_FALLBACKS if m != GEMINI_MODEL], GEMINI_MODEL]
    for model in order:
        try:
            out = _gemini_once(model, system, user, schema, usage, temperature, fast)
            usage.model = model
            return out
        except LLMUnavailable as e:
            if e.kind not in ("busy", "quota", "timeout", "gone"):
                raise
            last = e  # 다음 모델로
    raise last or LLMUnavailable("AI 서버가 바빠요", "busy", 10)


def _gemini_once(model: str, system: str, user: str, schema: dict, usage: Usage, temperature: float, fast: bool = False) -> dict:
    gen = {"temperature": temperature, "responseMimeType": "application/json", "responseSchema": schema, "maxOutputTokens": 1024}
    if model.startswith("gemini-2.5-flash"):
        gen["thinkingConfig"] = {"thinkingBudget": 0}  # 응답 속도 우선
    elif model.startswith("gemini-3"):
        gen["thinkingConfig"] = {"thinkingLevel": "minimal" if fast else "low"}  # 게임 중 질문은 생각을 최소로(속도)
    body = {"systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": gen}
    t = time.perf_counter()
    try:
        r = httpx.post(f"{API}/{model}:generateContent", json=body, timeout=min(LLM_TIMEOUT, 12) if fast else LLM_TIMEOUT,
                       headers={"x-goog-api-key": GEMINI_API_KEY})
    except httpx.TimeoutException as e:
        usage.latency_ms += int((time.perf_counter() - t) * 1000)
        raise LLMUnavailable("답이 너무 오래 걸려요", "timeout") from e
    except httpx.HTTPError as e:
        raise LLMUnavailable("AI 서버에 연결하지 못했어요", "network") from e
    usage.latency_ms += int((time.perf_counter() - t) * 1000)
    if r.status_code == 429:
        raise LLMUnavailable("무료 사용량 한도에 걸렸어요", "quota", _retry_after(r))
    if r.status_code in (500, 502, 503, 504):
        raise LLMUnavailable("AI 서버가 바빠요", "busy", _retry_after(r) or 10)
    if r.status_code == 404:  # 모델이 없어짐(예: 새 사용자에게 막힌 옛 모델) → 대체 모델로
        raise LLMUnavailable("AI 모델을 쓸 수 없어요", "gone")
    if r.status_code >= 400:
        raise LLMUnavailable(f"모델 오류 {r.status_code}", "model")
    data = r.json()
    meta = data.get("usageMetadata", {})
    usage.tokens_in += meta.get("promptTokenCount", 0)
    usage.tokens_out += meta.get("candidatesTokenCount", 0)
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise ValueError("JSON 형식이 아님") from e



# ------------------------------------------------------------ 코치
COACH_SYSTEM = """너는 투자 시뮬레이션 게임 '타임슬립 개미'의 코치다. 플레이어가 실제 과거 시장 26주를 방금 끝냈다.
규칙:
- 주어진 결산 자료의 숫자만 쓴다. 새 숫자를 만들지 않는다.
- 앞으로 무엇을 사라·팔라 같은 투자 권유, 종목 추천, 시장 전망을 하지 않는다. '습관'에 대해서만 말한다.
- 친구처럼 따뜻하지만 솔직하게, 한국어 반말 대신 부드러운 존댓말(~요)로 쓴다.
- headline 은 20자 안팎 한 줄, points 는 정확히 3개(각 60자 이내), tip 은 다음 판에 해 볼 한 가지 행동(50자 이내)."""

COACH_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "headline": {"type": "STRING"},
        "points": {"type": "ARRAY", "items": {"type": "STRING"}},
        "tip": {"type": "STRING"},
    },
    "required": ["headline", "points", "tip"],
}

NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
ADVICE_RE = re.compile(r"사세요|파세요|사라|팔아라|매수하세요|매도하세요|담으세요|추천(합니다|해요|드려요)|무조건|오를 (거|것)|내릴 (거|것)")


def _numbers(text: str) -> set[str]:
    """글 속 숫자(쉼표 제거, 소수점 뒤 끝 0 만 제거: '12.50' → '12.5', '30' 은 그대로)"""
    out = set()
    for n in NUM_RE.findall(text):
        n = n.replace(",", "")
        if "." in n:
            n = n.rstrip("0").rstrip(".")
        out.add(n or "0")
    return out


def check(resp: dict, context: str) -> dict:
    """검증 결과 {항목: 통과?, ...}"""
    text = " ".join([resp.get("headline", ""), *resp.get("points", []), resp.get("tip", "")])
    allowed = _numbers(context) | {str(i) for i in range(0, 11)} | {"26", "100"}
    bad_nums = sorted(_numbers(text) - allowed)
    out = {
        "format": isinstance(resp.get("points"), list) and len(resp["points"]) == 3 and bool(resp.get("headline")) and bool(resp.get("tip")),
        "numbers": not bad_nums,
        "advice": not ADVICE_RE.search(text),
        "length": len(text) <= 400,
    }
    out["_bad"] = bad_nums
    return out


def coach(summary: dict) -> tuple[dict, dict, Usage, int]:
    """(답, 검증, 사용량, 시도 수). 두 번 모두 검증에 떨어지면 ValueError"""
    usage = Usage()
    context = json.dumps(summary, ensure_ascii=False)
    user = f"결산 자료:\n{context}"
    last: dict = {}
    for attempt in (1, 2):
        resp = llm(COACH_SYSTEM, user, COACH_SCHEMA, usage, temperature=0.5)
        chk = check(resp, context)
        if all(v for k, v in chk.items() if not k.startswith("_")):
            return resp, chk, usage, attempt
        last = chk
        fails = [k for k, v in chk.items() if not k.startswith("_") and not v]
        user = f"{user}\n\n직전 답이 검증에 떨어졌어(항목: {', '.join(fails)}, 자료에 없는 숫자: {chk['_bad']}). 규칙을 지켜 다시 써."
    raise ValueError(json.dumps(last, ensure_ascii=False))


# ------------------------------------------------------------ 개미 비서(시점 제한 RAG)
ASK_SYSTEM = """너는 투자 시뮬레이션 게임 '타임슬립 개미'의 개미 비서 '범고래 박사'다. 플레이어는 이름이 코드네임으로 가려진 종목을 보고 있다.
규칙:
- 반드시 아래 [자료]만 근거로 답한다. 자료에 없는 사실·숫자·회사 이름을 만들지 않는다.
- 답의 문장마다 근거 자료 id 를 cites 에 넣는다(예: ["D2","D5"]). 자료로 답할 수 없으면 answer 를 "지금까지 나온 자료로는 알 수 없어요."로 하고 cites 는 빈 배열.
- 사라·팔아라 같은 권유, 앞으로 오른다·내린다 같은 예측을 하지 않는다. 사람들이 무엇을 말했는지, 무엇이 나왔는지만 정리한다.
- 영상 제목을 옮길 때는 작은따옴표로 감싼다(예: '조만간 오른다'는 제목). 따옴표 밖은 너의 말이다.
- 종목은 자료에 적힌 코드네임(예: '반도체 A')으로만 부른다.
- 질문에 회사 이름이 나와도 되풀이하지 않고 '그 이름은 말씀드릴 수 없어요'라고만 한다(맞다·아니다도 말하지 않는다).
- [지금 보고 있는 종목]에 대해 답한다. 제목에 다른 종목이 함께 나와도 그 종목 이야기는 하지 않는다. 답에 그 종목 코드네임을 꼭 쓴다.
- 2~3문장, 200자 이내, 부드러운 존댓말(~요)."""

ASK_SCHEMA = {
    "type": "OBJECT",
    "properties": {"answer": {"type": "STRING"}, "cites": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["answer", "cites"],
}


def check_ask(resp: dict, context: str, question: str, ids: set[str], banned: list[str], focus: str | None = None) -> dict:
    ans = resp.get("answer", "") or ""
    cites = [c for c in (resp.get("cites") or []) if isinstance(c, str)]
    unknown = "알 수 없어요" in ans
    allowed = _numbers(context) | _numbers(question) | {str(i) for i in range(0, 11)}
    bad_nums = sorted(_numbers(ans) - allowed)
    low = ans.lower()
    leaked = [b for b in banned if b and len(b) >= 2 and b.lower() in low]
    own = re.sub(r"['\"‘’“”「」『』][^'\"‘’“”「」『』]{1,80}['\"‘’“”「」『』]", " ", ans)  # 인용(제목)은 빼고 비서 자신의 말만
    out = {
        "format": bool(ans) and isinstance(resp.get("cites"), list),
        "cites": unknown or (bool(cites) and all(c in ids for c in cites)),
        "numbers": not bad_nums,
        "advice": not ADVICE_RE.search(own),
        "names": not leaked,
        "length": len(ans) <= 320,
        # 물어본 종목 자료가 있으면 그 종목 이야기를 해야 한다(다른 종목 이야기로 새지 않게)
        "focus": unknown or not focus or focus in ans,
    }
    out["_bad"] = bad_nums + leaked
    return out


def ask(question: str, context: str, ids: set[str], banned: list[str], focus: str | None = None) -> tuple[dict, dict, Usage, int]:
    """(답, 검증, 사용량, 시도 수). 두 번 다 떨어지면 ValueError"""
    usage = Usage()
    user = f"[자료]\n{context}\n\n[질문]\n{question}"
    last: dict = {}
    for attempt in (1, 2):
        resp = llm(ASK_SYSTEM, user, ASK_SCHEMA, usage, temperature=0.2, fast=True)
        chk = check_ask(resp, context, question, ids, banned, focus)
        if all(v for k, v in chk.items() if not k.startswith("_")):
            return resp, chk, usage, attempt
        last = chk
        fails = [k for k, v in chk.items() if not k.startswith("_") and not v]
        user = f"{user}\n\n직전 답이 검증에 떨어졌어(항목: {', '.join(fails)}). 자료에 있는 것만, 규칙대로 다시 써."
    raise ValueError(json.dumps(last, ensure_ascii=False))
