# 타임슬립 개미 (Foresight)

> 그때로 돌아가면 부자 될 수 있을까? 1,000만 원과 폰 하나로, 실제로 있었던 시장의 반년(26주)을 다시 산다.

hindsight(유튜버 언급 뒤 실제 주가를 모은 서비스)의 데이터로 만든 투자 시뮬레이션 게임. 한 턴은 실제 1주다. 월요일 아침 피드(지난주 실제 유튜브 영상 제목·화제성·차트)를 보고 사고판 뒤 [다음 주 ▶]를 누르면, 그 주의 실제 가격으로 결과가 나온다. 종목은 코드네임('반도체 A')으로 가리고, 실제 유튜버 3명(그들이 '오른다'고 한 종목을 따라 산 가상 성적)과 코스피를 라이벌로 26주 동안 겨룬다.

2026-11-21 에 10문제 퀴즈였던 이전 버전을 갈아엎었다. 이유·레퍼런스(킥루·전염병 주식회사·키자니아)·설계는 [`docs/redesign-plan.md`](docs/redesign-plan.md).

## 주소

| | |
|---|---|
| 서비스 | https://foresight-rho-teal.vercel.app |
| 5주차 발표(아이디어 공유) | https://foresight-rho-teal.vercel.app/deck/index.html (F 전체화면 · P 발표자 화면 · 대본 `docs/script.md`) |
| 프로토타입 | https://foresight-rho-teal.vercel.app (시연용 바로가기 `/#/demo`) |
| 팀 페이지 | https://foresight-rho-teal.vercel.app/#/team |
| 기말 최종 발표 자료 | https://foresight-rho-teal.vercel.app/final/ (P 발표자 화면 · 대본 `docs/final-script.md`) |
| API 문서(Swagger) | https://foresight-api-yda3.onrender.com/docs |
| 코드 | https://github.com/insung1939/foresight |

## 평가 항목별 근거 위치

| 평가 항목 | 어디서 보나 |
|---|---|
| 시스템 기능 설계·구현 | 팀 페이지 '시스템' · `api/app/season.py`(규칙 엔진) · `main.py`(API) · `ai.py`(코치·검증) · 테스트 `api/tests` |
| Needs·문제 정의·시장 | 팀 페이지 'Needs'·'레퍼런스 분석'·'수익화' · `docs/redesign-plan.md` |
| UI/UX·사용성 | 서비스 화면(모바일 우선) · 팀 페이지 'UI/UX'(11주차 용어집 대응표) · `docs/ux-log.md`(R1~R9) |
| 데이터·API 활용 | 데이터 페이지 `#/data`(출처·가공·분석 4가지) · `scripts/build_season.py` |
| 성능·보안 | 팀 페이지 '성능·보안' · `api/app/ops.py` · 데이터 페이지 '응답 속도' |
| 팀 페이지·배포·시연 | 팀 페이지 `#/team` · `docs/deploy.md` · Swagger `/docs` |

## 구조

```
React + three.js(apps/web, Vercel) ──/api──▶ FastAPI(api/, Render) ──▶ Supabase PostgreSQL
                                                  │                        ├─ runs      판 상태·결과(분석에 사용)
                                                  │                        ├─ ai_calls  AI 호출·검증 기록
                                                  │                        └─ rag_docs  pgvector(256) — 범고래 박사 비서 색인
                                                  ├─ data/season.json  시즌 팩(주봉·언급·제목·유튜버 고스트, 서버만)
                                                  └─ Gemini            질문 임베딩 · 범고래 박사 답 · AI 코치(로컬 개발: 키 없으면 Ollama, 운영: 실패 시 규칙 답)

hindsight DB ─(읽기만)─▶ build_season.py ─▶ season.json + rag_docs.json ─▶ build_rag.py(Gemini 임베딩, 하루 한도만큼) ─▶ rag.json
                                       └──────────────▶ pack_data.py ─▶ data/pack.enc(공개 저장소, 서버가 DATA_KEY 로 풂)
```

| 폴더 | 내용 |
|---|---|
| `api/app/` | `season.py` 게임 규칙(시드·매매·멘탈·사건·캐릭터·미션·결산) · `main.py` API · `rag.py` 시점 제한 검색(pgvector/메모리) · `ai.py` 개미 비서·코치 프롬프트와 검증 · `masking.py` 이름·날짜 가리기 · `ops.py` 요청 한도·지연 측정 · `db.py` |
| `apps/web/src/` | `screens/` 홈·플레이(`play/` 판·시트·모달)·결산·랭킹·데이터·팀·시연 · `components/` 공용 부품·캐릭터(SVG)·3D(`three/`) · `lib/` API·진행 기록·내 방 |
| `apps/web/public/deck/` | 5주차 발표 자료(← → · F 전체화면 · P 발표자 화면) — 대본 `docs/script.md` |
| `docs/` | `redesign-plan.md` 1차 기획 · `design-v2.md` 자체 피드백·2·3차 설계 · `ux-log.md` 사용성 개선 기록 · `ai-eval.md` 짓궂은 질문 평가 · `perf.md` 성능 전후·비용·보안 · `script.md` 발표 대본 · `deploy.md` 배포 · `archive/` 이전 버전 문서 |

API 흐름: `POST /v1/runs`(새 판, mode·char) → `POST /event`(사건) → `POST /turn` 또는 `/skip`(빨리 감기) × 26 · `POST /ask`(개미 비서) → `GET /final` · `POST /coach` · `GET /v1/leaderboard` · `GET /v1/meta` · `GET /v1/chars`

## 실행

```bash
# 0) 한 번만
python3 -m venv .venv && .venv/bin/pip install -r api/requirements.txt pytest psycopg[binary]
cd apps/web && npm install && cd ../..
# .env: HINDSIGHT_DATABASE_URL, DART_KEY(코드네임용 업종 코드 조회만 — 공시는 게임에서 안 씀), GEMINI_API_KEY, DATA_KEY (값은 커밋하지 않음)

# 1) 시즌 팩(이미 data/season.json 이 있으면 건너뜀. DATA_KEY 가 있으면 서버가 pack.enc 를 자동으로 푼다)
.venv/bin/python scripts/build_season.py    # ~30초 → season.json + rag_docs.json
.venv/bin/python scripts/build_rag.py       # 범고래 박사 색인(Gemini 임베딩, 하루 무료 한도만큼 — 다음 날 다시 돌리면 이어서)
.venv/bin/python scripts/pack_data.py       # 배포용 암호화 → data/pack.enc
# (선택) 로컬에서 Supabase 와 같은 pgvector: docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=ant -e POSTGRES_DB=ant pgvector/pgvector:pg16
#        → DATABASE_URL=postgresql://postgres:ant@localhost:54329/ant 로 서버 실행. 없으면 SQLite + 메모리 검색

# 2) 서버 + 화면
cd api && ../.venv/bin/uvicorn app.main:app --port 8000 --reload   # Swagger: http://localhost:8000/docs
cd apps/web && npm run dev                                          # http://localhost:5175
cd apps/web && npm run dev:lan                                      # 같은 와이파이의 휴대폰에서 http://<이 컴퓨터 IP>:5175

# 테스트 25개(미래 가격·진짜 이름·날짜 노출, 주문 규칙, 사건, 패닉셀, 캐릭터·미션·빨리 감기, ETF·전략 카드·행운·멘탈 구간, 단서 지우기, RAG 미래 문서 차단, AI 검증)
cd api && ../.venv/bin/python -m pytest -q
```
