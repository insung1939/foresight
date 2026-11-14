// 팀 페이지 = 발표 자료(강의계획서: "별도 슬라이드 없이 팀 프로젝트 페이지로 발표").
// 평가 항목 6개 순서로 구성하고, 숫자는 가능한 한 서버에서 지금 값을 받아 보여 준다(하드코딩 최소화).
// 발표: ←/→ 또는 PageUp/PageDown 으로 다음 칸, 왼쪽 목차로 이동.
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Owl } from "../components/Buddy";
import { QR, joinUrl } from "../components/QR";
import { Mark, TopBar } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { pct } from "../lib/format";
import { go } from "../lib/router";
import { SOURCES } from "../lib/sources";
import { MEASURED, TEAM } from "../lib/team";
import type { Meta } from "../lib/types";

const nf = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 칸 이동: 브라우저 기본 스크롤 대신 일정한 감속 곡선(0.7초)으로 → 뚝뚝 끊기지 않게 */
let anim = 0;
function glideTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = window.scrollY;
  const to = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 60);
  if (reduce) return window.scrollTo(0, to);
  const t0 = performance.now(), dur = 700;
  const id0 = ++anim;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (t: number) => {
    if (id0 !== anim) return; // 새 이동이 시작되면 이전 것은 멈춘다
    const p = Math.min(1, (t - t0) / dur);
    window.scrollTo(0, from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const SECTIONS = [
  { id: "intro", label: "한눈에", crit: "" },
  { id: "needs", label: "문제·Needs", crit: "Needs·문제 정의 20%" },
  { id: "market", label: "시장·차별화", crit: "시장·기능·아이디어" },
  { id: "system", label: "시스템 설계", crit: "시스템 기능 설계·구현 30%" },
  { id: "ai", label: "AI·검증", crit: "시스템 기능 설계·구현 30%" },
  { id: "ux", label: "UI/UX", crit: "UI/UX·사용성 20%" },
  { id: "data", label: "데이터·API", crit: "데이터·API 활용 10%" },
  { id: "nfr", label: "성능·보안", crit: "비기능적 요구사항 10%" },
  { id: "lessons", label: "실패와 개선", crit: "AI 결과 검증·수정 근거" },
  { id: "demo", label: "시연·링크·팀", crit: "팀 페이지·배포·시연 10%" },
];

export default function Team() {
  const st = useAsync(() => api.meta(), []);
  const m = st.status === "ready" ? st.data : null;
  const [active, setActive] = useState("intro");

  // 지금 보고 있는 칸을 목차에 표시
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-40% 0px -55% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [m]);

  // 발표용 키보드 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const i = SECTIONS.findIndex((s) => s.id === active);
      const next = ["ArrowRight", "PageDown"].includes(e.key) ? i + 1 : ["ArrowLeft", "PageUp"].includes(e.key) ? i - 1 : null;
      if (next === null || next < 0 || next >= SECTIONS.length) return;
      e.preventDefault();
      glideTo(SECTIONS[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      <TopBar route="/team" />
      <div className="team-wrap">
        <nav className="toc" aria-label="목차">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#/team`} className={active === s.id ? "on" : ""} onClick={(e) => (e.preventDefault(), glideTo(s.id))}>
              <span className="n">{String(i).padStart(2, "0")}</span>
              {s.label}
            </a>
          ))}
          <p className="toc-hint">← → 키로 넘겨요</p>
          <a className="deck-link" href="/deck/index.html" target="_blank" rel="noreferrer">
            ▶ 발표 슬라이드
          </a>
        </nav>
        <main className="team">
          <Intro m={m} />
          <Needs m={m} />
          <Market />
          <System />
          <Ai m={m} />
          <Ux />
          <DataApi m={m} />
          <Nfr m={m} />
          <Lessons />
          <Demo />
          <p className="disclaimer">학습용 시뮬레이션이며 투자 권유가 아닙니다. 데이터: hindsight · DART · 공공데이터포털 · Google 뉴스 · Gemini</p>
        </main>
      </div>
    </>
  );
}

// 칸에 들어올 때마다(다시 와도) 제목 → 본문 순서로 떠오른다
const EASE = [0.2, 0.7, 0.2, 1] as const;
const SEC = { hide: { opacity: 0.25 }, show: { opacity: 1, transition: { duration: 0.5, ease: EASE, staggerChildren: 0.09 } } };
const ITEM = { hide: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } } };

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <motion.section id={id} className="tsec" initial="hide" whileInView="show" viewport={{ amount: 0.18 }} variants={SEC}>
      {s.crit && (
        <motion.p className="crit" variants={ITEM}>
          {s.crit}
        </motion.p>
      )}
      <motion.h2 variants={ITEM}>{title}</motion.h2>
      <motion.div variants={ITEM}>{children}</motion.div>
    </motion.section>
  );
}

function Big({ v, label, tone }: { v: React.ReactNode; label: string; tone?: "up" | "down" }) {
  return (
    <div className="big-num">
      <b className={tone}>{v}</b>
      <small>{label}</small>
    </div>
  );
}

