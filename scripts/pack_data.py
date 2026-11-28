"""미래 가격이 든 시즌 팩을 암호화해 공개 저장소에 넣을 수 있게 묶는다 → data/pack.enc

    .venv/bin/python scripts/pack_data.py          # 묶기(.env 의 DATA_KEY 사용, 없으면 새로 만들어 .env 에 추가)
    .venv/bin/python scripts/pack_data.py --unpack # 풀기(서버는 시작할 때 자동으로 푼다: api/app/bank.py)

- 공개 GitHub 에는 data/pack.enc(암호문)만 올라가고, 원본 season.json 은 .gitignore.
- 서버(Render)는 환경 변수 DATA_KEY 로 시작할 때 풀어서 쓴다. 키가 없으면 아무도 정답을 볼 수 없다.
- 암호: Fernet(AES-128-CBC + HMAC-SHA256, cryptography 라이브러리).
"""
from __future__ import annotations

import io
import os
import sys
import tarfile
from pathlib import Path

from cryptography.fernet import Fernet
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FILES = ["season.json", "rag.json", "sector.json"]  # 시즌 팩(미래 가격 포함) + 개미 비서 색인 + 업종 캐시(주간 자동 갱신용) — 서버만 갖는다


def pack() -> None:
    load_dotenv(ROOT / ".env")
    key = os.environ.get("DATA_KEY", "").strip()
    if not key:
        key = Fernet.generate_key().decode()
        with open(ROOT / ".env", "a") as f:
            f.write(f"\n# 문제 파일 암호 키(서버 환경 변수 DATA_KEY 로도 넣는다. 공개 금지)\nDATA_KEY={key}\n")
        print("새 DATA_KEY 를 .env 에 추가했어요(Render 환경 변수에도 같은 값을 넣어야 해요).")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in FILES:
            p = DATA / name
            if p.exists():
                tar.add(p, arcname=name)
    enc = Fernet(key.encode()).encrypt(buf.getvalue())
    (DATA / "pack.enc").write_bytes(enc)
    print(f"data/pack.enc {len(enc) / 1024:.0f} KB ({', '.join(n for n in FILES if (DATA / n).exists())})")


def unpack(target: Path, key: str) -> list[str]:
    raw = Fernet(key.encode()).decrypt((DATA / "pack.enc").read_bytes())
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        names = [m.name for m in tar.getmembers() if m.isfile() and "/" not in m.name and m.name in FILES]
        for n in names:
            (target / n).write_bytes(tar.extractfile(n).read())
    return names


if __name__ == "__main__":
    if "--unpack" in sys.argv:
        load_dotenv(ROOT / ".env")
        print(unpack(DATA, os.environ["DATA_KEY"]))
    else:
        pack()
