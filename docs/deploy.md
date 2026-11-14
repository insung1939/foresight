# 배포 순서 (Supabase → Render → Vercel)

주소 3개(서비스·GitHub·Swagger)를 발표 자료(팀 페이지)에 넣는 것이 목표. 비밀 값은 저장소에 없고 각 서비스 대시보드에만 넣는다.

## 0. 문제 파일 묶기(로컬)
```bash
.venv/bin/python scripts/pack_data.py   # data/pack.enc 생성(암호문), .env 에 DATA_KEY
```
공개 저장소에는 `data/pack.enc` 만 올라가고 정답 원본(bank·extra·ai.json)은 `.gitignore`.

## 1. Supabase (새 프로젝트)
1. 새 프로젝트 → Project Settings → Database → Connection string(**Session pooler**) 복사 → Render `DATABASE_URL`
2. 로그인(선택): Authentication → Providers → Google 켜기(Google Cloud 에서 OAuth 클라이언트 ID·비밀) → Redirect URL 에 Vercel 주소
3. Project URL → Render `SUPABASE_URL`, 화면 `VITE_SUPABASE_URL` / anon key → 화면 `VITE_SUPABASE_ANON_KEY`
테이블은 서버가 처음 켜질 때 만든다(`init_db`).

## 2. Render (서버)
- GitHub 저장소 연결 → `render.yaml` 블루프린트
- 환경 변수: `GEMINI_API_KEY`, `DATABASE_URL`, `DATA_KEY`, `ALLOWED_ORIGINS`(Vercel 주소), `SUPABASE_URL`(선택)
- 확인: `https://<앱>.onrender.com/v1/health` → `cases: 452`, `ai: true` / Swagger: `/docs`

## 3. Vercel (화면)
- 저장소 연결, Root Directory `apps/web`
- `apps/web/vercel.json` 의 rewrite 주소를 Render 주소로(지금: `foresight-api-yda3.onrender.com`)
- 환경 변수(선택): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## 4. 마무리
- `apps/web/src/lib/team.ts` 의 `links` 에 세 주소, `members` 에 팀원
- `docs/demo.md` 체크리스트(다른 PC·휴대폰 접속, 서버 깨우기)
- 강의실 와이파이에서 3~4명 동시 플레이 시험(요청 한도는 IP+기기 기준이라 서로 막지 않음)
