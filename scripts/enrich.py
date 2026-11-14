"""문제 은행에 재무·공시 핵심 내용·뉴스를 붙인다 → data/extra.json

    .venv/bin/python scripts/enrich.py [--only fin,docs,news] [--limit 5]

미래 정보 차단 원칙
- 재무: 산 날(T0) **전날까지** 접수된 정기보고서(분기·반기·사업)만 쓴다.
- 공시 내용: 문제 카드에 이미 나온(=T0 이전) 공시와 중간 사건 공시만 원문을 연다.
- 뉴스: T0 15:30(KST) 이전에 나온 기사만. 결과 공개용 '그 뒤 뉴스'는 따로 저장한다.

가리기·검색 방지
- 회사 이름·별칭·코드는 A사, 다른 종목은 ○○. 가린 뒤에도 이름이 남으면 그 항목은 버린다.
- 재무 절대 금액은 '수천억 원' 같은 구간으로만 보여 준다(금액으로 회사를 찾지 못하게).
- 원문 발췌(AI 근거용)는 서버에만 두고 화면에는 보내지 않는다.

DART·Google 응답은 data/cache/ 에 저장해 다시 돌릴 때 재요청하지 않는다.
"""
from __future__ import annotations

import argparse
import email.utils
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from masking import leaks, mask  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
load_dotenv(ROOT / ".env")
DART = "https://opendart.fss.or.kr/api"
KEY = os.environ.get("DART_KEY", "")
KST = timezone(timedelta(hours=9))

ap = argparse.ArgumentParser()
ap.add_argument("--only", default="fin,docs,news")
ap.add_argument("--limit", type=int, default=0, help="앞에서 n문제만(시험용)")
args = ap.parse_args()
ONLY = set(args.only.split(","))

bank = json.loads((ROOT / "data" / "bank.json").read_text())
NAMES: list[str] = json.loads((ROOT / "data" / "names.json").read_text())
out_path = ROOT / "data" / "extra.json"
extra: dict = json.loads(out_path.read_text()) if out_path.exists() else {}
client = httpx.Client(timeout=30, headers={"User-Agent": "Mozilla/5.0 (geuttae class project)"})


def cached(kind: str, key: str, fetch, binary=False):
    p = CACHE / kind / (hashlib.sha1(key.encode()).hexdigest()[:20] + (".bin" if binary else ".json"))
    if p.exists():
        return p.read_bytes() if binary else json.loads(p.read_text())
    data = fetch()
    p.parent.mkdir(parents=True, exist_ok=True)
    if binary:
        p.write_bytes(data)
    else:
        p.write_text(json.dumps(data, ensure_ascii=False))
    return data


def dart(path: str, **params) -> dict:
    key = path + json.dumps(params, sort_keys=True)

    def go():
        r = client.get(f"{DART}/{path}", params={"crtfc_key": KEY, **params})
        time.sleep(0.15)
        return r.json()

    return cached("dart", key, go)


def won_band(x: float) -> str:
    a = abs(x)
    if a < 1e10:
        return "100억 원 미만"
    if a < 1e11:
        return "수백억 원"
    if a < 1e12:
        return "수천억 원"
    if a < 1e13:
        return "1조~10조 원"
    return "10조 원 이상"


# ------------------------------------------------------------ 재무
REPRT = {"03": ("11013", "1분기"), "06": ("11012", "반기"), "09": ("11014", "3분기"), "12": ("11011", "연간")}
PERIODIC = re.compile(r"(분기|반기|사업)보고서\s*\((\d{4})\.(\d{2})\)")


