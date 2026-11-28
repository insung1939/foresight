/* 타임슬립 개미 — 기말 최종 발표 엔진 (빌드 없음, 정적 파일. 엔진은 5주차 발표와 같고 대본·숫자만 다르다)
   키: → / Space 다음 단계 · ← 이전 · F 전체화면 · P 발표자 화면 · A 이 장 단계 전부 · Home/End · 숫자 1~9
   data-in="n" : n단계부터 보임 · data-step="n" : 그 단계에서 강조
   data-b="경로|형식" : DATA(/v1/meta 값)에서 숫자를 채움 · data-count : 장에 들어오면 숫자가 올라감
   지금 상태(서버·DB·AI)는 /v1/health 를 발표 중에 직접 물어서 채운다. */

// ───────────────────────── 주소 · 팀 ─────────────────────────
const CONFIG = {
  service: "https://foresight-rho-teal.vercel.app",
  github: "https://github.com/insung1939/foresight",
  swagger: "https://foresight-api-yda3.onrender.com/docs",
  deck: "https://foresight-rho-teal.vercel.app/final/",
  api: "/api",
  team: { name: "2조", members: ["김지환", "김현준", "오선호", "조인성", "채재희"], presenter: "" },
  targetSec: 540, // 목표 9:00 — 시간이 짧으면 대본의 [줄일 때] 표시를 따른다
};

// ───────────────────────── 숫자 (2026-11-28 운영 /v1/meta 값. 열릴 때 서버 값으로 덮어씀) ─────────────────────────
const DATA = {
  source: { channels: 51, videos: 50019, mentions: 55160, prices: 322794, disclosures: 55005, through: "2026-11-28" },
  quality: { ragIndexed: 2829, ragTotal: 10124 },
  pack: { weeks: 67, playable: 46, from: "2025-10-13", to: "2026-11-23", assets: { KRX: 110, US: 30, CRYPTO: 30 }, channels: 47 },
  hype: {
    "0건": { n: 5708, mean: 0.00993, win: 0.4646 },
    "1~2건": { n: 2212, mean: -0.00361, win: 0.4263 },
    "3~9건": { n: 1083, mean: -0.01485, win: 0.4174 },
    "10건 이상": { n: 915, mean: -0.00529, win: 0.4514 },
  },
  all: { n: 9918, mean: 0.0029, win: 0.449 },
  momentum: { afterJump: { n: 720, mean: 0.01347, median: -0.01062, win: 0.4639 }, afterDrop: { n: 507, mean: -0.0053, win: 0.432 } },
  ghosts: { kospi: 0.3014, n: 47, beat: 5, hist: [[-100, 1], [-75, 4], [-50, 16], [-25, 12], [0, 9], [25, 2], [50, 1], [75, 2]] },
  plays: { runs: 69, done: 30, titles: { "균형 잡힌 개미": 7, "존버의 신": 6, "방치형 개미": 5, "익절 장인": 5, "몰빵러": 4, "FOMO 장인": 2, "패닉셀러": 1 } },
  players: { n: 16, beatIndex: 0.5, beatYt: { 0: 2, 1: 3, 3: 11 } },
  ask: { n: 26, ok: 22, p50: 4068 },
  coach: { n: 9, ok: 6, p50: 10331 },
  rag: { docs: 2829, backend: "pgvector" },
  perf: [],
  ux: { modes: { practice: { n: 42, done: 14, rate: 0.333, minutes: 2.8 }, daily: { n: 18, done: 14, rate: 0.778, minutes: 5.8 }, free: { n: 7, done: 2, rate: 0.286, minutes: 8.0 } }, errors7d: 0, turns7d: 289 },
  updates: {
    history: [
      { builtAt: "2026-11-21T17:22:40+09:00", lastWeek: "2026-11-16", weeks: 66, added: [] },
      { builtAt: "2026-11-28T22:50:50+09:00", lastWeek: "2026-11-23", weeks: 67, added: ["2026-11-23"], verify: "24/24" },
    ],
    verify: { n: 24, ok: 24 },
  },
};

