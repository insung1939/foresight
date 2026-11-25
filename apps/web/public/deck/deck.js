/* 타임슬립 개미 — 5주차 아이디어 공유 발표 엔진 (빌드 없음, 정적 파일)
   키: → / Space 다음 단계 · ← 이전 · F 전체화면 · P 발표자 화면 · A 이 장 단계 전부 · Home/End · 숫자 1~9
   data-in="n"  : n단계부터 보임  ·  data-step="n" : 그 단계에서 강조
   data-b="경로|형식" : DATA(아래, /v1/meta 값)에서 숫자를 채움 · data-count : 장에 들어오면 숫자가 올라감
   주소 바꾸기: 아래 CONFIG 하나만 고치면 화면·QR·발표자 화면이 모두 따라간다. */

// ───────────────────────── 주소 · 팀 (여기만 고치면 됨) ─────────────────────────
const CONFIG = {
  service: "https://foresight-rho-teal.vercel.app",
  github: "https://github.com/insung1939/foresight",
  swagger: "https://foresight-api-yda3.onrender.com/docs",
  deck: "https://foresight-rho-teal.vercel.app/deck/index.html",
  api: "/api", // 같은 서비스의 API(Vercel rewrite · vite proxy). 실패하면 아래 DATA 값 그대로
  team: { name: "2조", members: ["김지환", "김현준", "오선호", "조인성", "채재희"], presenter: "" },
  // 프로토타입 장의 휴대폰 화면(같은 서비스의 상대 주소)
  screens: [
    { src: "/#/", label: "홈", sub: "개미 고르기 · 시즌 선택" },
    { src: "/#/demo", label: "플레이", sub: "연습 시즌 · 다음 주 ▶" },
    { src: "/#/rank", label: "랭킹", sub: "오늘의 시드" },
    { src: "/#/data", label: "데이터", sub: "분석 결과 공개" },
  ],
  targetSec: 320, // 목표 발표 시간 5:20 (허용 5:00~5:45)
};

// ───────────────────────── 숫자 (2026-11-21 로컬 /v1/meta 값. 열릴 때 서버 값으로 덮어씀) ─────────────────────────
const DATA = {
  source: { channels: 51, videos: 49299, mentions: 54323, prices: 317251, disclosures: 53980 },
  quality: { ragIndexed: 1429, ragTotal: 10003 },
  pack: { weeks: 66, playable: 31, from: "2025-10-13", to: "2026-11-16", assets: { KRX: 110, US: 30, CRYPTO: 30 }, channels: 47 },
  hype: {
    "0건": { n: 5540, mean: 0.01015, win: 0.4639 },
    "1~2건": { n: 2182, mean: -0.00284, win: 0.4267 },
    "3~9건": { n: 1067, mean: -0.01469, win: 0.418 },
    "10건 이상": { n: 901, mean: -0.00643, win: 0.4451 },
  },
  all: { n: 9690, mean: 0.00295, win: 0.4487 },
  momentum: { afterJump: { n: 719, mean: 0.01549, median: -0.00889, win: 0.4659 }, afterDrop: { n: 507, mean: -0.0053, win: 0.432 } },
  ghosts: { kospi: 0.3082, n: 47, beat: 5, hist: [[-100, 1], [-75, 4], [-50, 16], [-25, 12], [0, 9], [25, 2], [50, 1], [75, 2]] },
};