// ------------------------------------------------------------ 00 한눈에
function Intro({ m }: { m: Meta | null }) {
  const hs = m?.summary.hindsight;
  return (
    <section id="intro" className="tsec intro">
      <div className="intro-brand">
        <Mark size={64} />
        <div>
          <h1 className="brand-title">Foresight</h1>
          <p className="tagline">
            지나고 보면 다 쉬워 보여요. <b>그때로 돌아가면, 맞힐 수 있을까요?</b>
          </p>
        </div>
      </div>
      <p className="lead-team">
        유튜버 말 뒤 실제 주가를 모은 <b>hindsight</b>의 기록으로, 회사 이름을 가린 과거 순간에서 <b>나·유튜버·AI</b>의 판단을 겨루는 투자 판단 연습 게임.
      </p>
      <div className="big-row">
        <Big v={m ? nf(m.summary.cases) : "…"} label="실제 과거 문제" />
        <Big v={hs ? nf(hs.eventReturns) : "…"} label="hindsight 언급 뒤 수익률 기록" />
        <Big v="6장" label="정보 카드(3장만 열기)" />
        <Big v={m?.plays.games !== undefined ? nf(m.plays.games) : "…"} label="완주한 게임(실시간)" />
      </div>
      <div className="intro-join">
        <QR url={TEAM.links.service || joinUrl()} size={150} />
        <div>
          <p className="join-big">📱 지금 같이 해 보세요</p>
          <p className="muted">QR → 🗓️ 오늘의 챌린지(모두 같은 10문제) → 발표 끝에 랭킹 공개</p>
          <div className="intro-owl">
            <Owl mood="happy" size={72} />
            <p className="bubble">로그인 없이 바로 돼요! 🦉</p>
          </div>
        </div>
      </div>
      <p className="muted small">{TEAM.course}</p>
    </section>
  );
}

// ------------------------------------------------------------ 01 문제·Needs
function Needs({ m }: { m: Meta | null }) {
  const hs = m?.summary.hindsight;
  const t = m?.text;
  const sv = m?.survey;
  return (
    <Sec id="needs" title="문제: 유튜브 보고 산 종목, 그 말대로 했으면 어땠을까?">
      <div className="two">
        <div>
          <h3>누가, 무엇이 불편한가</h3>
          <ul className="bul">
            <li>
              <b>대상</b> 유튜브·커뮤니티로 종목 정보를 얻는 개인 투자자, 투자 입문자
            </li>
            <li>
              <b>문제 1</b> 유튜버 말이 <b>얼마나 맞았는지</b> 확인할 방법이 없다
            </li>
            <li>
              <b>문제 2</b> 실전에서 판단을 연습하면 진짜 돈을 잃는다. 결과를 알기까지 몇 주가 걸린다
            </li>
            <li>
              <b>문제 3</b> 정보가 넘치는데, <b>무엇을 보고 판단해야 하는지</b> 연습할 곳이 없다
            </li>
          </ul>
        </div>
        <div>
          <h3>근거 ① 시장: 누가, 어디서 정보를 얻나</h3>
          <ul className="evidence ext">
            <li>
              <span className="e-num">1,442만</span>
              <span>
                주식을 가진 개인 투자자(2025년 12월 결산 상장사, 전체 소유자의 99.1%){" "}
                <a href="https://www.metroseoul.co.kr/article/20260318500124" target="_blank" rel="noreferrer">
                  한국예탁결제원 · 메트로신문 2026.3.18
                </a>
              </span>
            </li>
            <li>
              <span className="e-num">37.4%</span>
              <span>
                주식 정보를 얻는 곳 1위 ‘유튜브’(증권사 보고서 14.6%) — 피앰아이, 20~59세 1,000명, 2026.6{" "}
                <a href="https://m.go.seoul.co.kr/news/plan/distrustResearch/2026/09/14/20260914008001" target="_blank" rel="noreferrer">
                  서울신문 2026.9.14
                </a>
              </span>
            </li>
          </ul>
          <h3>근거 ② 데이터: 그 말대로 했으면</h3>
          {hs ? (
            <ul className="evidence">
              <li>
                <span className="e-num down">{pct(hs.bull.avg)}</span>
                유튜버가 ‘오른다’고 한 국내 종목 {nf(hs.bull.n)}번의 20거래일 뒤 평균. 실제로 오른 건 {Math.round(hs.bull.hit * 100)}%
              </li>
              <li>
                <span className="e-num">
                  {hs.channels.filter((c) => c.hit > 0.5).length}/{hs.channels.length}
                </span>
                방향 예측 30번 넘는 유튜버 중 적중률 50%를 넘는 사람
              </li>
              {t && t.hype.byWord[0] && (
                <li>
                  <span className="e-num down">{pct(t.hype.byWord[0].avg)}</span>
                  제목에 ‘{t.hype.byWord[0].word}’가 들어간 ‘오른다’ 영상의 20거래일 뒤 평균(텍스트 분석)
                </li>
              )}
              {sv && sv.n > 0 && (
                <li>
                  <span className="e-num">{Math.round((((sv.youtube.often ?? 0) + (sv.youtube.sometimes ?? 0)) / sv.n) * 100)}%</span>
                  플레이어 설문 {sv.n}명 중 ‘유튜브 보고 종목을 고른 적 있음’ · 도움 정도 {sv.helpful?.toFixed(1)}/5
                </li>
              )}
            </ul>
          ) : (
            <p className="muted">불러오는 중…</p>
          )}
        </div>
      </div>
      <h3>요구사항으로 바꾸기 (Needs → Requirements → 시나리오)</h3>
      <div className="req-grid">
        {[
          ["R1", "실제로 있었던 상황", "가짜 시나리오가 아니라 hindsight·DART·뉴스의 실제 과거"],
          ["R2", "미래 정보 차단", "산 날 이전 정보만. 정답은 서버가 쥐고 판단 뒤에만 공개"],
          ["R3", "정보 선택 훈련", "6장 중 3장만 → 무엇을 볼지 고르는 것도 실력"],
          ["R4", "즉시 피드백·비교", "20거래일 뒤 결과를 유튜버·AI·코스피·다른 사람과 나란히"],
          ["R5", "근거 있는 AI", "그 시점 자료만 근거, 출처 칩, 틀리면 숨김"],
          ["R6", "5분 안에, 폰으로", "로그인은 선택(바로 플레이), 휴대폰 엄지 조작, 챌린지·랭킹으로 재방문"],
        ].map(([k, a, b]) => (
          <div key={k} className="req">
            <span className="rk">{k}</span>
            <b>{a}</b>
            <small>{b}</small>
          </div>
        ))}
      </div>
      <p className="scenario">
        <b>시나리오</b> 출근길 지하철에서 QR로 접속 → 🗓️ 오늘의 챌린지 → ‘A사, 60일 동안 +88%’ → 차트·유튜버·재무 카드 → “유튜버 과거 적중 41%… 🔥‘놓치면’?” → 공매도 50% → 리플레이 D+6 속보에 버티기 → D+14 💰 지금 팔기 → 적중 🎯 → 리포트에서 ‘유튜브파·하락에 거는 편’ → 챌린지 랭킹 3위 → 구글 로그인으로 기록 저장
      </p>
    </Sec>
  );
}