def num(s) -> float | None:
    if s in (None, "", "-"):
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def finance(corp: str, t0: date) -> dict | None:
    lst = dart("list.json", corp_code=corp, bgn_de=(t0 - timedelta(days=450)).strftime("%Y%m%d"),
               end_de=(t0 - timedelta(days=1)).strftime("%Y%m%d"), pblntf_ty="A", page_count=30)
    for item in lst.get("list", []):  # 최신순
        m = PERIODIC.search(item["report_nm"])
        if not m:
            continue
        year, mm = m.group(2), m.group(3)
        if mm not in REPRT:  # 결산월이 12월이 아닌 회사의 보고서는 건너뛴다(분기 구분이 다름)
            continue
        code, label = REPRT[mm]
        rows = dart("fnlttSinglAcnt.json", corp_code=corp, bsns_year=year, reprt_code=code).get("list", [])
        if not rows:
            continue
        basis = "CFS" if any(r["fs_div"] == "CFS" for r in rows) else "OFS"
        acc: dict[str, dict] = {}
        for r in rows:
            if r["fs_div"] == basis and r["account_nm"] not in acc:
                acc[r["account_nm"]] = r

        def pick(*names):
            for n in names:
                if n in acc:
                    return num(acc[n].get("thstrm_amount")), num(acc[n].get("frmtrm_amount"))
            return None, None

        rev, rev0 = pick("매출액", "영업수익", "수익(매출액)")
        op, op0 = pick("영업이익", "영업이익(손실)")
        net, net0 = pick("당기순이익(손실)", "당기순이익", "분기순이익(손실)", "반기순이익(손실)")
        assets, _ = pick("자산총계")
        debt, _ = pick("부채총계")
        equity, _ = pick("자본총계")
        if rev is None and op is None:
            continue
        rcept = datetime.strptime(item["rcept_dt"], "%Y%m%d").date()

        def growth(a, b):
            if a is None or b in (None, 0):
                return None
            return round(a / b - 1, 4) if b > 0 else None

        def turn(a, b):
            if a is None or b is None:
                return None
            if a >= 0 > b:
                return "흑자 전환"
            if a < 0 <= b:
                return "적자 전환"
            if a < 0 and b < 0:
                return "적자 지속"
            return None

        return {
            "report": f"{year}년 {label}" + (" 보고서" if label != "연간" else " 사업보고서"),
            "daysBefore": (t0 - rcept).days,
            "basis": "연결" if basis == "CFS" else "별도",
            "revenueBand": won_band(rev) if rev is not None else None,
            "revenueGrowth": growth(rev, rev0),
            "opMargin": round(op / rev, 4) if op is not None and rev else None,
            "opGrowth": growth(op, op0),
            "opTurn": turn(op, op0),
            "netTurn": turn(net, net0),
            "netLoss": net is not None and net < 0,
            "debtRatio": round(debt / equity, 4) if debt is not None and equity and equity > 0 else None,
            "compare": "전년 같은 기간 대비",
            # 서버 전용(AI 근거): 억 원 단위로 반올림
            "_raw": {k: (round(v / 1e8) if v is not None else None) for k, v in
                     {"매출액": rev, "전년매출액": rev0, "영업이익": op, "전년영업이익": op0, "순이익": net,
                      "자산총계": assets, "부채총계": debt, "자본총계": equity}.items()},
        }
    return None


# ------------------------------------------------------------ 공시 원문 핵심
WANT_DOC = re.compile(r"공급계약|유상증자|무상증자|자기주식|전환사채|신주인수권|교환사채|합병|분할|최대주주|투자판단|경영사항|"
                      r"소송|영업정지|잠정\)?실적|손익구조|타법인주식|유형자산|감자|횡령|배임|불성실")
SKIP_DOC = re.compile(r"증권신고서|투자설명서|일괄신고|주주총회|감사보고서|사업보고서|분기보고서|반기보고서|결과보고서|소유상황")
FACT_KEYS = ["계약금액", "매출액 대비", "매출액대비", "계약상대", "계약기간", "계약내용", "판매ㆍ공급계약 내용", "체결계약명",
             "증자방식", "신주의 종류와 수", "자금조달의 목적", "발행결정 전 발행주식", "취득예정금액", "취득목적", "처분목적",
             "처분예정금액", "변동사유", "변경사유", "주요내용", "결정내용", "결정사유", "청구내용", "사유", "목적", "증감비율",
             "증감률", "매출액", "영업이익", "당기순이익", "자기자본대비", "자산총액대비", "변경내용", "사채의 권면"]
# 가격·회사 규모 절대값은 회사를 특정하게 하므로 뺀다(비율은 '매출액 대비 %'로 남는다)
PRICE_LABEL = re.compile(r"가액|주가|단가|기준가|최근\s*매출액|자산총액\(|자기자본\(|발행주식\s*총수")


def strip_tags(x: str) -> str:
    x = re.sub(r"<[^>]+>", " ", x)
    x = x.replace("&cr;", " ").replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", x).strip()


def amount_to_eok(v: str) -> str:
    """'123,456,789,000' → '약 1,235억 원'"""
    def rep(m):
        n = float(m.group(0).replace(",", ""))
        if n >= 1e8:
            e = n / 1e8
            return f"약 {e:,.0f}억 원" if e >= 10 else f"약 {e:.1f}억 원"
        return m.group(0)
    return re.sub(r"\d{1,3}(?:,\d{3}){2,}", rep, v)


def doc_facts(rcept_no: str, target: dict) -> dict | None:
    raw = cached("docs", rcept_no, lambda: client.get(f"{DART}/document.xml",
                                                        params={"crtfc_key": KEY, "rcept_no": rcept_no}).content, binary=True)
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        return None
    xml = z.read(z.namelist()[0]).decode("utf-8", "ignore")
    xml = re.sub(r"<style.*?</style>", " ", xml, flags=re.S | re.I)
    facts: list[dict] = []
    seen = set()
    # DART 원문은 대문자 XML(TR/TD/TE)과 소문자 HTML(tr/td) 두 가지가 섞여 있다
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", xml, re.S | re.I):
        cells = [strip_tags(c) for _, c in re.findall(r"<(td|te|th|tu)[^>]*>(.*?)</\1>", tr, re.S | re.I)]
        cells = [c for c in cells if c]
        if len(cells) < 2:
            continue
        label = re.sub(r"^[\d.\-)\s]+", "", cells[0])[:40]
        value = cells[-1]
        if not any(k in label for k in FACT_KEYS) or PRICE_LABEL.search(label) or value in ("-", label):
            continue
        value = mask(amount_to_eok(value), target, NAMES, strip_tail=False)[:90]
        label = mask(label, target, NAMES, strip_tail=False)
        if leaks(value, target) or leaks(label, target) or (label, value) in seen or not value:
            continue
        seen.add((label, value))
        facts.append({"label": label, "value": value})
        if len(facts) >= 6:
            break
    text = mask(amount_to_eok(strip_tags(xml)), target, NAMES, strip_tail=False)
    return {"facts": facts, "_excerpt": text[:1500]}