// ───────────────────────── 발표 대본 (docs/script.md 와 같은 내용. segs[k] = k단계에서 할 말) ─────────────────────────
const NOTES = [
  { id: "cover", title: "표지 · 그때로 돌아가면", sec: 15, segs: [
    "안녕하세요, 2조입니다. '그때 그 종목 샀으면 지금 부자일 텐데', 한 번쯤 생각해 보셨죠? [한 박자 쉬고] 그 질문을 게임으로 만들었습니다. 「타임슬립 개미」입니다.",
  ] },
  { id: "problem", title: "대상 사용자와 문제", sec: 25, segs: [
    "대상은 유튜브로 투자를 배우는 초보 개인투자자, 주린이 개미입니다. 주식 정보를 얻는 곳 1위가 유튜브, 37.4%입니다.",
    "[클릭] 문제는 세 가지입니다. 첫째, 지나고 보면 다 쉬워 보입니다.",
    "[클릭] 둘째, '무조건 오른다' 영상에 흔들립니다.",
    "[클릭] 셋째, 실전에서 배우면 수업료가 비쌉니다. 그래서 잃지 않고 흔들려 볼 곳이 필요합니다.",
  ] },
  { id: "facts", title: "우리 데이터로 본 사실", sec: 35, segs: [
    "정말 그때로 가면 쉬울까요? 지난 학기 hindsight에서 모은 1년치 데이터로 확인했습니다.",
    "[클릭] 유튜버 47명의 '오른다'를 그대로 따라 샀다면, 코스피 +30.8%를 이긴 건 5명뿐입니다.",
    "[클릭] 언급 0건 종목은 다음 주 +1.02%, 10건 넘게 언급된 종목은 −0.64%. 화제가 클수록 덜 올랐습니다.",
    "[클릭] 15% 급등한 다음 주, 오른 건 47%. 동전 던지기입니다. 지나고 보면 쉽지만 그 순간엔 어렵다, 이게 출발점입니다.",
  ] },
  { id: "loop", title: "해결 · 핵심 루프", sec: 30, segs: [
    "1,000만 원과 폰 하나로 실제 과거 시장에 떨어집니다. 한 턴은 실제 1주. 월요일 피드에서 영상 제목과 화제성을 보고 사고판 뒤 '다음 주'를 누르면, 그 주 실제 가격으로 결과가 나옵니다. 한 판은 기본 12주, 5분이고 길게 하려면 24주도 고를 수 있습니다. 첫 판은 8주 연습입니다.",
    "[클릭] 종목은 '반도체 A' 같은 코드네임이라 기억으로 못 이깁니다. 라이벌은 유튜버 고스트와 코스피, 멘탈이 0이면 패닉셀. 시작하면 이길 유튜버 목표가 정해지고, 수익률 선을 넘을 때마다 가구 상자가 열립니다.",
  ] },
  { id: "refs", title: "레퍼런스에서 가져온 재미", sec: 20, segs: [
    "재미는 세 게임에서 원리만 가져왔습니다.",
    "[클릭] 킥루에서 버튼 하나로 굴러가는 템포,",
    "[클릭] 전염병 주식회사에서 눈에 보이는 확산, 언급 수만큼 개미가 몰리는 화제 광장,",
    "[클릭] 키자니아에서 역할놀이, '증권사 첫 출근' 연습 시즌입니다. 행운 카드는 발라트로처럼 쉬운 운 요소로 넣었습니다.",
  ] },
  { id: "proto", title: "UI 프로토타입 · 시연", sec: 60, segs: [
    "프로토타입입니다. 이 화면들은 그림이 아니라 실제 앱입니다. [화면 로딩 확인]",
    "[클릭: 홈 강조] 홈에서 개미를 골라 시즌을 시작합니다. 처음 오면 1분짜리 게임 방법이 먼저 뜨고, 로그인 없이 바로 하고 자동 저장됩니다.",
    "[클릭: 플레이 강조] [시연: 행운 카드 뒤집기 → 종목 눌러 범고래 박사에게 '왜 화제야?' → 매수 → 다음 주 ▶] 카드를 뒤집고, 박사에게 묻고, 사고 나서 '다음 주'를 누르면 실제 수익과 라이벌 순위가 바뀝니다.",
    "[클릭: 랭킹 강조] 끝나면 오늘의 시드 순위에 오르고, 지난 날짜와 명예의 전당도 봅니다.",
    "[클릭: 데이터 강조] 데이터 페이지에서는 앞의 분석을 누구나 봅니다. 모두 휴대폰에서 됩니다.",
  ] },
  { id: "flow", title: "한 판의 흐름 · UX 원칙", sec: 20, segs: [
    "한 판은 개미 고르기, 피드, 사고팔기, 다음 주로 흘러갑니다. 평범한 주는 3초 리캡으로 넘기고, 결산 별로 3D 방을 꾸미고 개미를 직접 걷게 한 뒤 한 판 더로 돌아옵니다.",
    "[클릭] 수업의 UI/UX 용어집을 적용했습니다. 바텀시트, 점진적 공개, 자동 저장, 그리고 색과 세모를 함께 씁니다.",
  ] },
  { id: "data", title: "데이터 확보 · 분석 방향", sec: 25, segs: [
    "데이터는 지난 학기에 만든 hindsight DB를 그대로 씁니다.",
    "[클릭] 유튜브 51개 채널, 영상 4만 9천 편, 언급 5만 4천 건, 시세 31만 행입니다.",
    "[클릭] 이름과 날짜를 가리고 주봉으로 바꿔 66주, 170종목 시즌 팩을 만듭니다. 암호화해서 서버가 한 주씩만 엽니다.",
    "[클릭] 8주차엔 플레이 기록으로 '사람이 유튜버보다 덜 흔들리나'를 봅니다.",
  ] },
  { id: "ai", title: "AI 활용 계획 · LLM · RAG · 에이전트", sec: 35, segs: [
    "AI 활용의 원칙은 하나, AI도 그때까지의 정보만 압니다.",
    "[클릭] 범고래 박사에게 '왜 화제야?'라고 물으면 그 주까지의 문서만 pgvector에서 찾습니다. 미래 문서는 SQL에서 걸러지고, Gemini가 출처와 함께 답합니다.",
    "[클릭] 답은 검증합니다. 인용이 실제로 있는지, 권유나 진짜 이름이 없는지. 짓궂은 질문 30개로 시험했더니 화면에 나간 문제 답은 0개였습니다.",
    "[클릭] 비서와 결산 코치는 지금 동작합니다. 다음은 비서가 검색·시세 도구를 직접 골라 쓰는 에이전트입니다.",
  ] },
  { id: "arch", title: "아키텍처 · 기술 스택", sec: 20, segs: [
    "구조는 수업에서 배운 그대로, 화면은 React와 Vercel, API는 FastAPI와 Render, DB는 Supabase와 pgvector, AI는 Gemini입니다.",
    "[클릭] 핵심은 미래 정보 차단. 미래 가격은 서버에만 있고, 행동을 내야 다음 주가 열립니다. 랭킹도 서버가 다시 계산합니다.",
  ] },
  { id: "road", title: "차별화 · 8주차 로드맵", sec: 25, segs: [
    "모의투자는 결과를 기다려야 하고, 투자 게임은 데이터가 가짜입니다. 저희는 실제 과거로 바로 결과를 보고, 유튜버와 겨룹니다.",
    "[클릭] 8주차까지는 6주차 사용성 테스트와 에이전트, 7주차 밸런스와 색인 확장, 8주차 성능·보안 점검과 시연 순서로 완성하겠습니다.",
  ] },
  { id: "end", title: "마무리 · QR", sec: 10, segs: [
    "그때로 가 보면 어떨지, QR로 직접 해 보세요. 감사합니다. [질문 받기 — 이 화면을 띄워 둔 채로]",
  ] },
];

