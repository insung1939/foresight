/* Foresight 발표 엔진 — → / Space 다음 단계, ← 이전, F 전체화면, P 발표자 화면, A 현재 장 단계 전부, Home/End, 숫자키 1~9 해당 장.
   data-in="n" : n단계부터 보임 · tr[data-row] 표 줄 · data-step="n" : 그 단계에서 강조(시연 목록).
   숫자: data-b="meta 경로"(서버 실시간, 없으면 HTML 의 값 그대로) · data-count(장에 들어오면 올라감). */
const CONFIG = {
  team: ["5조", "김지환", "김현준", "오선호", "조인성", "채재희"], // 역할을 붙이려면 "이름 · 역할"
  service: "", // 비우면 지금 주소(같은 서비스의 /deck)
  github: "https://github.com/insung1939/foresight",
  swagger: "https://foresight-api-yda3.onrender.com/docs",
  api: "/api", // 같은 서비스의 API(Vercel rewrite / vite proxy)
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $("#stage");
const slides = $$(".slide");
const PARTS = ["문제", "해결", "시스템 · AI", "품질 · UX", "마무리"];
let cur = 0, step = 0, meta = null;

const maxStep = (el) => Math.max(+el.dataset.steps || 0, ...$$("[data-in],[data-row]", el).map((x) => +(x.dataset.in || x.dataset.row) || 0));
slides.forEach((el) => (el._max = maxStep(el)));

// ── 화면 맞춤(1600×900 을 화면에 꽉) ──
function fit() {
  const k = Math.min(innerWidth / 1600, innerHeight / 900);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener("resize", fit);
fit();

$("#parts").innerHTML = PARTS.map((p, i) => `<span data-p="${i + 1}">${i + 1}. ${p}</span>`).join("");

function render(enter) {
  slides.forEach((el, k) => {
    el.classList.toggle("active", k === cur);
    el.classList.toggle("before", k < cur);
  });
  const el = slides[cur];
  el.dataset.s = step;
  for (let n = 1; n <= el._max; n++) el.classList.toggle("s" + n, n <= step);
  $$("[data-in]", el).forEach((x) => x.classList.toggle("in", step >= +x.dataset.in));
  $$("tr[data-row]", el).forEach((x) => x.classList.toggle("in", step >= +x.dataset.row));
  $$("[data-step]", el).forEach((x) => x.classList.toggle("now", +x.dataset.step === step));
  // 숫자 올라가기: 장에 들어올 때, 보이는 것만
  $$("[data-count]", el).forEach((x) => {
    const host = x.closest("[data-in]");
    const vis = !host || host.classList.contains("in");
    if (vis && !x._done) {
      x._done = true;
      countUp(x);
    }
  });
  const part = +el.dataset.part || 0;
  $$("#parts span").forEach((s) => {
    const p = +s.dataset.p;
    s.classList.toggle("on", p === part);
    s.classList.toggle("done", p < part);
  });
  stage.dataset.mood = el.dataset.mood || "1";
  stage.classList.toggle("bare", part === 0);
  $("#pos").textContent = `${cur + 1} / ${slides.length}`;
  $("#bar").style.width = `${((cur + (el._max ? step / (el._max + 1) : 0)) / (slides.length - 1)) * 100}%`;
  $("#dots").innerHTML = el._max ? Array.from({ length: el._max + 1 }, (_, n) => `<i class="${n <= step ? "on" : ""}"></i>`).join("") : "";
  history.replaceState(null, "", `#${cur + 1}${step ? "." + step : ""}`);
  hooks[el.id]?.(el, step, enter);
  sync?.postMessage({ cur, step, max: el._max, total: slides.length, title: el.dataset.title, next: slides[cur + 1]?.dataset.title || "끝", notes: $(".notes", el)?.textContent.trim() || "" });
}

let lock = 0;
function go(n, s = 0) {
  const prev = cur;
  cur = Math.max(0, Math.min(slides.length - 1, n));
  step = Math.max(0, Math.min(s, slides[cur]._max));
  if (prev !== cur) {
    leave[slides[prev].id]?.();
    $$("[data-count]", slides[cur]).forEach((x) => (x._done = false));
    lock = performance.now(); // 전환 중 연타로 장이 건너뛰지 않게
  }
  render(prev !== cur);
}
const next = () => (step < slides[cur]._max ? go(cur, step + 1) : cur < slides.length - 1 && go(cur + 1, 0));
const prev = () => (step > 0 ? go(cur, step - 1) : cur > 0 && go(cur - 1, slides[cur - 1]._max));
const guarded = (f) => () => {
  if (performance.now() - lock < 280) return;
  f();
};
const gNext = guarded(next), gPrev = guarded(prev);
window.deckGo = go;

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  const k = e.key;
  if (["ArrowRight", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); gNext(); }
  else if (["ArrowLeft", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); gPrev(); }
  else if (k === "Home") go(0);
  else if (k === "End") go(slides.length - 1);
  else if (/^[1-9]$/.test(k)) go(+k - 1);
  else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  else if (k === "a" || k === "A") go(cur, slides[cur]._max);
  else if ((k === "p" || k === "P") && sync) open("presenter.html", "presenter", "width=1400,height=860");
}
addEventListener("keydown", onKey);
$("#prev").onclick = gPrev;
$("#next").onclick = gNext;
let tx = null;
addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
addEventListener("touchend", (e) => {
  if (tx == null) return;
  const d = e.changedTouches[0].clientX - tx;
  if (Math.abs(d) > 50) (d < 0 ? gNext : gPrev)();
  tx = null;
});

// 발표자 화면: P 로 열면 두 창이 같은 장·단계를 따라간다
const sync = window === top ? new BroadcastChannel("foresight-deck") : null;
if (sync)
  sync.onmessage = ({ data: d }) => {
    if (d.cmd === "next") next();
    else if (d.cmd === "prev") prev();
    else if (d.cmd === "go") go(d.cur, d.step);
    else if (d.cmd === "hello") render(false);
  };

// ── 숫자 ──
function countUp(x) {
  const to = +x.dataset.count, dec = +(x.dataset.dec || 0), suf = x.dataset.suf || "", t0 = performance.now(), dur = 1400;
  const f = (t) => {
    const p = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - p, 3));
    x.textContent = (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("ko-KR")) + suf;
    if (p < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const FMT = {
  int: (v) => Math.round(v).toLocaleString("ko-KR"),
  pct1: (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`,
  pct0: (v) => `${Math.round(v * 100)}%`,
};

// ── 장별 동작 ──
const hooks = {}, leave = {};

// 유튜버 자극어 막대 · 유튜버별 적중률 점
const FALLBACK = {
  hype: [{ word: "놓치면", n: 407, avg: -0.1803 }, { word: "무조건", n: 203, avg: -0.1333 }, { word: "폭등", n: 620, avg: -0.0987 }, { word: "100배", n: 60, avg: -0.0956 }, { word: "폭발", n: 137, avg: -0.0723 }],
  channels: [0.613, 0.588, 0.587, 0.578, 0.557, 0.535, 0.522, 0.521, 0.521, 0.514, 0.504, 0.496, 0.493, 0.485, 0.48, 0.474, 0.471, 0.471, 0.462, 0.433, 0.394, 0.384, 0.349, 0.337, 0.33, 0.287].map((hit, i) => ({ hit, n: [31, 34, 196, 263, 61, 129, 429, 1228, 213, 780, 115, 125, 377, 33, 202, 38, 418, 223, 65, 642, 33, 1306, 43, 86, 1861, 574][i] })),
};
function drawEvidence() {
  const hype = meta?.text?.hype?.byWord?.slice(0, 5) || FALLBACK.hype;
  const max = Math.max(...hype.map((h) => Math.abs(h.avg)), 0.01);
  $("#hype").innerHTML = hype
    .map((h) => `<div class="r"><span>‘${h.word}’<small>${h.n.toLocaleString("ko-KR")}개 영상</small></span><span class="t"><i style="--w:${(Math.abs(h.avg) / max) * 100}%"></i></span><span class="v">${FMT.pct1(h.avg)}</span></div>`)
    .join("");
  const ch = meta?.summary?.hindsight?.channels || FALLBACK.channels;
  $("#strip").querySelectorAll("i").forEach((x) => x.remove());
  ch.forEach((c, i) => {
    const d = document.createElement("i");
    const s = 10 + Math.min(c.n / 90, 18);
    Object.assign(d.style, { left: `${c.hit * 100}%`, width: `${s}px`, height: `${s}px`, transitionDelay: `${i * 30}ms` });
    if (c.hit > 0.5) d.className = "g";
    $("#strip").appendChild(d);
  });
  setText("hsGood", ch.filter((c) => c.hit > 0.5).length);
  setText("hsN", ch.length);
}
hooks.evidence = (el, s) => {
  $("#hype").closest(".card").classList.toggle("go", s >= 1);
  $("#hype").classList.toggle("go", s >= 1);
};
function setText(key, v) {
  $$(`[data-b="${key}"]`).forEach((x) => (x.textContent = v));
}

// 시연: 진짜 앱을 휴대폰 틀 안에. 앱 안에 초점이 있어도 ←/→ 는 발표가 받는다(같은 주소라 가능)
const app = $("#app");
hooks.demo = () => {
  if (!app.src) app.src = `${location.origin}/#/`;
};
app.addEventListener("load", () => {
  try {
    app.contentWindow.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp"].includes(e.key) && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault();
        (e.key === "ArrowRight" || e.key === "PageDown" ? gNext : gPrev)();
      }
    });
  } catch { /* 다른 주소면 무시 */ }
});

