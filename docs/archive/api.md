# API

Swagger: `http://localhost:8000/docs` (배포 후 Render 주소/docs)

게임 진행은 서버가 쥔다. 화면은 지금 단계에서 볼 수 있는 것만 받는다.

| 메서드 | 경로 | 하는 일 | 단계 |
|---|---|---|---|
| GET | `/v1/health` | 문제 수·AI 연결 여부 | — |
| POST | `/v1/games` | 새 게임(문제 10개를 서버가 고름) | → pick |
| GET | `/v1/games/{id}` | 진행 상태(새로고침·다른 기기 이어하기) | 모두 |
| POST | `/v1/games/{id}/cards` `{card}` | 카드 한 장 열기, 라운드당 3장 | pick |
| POST | `/v1/games/{id}/ask` `{question}` | AI 애널리스트 질문(AI 카드 연 뒤, 3번) | pick |
| POST | `/v1/games/{id}/decide` `{weight}` | 첫 판단 → 20일 리플레이 시작 | pick → replay |
| POST | `/v1/games/{id}/tick` `{days}` | 리플레이 하루(며칠) 진행. 속보 날엔 event 로 멈춤, 20일째면 reveal | replay |
| POST | `/v1/games/{id}/adjust` `{weight}` | 속보 뒤 비중 → 리플레이 계속 | event → replay |
| POST | `/v1/games/{id}/exit` | 지금 팔기(중도 매도): 그날 종가로 정리 → reveal | replay·event |
| POST | `/v1/games/{id}/next` | 다음 라운드 / 마지막이면 done | reveal |
| GET | `/v1/games/{id}/report` | 10라운드 리포트, 다른 플레이어 대비 위치 | done |
| GET | `/v1/meta` | 데이터 규모·분석·AI 성적·플레이 통계·AI 검증 통계 | — |
| POST | `/v1/games/{id}/nickname` `{nickname}` | 랭킹 이름 바꾸기(한글·영문·숫자 2~12자, 금칙어 거름) | 모두 |
| GET | `/v1/me` | (로그인) 프로필·XP·배지·모든 게임 전적·카드별 적중 | — |
| PUT | `/v1/me` `{nickname}` | (로그인) 닉네임 | — |
| POST | `/v1/me/progress` `{progress}` | (로그인) 이 기기 XP·배지를 계정과 합치기(같은 게임은 한 번만) | — |
| POST | `/v1/me/claim` `{gameIds}` | (로그인) 로그인 전 이 기기에서 한 게임을 계정으로 | — |
| GET | `/v1/live?scope=daily\|today\|all` | 실시간 랭킹·대시보드(완주 순위·적중왕·소식·카드 통계·분포). 2초 캐시, 화면은 4초마다 받음 | — |

| POST | `/v1/ai/{logId}/feedback` `{vote: 1\|-1}` | AI 답 평가 👍/👎 (ai_logs.feedback) | — |
| POST | `/v1/games/{id}/survey` `{youtube, helpful, lesson}` | 완주 뒤 30초 설문(객관식, 게임당 1번) | done |

새 게임 `POST /v1/games` 은 `{nickname, mode}` 를 선택으로 받는다(없으면 '익명 부엉이', mode = free · daily). daily 는 날짜(KST)로 문제 10개를 고정하고, 같은 기기(`X-Device`)·계정의 오늘 두 번째 판부터는 mode=replay(순위 제외).
로그인은 선택: `Authorization: Bearer <Supabase access token>` 이 있으면 게임이 계정에 붙는다. 서버는 토큰만 검증(SUPABASE_URL JWKS 또는 SUPABASE_JWT_SECRET)하고 이메일은 저장하지 않는다. 리포트에 `rank`(전체 순위)가 붙는다.
랭킹·소식에는 회사 이름(정답)을 넣지 않는다 — 아직 그 문제를 안 푼 사람에게 답이 새지 않게(테스트로 검사).

`weight`: −50(공매도) · 0 · 30 · 70 · 100

## 단계별로 응답에 들어가는 것

| 단계 | 들어감 | 안 들어감 |
|---|---|---|
| pick | 반기·시장·60일 수익률, **연 카드 내용만** | 정답, 미래 차트, 사건, 안 연 카드 |
| replay | + 오늘(D+n)까지 차트·내 돈 | 정답, 내일 이후 차트 |
| event | + 사건 내용, 사건일까지 차트 | 정답, 사건 뒤 차트 |
| reveal | + 회사명·20일 수익률·전체 차트·AI 판단·다른 사람 분포·그 뒤 뉴스 | — |

공시 접수번호·DART 고유번호·원문 발췌·재무 원금액(`_` 로 시작하는 필드, `private`)은 어느 단계에서도 보내지 않는다.

## 오류

| 코드 | 언제 |
|---|---|
| 400 | 없는 카드, 허용되지 않는 비중 |
| 404 | 없는 게임 |
| 409 | 단계가 맞지 않음(예: pick 에서 next), 카드 3장 초과, AI 질문 3번 초과 |
| 200 + `error`·`errorKind`·`retryAfter` | AI 호출 실패. kind = unconfigured · quota · timeout · busy · network · model. 질문 횟수는 차감하지 않음 |
| 429 + `Retry-After` | IP 별 요청 한도 초과(AI 질문 1분 12번, 새 게임 20번, 그 밖의 POST 240번) |

## 테이블

| 테이블 | 컬럼 |
|---|---|
| `games` | id, case_ids(JSON), round, stage, opened, w1, w2, asked, day, exit_day, decide_ms, mode, daily, device, user_id, round_started, created_at, finished_at, nickname, final_ret, hits, yt_ret |
| `users` | id(Supabase 사용자 id), nickname, progress(JSON), created_at, updated_at — 이메일 없음 |
| `plays` | id, game_id(FK), round, case_key, opened, w1, w2, ret, hit, ms, exit_day, created_at |
| `ai_logs` | id, kind(ask·judge), game_id, case_key, question, answer, ok, checks(JSON), attempts, latency_ms, tokens_in, tokens_out, model, feedback, created_at |
| `surveys` | game_id(PK), youtube, helpful(1~5), lesson, created_at |