// ───────────────────────── 발표 대본 (docs/final-script.md 와 같은 내용. segs[k] = k단계에서 할 말) ─────────────────────────
const NOTES = [
  { id: "cover", title: "표지", sec: 15, segs: [
    "안녕하세요, 2조입니다. '그때 그 종목 샀으면 지금 부자일 텐데', 한 번쯤 생각해 보셨죠? 그 질문을 게임으로 만든 「타임슬립 개미」, 최종 발표를 시작하겠습니다.",
  ] },
  { id: "scenario", title: "시나리오 · 누구의 어떤 니즈", sec: 40, segs: [
    "모든 건 한 사람에서 시작합니다. 입사 2년 차 김개미 씨, 매달 50만 원으로 투자를 시작하려 하고, 정보는 출퇴근길 유튜브에서 얻습니다. 실제로 주식 정보를 얻는 곳 1위가 유튜브, 37.4%입니다.",
    "[클릭] 김개미 씨의 첫 번째 질문, '유튜버 말, 믿어도 돼?' 저희는 실제 유튜버 47명의 성적을 라이벌로 보여 줍니다.",
    "[클릭] 두 번째, '잃지 않고 흔들려 보고 싶다.' 가상 1,000만 원으로 실제 과거 가격을 겪습니다.",
    "[클릭] 세 번째, '결과를 몇 달씩 기다리기 싫다.' 한 턴이 실제 1주, 12주를 5분에 끝냅니다.",
  ] },
  { id: "facts", title: "데이터로 본 문제", sec: 35, segs: [
    "정말 그때로 가면 쉬울까요? hindsight 1년치 데이터로 확인했습니다.",
    "[클릭] 유튜버 47명의 '오른다'를 그대로 샀다면, 코스피를 이긴 건 5명뿐입니다.",
    "[클릭] 언급이 0건인 종목은 다음 주 평균 +1%, 화제가 된 종목은 오히려 마이너스였습니다.",
    "[클릭] 15% 급등한 다음 주에 오른 건 46%, 동전 던지기입니다. 지나고 보면 쉽지만 그 순간엔 어렵다, 이게 저희 출발점입니다.",
  ] },
  { id: "solution", title: "해결 · 이야기가 곧 게임", sec: 35, segs: [
    "그래서 김개미 씨를 그 월요일로 돌려보냅니다. 범고래 박사가 시계를 건네며 말하죠. '대신 기억은 흐릿해질 걸세, 회사 이름도 날짜도.' 그래서 종목은 '반도체 A' 같은 코드네임이고, 기억으로는 이길 수 없습니다.",
    "[클릭] 한 주는 이렇게 흘러갑니다. 피드를 보고, 궁금하면 박사에게 묻고, 금액 버튼 한 번으로 사고, 다음 주를 누르면 그 주 실제 가격으로 결과가 나옵니다. 중간중간 월급이나 리딩방 같은 인생 사건이 흔들고, 끝나면 진짜 이름과 엔딩이 나옵니다.",
  ] },
  { id: "demo", title: "시연", sec: 70, segs: [
    "직접 보여 드리겠습니다. 이 화면들은 그림이 아니라 실제 서비스입니다. [화면 로딩 확인]",
    "[클릭: 홈] 처음 오면 이야기가 먼저 나오고, 쉬운 모드가 기본입니다. 로그인 없이 바로 시작하고 자동 저장됩니다.",
    "[클릭: 플레이] [시연: 종목 누르기 → '100만 원어치' → 다음 주 ▶ → 라이벌 탭 순위 경주] 위에 '이번 주 할 일'이 한 줄로 떠서 처음 하는 사람도 헤매지 않습니다.",
    "[클릭: 랭킹] 오늘의 시드는 모두 같은 시장이라 날짜별로 순위를 겨룹니다.",
    "[클릭: 데이터] 그리고 데이터 페이지에서 오늘 말씀드릴 요구사항 점검표를 누구나 지금 값으로 봅니다. 모두 휴대폰에서 됩니다.",
  ] },
  { id: "rag", title: "AI · 범고래 박사 RAG 3건", sec: 40, segs: [
    "AI의 원칙은 하나입니다. AI도 그때까지의 정보만 압니다. 질문하면 그 주까지의 영상 제목만 pgvector에서 찾고, 미래 문서는 SQL 조건으로 아예 걸러집니다.",
    "[클릭] 첫째, '왜 화제야?'에는 출처를 달아 요약합니다. 출처는 모두 과거 주입니다.",
    "[클릭] 둘째, '다음 주에 오를까?'에는 지어내지 않고 '알 수 없다'고 답합니다.",
    "[클릭] 셋째, '진짜 회사 이름이 뭐야?'에는 막습니다. 짓궂은 질문 30개로 시험했더니 화면에 나간 문제 답은 0개였습니다.",
  ] },
  { id: "changes", title: "중간발표 이후 바뀐 것", sec: 45, segs: [
    "중간발표 뒤 교수님, 팀원, 사용자 피드백을 받아 이렇게 바꿨습니다.",
    "[클릭] 가장 중요한 시나리오는 페르소나와 이야기 그림, 사건마다 '실제로는' 한 줄로 구체화했습니다. 데이터 정합성은 갱신 때마다 원천과 대조하고, 아키텍처는 장애 일곱 가지에 대한 대응을 만들었습니다.",
    "[클릭] 사용자들이 '어렵다, 길다'고 해서 쉬운 모드와 12주로 바꿨고, 12주 오늘의 시드 완주율은 지금 78%입니다. 이런 개선 기록이 55건, 저장소에 모두 남아 있습니다.",
  ] },
  { id: "data", title: "데이터 신뢰성 · 지속가능성", sec: 40, segs: [
    "데이터는 지난 학기 hindsight가 매일 모으는 유튜브 언급 5만 5천 건, 시세 32만 행입니다.",
    "[클릭] 매주 일요일 아침 시즌 팩을 다시 만들고, 품질 관문을 통과해야만 서비스에 반영됩니다. 종목 순서, 지난 종가가 그대로인지, 이상한 급등락은 없는지, 그리고 원천 대조. 하나라도 걸리면 이전 데이터로 계속 서비스합니다.",
    "[클릭] 실제로 지난주 갱신에서 새 주가 들어왔고, 원천 대조는 24곳 중 24곳 일치했습니다. 이 기록은 데이터 페이지에 계속 쌓입니다. [자동 갱신을 켰는지 발표 전 확인]",
  ] },
  { id: "visual", title: "시각화", sec: 30, segs: [
    "숫자는 보이게 만들었습니다. 언급 수만큼 개미가 몰리는 3D 화제 광장, 나와 유튜버와 코스피의 순위 경주, 내 계좌 비중 도넛.",
    "[클릭] 결산에서는 12주 곡선과 주별 막대로 어디서 흔들렸는지 보이고, 인생 사건은 그림과 함께 '실제로는'이 붙습니다.",
  ] },
  { id: "arch", title: "아키텍처 · 견고함", sec: 35, segs: [
    "구조는 화면, 서버, DB, AI 네 층입니다. 지금 이 화면의 초록불은 발표 중에 서버에 직접 물어본 실제 상태입니다.",
    "[클릭] 견고함은 '고장 나도 게임은 계속된다'로 설계했습니다. 서버가 잠들면 화면이 자동 재시도하고, DB가 끊기면 잠시 뒤 다시를 안내하고, AI가 실패하면 규칙 답으로, 데이터가 바뀌어도 진행 중인 판은 같은 종목을 가리킵니다. 미래 가격은 서버에만 있습니다.",
  ] },
  { id: "nfr", title: "비기능 요구사항", sec: 45, segs: [
    "비기능 요구사항은 말이 아니라 숫자로 보여 드리겠습니다.",
    "[클릭] 신뢰성: 자동 테스트 35개, 원천 대조 24/24, 화면 오류는 자동으로 모아 지난 7일 0건입니다.",
    "[클릭] 사용성: 완주율과 한 판 걸린 시간을 직접 잽니다. 12주 판은 78%가 끝까지 했고 약 6분 걸렸습니다.",
    "[클릭] 속도: 앱 파일은 1년 캐시, 3D는 화면이 뜬 뒤에 불러옵니다. 보안: 콘텐츠 보안 정책, HTTPS 강제, 요청 한도, 라이브러리 취약점 0건입니다.",
  ] },
  { id: "game", title: "게임 · 산만하지 않게", sec: 30, segs: [
    "게임으로서도 신경 썼습니다. 그림 32장은 ChatGPT 이미지 생성을 codex로 연동해 같은 그림체로 만들었고, 소리를 켜면 효과음과 배경음악이 흐릅니다.",
    "[클릭] 그리고 산만하지 않게. 쉬운 모드는 금액 버튼 한 번, 안내 한 줄, 어려운 기능은 고수 모드로 숨겼습니다. 목표 유튜버를 이기고, 상자를 열고, 3D 방을 채우는 보상이 '한 판 더'를 만듭니다.",
  ] },
  { id: "results", title: "플레이 기록으로 본 결과", sec: 35, segs: [
    "마지막으로, 사람들은 실제로 어땠을까요? 끝까지 한 판을 모아 봤습니다.",
    "[클릭] 유튜버 3명을 모두 이긴 사람이 16명 중 11명, 코스피를 이긴 사람이 절반이었습니다. 많이 받은 칭호는 '균형 잡힌 개미', '존버의 신'. 따라 사지 않고 나눠 담고 버틴 사람이 잘했습니다. 표본이 작아 결론은 아니지만, 저희가 처음 세운 가설과 같은 방향입니다.",
  ] },
  { id: "limits", title: "차별화 · 한계 · 다음", sec: 25, segs: [
    "모의투자는 결과를 기다려야 하고, 투자 게임은 데이터가 가짜입니다. 저희는 실제 과거로 바로 결과를 보고 실제 유튜버와 겨룹니다.",
    "[클릭] 한계도 있습니다. 1년치 데이터라 AI 반도체 붐 국면이 크고, 무료 서버라 첫 응답이 느리고, 검색 색인은 아직 일부입니다. 다음은 학교·증권사 온보딩용 반별 리그입니다.",
  ] },
  { id: "end", title: "마무리 · QR", sec: 10, segs: [
    "지나고 보면 쉽습니다. 그때로 가 보면 어떨지, QR로 직접 해 보세요. 감사합니다. [질문 받기]",
  ] },
];

