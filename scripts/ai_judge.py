"""문제마다 'AI의 판단'(비중·이유)을 미리 만든다 → data/ai.json

    .venv/bin/python scripts/ai_judge.py [--limit 5] [--redo]

플레이어와 같은 조건: 그 문제의 T0 이전 자료(차트·공시·재무·뉴스·유튜브)만 본다.
검증(인용 id·이름 노출·숫자 출처·권유 표현)을 통과한 답만 저장하고, 모든 호출은 ai_logs 에 남긴다.
무료 한도를 지키려고 호출 사이에 쉬고, 429 가 오면 기다렸다 다시 한다. 이미 만든 문제는 건너뛴다.
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))
from app import ai  # noqa: E402
from app.bank import bank, case_key  # noqa: E402
from app.db import AiLog, Session, init_db  # noqa: E402


ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--daily-days", type=int, default=0, help="오늘부터 n일치 '오늘의 챌린지' 문제만(시연용, 로컬 모델이 느릴 때)")
ap.add_argument("--redo", action="store_true")
ap.add_argument("--pause", type=float, default=4.5, help="호출 사이 쉬는 초(무료 한도 대비)")
args = ap.parse_args()

init_db()
out_path = ROOT / "data" / "ai.json"
done: dict = json.loads(out_path.read_text()) if out_path.exists() else {}
ok = fail = 0
targets = bank.cases
if args.daily_days:
    import random as _r
    from datetime import date, timedelta

    from app import rules

    today = date.fromisoformat(__import__("app.main", fromlist=["today_kst"]).today_kst())
    seen, targets = set(), []
    for d in range(args.daily_days):  # 서버의 오늘의 챌린지와 같은 방식으로 날짜별 10문제
        for c in rules.pick_rounds(bank.cases, _r.Random(f"daily-{(today + timedelta(days=d)).isoformat()}")):
            if case_key(c) not in seen:
                seen.add(case_key(c))
                targets.append(c)
    print(f"오늘의 챌린지 {args.daily_days}일치 {len(targets)}문제")
for c in targets[: args.limit or None]:
    key = case_key(c)
    if key in done and done[key].get("weight") is not None and not args.redo:
        continue
    for wait in (0, 30, 60, 120):
        time.sleep(wait)
        try:
            res, chk, usage, attempts = ai.judge(c, bank.ex(key))
            break
        except ai.LLMUnavailable as e:
            print(f"  {key}: {e}", flush=True)
            if "한도" not in str(e):
                res, chk, usage, attempts = None, ai.Check(False, {"call": str(e)}), ai.Usage(), 0
                break
    else:
        sys.exit("한도가 풀리지 않아 멈춰요. 나중에 다시 돌리면 이어서 해요.")
    with Session() as s:
        s.add(AiLog(kind="judge", case_key=key, answer=json.dumps(res, ensure_ascii=False) if res else None, ok=chk.ok,
                    checks=chk.items, attempts=attempts, latency_ms=usage.latency_ms, tokens_in=usage.tokens_in,
                    tokens_out=usage.tokens_out, model=ai.model_name()))
        s.commit()
    if res:
        done[key] = {**res, "model": ai.model_name(), "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        ok += 1
    else:
        fail += 1
        print(f"  검증 실패 {key}: {chk.items}", flush=True)
    out_path.write_text(json.dumps(done, ensure_ascii=False, indent=1))
    print(f"{ok + fail} ok={ok} fail={fail} w={res and res['weight']} {usage.latency_ms}ms", flush=True)
    time.sleep(args.pause)
print(f"done ok={ok} fail={fail} total={len(done)}")