// ------------------------------------------------------------ 02 시장·차별화
function Market() {
  const rows: [string, boolean, boolean, boolean, boolean, boolean][] = [
    // 실제 과거 데이터, 즉시 정답, 정보 선택 훈련, 유튜버 성적 검증, 근거 있는 AI
    ["증권사 모의투자", false, false, false, false, false],
    ["투자 유튜브·커뮤니티", false, false, false, false, false],
    ["투자 교육 퀴즈·강의", false, true, false, false, false],
    ["Foresight", true, true, true, true, true],
  ];
  const cols = ["실제 과거 상황", "바로 정답 확인", "정보 고르기 훈련", "유튜버 성적 검증", "근거 붙은 AI"];
  return (
    <Sec id="market" title="시장·경쟁: 연습장은 있지만 ‘판단’을 채점해 주는 곳은 없다">
      <div className="tbl-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, ...v]) => (
              <tr key={name} className={name === "Foresight" ? "me" : ""}>
                <th>{name}</th>
                {v.map((x, i) => (
                  <td key={i}>{x ? "●" : "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fineprint">모의투자는 지금 시장에서 몇 주를 기다려야 결과가 나오고, 유튜브·커뮤니티는 말한 사람의 과거 성적을 보여 주지 않는다는 점을 비교했어요(팀 조사, 서비스 유형 기준).</p>
      <div className="swot">
        {[
          ["S 강점", "hindsight 수만 건의 실제 기록 · 미래 정보 차단 검증(테스트) · 5분 게임 + 랭킹"],
          ["W 약점", "국내 주식만 · 과거 데이터라 지금 종목 추천은 아님 · 표본 452문제"],
          ["O 기회", "개인 투자자 금융교육 수요 · 유튜브 투자 정보에 대한 신뢰 문제 · 강의·동아리 대회용"],
          ["T 위협", "‘정답 맞히기’가 투자 조언으로 오해될 위험 → 면책 문구·권유 금지 검증으로 대응"],
        ].map(([k, v]) => (
          <div key={k}>
            <b>{k}</b>
            <p>{v}</p>
          </div>
        ))}
      </div>
      <h3>차별화 3가지</h3>
      <ol className="diff">
        <li>
          <b>유튜버를 채점한다</b> — 영상 논조 + 그 유튜버의 <b>그 시점까지</b> 적중률을 같이 보여 줌(미래 기록은 빼고 다시 계산)
        </li>
        <li>
          <b>정보를 고르는 습관을 본다</b> — 카드 6장 중 3장, 리포트에서 ‘차트파·유튜브파…’ 성향과 카드별 적중률
        </li>
        <li>
          <b>AI도 같은 조건에서 겨룬다</b> — 같은 자료만 보고 판단한 AI와 비교, AI 답은 6가지 검증을 통과해야 보임
        </li>
      </ol>
    </Sec>
  );
}

// ------------------------------------------------------------ 03 시스템 설계
function System() {
  return (
    <Sec id="system" title="아키텍처: 정답은 서버만, 화면은 지금 볼 수 있는 것만">
      <div className="arch">
        <div className="arch-col">
          <div className="box fe">
            <b>React (Vercel)</b>
            <small>홈 · 게임 · 리포트 · 랭킹 · 데이터 · 팀 페이지</small>
            <small>Motion 애니메이션 · 휴대폰 엄지 조작 · PWA</small>
          </div>
        </div>
        <div className="arrow">
          ⇄<small>/api · JSON</small>
        </div>
        <div className="arch-col">
          <div className="box be">
            <b>FastAPI (Render)</b>
            <small>게임 상태 · 단계별 공개 · 규칙(rules.py)</small>
            <small>AI 프롬프트·검증(ai.py) · 이름 가리기(masking.py)</small>
            <small>요청 한도 · 응답 시간 측정(ops.py)</small>
          </div>
          <div className="arch-row">
            <div className="box db">
              <b>PostgreSQL (Supabase)</b>
              <small>games · plays · ai_logs · surveys</small>
            </div>
            <div className="box ai">
              <b>Gemini API</b>
              <small>AI 애널리스트 · AI 판단</small>
            </div>
          </div>
        </div>
      </div>
      <div className="pipe">
        <span className="box src">hindsight DB (읽기 전용)</span>→<span className="box">build_bank.py 문제 452개</span>→<span className="box">enrich.py DART 재무·원문 · Google 뉴스</span>→
        <span className="box">quality.py · text_analysis.py</span>→<span className="box">bank · extra · ai.json (서버 전용)</span>
      </div>
      <h3>핵심 흐름 (서버가 단계를 쥔다)</h3>
      <ol className="flow">
        <li>
          <b>pick</b> 상황(반기·60일 수익률)만 → 카드는 <code>POST /cards</code> 로 한 장씩(3장 제한, 서버가 셈)
        </li>
        <li>
          <b>decide</b> 비중(−50·0·30·70·100) → <b>replay</b> <code>POST /tick</code> 하루씩, 그날까지 차트만(내일은 서버에)
        </li>
        <li>
          <b>event</b> 속보 날에 멈춤 → 비중 조정 → 리플레이 계속 · 언제든 <code>POST /exit</code> 지금 팔기
        </li>
        <li>
          <b>reveal</b> 이때만 회사명·20일 수익률·AI 판단·다른 사람 분포 → 기록(plays)
        </li>
        <li>
          <b>done</b> 리포트·순위 → 실시간 랭킹(<code>/v1/live</code>, 오늘의 챌린지는 날짜별 같은 문제) · 로그인(선택) 시 계정에 저장(<code>/v1/me</code>)
        </li>
      </ol>
      <p className="fineprint">테스트 19개(pytest): 10라운드 내내 응답에 정답 문자열이 없는지, 단계 순서, 공매도 수수료, 미래 정보 0건, 이름 노출 0건, 요청 한도, 랭킹에 회사명 없음 등.</p>
    </Sec>
  );
}

// ------------------------------------------------------------ 04 AI
function Ai({ m }: { m: Meta | null }) {
  const o = m?.aiOps;
  const called = o ? o.asks - o.unavailable : 0;
  return (
    <Sec id="ai" title="AI: 화려함보다 ‘틀렸을 때 어떻게 하나’">
      <div className="two">
        <div>
          <h3>쓰는 곳 2가지</h3>
          <ul className="bul">
            <li>
              <b>AI 애널리스트</b> 카드를 열고 질문(라운드당 3번). 그 문제의 <b>산 날 이전 자료만</b> id(F1·D2·N3·Y1…)를 붙여 넣고 답에 근거 id 를 달게 함
            </li>
            <li>
              <b>AI 플레이어</b> 문제마다 같은 자료로 미리 비중을 정함(배치) → 결과 화면에서 나와 비교
            </li>
          </ul>
          <h3>왜 이 방식(시점 제한 RAG)인가</h3>
          <ul className="bul small">
            <li>
              <b>검색</b> 문서 전체가 아니라 <b>그 문제의 산 날 이전 문서만</b> 꺼낸다(시점·종목 메타데이터 필터). 미래 정보가 섞이면 게임이 깨지기 때문
            </li>
            <li>
              <b>생성</b> 꺼낸 문서에 id(F1·D2·N3·Y1…)를 붙여 넣고, 답에 근거 id 를 달게 함 → 화면에 출처 칩
            </li>
            <li>
              <b>벡터 검색을 안 쓴 이유</b> 한 문제의 문서가 20개 안팎이라 전부 넣어도 짧다. 유사도 검색보다 ‘시점 필터’가 정확도·공정성에 더 중요. 다음 단계: pgvector 로 ‘비슷했던 과거 사례’ 검색
            </li>
          </ul>
          <h3>모델·프롬프트</h3>
          <ul className="bul small">
            <li>Gemini(서버에서만 호출, 키는 .env) · temperature 0.2/0.1 · JSON 스키마 강제</li>
            <li>규칙: 자료에 있는 것만 · 회사는 ‘A사’ · 숫자는 자료 그대로 · 근거 없으면 grounded=false · 사라/팔아라 금지</li>
          </ul>
        </div>
        <div>
          <h3>답을 보여 주기 전 6가지 검사</h3>
          <ol className="checks6">
            <li>JSON 형식</li>
            <li>인용 id 가 실제로 있나</li>
            <li>회사 이름·코드 노출</li>
            <li>자료에 없는 숫자(지어낸 숫자)</li>
            <li>직접 매수·매도 권유</li>
            <li>근거 없는 단정</li>
          </ol>
          <div className="aiflow">
            <span className="box">1차 답</span>→<span className="box ok">통과 → 보여 줌 ✓</span>
            <br />
            <span className="box">실패</span>→<span className="box">실패 항목을 알려 주고 1번 더</span>→<span className="box bad">또 실패 → 숨김 ⚠️</span>
          </div>
        </div>
      </div>
      <h3>실패 종류별 대응</h3>
      <div className="tbl-wrap">
        <table className="cmp left">
          <tbody>
            <tr>
              <th>키 없음·연결 실패</th>
              <td>‘AI 연결이 아직…’ 안내, 다른 카드로 진행. 질문 횟수 차감 안 함</td>
            </tr>
            <tr>
              <th>한도 초과(429)·서버 바쁨(5xx)</th>
              <td>Retry-After 만큼 ‘n초 뒤 다시 묻기’ 카운트다운</td>
            </tr>
            <tr>
              <th>시간 초과</th>
              <td>‘질문을 짧게 바꾸면 빨라져요’ + 다시 묻기</td>
            </tr>
            <tr>
              <th>검증 실패</th>
              <td>재질문 1회 → 그래도 실패면 답을 숨기고 이유를 보여 줌</td>
            </tr>
            <tr>
              <th>자료로 답할 수 없음</th>
              <td>‘확인된 근거가 없어요’로 시작(답을 지어내지 않음)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="big-row">
        <Big v={o ? nf(o.asks) : "…"} label="AI 질문(실시간)" />
        <Big v={o && called ? `${Math.round((o.passed / called) * 100)}%` : "—"} label="검증 통과율" />
        <Big v={o ? nf(o.fallback) : "…"} label="숨긴 답(검증 실패)" />
        <Big v={o ? `👍${o.thumbsUp ?? 0} 👎${o.thumbsDown ?? 0}` : "…"} label="사용자 평가" />
      </div>
      <EvalTable m={m} />
      <p className="fineprint">
        모든 호출은 ai_logs 에 저장(질문·답·검사 결과·시도·지연·토큰). 짓궂은 질문 15개 묶음(이름 캐기·미래 주가·매수 권유·지시 무시·자료 밖) 평가: scripts/ai_eval.py → docs/ai-eval.md
      </p>
    </Sec>
  );
}

/** 짓궂은 질문 평가 결과(scripts/ai_eval.py): 모델·버전별 비교 */
function EvalTable({ m }: { m: Meta | null }) {
  const ev = m?.aiEval ?? [];
  const cats: [string, string][] = [
    ["normal", "정상 질문"],
    ["leak", "이름 캐기"],
    ["future", "미래 주가"],
    ["advice", "매수 권유"],
    ["offtopic", "자료 밖"],
    ["inject", "지시 무시"],
  ];
  return (
    <>
      <h3>짓궂은 질문 평가 — 틀린 답이 화면에 보였나?</h3>
      {ev.length === 0 ? (
        <p className="muted small">평가 기록이 아직 없어요(scripts/ai_eval.py).</p>
      ) : (
        <div className="tbl-wrap">
          <table className="cmp">
            <thead>
              <tr>
                <th>모델 · 버전</th>
                {cats.map(([, l]) => (
                  <th key={l}>{l}</th>
                ))}
                <th>전체</th>
                <th>응답</th>
              </tr>
            </thead>
            <tbody>
              {ev.map((e) => (
                <tr key={e.tag + e.at}>
                  <th>
                    {e.model.replace("ollama/", "로컬 ")}
                    <small>{e.tag}</small>
                  </th>
                  {cats.map(([k]) => {
                    const c = e.byCat[k];
                    return <td key={k}>{c ? `${c.pass}/${c.n}` : "–"}</td>;
                  })}
                  <td className="good">{Math.round((e.pass / Math.max(e.called, 1)) * 100)}%</td>
                  <td>{e.avgMs ? `${(e.avgMs / 1000).toFixed(1)}초` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ 05 UI/UX
function Ux() {
  const flow = [
    ["🏠", "홈", "챌린지·자유 연습"],
    ["🎲", "닉네임", "로그인은 선택"],
    ["⏪", "시간 되감기", "CASE 01"],
    ["🃏", "카드 3장", "6장 중 선택"],
    ["⚖️", "비중", "공매도~풀매수"],
    ["🎬", "20일 리플레이", "하루씩·지금 팔기"],
    ["⚡", "속보", "멈추고 비중 조정"],
    ["🎯", "정답 공개", "도장·비교"],
    ["📊", "리포트", "성향·등급·보상"],
    ["🏆", "랭킹", "실시간"],
  ];
  const states = [
    ["로딩", "스켈레톤 · 서버 깨우는 중(새벽이 졸음) 안내"],
    ["오류", "다시 시도 · 홈으로 · 진행은 서버에 저장되어 이어하기"],
    ["빈 결과", "공시 없음 ‘조용한 것도 정보’, 뉴스 없음, 랭킹 비면 ‘첫 1등 되기’"],
    ["AI 실패", "종류별 안내·카운트다운, 횟수 차감 없음"],
    ["카드 초과", "4번째 카드 누르면 이유 안내"],
    ["접근성", "색 + ▲▼ 기호, 키보드 조작, 움직임 줄이기 설정 존중, 스크린리더 라벨"],
  ];
  const fixes = [
    ["카드 두 장을 연달아 누르면 두 번째가 안 열림", "안내 상자가 닫히며 화면이 튐", "안내는 직접 닫을 때만"],
    ["휴대폰에서 비중을 고르려면 맨 아래까지 스크롤", "넓은 화면용 오른쪽 칸이 아래로 감", "비중·확정 버튼을 아래 고정 패널로"],
    ["0%가 빨간색(상승)으로 보임", "0 이상을 상승으로 처리", "0은 회색, 색+기호 같이"],
    ["‘2명 중 상위 100%’", "적은 인원도 백분율", "5명 이상일 때만"],
    ["새벽이 말풍선이 버튼을 가림(폰)", "구석 자리가 결정 버튼 위", "폰에선 위쪽으로"],
    ["‘게임이라기엔 정적이다’(팀 의견)", "판단 → 정답이 한 번에", "20일 리플레이 + 지금 팔기"],
    ["랭킹이 운에 좌우", "사람마다 다른 문제", "오늘의 챌린지(같은 문제)"],
  ];
  return (
    <Sec id="ux" title="UI/UX: 5분 안에, 엄지 하나로, 다시 하고 싶게">
      <div className="uxflow">
        {flow.map(([i, a, b], k) => (
          <motion.div key={a} className="uxstep" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.05 }}>
            <span>{i}</span>
            <b>{a}</b>
            <small>{b}</small>
          </motion.div>
        ))}
      </div>
      <div className="two">
        <div>
          <h3>상태 처리</h3>
          <dl className="states">
            {states.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>게임처럼 (레퍼런스: 듀오링고·토스증권·카훗)</h3>
          <ul className="bul small">
            <li>마스코트 새벽이(8표정) — 상황마다 반응, 정답 힌트는 주지 않음</li>
            <li>XP·레벨 9단계·배지 18개, 연속 적중 🔥, 등급 도장 S~D</li>
            <li>시간 되감기·속보 번쩍·적중 도장·색종이/비, 효과음(기본 꺼짐)</li>
            <li>20일 리플레이: 하루씩 움직이는 주가·내 돈, 언제든 지금 팔기(익절·손절)</li>
            <li>오늘의 챌린지(모두 같은 문제) + 실시간 랭킹·QR — 발표장에서 바로 참여</li>
            <li>로그인은 선택: 바로 플레이, 로그인하면 기록이 계정에 · 내 전적 페이지</li>
          </ul>
        </div>
      </div>
      <h3>사용성 개선 사례 (발견 → 원인 → 수정, 전체 24건은 docs/ux-log.md)</h3>
      <div className="fixes">
        {fixes.map(([a, b, c]) => (
          <div key={a} className="fix">
            <p>
              <span className="tag">발견</span>
              {a}
            </p>
            <p>
              <span className="tag">원인</span>
              {b}
            </p>
            <p>
              <span className="tag ok">수정</span>
              {c}
            </p>
          </div>
        ))}
      </div>
    </Sec>
  );
}

// ------------------------------------------------------------ 06 데이터·API
function DataApi({ m }: { m: Meta | null }) {
  const q = m?.quality;
  return (
    <Sec id="data" title="데이터·API: 지난 학기 hindsight 를 이어받아 화면·분석·AI 를 더했다">
      <div className="tbl-wrap">
        <table className="cmp left src-table">
          <thead>
            <tr>
              <th>출처</th>
              <th>가져온 것</th>
              <th>게임에서 쓰는 곳</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name}>
                <th>
                  {s.name}
                  <small>{s.org}</small>
                </th>
                <td>{s.what}</td>
                <td>{s.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m && (
        <div className="big-row">
          <Big v={nf(m.summary.source.videos)} label="유튜브 영상" />
          <Big v={nf(m.summary.source.prices)} label="일별 시세" />
          <Big v={nf(m.summary.source.disclosures + m.enrich.docs)} label="공시·원문" />
          <Big v={nf(m.enrich.news)} label="뉴스(산 날 전)" />
        </div>
      )}
      {q && (
        <p className="quality-line">
          ✅ 품질 점검: 화면에 나가는 글 {nf(q.textsChecked)}개 중 회사 이름 노출 <b>{q.leaks}</b> · 미래 정보 <b>{q.futureViolations}</b> · 정답 불일치 <b>{q.answerMismatch}</b> · 재무 채움{" "}
          {Math.round(q.coverage.finance.share * 100)}%
        </p>
      )}
      <p className="muted small">
        분석 결과의 활용: ‘이미 오른 종목 그 뒤 20일’, ‘속보 뒤’, 유튜버 vs AI, 카드별 적중률, 유튜브 제목 텍스트 분석(c-TF-IDF·자극어) →{" "}
        <button className="link" onClick={() => go("/data")}>
          데이터 페이지에서 보기 →
        </button>
      </p>
    </Sec>
  );
}

// ------------------------------------------------------------ 07 성능·보안
function Nfr({ m }: { m: Meta | null }) {
  const routes = useMemo(() => (m?.perf?.routes ?? []).filter((r) => /games|live|meta/.test(r.path)).slice(0, 6), [m]);
  const o = m?.aiOps;
  return (
    <Sec id="nfr" title="성능·보안: 빠르게, 싸게, 새지 않게">
      <h3>최적화 전후 (직접 잰 값, {MEASURED.date})</h3>
      <div className="tbl-wrap">
        <table className="cmp left">
          <thead>
            <tr>
              <th>무엇</th>
              <th>전</th>
              <th>후</th>
              <th>어떻게</th>
            </tr>
          </thead>
          <tbody>
            {MEASURED.payload.map((r) => (
              <tr key={r.what}>
                <th>{r.what}</th>
                <td>{r.before}</td>
                <td className="good">{r.after}</td>
                <td>{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {routes.length > 0 && (
        <p className="muted small">
          지금 서버 응답(p50/p95): {routes.map((r) => `${r.path.replace(/^(GET|POST) \/v1/, "")} ${Math.round(r.p50)}/${Math.round(r.p95)}ms`).join(" · ")}
        </p>
      )}
      <div className="two">
        <div>
          <h3>비용</h3>
          <ul className="bul small">
            <li>AI 판단은 문제마다 <b>미리 한 번</b>(배치) → 게임 중 호출은 질문할 때만</li>
            <li>질문 라운드당 3번·200자, 한 사람 1분 12번 · 서버 전체 1분 60번 상한(429 + Retry-After)</li>
            <li>무료 범위: Gemini 무료 등급 · Render·Vercel·Supabase 무료{o?.avgTokensIn ? ` · 질문 1번 평균 토큰 ${nf(o.avgTokensIn)}/${nf(o.avgTokensOut ?? 0)}` : ""}</li>
          </ul>
        </div>
        <div>
          <h3>보안·개인정보</h3>
          <ul className="bul small">
            <li>API 키는 서버 .env 에만(화면 코드·GitHub 에 없음)</li>
            <li>로그인 없음 · 닉네임만(금칙어 거름) · 설문은 객관식만(자유 서술 X)</li>
            <li>정답·안 연 카드는 서버에만, 랭킹·소식에 회사명 없음(테스트)</li>
            <li>CORS 허용 주소 제한 · 보안 헤더(nosniff·frame 금지) · 게임 응답 캐시 금지</li>
            <li>동시 요청(연타·스크립트)으로 순위 조작 불가: 게임별 잠금 + 라운드 중복 기록 금지(테스트)</li>
          </ul>
        </div>
      </div>
      <h3>남은 한계</h3>
      <ul className="bul small muted">
        <li>Render 무료 서버는 15분 쉬면 잠듦 → 첫 접속 30초 안팎(화면에 ‘서버 깨우는 중’ 안내, 발표 전 미리 깨우기)</li>
        <li>요청 한도·응답 시간 기록은 서버 메모리 기준(서버 한 대 가정)</li>
        <li>공시 계약명처럼 가리기 어려운 단서가 남을 수 있음 → 그래도 미래 주가는 알 수 없음</li>
      </ul>
    </Sec>
  );
}

// ------------------------------------------------------------ 08 실패와 개선
function Lessons() {
  const items = [
    ["🔓", "정답이 화면 파일에 들어 있었다", "첫 프로토타입은 문제 파일(정답 포함)을 통째로 내려받아 개발자도구로 정답이 보였다", "FastAPI 로 옮겨 단계별 공개, ‘응답에 정답 문자열 없음’ 테스트"],
    ["🕵️", "뉴스·공시로 회사가 드러났다", "‘○○ 회장’, ‘○○ 뉴스룸’, 공시 속 ‘매출 42조’", "직함 앞 이름 가리기, 보도자료 제외, 금액은 구간·비율로. 화면 글 전체 노출 0건 점검(테스트)"],
    ["⏳", "유튜버 성적표에 미래가 섞였다", "hindsight 성적표는 기간 전체 기준", "산 날 전에 20거래일 결과가 확정된 언급만으로 다시 계산"],
    ["🔎", "이름을 가려도 검색하면 회사가 나왔다", "공시 속 ‘계약금액 1조 656억’, ‘평택캠퍼스 공사’, 유튜브 제목 ‘559억 수주’", "공시 항목은 허용 목록(비율·금액 구간·일반 항목)만, 금액은 ‘조 원대’ 같은 구간으로 → 화면 글 7,324개 중 절대 금액 0건(테스트)"],
    ["🧪", "동시에 누르면 순위가 부풀었다(코드 리뷰로 발견)", "별도 AI 리뷰어에게 코드만 주고 검토 → ‘지금 팔기’ 8번 동시 요청에 한 라운드가 최대 8번 기록, 카드도 6장 열림(직접 재현)", "게임별 요청 잠금 + DB 유니크 인덱스 → 동시 요청 테스트 5회 반복 통과. AI가 만든 코드도 검증 없이 믿지 않는다"],
    ["📉", "코스피가 하루 −10%? 데이터 오류 의심", "2026년 지수가 5,000↔8,900 급변", "다른 출처(공공데이터포털 개별 종목)로 교차 확인 → 실제 데이터로 판정, 리포트에 안내"],
    ["🔁", "몇 판 하면 같은 문제", "150문제·한 종목 한 번", "452문제로(오른 종목이 특정 시기에 몰려 600개는 편향) + 한 게임 안 같은 종목 금지"],
    ["🧾", "재무 수집이 중간에 멈췄다", "결산월이 12월이 아닌 회사의 보고서", "분기 구분이 다른 보고서는 건너뛰고 캐시로 이어서 수집"],
    ["💬", "랭킹 소식 ‘−8.5% 적중!’", "방향은 맞혔지만 돈은 잃은 경우", "소식엔 맞히고 8% 넘게 번 라운드만"],
  ];
  return (
    <Sec id="lessons" title="실패와 개선: 무엇이 틀렸고, 어떻게 알았고, 어떻게 고쳤나">
      <div className="aicode">
        <h3>AI 코딩 도구(Claude Code)를 쓴 방식 — 믿지 말고 검증</h3>
        <ol className="flow">
          <li>
            <b>계획</b> 평가 기준·요구사항(R1~R6)을 먼저 적고, 기능마다 ‘무엇이 틀리면 안 되나’(정답 노출·미래 정보)를 정함
          </li>
          <li>
            <b>구현</b> AI가 만든 코드는 작은 단위로 받고, 규칙(rules.py)·가리기(masking.py)는 사람이 이해할 수 있게 한 곳에
          </li>
          <li>
            <b>검증</b> 자동 테스트 19개 · 품질 점검 스크립트 · 브라우저로 직접 플레이 · <b>코드만 주고 다른 AI에게 따로 리뷰</b>(동시 요청 버그 발견)
          </li>
          <li>
            <b>기록</b> 발견→원인→수정→확인을 docs/ux-log.md 에 24건
          </li>
        </ol>
      </div>
      <div className="lessons">
        {items.map(([i, a, b, c], k) => (
          <motion.div key={a} className="lesson" initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.05 }}>
            <span className="ic">{i}</span>
            <div>
              <b>{a}</b>
              <p className="muted small">원인: {b}</p>
              <p className="small">→ {c}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </Sec>
  );
}

// ------------------------------------------------------------ 09 시연·링크·팀
function Demo() {
  const service = TEAM.links.service || window.location.origin;
  const links = [
    ["🌐 서비스", service],
    ["💻 GitHub", TEAM.links.github],
    ["🧪 Swagger", TEAM.links.swagger],
  ];
  const steps = [
    ["/", "홈 → 게임 시작 → 닉네임 🎲"],
    ["/play", "카드 3장: 유튜버(과거 적중·🔥 자극어) · 재무 · AI 질문(근거 칩·검증 표시)"],
    ["/play", "공매도 선택 → 속보 → 정답 공개(도장·유튜버·AI·다른 사람 비교)"],
    ["/report", "리포트: 성향·등급·hindsight 비교·보상·설문"],
    ["/live", "실시간 랭킹 + QR → 청중 참여"],
    ["/data", "데이터·분석 페이지(출처·품질·텍스트 분석·AI 검증·응답 속도)"],
  ] as const;
  return (
    <Sec id="demo" title="시연 순서 · 주소 · 팀">
      <ol className="demo">
        {steps.map(([r, t], i) => (
          <li key={i}>
            <button className="link" onClick={() => go(r)}>
              {t} →
            </button>
          </li>
        ))}
      </ol>
      <div className="links">
        {links.map(([k, v]) => (
          <div key={k} className="lnk">
            <b>{k}</b>
            {v ? (
              <a href={v} target="_blank" rel="noreferrer">
                {v.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span className="muted">배포 후 추가</span>
            )}
          </div>
        ))}
      </div>
      <h3>{TEAM.name} · 역할</h3>
      {TEAM.members.length ? (
        <div className="members">
          {TEAM.members.map((p) => (
            <div key={p.name} className="member">
              <b>{p.name}</b>
              {p.role && <span className="chip">{p.role}</span>}
              {p.did && <small>{p.did}</small>}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">팀원·역할은 apps/web/src/lib/team.ts 에 넣으면 여기에 보여요.</p>
      )}
    </Sec>
  );
}
