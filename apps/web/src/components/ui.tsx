// 공용 부품: 숫자 카운트업 · 등락 · 스파크라인 · 선 그래프 · 멘탈 게이지 · 바텀시트 · 모달 · 토스트 · 상태(로딩/오류) · 상단 바
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Component, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { arrow, pct, tone } from "../lib/format";
import { go, type Route } from "../lib/router";
import { onSound, setSound, soundOn } from "../lib/sfx";

/** 숫자가 올라가며 바뀐다. 보조기술에는 최종값만 읽힌다 */
export function CountUp({ to, from = 0, format, duration = 1, delay = 0 }: { to: number; from?: number; format: (n: number) => string; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt.current(to);
      return;
    }
    el.textContent = fmt.current(from);
    const a = animate(from, to, { duration, delay, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = fmt.current(v)) });
    return () => a.stop();
  }, [to, from, duration, delay, reduce]);
  return (
    <span className="countup">
      <span ref={ref} aria-hidden />
      <span className="sr-only">{format(to)}</span>
    </span>
  );
}

/** ▲ +12.3% — 색만으로 말하지 않도록 기호를 같이 */
export function Delta({ x, digits = 1, className = "" }: { x: number; digits?: number; className?: string }) {
  const k = 10 ** (digits + 2);
  const r = Math.round(x * k) / k;
  return (
    <span className={`delta ${tone(r)} ${className}`}>
      <span aria-hidden>{arrow(r)} </span>
      {pct(r, digits)}
    </span>
  );
}

/** 작은 추세선. 마지막 점이 지금 */
export function Spark({ data, w = 72, h = 28, strokeWidth = 2 }: { data: number[]; w?: number; h?: number; strokeWidth?: number }) {
  if (data.length < 2) return <svg width={w} height={h} aria-hidden />;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - 4) + 2, h - 3 - ((v - lo) / span) * (h - 6)]);
  const t = tone(data[data.length - 1] / data[0] - 1);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`spark ${t}`} aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.6} />
    </svg>
  );
}

export interface Series {
  data: number[];
  label: string;
  cls: string; // 색 클래스(line-me, line-yt1 …)
  dash?: boolean;
  bold?: boolean;
}