const QA = [
  ["실제 과거 데이터면, 그때 일을 기억하는 사람이 유리하지 않나요?", "종목은 판마다 새로 섞는 코드네임으로 가리고, 시작 주도 45가지 중 무작위입니다. 영상 제목 속 날짜·'3월'·'추석' 같은 시점 단서와 제품·공장 이름도 지우고, 매 턴 테스트로 검사합니다. 정체는 결산 때만 공개합니다."],
  ["투자 권유나 규제 문제는 없나요?", "지나간 데이터로 하는 시뮬레이션이고 실시간 추천 기능은 없습니다. 결산 전까지 실제 종목명을 보여 주지 않고, AI 답변도 검증 단계에서 '사라·팔아라' 같은 권유 문장을 막습니다."],
  ["유튜버 고스트는 어떻게 계산하나요?", "각 채널이 지난주 영상에서 '오른다'고 한 종목을 이번 주에 똑같은 비중으로 나눠 샀다고 보고 주간 수익을 이어 붙였습니다. 언급이 없는 주는 현금입니다. 활동한 주가 8주 이상인 47개 채널만 씁니다."],
  ["RAG가 미래 정보를 안 쓴다는 걸 어떻게 보장하나요?", "현재 주차는 클라이언트가 아니라 서버의 판 상태에서 가져오고, 검색 SQL에 week ≤ 현재 주 조건을 겁니다. 미래 문서는 모델에 들어가지도 않습니다. 이 조건은 자동 테스트로 매번 확인합니다."],
  ["1년치 데이터로 충분한가요? 통계는 일반화할 수 있나요?", "한 해의 결과라 일반화에는 한계가 있습니다. 그래서 '교훈'이 아니라 '경험'으로 보여 줍니다. 게임으로는 12주 시즌, 45가지 시작점, 170종목 코드네임 조합이라 매 판이 다르고, hindsight 수집이 계속되면 기간이 늘어납니다."],
  ["결국 운 아닌가요? 실력이 드러나나요?", "실제 주가는 한 주 단위로 보면 거의 무작위라, 맞히기보다 버티기를 평가합니다. 멘탈 관리, 분산, 전략 카드를 잘 쓰면 미션과 칭호로 드러나고, 코스피 ETF로 '그냥 시장 사기'와도 비교됩니다. 운은 행운 카드처럼 재미로만 넣었습니다."],
  ["수익 모델은요?", "가장 현실적인 건 B2B 금융교육입니다. 증권사 신규 고객 온보딩이나 학교·기관 수업에서 반별 리그로 쓰는 방식이고, 개인은 무료에 방 꾸미기 같은 코스메틱 과금을 생각하고 있습니다."],
  ["한 판이 왜 12주인가요?", "처음엔 26주(반년)였는데, 지인 테스트에서 3~4주차에 그만두는 사람이 많았습니다. 그래서 메인 시즌을 12주, 약 5분으로 줄였습니다. 시작점은 31개에서 45개로 늘어 판마다 더 다양해졌고, 수익률 상자 선도 +3·7·14·25%로 12주에 맞췄습니다. 길게 하고 싶은 사람은 자유 플레이에서 24주를 고를 수 있습니다. 처음 온 사람에게는 1분짜리 게임 방법이 먼저 뜹니다."],
];

// 발표 창 ↔ 발표자 화면 연결(BroadcastChannel, 없으면 localStorage)
function makeBus(name = "timeslip-deck") {
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
  }
  bind();
  if (!PREVIEW) {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 6000);
    fetch(`${CONFIG.api}/v1/meta`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m || !m.ghosts) return;
        for (const k of ["source", "pack", "hype", "all", "momentum", "ghosts", "quality"]) if (m[k]) DATA[k] = m[k];
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
    else if (k === "p" || k === "P") open("presenter.html", "timeslip-presenter", "width=1440,height=880");
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