# ------------------------------------------------------------ 뉴스(Google 뉴스 RSS)
def news(name: str, target: dict, since: date, until: date, cutoff: datetime | None, after: datetime | None,
         masked: bool, n: int) -> list[dict]:
    q = f'"{name}" after:{since.isoformat()} before:{until.isoformat()}'
    url = f"https://news.google.com/rss/search?q={quote(q)}&hl=ko&gl=KR&ceid=KR:ko"
    xml = cached("news", url, lambda: (time.sleep(1.0), client.get(url).text)[1])
    items = re.findall(r"<item>.*?<title>(.*?)</title>.*?<pubDate>(.*?)</pubDate>.*?<source[^>]*>(.*?)</source>", xml, re.S)
    out, seen = [], set()
    for title, pub, src in items:
        when = email.utils.parsedate_to_datetime(pub)
        if cutoff and when >= cutoff:
            continue  # 산 시점 뒤 기사는 문제에 못 쓴다
        if after and when <= after:
            continue
        title = re.sub(r"\s+-\s+[^-]+$", "", title).replace("&quot;", '"').replace("&amp;", "&").replace("&#39;", "'")
        if masked:
            title = mask(title, target, NAMES, strip_tail=False)
            if leaks(title, target) or "A사" not in title:
                continue  # 다른 회사 이야기거나 이름이 남은 기사
            if leaks(src, target) or re.search(r"뉴스룸|newsroom|IR", src, re.I):
                continue  # 회사가 직접 낸 보도자료 채널은 출처 이름으로 회사가 드러난다
        if title in seen:
            continue
        seen.add(title)
        item = {"title": title, "source": src, "at": when.astimezone(KST).isoformat(timespec="minutes")}
        if cutoff:  # 문제용: 날짜 대신 'n일 전'
            item["daysBefore"] = max((cutoff.date() - when.astimezone(KST).date()).days, 0)
        out.append(item)
    out.sort(key=lambda x: x["at"], reverse=True)  # 최신 기사 먼저
    return out[:n]


# ------------------------------------------------------------ 실행
cases = bank["cases"][: args.limit or None]
stats = {"fin": 0, "docs": 0, "facts": 0, "news": 0, "newsAfter": 0}
for i, c in enumerate(cases, 1):
    a = c["answer"]
    t0 = date.fromisoformat(a["t0"])
    key = f'{c["private"]["assetId"]}|{a["t0"]}'
    e = extra.setdefault(key, {})
    target = {"name": a["name"], "aliases": [], "symbol": a["symbol"]}

    if "fin" in ONLY:
        e["finance"] = finance(c["private"]["corpCode"], t0)
        stats["fin"] += e["finance"] is not None

    if "docs" in ONLY:
        docs = {}
        rcepts = [d.get("_rcept") for d in c["disclosures"]["items"]
                  if d.get("_rcept") and WANT_DOC.search(d["title"]) and not SKIP_DOC.search(d["title"])][:4]
        if c["event"] and c["event"].get("_rcept"):
            rcepts.append(c["event"]["_rcept"])
        for no in rcepts:
            f = doc_facts(no, target)
            if f:
                docs[no] = f
                stats["facts"] += len(f["facts"])
        e["docs"] = docs
        stats["docs"] += len(docs)

    if "news" in ONLY:
        cutoff = datetime.combine(t0, datetime.min.time(), tzinfo=KST) + timedelta(hours=15, minutes=30)
        before = news(a["name"], target, t0 - timedelta(days=7), t0 + timedelta(days=1), cutoff, None, True, 8)
        after = news(a["name"], target, t0 + timedelta(days=1), t0 + timedelta(days=30), None, cutoff, False, 5)
        e["news"] = {"before": before, "after": after}
        stats["news"] += len(before)
        stats["newsAfter"] += len(after)

    if i % 10 == 0:
        print(f"{i}/{len(cases)} {stats}", flush=True)
        out_path.write_text(json.dumps(extra, ensure_ascii=False, indent=1))

out_path.write_text(json.dumps(extra, ensure_ascii=False, indent=1))
print("done", stats, f"→ {out_path}")