const QA = [
  ["실제 과거 데이터면, 그때 일을 기억하는 사람이 유리하지 않나요?", "종목은 판마다 새로 섞는 코드네임이고 시작 주도 40여 가지 중 무작위입니다. 영상 제목 속 날짜·'3월'·'추석' 같은 시점 단서와 제품·공장 이름도 지우고, 가격도 판마다 다른 배율로 보여 줍니다(등락률은 그대로). 정체는 결산 때만 공개합니다. 이야기 속 '기억이 흐릿해진다'가 바로 이 장치입니다."],
  ["데이터가 바뀌면 진행 중인 게임은 어떻게 되나요?", "갱신할 때 지난 팩의 종목과 순서를 그대로 지키고, 새 판은 종목 id 를 같이 저장해서 서버가 불러올 때 다시 연결합니다. 금요일 종가 전의 주는 넣지 않고, 지난 종가가 바뀌면 품질 관문에서 배포를 멈춥니다. 이 경우를 자동 테스트로 확인합니다."],
  ["'실시간'은 왜 안 하나요?", "이 게임은 '과거를 다시 사는' 구조라 실시간 시세를 쓰면 정답이 사라집니다. 대신 원천은 매일 쌓이고, 시즌 팩은 주 단위로 갱신해 플레이할 수 있는 시장이 계속 늘어납니다."],
  ["RAG가 미래 정보를 안 쓴다는 걸 어떻게 보장하나요?", "현재 주차는 화면이 아니라 서버의 판 상태에서 가져오고, 검색 SQL에 '주 ≤ 지금 주' 조건을 겁니다. 미래 문서는 모델에 들어가지도 않습니다. 자동 테스트가 매번 확인하고, 답은 인용 실재·권유·실명 검사를 통과해야 화면에 나갑니다."],
  ["사용성은 어떻게 검증했나요?", "모드별 완주율과 한 판에 걸린 시간을 서버가 직접 집계합니다. 26주였을 때 3~4주차에 그만두는 사람이 많아 12주로 줄였고, 12주 오늘의 시드는 78%가 끝까지 했습니다. 개선 55건은 무엇을 보고 무엇을 바꿨는지 docs/ux-log.md 에 남겼습니다."],
  ["보안은 어떤가요?", "로그인·개인정보가 없고 기기 표식은 무작위 문자열입니다. 콘텐츠 보안 정책·HTTPS 강제·다른 사이트 iframe 금지, IP+기기별 요청 한도(AI는 더 엄격), API 키는 서버 환경변수에만, 정답이 든 시즌 팩은 암호문으로만 저장소에 있습니다. 화면 라이브러리 취약점 0건입니다."],
  ["결국 운 아닌가요?", "한 주 단위 주가는 거의 무작위라 맞히기보다 버티기를 평가합니다. 멘탈 관리·분산·추격 매수 여부가 칭호와 미션으로 드러나고, 코스피 ETF로 '그냥 시장 사기'와도 비교됩니다. 실제로 많이 받은 칭호도 '균형 잡힌 개미'였습니다."],
  ["반도체·빅테크만 담으면 끝 아닌가요?", "데이터 기간이 AI 반도체 붐과 겹친 건 맞습니다. 하지만 같은 업종 안에서도 −70%부터 수천 %까지 갈렸고, 마지막 시작점들에선 반도체의 90%가 손실이었습니다. 업종은 힌트일 뿐이고, 수집 기간이 늘면 다른 국면이 들어옵니다."],
  ["그림과 소리는 어떻게 만들었나요?", "그림 32장은 Codex CLI의 이미지 생성(ChatGPT)을 스크립트(scripts/gen_image.sh)로 불러 같은 그림체·같은 주인공 문구를 고정해 만들었습니다. 소리는 파일 없이 Web Audio 로 합성한 효과음과 로파이 배경음악입니다."],
  ["수익 모델은요?", "현실적인 건 B2B 금융교육입니다. 증권사 신규 고객 온보딩이나 학교·기관 수업에서 반별 리그로 쓰고, 개인은 무료에 방 꾸미기 같은 코스메틱을 생각합니다."],
];

