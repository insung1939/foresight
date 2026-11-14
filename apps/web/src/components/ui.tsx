// 작은 공용 부품: 로고, 배경, 전광판, 도장, 숫자 카운트업, 진행 막대, 스켈레톤, 오류, 상단 바, 하단 고정 바, 축하 효과, 이름 공개
import { animate, motion, useReducedMotion } from "motion/react";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { arrow, pct, tone } from "../lib/format";
import { go, type Route } from "../lib/router";
import { Owl } from "./Buddy";
import { SoundToggle } from "./Cheers";
import { displayName, useSession } from "../lib/auth";

/** 숫자가 올라가며 바뀐다. 접근성 도구에는 최종값만 읽힌다 */
export function CountUp({
  to,
  from = 0,
  format,
  duration = 1.2,
  delay = 0,
}: {
  to: number;
  from?: number;
  format: (n: number) => string;
  duration?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format; // 매 렌더 새 함수가 와도 애니메이션을 다시 시작하지 않게
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

/** ▲ +12.3% 처럼 기호와 색을 같이 */
export function Delta({ x, digits = 1, className = "" }: { x: number; digits?: number; className?: string }) {
  const k = 10 ** (digits + 2);
  const r = Math.round(x * k) / k; // 보이는 숫자(반올림)와 색·기호를 맞춘다: −0.4% 를 0% 로 보이면 회색
  return (
    <span className={`delta ${tone(r)} ${className}`}>
      <span aria-hidden>{arrow(r)} </span>
      {pct(r, digits)}
    </span>
  );
}

export type Dot = "hit" | "miss" | "now" | "todo";

export function ProgressDots({ dots }: { dots: Dot[] }) {
  return (
    <ol className="dots" aria-label={`${dots.findIndex((d) => d === "now") + 1}번째 라운드`}>
      {dots.map((d, i) => (
        <motion.li key={i} className={`dot ${d}`} layout initial={false} animate={{ scale: d === "now" ? 1 : 0.92 }} />
      ))}
    </ol>
  );
}

export function Skeleton({ w = "100%", h = 16, r = 8 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon" aria-hidden>
        <Owl mood="sad" size={96} />
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
            detail="진행 상황은 저장돼 있어요. 다시 열면 이어서 할 수 있어요."
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

/** 반은 지나간 시간(hindsight), 반은 아직 오지 않은 시간(foresight) */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden className="mark">
      <defs>
        <linearGradient id="fs-dawn" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7048e8" />
          <stop offset="1" stopColor="#f76707" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="var(--ink)" />
      <path d="M14 6.5 A7.5 7.5 0 0 0 14 21.5" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2.2" strokeDasharray="2.2 2.4" />
      <path d="M14 6.5 A7.5 7.5 0 0 1 14 21.5 Z" fill="url(#fs-dawn)" />
      <circle cx="14" cy="14" r="1.9" fill="#fff" />
    </svg>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={small ? "logo small" : "logo"}>
      <Mark size={small ? 24 : 28} />
      Foresight
    </span>
  );
}

/** 화면 뒤에서 천천히 움직이는 새벽빛 */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <i className="a1" />
      <i className="a2" />
      <i className="a3" />
    </div>
  );
}

/** 가로로 흐르는 전광판 */
export function Marquee({ items, speed = 40, className = "" }: { items: ReactNode[]; speed?: number; className?: string }) {
  const reduce = useReducedMotion();
  const row = (
    <>
      {items.map((x, i) => (
        <span key={i} className="mq-item">
          {x}
        </span>
      ))}
    </>
  );
  return (
    <div className={`marquee ${className}`} role="marquee" aria-label="데이터 전광판">
      <div className="mq-track" style={{ animationDuration: `${speed}s`, animationPlayState: reduce ? "paused" : undefined }}>
        {row}
        <span aria-hidden className="mq-dup">{row}</span>
      </div>
    </div>
  );
}

/** 도장 찍듯 내려앉는 배지 */
export function Stamp({ children, tone = "hit", delay = 0, className = "" }: { children: ReactNode; tone?: "hit" | "miss" | "grade"; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`stamp ${tone} ${className}`}
      initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: -18 }}
      animate={{ scale: 1, opacity: 1, rotate: -6 }}
      transition={{ delay, type: "spring", stiffness: 520, damping: 18, mass: 0.8 }}
    >
      {children}
    </motion.div>
  );
}

