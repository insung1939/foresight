"""이름 가리기 — 문제 은행·공시·뉴스·AI 답변이 모두 같은 규칙을 쓴다.

target = {"name", "aliases", "symbol"}: 문제의 회사(→ "A사")
names  = 국내 종목 이름·별칭 전체(→ "○○", 다른 종목도 힌트가 되므로)
"""
from __future__ import annotations

import re

PRICE_RE = re.compile(r"\d[\d,.]*\s*(만\s*원|천\s*원|원|만원)")
NICK_RE = re.compile(r"\d+만\s*(전자|닉스)")  # '25만전자' 같은 별명
DATE_RE = re.compile(r"\(?\b20\d{2}[.\-/]?\d{2}[.\-/]?\d{2}\w?\)?|\b\d{1,2}월\s*\d{1,2}일|\b\d{1,2}/\d{1,2}\b")
YEAR_RE = re.compile(r"\b20\d{2}년?")
HASHTAG_RE = re.compile(r"#\S+")
# '정용진 회장', '이권희 대표' — 사람 이름은 회사·채널을 드러낸다
PERSON_RE = re.compile(r"[가-힣]{2,4}(\s?)((?:A사\s?)?)(명예회장|부회장|회장|대표이사|대표|부사장|사장|의장|창업주|총수|오너|센터장|이사|본부장|위원장|위원|대통령|당선인|장관|총리|총재|의원|후보)(?=[^가-힣]|$|[은는이가의을를께도])")
WORD = re.compile(r"[가-힣A-Za-z0-9]")


def name_terms(rows) -> list[str]:
    """rows = [(name, aliases), ...] → 긴 것부터"""
    return sorted({t for n, al in rows for t in [n, *(al or [])] if t and len(t) >= 2}, key=len, reverse=True)


def _sub_bounded(text: str, term: str, repl: str) -> str:
    """term 앞이 글자가 아닐 때만 바꾼다(뒤는 조사가 붙을 수 있어 허용)."""
    out, i = [], 0
    while True:
        j = text.find(term, i)
        if j < 0:
            out.append(text[i:])
            return "".join(out)
        if j > 0 and WORD.match(text[j - 1]):
            out.append(text[i:j + len(term)])
            i = j + len(term)
            continue
        out.append(text[i:j])
        out.append(repl)
        i = j + len(term)


def own_terms(target: dict) -> list[str]:
    terms = {target["name"], *target.get("aliases", []), target["symbol"]}
    # '(주)신세계', '주식회사 신세계' 꼴도 잡히도록 이름 자체를 쓴다
    return sorted({t for t in terms if t}, key=len, reverse=True)


def mask(text: str, target: dict, names: list[str], others: bool = True, strip_tail: bool = True) -> str:
    text = HASHTAG_RE.sub("", text)
    if strip_tail:
        # "제목 | 진행자" 꼴의 꼬리는 채널을 드러내므로 뗀다
        parts = re.split(r"\s*[|ㅣ│]\s*", text)
        if len(parts) > 1:
            text = max(parts, key=len)
    for t in own_terms(target):
        text = text.replace(t, "A사")
    text = re.sub(r"(\(주\)|㈜|주식회사)\s*A사", "A사", text)
    text = re.sub(r"A사\s*(\(주\)|㈜)", "A사", text)
    if others:
        for t in names:
            if t in text:
                text = _sub_bounded(text, t, "○○")
    text = NICK_RE.sub("A사", text)
    text = PERSON_RE.sub(lambda m: f"○○○{m.group(1)}{m.group(2)}{m.group(3)}", text)
    text = PRICE_RE.sub("○○원", text)
    text = DATE_RE.sub("", text)
    text = YEAR_RE.sub("", text)
    text = re.sub(r"○○(\s*[,·/]?\s*○○)+", "○○", text)
    text = re.sub(r"\(\s*[.\d]*\s*\)|\[\s*\]", "", text)
    text = re.sub(r"\[\s+", "[", text)
    return re.sub(r"\s{2,}", " ", text).strip(" ,/-")


