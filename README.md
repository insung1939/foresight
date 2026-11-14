# Foresight

> 지나고 보면 다 쉬워 보인다. 그때로 돌아가면, 맞힐 수 있을까?

hindsight(유튜버 언급 뒤 실제 주가를 모은 서비스)의 기록을 거꾸로 써서, 결과를 가린 실제 과거 순간에 내 판단(foresight)을 시험하는 게임.
(작업 이름 '그때 살걸' → 11/14 Foresight 로 바꿈. 폴더 이름 `geuttae` 는 그대로.)


같은 정보를 보고 나, 유튜버, AI 중 누가 더 잘 맞힐까? 실제 과거 상황으로 겨루는 투자 판단 게임.
기획은 `../idea.md`. 데이터는 hindsight(유튜브 언급·주가·공시)에서 **읽기만** 하고, DART 원문·재무와 Google 뉴스를 더한다.

## 주소

| | |
|---|---|
| 서비스 | https://foresight-rho-teal.vercel.app |
| 발표 슬라이드 | https://foresight-rho-teal.vercel.app/deck/index.html (F 전체화면 · P 발표자 화면) |
| 팀 페이지 | https://foresight-rho-teal.vercel.app/#/team |
| API 문서(Swagger) | https://foresight-api-yda3.onrender.com/docs |
| 코드 | https://github.com/insung1939/foresight |

## 평가 항목별 근거 위치

| 평가 항목 | 어디서 보나 |
|---|---|
| 시스템 기능 설계·구현 30% | 팀 페이지 '시스템·AI' · `api/app/main.py`(단계별 공개) · `rules.py` · `ai.py`(프롬프트·6가지 검증) · `docs/ai.md` · `docs/ai-eval.md` · 테스트 `api/tests` |
| Needs·문제 정의·시장 20% | 팀 페이지 'Needs·시장' · `docs/needs.md`(출처 포함) · 플레이어 설문 · 이용 흐름·학습 효과(데이터 페이지 분석 6) |
| UI/UX·사용성 20% | 서비스 화면 · `docs/ux-plan.md` · `docs/ux-log.md`(개선 사례 22건) |
| 데이터·API 활용 10% | 데이터 페이지 `#/data` · `scripts/`(수집·품질·텍스트 분석) · `data/quality.json` |
| 성능·보안 10% | `docs/perf.md`(최적화 전후·보안 표) · `api/app/ops.py` · 데이터 페이지 '응답 속도' |
| 팀 페이지·배포·시연 10% | 팀 페이지 `#/team` · `docs/demo.md`(시연 순서) · `docs/qna.md`(예상 질문) · `docs/deploy.md` · Swagger `/docs` |

## 구조

```
React(apps/web) ──/api──▶ FastAPI(api/) ──▶ SQLite/PostgreSQL(게임·판단·AI 기록)
                               │
                               ├─ data/bank.json   문제 452개(정답 포함, 서버만)
                               ├─ data/extra.json  재무·공시 핵심·뉴스
                               ├─ data/ai.json     문제별 AI 판단
                               └─ Gemini API       AI 애널리스트(질문할 때만)

scripts/build_bank.py   hindsight DB → data/bank.json
scripts/enrich.py       DART(재무·원문)·Google 뉴스 → data/extra.json
scripts/ai_judge.py     Gemini 로 문제별 AI 판단 → data/ai.json
```

| 폴더 | 내용 |
|---|---|
| `api/app/` | `main.py` 라우트 · `rules.py` 수익률·공매도 · `bank.py` 단계별 공개 범위 · `ai.py` 프롬프트·검증 · `masking.py` 이름 가리기 · `db.py` 테이블 |
| `apps/web/src/` | `screens/` 홈·게임·리포트·데이터 · `components/` 차트·카드·AI 채팅·비중 · `lib/` API 클라이언트·상태 |
| `docs/` | `needs.md` 문제·근거·시장 · `ai.md` 모델·프롬프트·검증 · `ai-eval.md` 평가 기록 · `api.md` API · `perf.md` 성능·보안 · `deploy.md` 배포 · `demo.md` 발표 체크리스트 · `qna.md` 예상 질문 · `ux-plan.md` · `ux-log.md` 사용성 개선 |

## 실행

```bash
# 0) 한 번만
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt pytest
cd apps/web && npm install && cd ../..
# .env: HINDSIGHT_DATABASE_URL, DART_KEY, GEMINI_API_KEY, (선택) SUPABASE_URL (값은 커밋하지 않음)
# 정답이 든 data/bank.json·extra.json·ai.json 은 공개 저장소에 없다 → scripts 로 다시 만들거나 팀에게 받기

# 1) 데이터(이미 data/ 에 있으면 건너뜀)
.venv/bin/python scripts/build_bank.py      # ~20초
.venv/bin/python scripts/enrich.py          # ~10분, data/cache 에 저장돼 다시 돌리면 빠름
.venv/bin/python scripts/ai_judge.py        # Gemini 키 필요, 무료 한도 맞춰 천천히
.venv/bin/python scripts/quality.py         # 미래 정보·이름 노출·정답 일관성 점검 → data/quality.json
.venv/bin/python scripts/text_analysis.py   # 유튜브 제목 c-TF-IDF·자극어 분석 → data/text.json
.venv/bin/python scripts/ai_eval.py         # 짓궂은 질문 평가 → docs/ai-eval.md (Gemini 키 필요)

# 2) 서버 + 화면
cd api && ../.venv/bin/uvicorn app.main:app --port 8000 --reload   # Swagger: http://localhost:8000/docs
cd apps/web && npm run dev                                          # http://localhost:5175
cd apps/web && npm run dev:lan                                      # 같은 와이파이의 휴대폰에서 http://<이 컴퓨터 IP>:5175

# AI: Gemini 키가 없으면 로컬 Ollama(qwen3.5:4b, 수업 3주차)를 자동으로 씀(LLM_PROVIDER=auto · gemini · ollama)
# 배포용 문제 묶음(암호화): .venv/bin/python scripts/pack_data.py → data/pack.enc, 서버는 DATA_KEY 로 자동 해제

# 테스트
cd api && ../.venv/bin/python -m pytest -q
```