// ───────────────────────── 이 발표만의 그림: 갱신 기록 · 플레이 결과 · 지금 상태 ─────────────────────────
window.extraDraw = (D, F) => {
  const $ = (s) => document.querySelector(s);
  const up = $("#updlog");
  if (up && D.updates?.history) {
    const rows = [...D.updates.history].reverse().slice(0, 4);
    up.innerHTML = rows.map((h, i) => `<tr class="${i === 0 ? "new" : ""}"><td>${(h.builtAt || "").slice(0, 10).replace(/-/g, ".")}</td><td>${h.weeks}주</td><td>${h.added?.length ? "+" + h.added.length + "주 (" + h.added.map((d) => d.slice(5).replace("-", ".")).join(", ") + ")" : "처음 만든 팩"}</td><td>${h.verify ? "✅ " + h.verify : "—"}</td></tr>`).join("");
  }
  const yt = $("#ytbeat");
  if (yt && D.players?.beatYt) {
    const n = D.players.n || 1, b = D.players.beatYt;
    const seg = [3, 2, 1, 0].map((k) => ({ k, v: +(b[k] || 0) })).filter((x) => x.v);
    yt.innerHTML = seg.map((x) => `<i class="b${x.k}" style="flex:${x.v}"><span>${x.k}명 이김 · ${x.v}</span></i>`).join("");
    const t = $("#ytbeat-n"); if (t) t.textContent = `${b[3] || 0}/${n}`;
  }
  const tt = $("#titles");
  if (tt && D.plays?.titles) {
    const e = Object.entries(D.plays.titles).slice(0, 6), mx = Math.max(...e.map(([, v]) => v), 1);
    tt.innerHTML = e.map(([k, v]) => `<li><span>${k}</span><i style="--w:${(v / mx) * 100}%"></i><b>${v}</b></li>`).join("");
  }
  const ph = (D.perf || []).find((p) => p.path === "GET /v1/health");
  $$q("[data-perf-health]").forEach((x) => (x.textContent = ph ? Math.round(ph.p50) : "—"));
};
const $$q = (s) => [...document.querySelectorAll(s)];

