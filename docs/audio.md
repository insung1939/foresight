# 사운드 — Suno 배경음악 · ElevenLabs 효과음

교수님 피드백 '게임은 사운드가 중요하다'. 화면은 **파일이 있으면 파일, 없으면 Web Audio 합성음**을 쓴다(`apps/web/src/lib/sfx.ts`).
어떤 파일이 있는지는 `apps/web/public/audio/manifest.json` 이 알려 준다(`scripts/gen_sfx.py --manifest` 가 폴더를 보고 다시 씀).

## 1. 배경음악 — Suno (화면별 3곡)

Suno 는 공개 API 가 없어서 사람이 만든다. **Custom 모드 · Instrumental 켜기**, 아래 Style 을 그대로 붙여 넣고 마음에 드는 걸 받는다(mp3).

| 파일 이름 | 언제 | Style of Music(그대로 붙여 넣기) | 제목 예 |
|---|---|---|---|
| `home.mp3` | 홈 · 내 방 · 랭킹 · 데이터 | `lo-fi chill hop, cozy and warm, soft Rhodes piano, gentle vinyl crackle, mellow boom-bap drums, 80 bpm, relaxing study vibe, seamless loop, instrumental, no vocals` | Monday Morning Ant |
| `play.mp3` | 플레이(한 주씩 넘기는 중) | `upbeat lo-fi hip hop with light tension, plucky synth arpeggio, subtle ticking clock percussion, warm bass, 95 bpm, focused game background music, seamless loop, instrumental, no vocals` | Market Open |
| `result.mp3` | 결산 | `bright cheerful synth-pop, triumphant and playful, sparkly chimes and claps, 110 bpm, celebration jingle, short and loopable, instrumental, no vocals` | Time Slip Payday |

- 길이는 1~2분이면 충분하다(반복 재생). 끝과 시작이 자연스럽게 이어지는 버전을 고른다.
- 받은 파일을 이름만 바꿔 `apps/web/public/audio/bgm/` 에 넣고 `.venv/bin/python scripts/gen_sfx.py --manifest` → 커밋.
- 볼륨은 `manifest.json` 의 `vol.bgm`(기본 0.35)으로 조절한다.
- 라이선스: Suno 무료 플랜 곡은 비상업 용도만 된다(수업 발표·시연은 괜찮음). 팀 페이지에 'Music: Suno' 출처를 적는다.

## 2. 효과음 — ElevenLabs (10개, 스크립트 한 번)

1. ElevenLabs 계정 → Profile → API Keys 에서 키 만들기(효과음 권한).
2. 프로젝트 루트 `.env` 에 한 줄 추가(채팅·코드에 붙여넣지 말 것): `ELEVENLABS_API_KEY=...`
3. `.venv/bin/python scripts/gen_sfx.py` → `apps/web/public/audio/sfx/*.mp3` 10개 + manifest 갱신.
4. 마음에 안 드는 소리만 다시: `scripts/gen_sfx.py coin flip`

| 이름 | 언제 나나 |
|---|---|
| tick | 버튼 · 탭 전환 · 평범한 주 |
| flip | 결산에서 정체 공개 카드 |
| confirm | 시즌 시작 · 사건 선택 |
| coin | 주문 담기 · 행운 상자 |
| hit / miss | 이번 주 수익 / 손실 |
| alarm | 패닉셀 |
| level | 가구 상자 · 등급 S·A·B · 행운 카드 |
| badge | 소리 켜기 · 칭호 |
| whoosh | 다음 주 · 빨리 감기 · 이야기 넘기기 |

- 설명(프롬프트)은 `scripts/gen_sfx.py` 의 `SFX` 표에 있다. 바꾸고 다시 돌리면 된다.
- 라이선스: ElevenLabs 무료 플랜은 출처 표기·비상업 조건이 붙는다 — 쓰는 플랜의 약관을 확인하고 팀 페이지에 'Sound effects: ElevenLabs' 를 적는다.