// 아키텍처: 상자 위치를 재서 연결선을 정확히 그린다(상자 가장자리 → 가장자리)
function drawArch() {
  const box = $(".arch"), svg = $("#archsvg");
  if (!box || !svg) return;
  const k = box.getBoundingClientRect().width / box.offsetWidth || 1; // 무대 확대 비율
  const B = box.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${box.offsetWidth} ${box.offsetHeight}`);
  const R = (n) => {
    const r = $(`[data-node="${n}"]`, box).getBoundingClientRect();
    return { x: (r.left - B.left) / k, y: (r.top - B.top) / k, w: r.width / k, h: r.height / k };
  };
  $$("path.ln", svg).forEach((p) => {
    const a = R(p.dataset.a), b = R(p.dataset.b);
    const ax = a.x + a.w, ay = a.y + a.h / 2;
    const bx = b.x, by = b.y + b.h / 2;
    const [x1, y1, x2, y2] = ax <= bx ? [ax, ay, bx, by] : [a.x, ay, b.x + b.w, by];
    const mx = (x1 + x2) / 2;
    p.setAttribute("d", `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
  });
}
hooks.arch = () => { requestAnimationFrame(drawArch); setTimeout(drawArch, 950); }; // 등장 애니메이션이 끝난 뒤 한 번 더
addEventListener("resize", () => slides[cur].id === "arch" && drawArch());