## 게임 규칙 (`api/app/rules.py`)

- 모드: 🗓️ 오늘의 챌린지(날짜별로 모두 같은 10문제, 기기·계정당 첫 판만 순위) · 🎲 자유 연습(452문제 중 무작위)
- 10라운드: 오른 4 · 내린 4 · 보합 2, 그중 3라운드에 중간 사건(실제 공시·급등락). 한 게임에 같은 종목은 한 번만. 시작 자금 1,000만 원, 복리.
- 판단 뒤 **20일 리플레이**: 주가가 하루씩 열리고 내 돈이 실시간으로 변한다. 속보 날엔 멈춰 비중을 다시 고르고, 언제든 💰 지금 팔기(중도 매도, 그날 종가). 적중은 처음 판단 방향으로만 본다.
- 카드 6장(차트·공시·유튜버·재무·뉴스·AI) 중 **3장**. 카드는 열 때 서버에서 한 장씩 받는다.
- 비중: **공매도 50%** · 0 · 30 · 70 · 100. 공매도는 손익이 반대 + 대차 수수료 연 4%(일할).
- 적중: 실제로 올랐을 때 70% 이상, 내렸을 때 30% 이하(공매도 포함).
- 비교: 유튜버 말대로(오른다 100%·내린다 0%) · AI(Gemini, 같은 자료) · 코스피 · 같은 문제를 푼 다른 사람들.

## 로그인(선택)

로그인 안 해도 게임은 그대로(레벨·배지는 이 기기에). 구글 로그인(Supabase Auth)하면 기록이 계정에 붙어 기기를 바꿔도 남고 `#/me` 에서 모든 판·성장 그래프·카드별 적중을 본다. 로그인 전 판도 계정으로 옮긴다.
설정: 서버 `SUPABASE_URL`(또는 `SUPABASE_JWT_SECRET`), 화면 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` (`apps/web/.env.example`). 없으면 로그인 버튼이 '준비 중'.

## 발표 슬라이드 `/deck/index.html`

13장, 1600×900 무대(화면에 맞춰 확대). → / Space 다음 단계 · ← 이전 · F 전체화면 · **P 발표자 화면**(대본·다음 장·타이머, 두 창 동기화) · 1~9 장 이동.
숫자는 같은 서비스의 `/api/v1/meta`·`/v1/live` 에서 실시간으로(서버가 없으면 HTML 의 값). 5장은 진짜 앱이 휴대폰 틀 안에 들어 있고, 13장은 오늘의 챌린지 순위가 4초마다 갱신된다.
팀원·GitHub·Swagger 주소는 `apps/web/public/deck/deck.js` 맨 위 `CONFIG`.

## 팀 페이지 `#/team`

평가 항목 6개 순서(Needs·시장 → 시스템·AI → UI/UX → 데이터·API → 성능·보안 → 실패와 개선 → 시연·링크·팀). 숫자는 서버에서 실시간으로 받는다. ←/→ 키로 칸 이동. 링크·팀원은 `apps/web/src/lib/team.ts`.

## 휴대폰 · 실시간 랭킹

- 휴대폰: 비중 고르기·확정 버튼이 아래 고정 패널(엄지로), 연 카드로 자동 스크롤, 정답 화면은 결과 → 차트 → 판정 순. 홈 화면에 추가하면 앱처럼 열림(manifest·아이콘).
- 실시간 랭킹 `#/live`: 닉네임(시작할 때 정함, 🎲 랜덤) · 수익률 순위(시상대) · 적중왕 · 방금 일어난 일 · 카드 통계 · 분포. 4초마다 갱신, 1등이 바뀌면 축하. **발표 때 프로젝터에 띄우고 QR 로 청중 참여.**

## hindsight 데이터를 쓰는 곳

| 어디 | 무엇 |
|---|---|
| 문제 452개 | 국내 주식 유튜브 언급 16,821건 → 후보 3,137개 → 같은 종목은 60일 넘게 떨어진 날만, 최대 4번 |
| 유튜버 카드 | 영상 논조 + **그 유튜버의 산 날 전 적중률**(산 날 전에 20거래일 결과가 확정된 언급만 셈) |
| 결과 공개 | '유튜버 말대로' 줄, 유튜버 판단 해설 |
| 리포트 | hindsight 전체 기록('오른다' 7,143번·'내린다' 2,480번)과 내 적중률 비교, 유튜버 26명 사이 내 자리 |
| 홈·데이터 | 전광판, '분석 0 · 유튜버 말 뒤 20거래일' |

## 공정성 원칙

- 문제 화면 정보는 전부 산 날 이전 것(재무는 전날까지 접수된 보고서, 뉴스는 15:30 전 기사).
- 정답·중간 사건은 서버가 쥐고 있다가 판단을 낸 뒤에만 보낸다(테스트: 10라운드 내내 정답 문자열이 응답에 없는지 검사).
- 회사·사람 이름, 가격·날짜, 회사를 특정할 금액은 가리거나 구간으로 바꾼다.

학습용 시뮬레이션이며 투자 권유가 아닙니다.
