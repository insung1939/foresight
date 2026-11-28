"""주간 자동 갱신의 품질 관문: 새로 만든 시즌 팩·색인이 이전 것보다 나빠지면 배포하지 않는다.

    .venv/bin/python scripts/check_pack.py --old /tmp/old   # /tmp/old 에 이전 season.json·rag.json(pack.enc 를 푼 것)

검사(하나라도 걸리면 종료 코드 1 → GitHub Actions 가 멈추고 메일로 알림, pack.enc 는 그대로):
- 주 수가 줄지 않았나, 앞부분(이미 있던 주)이 그대로인가
- 종목 수가 크게 줄지 않았나(90% 이상), 종가에 빈 값·0·음수가 없나
- 마지막 주가 미래가 아니고, 너무 오래되지 않았나(21일 이내)
- 종목 순서가 그대로인가(판이 종목을 번호로 가리킨다), 지난 주 종가가 다시 쓰이지 않았나
- 주간 등락이 말이 안 되게 큰 값(±95% 넘게)이 새로 생기지 않았나 — 시세 수집 오류 신호
- 검색 색인 문서 수가 줄지 않았나(95% 이상)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))


def load(d: Path, name: str) -> dict | None:
    p = d / name
    return json.loads(p.read_text()) if p.exists() else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", type=Path, required=True)
    ap.add_argument("--new", type=Path, default=ROOT / "data")
    a = ap.parse_args()
    old, new = load(a.old, "season.json"), load(a.new, "season.json")
    bad: list[str] = []
    if not new:
        print("❌ 새 season.json 이 없어요")
        return 1
    W = new["weeks"]
    today = datetime.now(KST).date()
    last = date.fromisoformat(W[-1])
    if last > today:
        bad.append(f"마지막 주 {last} 가 미래")
    if (today - last).days > 21:
        bad.append(f"마지막 주 {last} 가 {(today - last).days}일 전(원천 수집이 멈췄을 수 있음)")
    for x in new["assets"]:
        c = [v for v in x["close"] if v is not None]
        if len(c) != len(x["close"]) or any(v <= 0 for v in c):
            bad.append(f"{x['id']} 종가에 빈 값·0·음수")
    jumps = 0
    for x in new["assets"]:
        cl = x["close"]
        jumps += sum(1 for i in range(max(1, len(cl) - 4), len(cl)) if cl[i - 1] and abs(cl[i] / cl[i - 1] - 1) > 0.95 and x["market"] != "CRYPTO")
    if jumps > 3:
        bad.append(f"최근 4주에 주식 주간 등락 ±95% 초과가 {jumps}건(시세 오류 의심)")
    if old:
        Wo = old["weeks"]
        if len(W) < len(Wo):
            bad.append(f"주 수가 줄었어요 {len(Wo)} → {len(W)}")
        if W[: len(Wo)] != Wo[: len(W)]:
            bad.append("이미 있던 주 목록이 바뀌었어요")
        oid = [x["id"] for x in old["assets"]]
        if [x["id"] for x in new["assets"]][: len(oid)] != oid:
            bad.append("종목 순서가 바뀌었어요(진행 중인 판이 다른 종목을 가리키게 됨)")
        # 마지막 주(금요일 종가 전에 만들었을 수 있음)를 뺀 지난 주 종가는 그대로여야 한다
        nb = {x["id"]: x for x in new["assets"]}
        moved = sum(1 for x in old["assets"] if x["id"] in nb and nb[x["id"]]["close"][: len(Wo) - 1] != x["close"][: len(Wo) - 1])
        if moved > 0.05 * len(oid):
            bad.append(f"지난 주 종가가 바뀐 종목 {moved}개(원천 데이터가 다시 쓰였을 수 있음)")
        if len(new["assets"]) < 0.9 * len(old["assets"]):
            bad.append(f"종목 수가 크게 줄었어요 {len(old['assets'])} → {len(new['assets'])}")
    ro, rn = load(a.old, "rag.json"), load(a.new, "rag.json")
    if rn is None:
        bad.append("새 rag.json 이 없어요")
    elif ro and len(rn["docs"]) < 0.95 * len(ro["docs"]):
        bad.append(f"검색 색인이 줄었어요 {len(ro['docs'])} → {len(rn['docs'])}")
    print(f"주 {len(old['weeks']) if old else '-'} → {len(W)} (마지막 {W[-1]}) · 종목 {len(new['assets'])} · 색인 {len(ro['docs']) if ro else '-'} → {len(rn['docs']) if rn else '-'}")
    for b in bad:
        print("❌", b)
    if bad:
        return 1
    print("✅ 품질 관문 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
