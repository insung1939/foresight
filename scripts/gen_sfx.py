"""게임 효과음 만들기: ElevenLabs 효과음 생성(Sound Effects API) → apps/web/public/audio/sfx/<이름>.mp3

    .venv/bin/python scripts/gen_sfx.py            # 10개 전부(이미 있는 건 건너뜀)
    .venv/bin/python scripts/gen_sfx.py coin flip  # 골라서 다시 만들기(덮어씀)
    .venv/bin/python scripts/gen_sfx.py --manifest # 만들지 않고 목록(manifest.json)만 다시 쓰기

필요: .env 의 ELEVENLABS_API_KEY (채팅에 붙여넣지 말고 .env 에 직접). 키는 저장소에 올라가지 않는다(.gitignore).
이름은 화면 코드(apps/web/src/lib/sfx.ts)의 sfx("…") 이름과 같다. 파일이 없는 소리는 화면이 합성음으로 낸다.
Suno 배경음악은 apps/web/public/audio/bgm/{home,play,result}.mp3 로 넣고 --manifest 를 한 번 돌리면 된다.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "apps" / "web" / "public" / "audio"
API = "https://api.elevenlabs.io/v1/sound-generation"

# (이름, 길이 초, 설명) — 모바일 게임 UI 답게 짧고 깨끗하게, 음악·목소리 없이
SFX = [
    ("tick", 0.5, "very short soft UI tap click, clean, modern mobile game button, no reverb"),
    ("flip", 0.6, "quick playing card flip whoosh with a light paper snap, mobile game"),
    ("confirm", 0.7, "short bright positive two-note UI confirm chime, friendly mobile game"),
    ("coin", 0.8, "single shiny gold coin clink, cash register sparkle, mobile game reward"),
    ("hit", 1.2, "cheerful short success jingle, rising arpeggio, stock price going up, casual game"),
    ("miss", 1.0, "soft descending sad trombone-like synth blip, gentle loss sound, not harsh"),
    ("alarm", 1.5, "tense short warning alarm beeps, panic sell alert, stock market crash, game"),
    ("level", 1.8, "triumphant short fanfare with sparkles, level up, treasure box opened, mobile game"),
    ("badge", 1.0, "magical sparkle chime, achievement badge unlocked, light and airy"),
    ("whoosh", 0.8, "fast airy whoosh transition, time travel swoosh, clean"),
]


def write_manifest() -> dict:
    m_path = AUDIO / "manifest.json"
    old = json.loads(m_path.read_text()) if m_path.exists() else {}
    m = {
        "bgm": sorted(p.stem for p in (AUDIO / "bgm").glob("*.mp3")),
        "sfx": sorted(p.stem for p in (AUDIO / "sfx").glob("*.mp3")),
        "vol": old.get("vol", {"bgm": 0.35, "sfx": 0.6}),
    }
    m_path.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
    print(f"manifest: 배경음악 {m['bgm']} · 효과음 {len(m['sfx'])}개")
    return m


def main() -> int:
    (AUDIO / "sfx").mkdir(parents=True, exist_ok=True)
    (AUDIO / "bgm").mkdir(parents=True, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--manifest" in sys.argv:
        write_manifest()
        return 0
    load_dotenv(ROOT / ".env")
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        print("ELEVENLABS_API_KEY 가 .env 에 없어요")
        return 1
    todo = [s for s in SFX if (s[0] in args if args else not (AUDIO / "sfx" / f"{s[0]}.mp3").exists())]
    c = httpx.Client(timeout=60, headers={"xi-api-key": key})
    for name, dur, text in todo:
        r = c.post(API, json={"text": text, "duration_seconds": dur, "prompt_influence": 0.6})
        if r.status_code != 200:
            print(f"✗ {name}: {r.status_code} {r.text[:200]}")
            continue
        (AUDIO / "sfx" / f"{name}.mp3").write_bytes(r.content)
        print(f"✓ {name} ({len(r.content) / 1024:.0f} KB)")
    write_manifest()
    return 0


if __name__ == "__main__":
    sys.exit(main())