def leaks(text: str, target: dict) -> bool:
    low = text.lower()
    return any(t and len(t) >= 2 and t.lower() in low for t in own_terms(target))


# ------------------------------------------------------------ 검색으로 회사를 찾게 하는 단서 줄이기
# 이름을 가려도 '계약금액 1조 656억', '평택캠퍼스 공사', 'ALT-L9' 같은 단서로 회사를 찾을 수 있다.
# 그래서 공시 핵심 항목은 '보여도 되는 것만 남기는'(허용 목록) 방식으로 고르고, 금액은 구간으로 바꾼다.
import re as _re

_AMOUNT = _re.compile(r"(?:약\s*)?(\d[\d,]*(?:\.\d+)?)\s*(조|억)(?:\s*(\d[\d,]*)\s*억)?(?:\s*\d[\d,]*\s*만)?\s*원*")


def amount_band(eok: float) -> str:
    """억 원 단위 금액 → 구간"""
    if eok < 100:
        return "백억 원 미만"
    if eok < 1000:
        return "수백억 원대"
    if eok < 10000:
        return "수천억 원대"
    if eok < 100000:
        return "조 원대"
    return "십조 원 이상"


def _eok(m: _re.Match) -> float:
    n = float(m.group(1).replace(",", ""))
    v = n * 10000 if m.group(2) == "조" else n
    if m.group(3):
        v += float(m.group(3).replace(",", ""))
    return v


def generalize_amounts(text: str) -> str:
    """글 속 '1조 656억 원', '약 2,439억 원' → '조 원대', '수천억 원대'"""
    out = _AMOUNT.sub(lambda m: f" {amount_band(_eok(m))} ", text)
    out = _re.sub(r"\s{2,}", " ", out)
    return _re.sub(r"\s+([,.…)\]])", r"\1", out).strip()


_RATIO = _re.compile(r"(대비|\(%\)|비율)")
_MONEY = _re.compile(r"(금액|총액|조달|권면)")
_TEXT_OK = _re.compile(r"^(증자방식|처분목적|계약목적|해지목적|유보사유|해지 주요사유|정정사유|판매ㆍ공급계약 내용|매출액 또는 손익구조 변동 주요원인|취득목적)$")
_TURN = _re.compile(r"(당기순이익|영업이익|매출액)")
_CLUE = _re.compile(r"(주식회사|㈜|\(주\)|[A-Za-z]{3,}|[A-Z]{2,}-?\d|\d{2,}[A-Z]|공사$|캠퍼스|단지|블록|프로젝트|PJT|대표이사|회장)")


def public_fact(label: str, value: str) -> dict | None:
    """화면·AI 에 보여도 되는 공시 항목이면 (구간으로 바꾼) 항목, 아니면 None"""
    v = value.strip()
    if not v:
        return None
    if _RATIO.search(label):
        return {"label": label, "value": v} if _re.fullmatch(r"-?[\d.]+\s*%?", v) else None
    if _MONEY.search(label):
        m = _AMOUNT.search(v)
        return {"label": label, "value": amount_band(_eok(m))} if m else None
    if _TURN.search(label):
        return {"label": label, "value": v} if v in ("흑자전환", "적자전환", "적자지속", "흑자지속") or _re.fullmatch(r"-?[\d.]+\s*%", v) else None
    if _TEXT_OK.match(label) and len(v) <= 60 and not _CLUE.search(v):
        return {"label": label, "value": generalize_amounts(v)}
    return None


def public_facts(facts: list[dict]) -> list[dict]:
    out, seen = [], set()
    for f in facts:
        g = public_fact(f.get("label", ""), f.get("value", ""))
        if g and (g["label"], g["value"]) not in seen:
            seen.add((g["label"], g["value"]))
            out.append(g)
    return out