/** 여러 줄 선 그래프(가로 = 주, 세로 = 1.0 기준 배수). 화면 폭에 맞춰 늘어난다 */
export function LineChart({ series, h = 200, base = 1, fmt = (v: number) => pct(v - 1, 0), xLabel }: { series: Series[]; h?: number; base?: number; fmt?: (v: number) => string; xLabel?: (i: number) => string }) {
  const W = 600;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.data);
  const lo = Math.min(base, ...all);
  const hi = Math.max(base, ...all);
  const span = hi - lo || 0.01;
  const n = Math.max(...series.map((s) => s.data.length));
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (h - pad.t - pad.b);
  const ticks = [lo, base, hi].filter((v, i, a) => a.findIndex((u) => Math.abs(u - v) < span * 0.08) === i);
  const title = useId();
  return (
    <figure className="linechart">
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" role="img" aria-labelledby={title}>
        <title id={title}>{series.map((s) => `${s.label} ${fmt(s.data[s.data.length - 1])}`).join(", ")}</title>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === base ? "grid base" : "grid"} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
              {fmt(v)}
            </text>
          </g>
        ))}
        {xLabel && (
          <>
            <text x={pad.l} y={h - 6} className="tick">
              {xLabel(0)}
            </text>
            <text x={W - pad.r} y={h - 6} textAnchor="end" className="tick">
              {xLabel(n - 1)}
            </text>
          </>
        )}
        {series.map((s) => (
          <polyline
            key={s.label}
            className={`line ${s.cls} ${s.dash ? "dash" : ""} ${s.bold ? "bold" : ""}`}
            points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.label} className={`key ${s.cls}`}>
            <i aria-hidden /> {s.label} <b>{fmt(s.data[s.data.length - 1])}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** 멘탈: 얼굴 + 막대. 30 아래면 경고 */
export const mood = (m: number) => (m >= 80 ? "😎" : m >= 60 ? "🙂" : m >= 40 ? "😐" : m >= 20 ? "😰" : "😱");
export function Mental({ value, compact }: { value: number; compact?: boolean }) {
  return (
    <div className={`mental ${value < 30 ? "low" : ""} ${compact ? "compact" : ""}`} data-ux="Meter · Gauge" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="멘탈">
      <span className="face" aria-hidden>
        {mood(value)}
      </span>
      <span className="bar">
        <motion.i initial={false} animate={{ width: `${value}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </span>
      {!compact && <b>{value}</b>}
    </div>
  );
}

/** 바텀시트: 휴대폰에선 아래에서 올라오고, 넓은 화면에선 가운데 창. Esc·배경 누르면 닫힘, 포커스는 안에 가둔다 */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("[data-autofocus], button, [href], input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const f = el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("noscroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("noscroll");
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-root">
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            className={`sheet ${wide ? "wide" : ""}`}
            data-ux="Bottom Sheet · Focus Trap · Swipe to Dismiss"
            role="dialog"
            aria-modal
            aria-labelledby={titleId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => {
              if (i.offset.y > 120 || i.velocity.y > 600) onClose();
            }}
          >
            <div className="grip" aria-hidden />
            <header className="sheet-head">
              <h2 id={titleId}>{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="닫기">
                ✕
              </button>
            </header>
            <div className="sheet-body">{children}</div>
            {footer && <footer className="sheet-foot">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** 가운데 창(닫기 버튼 없음 — 반드시 하나를 골라야 하는 사건·결과용) */
export function Modal({ open, children, label }: { open: boolean; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("noscroll");
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus], button")?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove("noscroll");
    };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="modal-root">
          <motion.div className="scrim dark" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            ref={ref}
            className="modal"
            data-ux="Modal Dialog · 반드시 고르기"
            role="dialog"
            aria-modal
            aria-label={label}
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- 토스트
type ToastItem = { id: number; text: string; action?: { label: string; run: () => void }; tone?: "ok" | "warn" };
let toasts: ToastItem[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export function toast(text: string, opt?: { action?: ToastItem["action"]; tone?: ToastItem["tone"]; ms?: number }) {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, text, action: opt?.action, tone: opt?.tone }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, opt?.ms ?? 3200);
}
export function Toasts() {
  const list = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite" data-ux="Toast · Undo">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} className={`toast ${t.tone ?? ""}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  toasts = toasts.filter((x) => x.id !== t.id);
                  emit();
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- 상태
export function Skeleton({ w = "100%", h = 16, r = 8 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}

export function Loading({ slow, label = "불러오는 중…" }: { slow?: boolean; label?: string }) {
  return (
    <div className="loading" role="status" aria-busy data-ux="Loading State · Skeleton">
      <div className="ant-walk" aria-hidden>
        🐜
      </div>
      <p className="muted">{slow ? "서버를 깨우는 중이에요. 처음 접속하면 30초쯤 걸려요." : label}</p>
      <div className="loading-skel" aria-hidden>
        <Skeleton h={64} r={16} />
        <Skeleton h={64} r={16} />
        <Skeleton h={64} r={16} />
      </div>
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert" data-ux="Error State · Retry">
      <div className="state-icon" aria-hidden>
        🐜💦
      </div>
      <h2>{title}</h2>
      {detail && <p className="muted">{detail}</p>}
      <div className="state-actions">
        {onRetry && (
          <button className="btn primary" onClick={onRetry}>
            다시 시도
          </button>
        )}
        <button className="btn ghost" onClick={() => go("/")}>
          홈으로
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err)
      return (
        <main className="page">
          <ErrorState
            title="화면을 그리다 문제가 생겼어요"
            detail="진행 상황은 서버에 저장돼 있어요. 다시 열면 이어서 할 수 있어요."
            onRetry={() => {
              this.setState({ err: null });
              window.location.reload();
            }}
          />
        </main>
      );
    return this.props.children;
  }
}

// ---------------------------------------------------------------- 상단 바
// ---------------------------------------------------------------- UX 렌즈: 화면 위에 11주차 용어집 용어를 띄운다(발표 시연용, 단축키 U)
const LENS = "ant:lens:v1";
const lensSubs = new Set<(v: boolean) => void>();
let lensOn = false;
try {
  lensOn = localStorage.getItem(LENS) === "1";
} catch {
  /* 무시 */
}
export function setLens(v: boolean) {
  lensOn = v;
  document.body.classList.toggle("ux-lens", v);
  try {
    localStorage.setItem(LENS, v ? "1" : "0");
  } catch {
    /* 무시 */
  }
  lensSubs.forEach((f) => f(v));
}
export const lensIsOn = () => lensOn;
export function LensToggle() {
  const [on, setOn] = useState(lensOn);
  useEffect(() => {
    document.body.classList.toggle("ux-lens", lensOn);
    lensSubs.add(setOn);
    return () => {
      lensSubs.delete(setOn);
    };
  }, []);
  return (
    <button className={`icon-btn lens-btn ${on ? "on" : ""}`} onClick={() => setLens(!on)} aria-pressed={on} aria-label={on ? "UX 렌즈 끄기" : "UX 렌즈 켜기: 화면에 쓰인 UI/UX 용어 보기"} title="UX 렌즈(U)">
      👓
    </button>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSound(setOn), []);
  return (
    <button className="icon-btn" onClick={() => setSound(!on)} aria-pressed={on} aria-label={on ? "소리·진동 끄기" : "소리·진동 켜기"} title="소리·진동">
      {on ? "🔊" : "🔈"}
    </button>
  );
}

export function Logo() {
  return (
    <a href="#/" className="logo" aria-label="타임슬립 개미 홈">
      <span className="logo-mark" aria-hidden>
        🐜
      </span>
      <span className="logo-text">
        타임슬립 <b>개미</b>
      </span>
    </a>
  );
}

const NAV: [Route, string][] = [
  ["/", "홈"],
  ["/rank", "랭킹"],
  ["/data", "데이터"],
  ["/team", "팀"],
];

export function TopBar({ route }: { route: Route }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Logo />
        <nav aria-label="주 메뉴">
          {NAV.map(([r, label]) => (
            <a key={r} href={`#${r}`} className={route === r ? "on" : ""} aria-current={route === r ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <LensToggle />
        <SoundToggle />
      </div>
    </header>
  );
}
