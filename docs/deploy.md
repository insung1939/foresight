# 배포 순서 (Supabase → Render → Vercel)

주소 3개(서비스·GitHub·Swagger)를 발표 자료(팀 페이지)에 넣는 것이 목표. 비밀 값은 저장소에 없고 각 서비스 대시보드에만 넣는다.

## 0. 문제 파일 묶기(로컬)
```bash
.venv/bin/python scripts/pack_data.py   # data/pack.enc 생성(암호문), .env 에 DATA_KEY
```
공개 저장소에는 `data/pack.enc` 만 올라가고 시즌 팩 원본(season.json)은 `.gitignore`.

## 1. Supabase (새 프로젝트)
1. 새 프로젝트 → Project Settings → Database → Connection string(**Session pooler**) 복사 → Render `DATABASE_URL`
2. 로그인(선택): Authentication → Providers → Google 켜기(Google Cloud 에서 OAuth 클라이언트 ID·비밀) → Redirect URL 에 Vercel 주소
3. Project URL → Render `SUPABASE_URL`, 화면 `VITE_SUPABASE_URL` / anon key → 화면 `VITE_SUPABASE_ANON_KEY`
테이블은 서버가 처음 켜질 때 만든다(`init_db`).

## 2. Render (서버)
- GitHub 저장소 연결 → `render.yaml` 블루프린트
- 환경 변수: `GEMINI_API_KEY`, `DATABASE_URL`, `DATA_KEY`, `ALLOWED_ORIGINS`(Vercel 주소), `SUPABASE_URL`(선택)
- 확인: `https://<앱>.onrender.com/v1/health` → `{"ok": true, "pack": true, "ai": "gemini"}` · `/v1/meta` 의 `rag.backend` 가 `pgvector` / Swagger: `/docs`

## 3. Vercel (화면)
- 저장소 연결, Root Directory `apps/web`
- `apps/web/vercel.json` 의 rewrite 주소를 Render 주소로(지금: `foresight-api-yda3.onrender.com`)
- 환경 변수(선택): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## 4. 마무리
- `apps/web/src/lib/team.ts` 의 `links` 에 세 주소, `members` 에 팀원
- 발표 전: 서비스·`/deck/index.html` 을 한 번 열어 서버 깨우기(첫 응답 약 30초), 다른 PC·휴대폰에서 접속 확인
- 강의실 와이파이에서 3~4명 동시 플레이 시험(요청 한도는 IP+기기 기준이라 서로 막지 않음)


## 2026-11-21 리디자인(타임슬립 개미) 뒤 바뀐 점
- 로그인(Supabase Auth)을 뺐다. Render 의 `SUPABASE_URL`, Vercel 의 `VITE_SUPABASE_*` 는 더 이상 필요 없다(남아 있어도 무시).
- 서버가 읽는 데이터는 `data/season.json` 하나. `scripts/build_season.py` → `scripts/pack_data.py` 로 `data/pack.enc` 를 다시 만들어 올리고, Render 의 `DATA_KEY` 는 그대로 쓴다.
- DB 는 새 테이블 `runs`·`coach_logs` 를 서버 시작 때 만든다. 예전 `games`·`plays` 테이블은 남아 있어도 쓰지 않는다.

## 2026-11-21 2차(개미 비서 RAG) 뒤 바뀐 점
- `data/pack.enc` 에 `season.json` 과 `rag.json`(개미 비서 색인)이 함께 들어 있다. 서버는 시작할 때 `DATA_KEY` 로 풀고, DB 가 PostgreSQL 이면 `create extension vector` 후 `rag_docs` 표(vector(256))를 채운다. 색인이 바뀌었을 때만 다시 채운다(`rag_meta.sig`).
- Supabase 는 pgvector 확장을 지원한다. 확장을 만들 권한이 없거나 실패하면 서버는 메모리 검색으로 자동 전환한다(`/v1/meta` 의 `rag.backend` 로 확인: `pgvector` · `memory`).
- 색인 늘리기(하루 무료 한도 ~1,000건): `build_season.py` → `build_rag.py` → `pack_data.py` → 커밋·푸시.
- 새 의존성: `numpy`. 환경 변수 추가 없음(질문 임베딩은 기존 `GEMINI_API_KEY`).