// 지금 상태(아키텍처 장): 발표 중에 서버에 직접 묻는다
function liveHealth() {
  const box = document.querySelectorAll("[data-live]");
  if (!box.length || new URLSearchParams(location.search).has("preview")) return;
  const t0 = performance.now();
  fetch(`${CONFIG.api}/v1/health`).then((r) => r.json()).then((h) => {
    const ms = Math.round(performance.now() - t0);
    const st = { web: ["ok", "지금 보고 있는 화면"], api: [h.ok ? "ok" : "bad", `왕복 ${ms}ms`], db: [h.db ? "ok" : "bad", `응답 ${h.dbMs}ms · ${h.rag}`], ai: [h.ai !== "off" ? "ok" : "warn", h.ai], data: [h.stale ? "warn" : "ok", `${(h.data?.lastWeek || "").replace(/-/g, ".")} 주까지 · ${h.data?.weeks}주`] };
    box.forEach((x) => { const s = st[x.dataset.live]; if (!s) return; x.classList.add("s-" + s[0]); const l = x.querySelector(".live"); if (l) l.textContent = s[1]; });
  }).catch(() => box.forEach((x) => x.classList.add("s-wait")));
}
addEventListener("load", liveHealth);

// 발표 창 ↔ 발표자 화면 연결(BroadcastChannel, 없으면 localStorage)
function makeBus(name = "timeslip-final") {
  if ("BroadcastChannel" in window) {
    const ch = new BroadcastChannel(name);
    return { post: (m) => ch.postMessage(m), on: (f) => (ch.onmessage = (e) => f(e.data)) };
  }
  const key = "bus:" + name;
  return {
    post: (m) => { try { localStorage.setItem(key, JSON.stringify({ m, t: Date.now() + Math.random() })); } catch {} },
    on: (f) => addEventListener("storage", (e) => { if (e.key === key && e.newValue) f(JSON.parse(e.newValue).m); }),
  };
}
Object.assign(window, { CONFIG, NOTES, QA, makeBus });

