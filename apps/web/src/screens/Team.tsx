// 팀 페이지(#/team): 평가 항목별 근거를 한 곳에. 발표 때 위에서 아래로 넘기며 설명한다.
import { QR } from "../components/QR";
import { Delta, TopBar } from "../components/ui";
import { loadMeta, useAsync } from "../lib/api";
import { pct } from "../lib/format";
import { TEAM } from "../lib/team";

const TOC: [string, string][] = [
  ["why", "왜 갈아엎었나"],
  ["needs", "Needs"],
  ["market", "SWOT"],
  ["ref", "레퍼런스 분석"],
  ["design", "게임 설계"],
  ["ux", "UI/UX"],
  ["system", "시스템"],
  ["data", "데이터"],
  ["ai", "AI"],
  ["nfr", "성능·보안"],
  ["biz", "수익화"],
  ["team", "팀·링크"],
];

export default function Team() {
  const meta = useAsync(loadMeta, []);
  const m = meta.status === "ready" ? meta.data : null;
  return (
    <>
      <TopBar route="/team" />
      <main className="page team">
        <header className="page-head">
          <p className="eyebrow">{TEAM.course}</p>
          <h1>타임슬립 개미 · {TEAM.name}</h1>
          <p className="lead">1,000만 원과 폰 하나로, 실제로 있었던 시장의 반년(26주)을 다시 산다. 유튜버 라이벌과 코스피를 이겨라.</p>
        </header>
        <nav className="toc" aria-label="목차">
          {TOC.map(([id, t]) => (
            <a key={id} href={`#/team`} onClick={(e) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }))}>
              {t}
            </a>
          ))}
        </nav>

        <section id="why" className="card">
          <h2 className="sec-title">01 · 왜 갈아엎었나 — 퀴즈 10문제 → 커리어 시뮬레이션</h2>
          <p>
            이전 버전(Foresight)은 &lsquo;이름을 가린 종목 하나 → 비중 고르기 → 정답&rsquo;을 10번 반복했다. 직접 해 보니 <b>라운드끼리 연결되지 않아</b> 앞의 선택이 뒤에 영향을 주지 않고, 쌓이는 게 없어 다시 할 이유가 없었다. 문제는 UI가 아니라 <b>구조</b>였다.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>문제</th>
                <th>새 구조</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>판단이 하나씩 끊김</td>
                <td>하나의 시간선(26주)에서 포트폴리오가 계속 이어진다</td>
              </tr>
              <tr>
                <td>잃어도 다음 문제로 넘어가면 끝</td>
                <td>자산·멘탈이 다음 주로 넘어간다. 멘탈 0이면 패닉셀</td>
              </tr>
              <tr>
                <td>다시 할 이유 없음</td>
                <td>판마다 시장 구간·종목·코드네임이 섞인다. 오늘의 시드 랭킹·칭호 도감·시장 해금</td>
              </tr>
              <tr>
                <td>hindsight 데이터가 카드 한 장</td>
                <td>실제 유튜버 채널이 라이벌. 매주 그들의 &lsquo;오른다&rsquo; 종목 성적과 순위를 다툰다</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="needs" className="card">
          <h2 className="sec-title">02 · Needs — 유튜브 보고 산 종목, 그 말대로 했으면?</h2>
          <ul className="dots">
            <li>
              <b>대상</b> 유튜브·커뮤니티로 종목 정보를 얻는 개인 투자자와 투자 입문자. 주식 정보를 얻는 곳 1위가 유튜브(37.4%, 피앰아이 2026.6, 20~59세 1,000명)
            </li>
            <li>
              <b>문제</b> 유튜버 말이 얼마나 맞았는지 확인할 곳이 없고, 실전 연습은 진짜 돈을 잃으며 결과를 알기까지 몇 달이 걸린다
            </li>
            <li>
              <b>해결</b> 실제 과거 시장을 압축해서(26주 → 10분) 안전하게 겪게 하고, 같은 기간 유튜버를 따라 샀을 때와 나란히 비교한다
            </li>
          </ul>
          {m && (
            <p className="callout">
              우리 데이터에서 유튜버 {m.ghosts.n}명의 &lsquo;오른다&rsquo; 종목을 매주 따라 샀다면, 같은 기간 코스피(<Delta x={m.ghosts.kospi} />)를 이긴 채널은 <b>{m.ghosts.beat}명</b>뿐이었다. 화제가 많이 된 종목(지난주 언급 10건 이상)의 다음 주 평균은{" "}
              <Delta x={m.hype["10건 이상"]?.mean ?? 0} digits={2} />였다.
            </p>
          )}
        </section>

        <section id="market" className="card">
          <h2 className="sec-title">02-2 · 시장·경쟁·SWOT</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>대안</th>
                <th>실제 과거</th>
                <th>바로 결과</th>
                <th>유튜버와 비교</th>
                <th>그때 정보만 쓰는 AI</th>
                <th>게임 재미</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["증권사 모의투자(예: 키움증권 영웅문 모의투자)", "–", "–(실시간, 몇 주 대기)", "–", "–", "△"],
                ["투자 유튜브·종목 토론방", "–", "–", "–", "–", "△"],
                ["금융교육 강의·퀴즈(예: 금융감독원 금융교육 콘텐츠)", "–", "●", "–", "–", "–"],
                ["타임슬립 개미", "●", "●(10분에 26주)", "●(고스트 라이벌)", "●(시점 제한 RAG)", "●"],
              ].map((r) => (
                <tr key={r[0]} className={r[0] === "타임슬립 개미" ? "me-row" : ""}>
                  {r.map((c, i) => (
                    <td key={i}>{i === 0 ? <b>{c}</b> : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">서비스 유형 기준 팀 비교(2026-11). 특정 제품의 기능을 전수 조사한 것은 아니다.</p>
          <div className="swot">
            <div>
              <b>S 강점</b>
              <span>hindsight 5.4만 언급·31.7만 시세 실데이터, 미래 정보 차단(테스트), 유튜버 고스트 라이벌, 10분 한 판</span>
            </div>
            <div>
              <b>W 약점</b>
              <span>데이터 기간 약 15개월(같은 시장이 반복될 수 있음), 무료 AI 한도, 첫 접속 지연</span>
            </div>
            <div>
              <b>O 기회</b>
              <span>2030 개인 투자자 금융교육 수요, 증권사 신규 고객 온보딩·학교 교육(B2B), 반·동아리 리그</span>
            </div>
            <div>
              <b>T 위협</b>
              <span>투자 조언으로 오해 → 면책·AI 권유 금지 검증, 실명 채널 평판 → 공개 분석은 익명, 저작권(제목 인용) → 짧은 제목만·출처 표기</span>
            </div>
          </div>
        </section>

        <section id="ref" className="card">
          <h2 className="sec-title">03 · 레퍼런스 분석 — 따라 하지 않고, 왜 재미있는지만 가져왔다</h2>
          <table className="tbl ref-tbl">
            <thead>
              <tr>
                <th>레퍼런스</th>
                <th>재미의 원리</th>
                <th>타임슬립 개미에서</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>킥루(벤치에서 발롱까지)</td>
                <td>한 사람의 커리어를 은퇴까지 한 번. 「시즌 진행」 버튼 하나의 빠른 템포, 가끔 진로 선택, 숨은 특성, 은퇴 기록이 일일 랭킹에</td>
                <td>26주 = 한 커리어, [다음 주 ▶] 하나로 진행, 4주마다 인생 사건, 숨은 투자 성향 → 칭호, 결산이 오늘의 시드 랭킹에</td>
              </tr>
              <tr>
                <td>전염병 주식회사</td>
                <td>눈에 보이는 게이지(감염·치료제)와 경주, 내 선택이 속도를 바꾼다</td>
                <td>🔥 화제성 게이지(실제 언급 수), 😎 멘탈 게이지, 유튜버·코스피와 매주 순위 경주</td>
              </tr>
              <tr>
                <td>키자니아 주식 체험</td>
                <td>진짜 직업을 역할놀이로, 쉬운 말과 익숙한 소품</td>
                <td>&lsquo;첫 출근&rsquo; 연습 시즌(8주·국내 6종목), 월요일 아침 폰 피드라는 익숙한 소품</td>
              </tr>
              <tr>
                <td>발라트로</td>
                <td>운(카드)이 판을 흔들지만 효과는 한 줄로 쉽다 → 매 판이 다르다</td>
                <td>시즌 시작 행운 카드 3장 중 1장 뒤집기(수수료 면제·강철 멘탈·별똥별…), 매주 🍀 작은 행운</td>
              </tr>
              <tr>
                <td>브롤스타즈 상자</td>
                <td>열기 전 두근거림 + 가변 보상 + 천장(일정 횟수 뒤 큰 보상 보장)</td>
                <td>결산 행운 상자: 별 +1~+5, 작은 보상 3번이면 다음은 큰 보상 확정</td>
              </tr>
              <tr>
                <td>듀오링고·워들</td>
                <td>하루 한 판 습관, 이모지 결과 공유</td>
                <td>오늘의 시드(모두 같은 시장), 🟥🔵 주간 그리드 공유, 연속 참여</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">GTA 같은 3D는 검토 후 제외: 일정·모바일 성능·&lsquo;쓰기 편함&rsquo;과 충돌하고, 이 게임의 재미는 이동이 아니라 판단과 결과에서 나온다.</p>
        </section>

        <section id="design" className="card">
          <h2 className="sec-title">04 · 게임 설계</h2>
          <ul className="dots">
            <li>
              <b>한 턴 = 실제 1주</b> 월요일 아침 피드(지난주 영상·공시·차트) → 사건 카드(4주마다) → 사고팔기(최대 5종목) → [다음 주 ▶] → 그 주의 실제 종가로 결과
            </li>
            <li>
              <b>기억으로 못 이기게</b> 종목은 코드네임(&lsquo;반도체 A&rsquo;), 가격은 판마다 다른 배율, 제목 속 이름·날짜·그룹명·사람 이름은 지움. 실제 이름과 기간은 결산에서 공개
            </li>
            <li>
              <b>멘탈</b> 큰 손실·잦은 매매·추격 매수에 깎이고 쉬거나 나눠 담으면 회복. 0이면 강제 패닉셀 → &lsquo;버티기&rsquo;를 몸으로 느끼게
            </li>
            <li>
              <b>점수</b> 시간가중수익률(중간 입금에 흔들리지 않음). 순위 = 나 + 유튜버 3명 + 코스피. 등급 S~F, 칭호 11종(성향 4축)
            </li>
            <li>
              <b>성장</b> 첫 판 국내만 → 1판 완주 시 미국 → B 등급 이상이면 코인. 레벨이 아니라 &lsquo;선택지가 늘어나는&rsquo; 성장
            </li>
            <li>
              <b>2차(자체 피드백 반영)</b> 연습 시즌(8주·6종목)으로 3분 안에 첫 성공 · 평범한 주는 3초 리캡 카드, 큰 주만 큰 창 · ▶▶ 4주 빨리 감기 · 내 개미 6종(특성이 전략을 바꿈) · 시즌 미션 3개 → ★ → 3D 내 방 가구 12종 · 동물 유튜버 라이벌의 한마디
            </li>
          </ul>
          <p className="muted small">자체 피드백 8가지(F1~F8)와 고친 방법은 GitHub docs/design-v2.md</p>
        </section>

        <section id="ux" className="card">
          <h2 className="sec-title">05 · UI/UX — 11주차 용어집으로 설계 근거를 단다</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>용어</th>
                <th>적용한 곳</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Bottom Sheet", "종목 정보·매매. 피드 맥락을 잃지 않고, 아래로 끌면 닫힘. 넓은 화면에선 가운데 창"],
                ["Onboarding · Coach Marks · Spotlight", "첫 판 3단계 안내(언제든 건너뛰기). 2단계는 직접 종목을 눌러야 넘어간다(체험형). '첫 출근' 연습 시즌"],
                ["Progressive Disclosure · New Badge", "국내 → 미국 → 코인 순으로 시장을 연다"],
                ["Undo · Toast Feedback", "주문을 담으면 토스트에 '되돌리기'. 주문은 주 마감 전까지 ✕로 취소"],
                ["Optimistic UI · Autosave", "주문은 즉시 화면에 반영, 새로고침해도 주문·진행이 남는다"],
                ["Confirmation(대신 Modal)", "되돌릴 수 없는 인생 사건만 반드시 고르게 하는 모달"],
                ["Haptic · Active State", "[다음 주 ▶] 엄지 영역 고정(60px), 누르면 진동·눌림 효과"],
                ["Skeleton · Loading/Empty/Error", "서버가 깨어날 때 안내, '이번 주 공시 없음' 같은 빈 상태, 다시 시도"],
                ["접근성", "상승 빨강▲·하락 파랑▼ 기호 병기, 포커스 가두기·Esc, reduced-motion, 미터 role"],
                ["반응형", "360~430px 기준 탭 4개. 960px 이상은 피드·시장·계좌·라이벌 2단 동시 표시"],
                ["Snackbar · Auto-dismiss", "평범한 주는 3초 리캡 카드(누르면 닫힘, 남은 시간 막대). 26번 반복해도 지루하지 않게"],
                ["Card Select", "내 개미 고르기: 그림·특성·잠금 조건을 한 카드에"],
                ["AI Chat · Citations", "개미 비서(부엉이 박사): 제안 질문 칩 → 단계별 진행 표시(검색 중 → 답 쓰는 중) → 출처 D1·D2 → 👍👎"],
                ["3D · Graceful Degradation", "three.js 장면은 보일 때만 그리고, WebGL 없음·움직임 줄이기면 2D로. 직접 끄기 버튼"],
                ["UX 렌즈", "👓 또는 U 키: 화면 위에 실제 적용된 용어집 용어를 띄운다(발표 시연용)"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td>
                    <b>{a}</b>
                  </td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">원칙: 한 화면에 한 가지 결정 · 결정 버튼은 엄지가 닿는 아래 · 긴장감은 주간 결과와 결산에 몰아서 · 숫자는 서버 값만.</p>
        </section>

        <section id="system" className="card">
          <h2 className="sec-title">06 · 시스템 — 규칙은 서버, 화면은 보여주기만</h2>
          <pre className="arch">{`React+three.js(Vercel) ──/api──▶ FastAPI(Render) ──▶ Supabase PostgreSQL(runs·ai_calls) + pgvector(rag_docs)
                              │
                              ├─ data/season.json  시즌 팩(미래 가격 포함, 서버만·암호화 배포)
                              └─ Gemini            임베딩(질문) · 개미 비서 답 · AI 코치

hindsight DB ─(읽기만)─▶ build_season.py ─▶ season.json · rag_docs ─▶ build_rag.py(Gemini 임베딩) ─▶ rag.json`}</pre>
          <ul className="dots">
            <li>
              <code>POST /v1/runs</code> 시드로 구간·종목·코드네임·라이벌·미션 결정 → <code>POST /event</code> 사건 → <code>POST /turn</code>·<code>/skip</code> 주문 검증·체결·평가 → <code>POST /ask</code> 개미 비서(RAG) → <code>GET /final</code> 결산
            </li>
            <li>다음 주 가격은 턴을 제출해야 계산된다. 화면 응답에는 지난주까지 값만(테스트가 매 턴 검사)</li>
            <li>잘못된 주문(현금 부족·잠긴 시장·6종목째)은 409 + 이유. 실패한 주문은 상태를 바꾸지 않는다(원자성)</li>
            <li>같은 판 동시 요청은 판 id 별 잠금, IP·기기별 요청 한도</li>
          </ul>
        </section>

        <section id="data" className="card">
          <h2 className="sec-title">07 · 데이터 — hindsight 를 &lsquo;시장&rsquo;으로</h2>
          {m ? (
            <p>
              유튜브 {m.source.channels}개 채널 · 언급 {Number(m.source.mentions).toLocaleString()}건 · 일별 시세 {Number(m.source.prices).toLocaleString()}행 · 공시 {Number(m.source.disclosures).toLocaleString()}건 → 주봉 {m.pack.weeks}주 · 종목 풀{" "}
              {m.pack.assets.KRX + m.pack.assets.US + m.pack.assets.CRYPTO}개 · 유튜버 고스트 {m.ghosts.n}명.
            </p>
          ) : (
            <p className="muted">불러오는 중…</p>
          )}
          <p>
            분석과 가공 과정은 <a href="#/data">데이터 페이지</a>에. 핵심 발견: 화제가 많이 된 종목이 다음 주에 더 오르지는 않았고, 한 주 15% 넘게 오른 종목이 다음 주에도 오른 비율은 {m ? pct(m.momentum.afterJump.win ?? 0, 0).replace("+", "") : "…"}로 절반이 안 됐다. 이 둘이 게임의 🔥화제성·추격 매수 규칙의 근거다.
          </p>
        </section>

        <section id="ai" className="card">
          <h2 className="sec-title">08 · AI — 개미 비서(시점 제한 RAG) · 코치</h2>
          <ul className="dots">
            <li>
              <b>개미 비서</b> 종목 시트에서 질문 → Gemini 임베딩(gemini-embedding-001, 256차원) → <b>Supabase pgvector</b>에서 &lsquo;이번 판 종목 AND 지금 보이는 주 이하 AND 최근 12주&rsquo; 조건으로 코사인 검색 + 최근성 가산 → Gemini 가 출처 id 를 달아 답(JSON) → 검증 6가지(형식·인용 실재·숫자 출처·권유·진짜 이름·길이) → 1번 재시도 → 실패하면 검색 결과만
            </li>
            <li>미래 문서는 SQL 단계에서 걸러져 모델에 가지 않는다. 테스트가 매번 확인</li>
            <li>
              무료 한도(임베딩 모델당 하루 ~1,000건) 때문에 &lsquo;중요한 문서부터&rsquo; 하루씩 색인을 늘린다: 핵심 공시 → 종목별 인기 제목 → 나머지{m ? ` (지금 ${m.rag.docs.toLocaleString()}건)` : ""}
            </li>
            <li>
              <b>코치</b> 결산이 끝나면 내 거래 기록(수익률·순위·거래 횟수·추격 매수·현금 비중·사건 선택)만 넘겨 세 줄 피드백
            </li>
            <li>종목 추천·시장 전망 금지. JSON 스키마로 형식 강제</li>
            <li>검증 3가지: 넘긴 자료에 없는 숫자 · 직접 권유 표현 · 길이 → 실패하면 이유를 알려 1번 재시도 → 그래도 실패하면 규칙 답</li>
            <li>Gemini 3.5 Flash → 대체 모델 → 키가 없으면 로컬 Ollama(수업 3주차 qwen3.5:4b) → 규칙 답. 모든 호출 기록(지연·토큰·통과 여부)</li>
          </ul>
          <p className="callout">
            짓궂은 질문 30개(미래 예측·투자 권유·실명·숫자 날조·규칙 무시 유도 포함) 평가: <b>화면에 문제 있는 답 0개</b>, 응답 중간값 1.4초 — GitHub <code>docs/ai-eval.md</code>. 검증이 실제로 잡은 실패와 고친 방법은 <code>docs/ux-log.md</code> R13~R16.
          </p>
          {m && (
            <p className="muted small">
              개미 비서 {m.ask.n}번(통과 {m.ask.ok}) · 코치 {m.coach.n}번(통과 {m.coach.ok})
            </p>
          )}
        </section>

        <section id="nfr" className="card">
          <h2 className="sec-title">09 · 성능·보안</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>무엇</th>
                <th>전</th>
                <th>후</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>개미 비서 응답</td>
                <td>18.4초</td>
                <td>
                  <b>1.4초</b>(가벼운 모델 먼저 · 생각 최소)
                </td>
              </tr>
              <tr>
                <td>첫 화면 JS(gzip)</td>
                <td>338 KB(3D 포함)</td>
                <td>
                  <b>111 KB</b>(3D 는 보일 때만)
                </td>
              </tr>
              <tr>
                <td>한 턴 처리 · 응답</td>
                <td>—</td>
                <td>7.8 ms · 5.4 KB</td>
              </tr>
              <tr>
                <td>RAG 검색(pgvector)</td>
                <td>—</td>
                <td>2.3 ms</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">측정 방법과 비용·남은 한계: GitHub docs/perf.md</p>
          <ul className="dots">
            <li>시즌 팩(2MB)은 서버에만. 한 턴 응답은 지금 화면에 필요한 것만(종목 20개 × 12주) gzip</li>
            <li>공개 저장소엔 암호문(pack.enc)만, 서버는 DATA_KEY 로 풀어 쓴다</li>
            <li>홈·플레이 외 페이지는 코드 분할로 열 때 받는다</li>
            <li>개인정보 없음: 로그인 없이 기기 표식(무작위)만. 닉네임은 욕설 거르고 12자</li>
            <li>보안 헤더(nosniff·frame deny·no-referrer), 게임 응답 캐시 금지, CORS 허용 주소만</li>
          </ul>
          {m && m.perf.length > 0 && (
            <p className="muted small">
              측정(서버 시작 뒤): {m.perf.slice(0, 3).map((p) => `${p.path} p50 ${p.p50}ms`).join(" · ")}
            </p>
          )}
        </section>

        <section id="biz" className="card">
          <h2 className="sec-title">10 · 수익화 가설</h2>
          <table className="tbl">
            <tbody>
              <tr>
                <td>
                  <b>B2B 교육</b>
                </td>
                <td>증권사 신규 고객 온보딩, 학교·기관 금융교육(키자니아 모델), 반·기수별 리그 — 실제 데이터라는 차별점, 가장 현실적인 매출원</td>
              </tr>
              <tr>
                <td>
                  <b>무료 + 꾸미기</b>
                </td>
                <td>칭호 테두리·시즌 패스. 플레이에 영향 없는 과금(공정성 유지)</td>
              </tr>
              <tr>
                <td>
                  <b>보상형 광고</b>
                </td>
                <td>패닉 직전 멘탈 회복 1회, 상세 코치 리포트 — 흐름을 끊지 않는 자리에만</td>
              </tr>
              <tr>
                <td>
                  <b>스폰서 리그</b>
                </td>
                <td>월간 시즌 대회(오늘의 시드 랭킹 인프라 재사용)</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">규제: 과거 데이터 시뮬레이션이며 투자 권유가 아니다. 결산 전 실제 종목명 비노출, 실시간 추천 기능 없음.</p>
        </section>

        <section id="team" className="card">
          <h2 className="sec-title">11 · 팀 · 링크</h2>
          <ul className="members">
            {TEAM.members.map((x) => (
              <li key={x.name}>
                <b>{x.name}</b>
                <span className="muted small">{x.role || "팀원"}</span>
              </li>
            ))}
          </ul>
          <div className="two-col" style={{ marginTop: 14 }}>
            <ul className="dots">
              <li>
                서비스 <a href={TEAM.links.service}>{TEAM.links.service}</a>
              </li>
              <li>
                API 문서 <a href={TEAM.links.swagger}>{TEAM.links.swagger}</a>
              </li>
              <li>
                코드 <a href={TEAM.links.github}>{TEAM.links.github}</a>
              </li>
            </ul>
            <div className="qr-card">
              <QR url={TEAM.links.service} size={160} />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
