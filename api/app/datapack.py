"""배포 서버: 공개 저장소엔 암호문(data/pack.enc)만 있다 → DATA_KEY 로 풀어서 쓴다(scripts/pack_data.py)."""
from __future__ import annotations

import io
import os
import tarfile

from .settings import DATA_DIR


def unpack_if_needed() -> None:
    if (DATA_DIR / "season.json").exists() and (DATA_DIR / "rag.json").exists():
        return
    enc = DATA_DIR / "pack.enc"
    key = os.environ.get("DATA_KEY", "").strip()
    if not enc.exists() or not key:
        raise FileNotFoundError("data/season.json 이 없어요(scripts/build_season.py 로 만들거나 DATA_KEY 를 넣어 주세요)")
    from cryptography.fernet import Fernet

    raw = Fernet(key.encode()).decrypt(enc.read_bytes())
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        for m in tar.getmembers():
            if m.isfile() and "/" not in m.name and m.name.endswith(".json"):
                (DATA_DIR / m.name).write_bytes(tar.extractfile(m).read())