// ───────────────────────── 발표 엔진 (index.html 에서만) ─────────────────────────
if (document.getElementById("stage")) (function deck() {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const qs = new URLSearchParams(location.search);
  const PREVIEW = qs.has("preview"); // 발표자 화면 미리보기: 동기화·앱 로드·애니메이션 없음
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = $("#stage");
  const slides = $$(".slide", stage);
  let cur = 0, step = 0, stack = false;
  if (PREVIEW) document.documentElement.classList.add("preview");

  const maxStep = (el) => Math.max(+el.dataset.steps || 0, ...$$("[data-in],[data-step]", el).map((x) => +(x.dataset.in || x.dataset.step) || 0));
  slides.forEach((el) => (el._max = maxStep(el)));

  // ── 화면 맞춤: 넓으면 1600×900 무대를 꽉, 휴대폰이면 세로로 쌓기 ──
  const wantStack = () => !PREVIEW && !qs.has("stage") && (qs.has("stack") || innerWidth < 820);
  function fit() {
    const s = wantStack();
    if (s !== stack) {
      stack = s;
      document.documentElement.classList.toggle("stack", stack);
      if (stack) { stage.style.transform = ""; slides.forEach(revealAll); observe(); }
      else render(false);
    }
    if (!stack) {
      const k = Math.min(innerWidth / 1600, innerHeight / 900);
      stage.style.transform = `translate(-50%, -50%) scale(${k})`;
    }
  }

  // ── 채우기: 팀 · 링크 · QR ──
  const T = CONFIG.team;
  $$("[data-team]").forEach((x) => (x.innerHTML = T.members.map((m) => (m === T.presenter ? `<b>${m}</b><small>발표</small>` : m)).join('<i class="sep">·</i>')));
  $$("[data-link]").forEach((a) => {
    const u = CONFIG[a.dataset.link];
    a.href = u; a.target = "_blank"; a.rel = "noopener";
    const t = $("[data-url]", a);
    if (t) t.textContent = u.replace(/^https?:\/\//, "");
  });
  function drawQR() {
    const box = $("#qr");
    if (!box) return;
    try {
      const q = qrcode(0, "M");
      q.addData(CONFIG.service); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    } catch { box.innerHTML = `<span class="qr-fail">${CONFIG.service.replace(/^https?:\/\//, "")}</span>`; }
  }
  if (window.qrcode) drawQR(); else addEventListener("load", drawQR);

  // ── 숫자 ──
  const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
  const FMT = {
    int: (v) => Math.round(v).toLocaleString("ko-KR"),
    pct: (v) => `${sign(v)}${Math.abs(v * 100).toFixed(1)}%`,
    pct2: (v) => `${sign(v)}${Math.abs(v * 100).toFixed(2)}%`,
    pct0: (v) => `${Math.round(v * 100)}%`,
    man: (v) => `${(v / 10000).toFixed(1)}만`,
    f1: (v) => v.toFixed(1),
    sec: (v) => (v / 1000).toFixed(1),
    ms: (v) => Math.round(v).toLocaleString("ko-KR"),
  };
  function bind() {
    DATA.pack.total = Object.values(DATA.pack.assets || {}).reduce((a, b) => a + b, 0);
    $$("[data-b]").forEach((x) => {
      const [path, f = "int"] = x.dataset.b.split("|");
      const v = get(DATA, path);
      if (v == null || typeof v !== "number") return;
      x.textContent = FMT[f](v);
      if (x.hasAttribute("data-count")) {
        x.dataset.count = f === "pct0" ? Math.round(v * 100) : f === "int" ? v : x.dataset.count;
        if (f === "pct0") x.dataset.suf = "%";
      }
    });
    drawCharts();
  }
  function countUp(x) {
    const to = +x.dataset.count, dec = +(x.dataset.dec || 0), suf = x.dataset.suf || "";
    const out = (v) => (x.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("ko-KR")) + suf);
    if (REDUCED || PREVIEW || stack) return out(to);
    const t0 = performance.now(), dur = 1300;
    const f = (t) => { const p = Math.min(1, (t - t0) / dur); out(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  // ── 그림: 유튜버 고스트 분포 · 화제성 막대 · 급등 뒤 점 100개 ──
  function drawCharts() {
    const g = DATA.ghosts, kos = g.kospi * 100;
    const H = g.hist, mx = Math.max(...H.map((h) => h[1]));
    const W = 420, BH = 150, bw = W / H.length;
    const x0 = H[0][0], span = H.length * 25;
    const kx = ((kos - x0) / span) * W;
    let s = "";
    H.forEach(([b, n], i) => {
      const h = (n / mx) * (BH - 30);
      s += `<rect class="${b + 25 > kos ? "win" : ""}" x="${i * bw + 4}" y="${BH - h}" width="${bw - 8}" height="${h}" rx="6" style="--d:${i * 60}ms"/>`;
      s += `<text x="${i * bw + bw / 2}" y="${BH - h - 8}" class="n">${n}</text>`;
    });
    s += `<line x1="${kx}" x2="${kx}" y1="0" y2="${BH}" class="kline"/><text x="${kx + 8}" y="16" class="klab">코스피 ${FMT.pct(g.kospi)}</text>`;
    s += `<line x1="0" x2="${W}" y1="${BH}" y2="${BH}" class="axis"/>`;
    const zx = ((0 - x0) / span) * W, lab = (v) => `${sign(v)}${Math.abs(v)}%`;
    s += `<text x="0" y="${BH + 24}" class="ax">${lab(x0)}</text><text x="${zx}" y="${BH + 24}" class="ax" text-anchor="middle">0%</text><text x="${W}" y="${BH + 24}" class="ax" text-anchor="end">${lab(x0 + span)}</text>`;
    const histo = $("#histo");
    if (histo) histo.innerHTML = s;

    const hb = $("#hypebars");
    if (hb) {
      const ks = Object.keys(DATA.hype), m = Math.max(...ks.map((k) => Math.abs(DATA.hype[k].mean)));
      hb.innerHTML = ks.map((k, i) => {
        const v = DATA.hype[k].mean, w = (Math.abs(v) / m) * 50;
        return `<div class="hb ${v >= 0 ? "up" : "dn"}" style="--d:${i * 120}ms"><span class="k">${k}</span><span class="t"><i style="--w:${w}%"></i></span><span class="v">${v >= 0 ? "▲" : "▼"} ${FMT.pct2(v)}</span></div>`;
      }).join("");
    }
    const dg = $("#dotgrid");
    if (dg) {
      const up = Math.round(DATA.momentum.afterJump.win * 100);
      dg.innerHTML = Array.from({ length: 100 }, (_, i) => `<i class="${i < up ? "u" : ""}" style="--d:${(i % 10) * 25 + Math.floor(i / 10) * 25}ms"></i>`).join("");
    }
    if (window.extraDraw) window.extraDraw(DATA, FMT);
  }
  bind();
  if (!PREVIEW) {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 6000);
    fetch(`${CONFIG.api}/v1/meta`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m || !m.ghosts) return;
        for (const k of ["source", "pack", "hype", "all", "momentum", "ghosts", "quality", "ux", "updates", "players", "plays", "ask", "coach", "rag", "perf"]) if (m[k]) DATA[k] = m[k];
        bind();
      })
      .catch(() => {});
  }

  // ── 휴대폰 틀 안의 진짜 앱 (장에 들어올 때만 로드) ──
  function loadPhones(el) {
    $$(".phone[data-src]", el).forEach((p, i) => {
      if (p._loaded || PREVIEW) return;
      p._loaded = true;
      const f = document.createElement("iframe");
      f.title = p.dataset.label + " 화면";
      f.loading = "lazy";
      f.setAttribute("tabindex", "-1");
      const tm = setTimeout(() => p.classList.add("slow"), 12000);
      f.addEventListener("load", () => {
        clearTimeout(tm);
        p.classList.add("ready"); p.classList.remove("slow");
        try { // 앱 안에 초점이 있어도 ← → 는 발표가 받는다(같은 주소라 가능)
          f.contentWindow.addEventListener("keydown", (e) => {
            if (!["ArrowRight", "ArrowLeft", "PageDown", "PageUp"].includes(e.key) || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
            e.preventDefault();
            (e.key === "ArrowRight" || e.key === "PageDown" ? gNext : gPrev)();
          });
        } catch { /* 다른 주소면 무시 */ }
      });
      setTimeout(() => { f.src = p.dataset.src; $(".screen", p).appendChild(f); }, stack ? 0 : i * 350);
    });
  }
  $$(".phone[data-src]").forEach((p) => {
    const a = $(".open", p);
    if (a) { a.href = p.dataset.src; a.target = "_blank"; a.rel = "noopener"; }
  });
  let io = null;
  function observe() {
    if (io || !("IntersectionObserver" in window)) return;
    io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && loadPhones(e.target)), { rootMargin: "300px" });
    slides.forEach((s) => io.observe(s));
  }

  // ── 그리기 ──
  function revealAll(el) {
    $$("[data-in]", el).forEach((x) => x.classList.add("in"));
    $$("[data-count]", el).forEach(countUp);
    el.classList.add("active", "done");
  }
  const pad = (n) => String(n).padStart(2, "0");
  function render(enter) {
    if (stack) return;
    slides.forEach((el, k) => { el.classList.toggle("active", k === cur); el.classList.toggle("before", k < cur); el.classList.remove("done"); });
    const el = slides[cur];
    el.dataset.s = step;
    $$("[data-in]", el).forEach((x) => x.classList.toggle("in", step >= +x.dataset.in));
    $$("[data-step]", el).forEach((x) => x.classList.toggle("now", +x.dataset.step === step));
    el.classList.toggle("focus", $$("[data-step]", el).some((x) => +x.dataset.step === step));
    if (enter) $$("[data-count]", el).forEach((x) => (x._done = false));
    $$("[data-count]", el).forEach((x) => {
      const host = x.closest("[data-in]");
      if ((!host || host.classList.contains("in")) && !x._done) { x._done = true; countUp(x); }
    });
    if (el.querySelector(".phone[data-src]")) loadPhones(el);
    $("#tag").textContent = el.dataset.tag || "";
    stage.classList.toggle("bare", !el.dataset.tag);
    $("#pos").innerHTML = `<b>${pad(cur + 1)}</b> / ${pad(slides.length)}`;
    $("#bar").style.width = `${((cur + (el._max ? step / (el._max + 1) : 0) + 1) / slides.length) * 100}%`;
    $("#dots").innerHTML = el._max ? Array.from({ length: el._max + 1 }, (_, n) => `<i class="${n <= step ? "on" : ""}"></i>`).join("") : "";
    if (!PREVIEW) history.replaceState(null, "", `${location.search}#${cur + 1}${step ? "." + step : ""}`);
    bus?.post({ cur, step, max: el._max, total: slides.length });
  }
  let lock = 0;
  function go(n, s = 0) {
    const prev = cur;
    cur = Math.max(0, Math.min(slides.length - 1, n));
    step = Math.max(0, Math.min(s, slides[cur]._max));
    if (prev !== cur) lock = performance.now();
    render(prev !== cur);
  }
  const next = () => (step < slides[cur]._max ? go(cur, step + 1) : cur < slides.length - 1 && go(cur + 1, 0));
  const prev = () => (step > 0 ? go(cur, step - 1) : cur > 0 && go(cur - 1, slides[cur - 1]._max));
  const guard = (f) => () => { if (performance.now() - lock > 250) f(); };
  const gNext = guard(next), gPrev = guard(prev);
  window.deckGo = go;

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || stack) return;
    if (["INPUT", "TEXTAREA"].includes(e.target?.tagName)) return;
    const k = e.key;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); gNext(); }
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); gPrev(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1);
    else if (/^[1-9]$/.test(k)) go(+k - 1);
    else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    else if (k === "a" || k === "A") go(cur, slides[cur]._max);
    else if (k === "p" || k === "P") open("presenter.html", "timeslip-final-presenter", "width=1440,height=880");
  });
  $("#prev").onclick = gPrev;
  $("#next").onclick = gNext;
  let tx = null, ty = null;
  addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchend", (e) => {
    if (tx == null || stack) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? gNext : gPrev)();
    tx = null;
  });
  // 마우스를 움직일 때만 화살표 버튼
  let idle;
  addEventListener("mousemove", () => { document.body.classList.add("mouse"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.remove("mouse"), 2200); });

  const bus = PREVIEW ? null : makeBus();
  bus?.on((d) => {
    if (d.cmd === "next") next();
    else if (d.cmd === "prev") prev();
    else if (d.cmd === "go") go(d.cur, d.step || 0);
    else if (d.cmd === "hello") render(false);
  });

  // 시작 위치: 주소의 #장.단계
  const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
  if (m) { cur = Math.min(slides.length - 1, +m[1] - 1); step = Math.min(+(m[2] || 0), slides[cur]._max); }
  addEventListener("resize", fit);
  fit();
  render(true);
  if (stack && m) slides[cur].scrollIntoView();
})();