export function TopBar({ route, right }: { route: Route; right?: ReactNode }) {
  return (
    <header className="topbar">
      <button className="topbar-home" onClick={() => go("/")} aria-label="홈으로">
        <Logo small />
      </button>
      <nav className="topbar-nav">
        <SoundToggle />
        <AccountButton route={route} />
        {right ?? (
          <>
            <a href="#/play" className={route === "/play" ? "on nav-game" : "nav-game"}>
              게임
            </a>
            <a href="#/live" className={route === "/live" ? "on live-link" : "live-link"}>
              <i className="live-dot" aria-hidden />
              랭킹
            </a>
            <a href="#/data" className={route === "/data" ? "on" : ""}>
              데이터
            </a>
            <a href="#/team" className={route === "/team" ? "on nav-team" : "nav-team"}>
              팀
            </a>
          </>
        )}
      </nav>
    </header>
  );
}

/** 엄지가 닿는 아래쪽에 결정 버튼을 고정한다 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="bottombar">
      <div className="bottombar-inner">{children}</div>
    </div>
  );
}

/** 잘 맞힌 라운드에 터지는 작은 종이 조각 */
export function Confetti({ fire }: { fire: boolean }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        x: (Math.random() - 0.5) * 520,
        y: -(160 + Math.random() * 260),
        r: Math.random() * 540 - 270,
        c: ["#e03131", "#7048e8", "#f76707", "#fab005", "#1c7ed6", "#ae3ec9"][i % 6],
        d: Math.random() * 0.15,
        s: 6 + Math.random() * 6,
      })),
    [],
  );
  if (!fire || reduce) return null;
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <motion.i
          key={i}
          style={{ background: b.c, width: b.s, height: b.s * 0.45 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 420], rotate: b.r, opacity: [1, 1, 0] }}
          transition={{ duration: 1.8, delay: b.d, ease: "easeOut", times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  );
}

const GLYPHS = "가나다라마바사아자차카타파하ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/** 가려진 이름이 글자를 섞으며 드러난다 */
export function NameReveal({ name, delay = 0 }: { name: string; delay?: number }) {
  const reduce = useReducedMotion();
  const [text, setText] = useState(reduce ? name : "A사");
  useEffect(() => {
    if (reduce) {
      setText(name);
      return;
    }
    let frame = 0;
    let id: number | undefined;
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        frame++;
        const done = Math.floor(frame / 3);
        setText(
          name
            .split("")
            .map((ch, i) => (i < done || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
            .join(""),
        );
        if (done >= name.length) window.clearInterval(id);
      }, 40);
    }, delay * 1000);
    return () => {
      window.clearTimeout(start);
      if (id) window.clearInterval(id);
    };
  }, [name, delay, reduce]);
  return (
    <span className="name-reveal" aria-label={name}>
      {text}
    </span>
  );
}

export function LoadingPage({ route, slow }: { route: Route; slow: boolean }) {
  return (
    <>
      <TopBar route={route} />
      <main className="page" aria-busy>
        <div className="loading-page">
          <Skeleton w="40%" h={14} />
          <Skeleton w="85%" h={36} />
          <Skeleton w="60%" h={36} />
          <div className="loading-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} h={96} r={16} />
            ))}
          </div>
          <Skeleton h={200} r={16} />
          <div className="loading-owl" role="status">
            <Owl mood="sleep" size={72} />
            <p className="muted">{slow ? "서버를 깨우는 중이에요. 새벽이도 아직 자는 중… 처음 접속하면 30초쯤 걸려요 😴" : "불러오는 중…"}</p>
          </div>
        </div>
      </main>
    </>
  );
}

/** 로그인(선택) 버튼: 로그인 전엔 '로그인', 후엔 이름 첫 글자 동그라미 → 내 전적 */
function AccountButton({ route }: { route: Route }) {
  const s = useSession();
  const name = displayName(s);
  return (
    <a href="#/me" className={`acct ${route === "/me" ? "on" : ""} ${s ? "in" : ""}`} aria-label={s ? `내 전적 (${name})` : "로그인·내 전적"}>
      {s ? <span className="avatar">{(name || "나").slice(0, 1)}</span> : "로그인"}
    </a>
  );
}