// 마무리: 오늘의 챌린지 랭킹(4초마다)
let lbTimer = null;
const MEDAL = ["🥇", "🥈", "🥉", "4", "5"];
async function drawBoard() {
  try {
    const r = await fetch(`${CONFIG.api}/v1/live?scope=daily`).then((x) => x.json());
    const rows = (r.leaders || []).slice(0, 5);
    $("#lb").innerHTML = rows.length
      ? rows.map((x, i) => `<div class="card r ${i === 0 ? "p1" : ""}"><span class="m">${MEDAL[i]}</span><span>${esc(x.nickname)}</span><small>🎯 ${x.hits}/10 · ${x.grade}</small><span class="${x.ret >= 0 ? "up" : "down"}">${x.ret >= 0 ? "▲" : "▼"} ${FMT.pct1(x.ret)}</span></div>`).join("")
      : `<div class="card empty">아직 완주한 사람이 없어요 — QR 로 지금 참여!</div>`;
  } catch {
    /* 서버가 없으면 그대로 */
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
hooks.end = () => {
  drawBoard();
  clearInterval(lbTimer);
  lbTimer = setInterval(drawBoard, 4000);
};
leave.end = () => clearInterval(lbTimer);

// ── 표지: 팀·QR·주소 ──
const service = CONFIG.service || location.origin;
$("#team").innerHTML = (CONFIG.team.length ? CONFIG.team : ["KAIST 디지털금융MBA · 금융빅데이터분석실습"]).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
try {
  const q = qrcode(0, "M");
  q.addData(service);
  q.make();
  $("#qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  $("#qr2").innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
} catch {
  $("#qr").textContent = service;
}
$("#links").innerHTML = [
  ["🌐 서비스", service],
  ["💻 GitHub", CONFIG.github],
  ["🧪 Swagger", CONFIG.swagger || (CONFIG.service ? "" : `${location.origin.replace(/:\d+$/, ":8000")}/docs`)],
]
  .filter(([, v]) => v)
  .map(([k, v]) => `<div><b>${k}</b>${esc(v.replace(/^https?:\/\//, ""))}</div>`)
  .join("");

// ── 서버 숫자로 덮어쓰기(없으면 HTML 값 그대로) ──
async function loadMeta() {
  try {
    meta = await fetch(`${CONFIG.api}/v1/meta`).then((r) => (r.ok ? r.json() : null));
  } catch {
    meta = null;
  }
  if (meta) {
    $$("[data-b]").forEach((x) => {
      const v = get(meta, x.dataset.b);
      if (typeof v === "number") x.textContent = FMT[x.dataset.fmt]?.(v) ?? String(v);
    });
    const ev = meta.aiEval || [];
    if (ev.length) {
      const pc = (e) => `${Math.round((e.pass / Math.max(e.called, 1)) * 100)}%`;
      setText("evalFirst", pc(ev[0]));
      setText("evalLast", ev.length > 1 ? pc(ev[ev.length - 1]) : "—");
    }
  }
  drawEvidence();
}
loadMeta();

// 시작: 주소의 #장.단계
const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
go(m ? +m[1] - 1 : 0, m && m[2] ? +m[2] : 0);
requestAnimationFrame(() => document.body.classList.add("ready"));
