// 마스코트 '새벽이'(부엉이). 새벽에 깨어 앞을 내다보는 새 = Foresight.
// 그림은 전부 이 파일의 SVG(외부 이미지 없음). 기분(mood)에 따라 눈·부리·몸짓이 바뀐다.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { onBuddy, type BuddyMsg, type Mood } from "../lib/buddy";
import { pickTip } from "../lib/lines";
import { sfx } from "../lib/sfx";

const INK = "#1d1640";

function Eyes({ mood }: { mood: Mood }) {
  if (mood === "happy" || mood === "proud")
    return (
      <g stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none">
        <path d="M35 58 Q44 47 53 58" />
        <path d="M67 58 Q76 47 85 58" />
      </g>
    );
  if (mood === "sleep")
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M36 57 Q44 63 52 57" />
        <path d="M68 57 Q76 63 84 57" />
      </g>
    );
  const shock = mood === "shock";
  const sad = mood === "sad";
  const think = mood === "think";
  const r = shock ? 4 : 7;
  const dx = think ? 3 : 0;
  const dy = think ? -4 : sad ? 3 : 1;
  return (
    <g>
      <circle cx="44" cy="56" r={shock ? 17 : 15} fill="#fff" />
      <circle cx="76" cy="56" r={shock ? 17 : 15} fill="#fff" />
      <g className="buddy-blink">
        <circle cx={44 + dx} cy={56 + dy} r={r} fill={INK} />
        <circle cx={76 + dx} cy={56 + dy} r={r} fill={INK} />
        <circle cx={46 + dx} cy={53 + dy} r={2.4} fill="#fff" />
        <circle cx={78 + dx} cy={53 + dy} r={2.4} fill="#fff" />
      </g>
      {sad && (
        <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
          <path d="M32 40 L50 45" />
          <path d="M88 40 L70 45" />
        </g>
      )}
      {mood === "cool" && (
        <g>
          <rect x="28" y="46" width="30" height="18" rx="7" fill={INK} />
          <rect x="62" y="46" width="30" height="18" rx="7" fill={INK} />
          <rect x="56" y="51" width="8" height="4" fill={INK} />
          <path d="M33 50 L42 50" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        </g>
      )}
    </g>
  );
}

/** 새벽이 한 마리. size 는 px */
export function Owl({ mood = "idle", size = 96, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const body =
    reduce || mood === "sleep"
      ? {}
      : mood === "happy" || mood === "proud"
        ? { y: [0, -12, 0, -8, 0], transition: { duration: 0.9, repeat: mood === "proud" ? Infinity : 1, repeatDelay: 1.2 } }
        : mood === "shock"
          ? { x: [0, -4, 4, -3, 3, 0], transition: { duration: 0.45 } }
          : mood === "sad"
            ? { y: [0, 3, 0], rotate: [0, -3, 0], transition: { duration: 2.4, repeat: Infinity } }
            : { y: [0, -3, 0], transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const } };
  const wingUp = !reduce && (mood === "happy" || mood === "proud");
  return (
    <motion.svg viewBox="0 0 120 120" width={size} height={size} className={`owl ${className}`} aria-hidden animate={body} key={mood}>
      <defs>
        <linearGradient id="owl-body" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#9775fa" />
          <stop offset="1" stopColor="#6741d9" />
        </linearGradient>
        <linearGradient id="owl-belly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4e6" />
          <stop offset="1" stopColor="#ffd8a8" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="30" ry="4" fill={INK} opacity="0.12" />
      {/* 날개 */}
      <motion.ellipse
        cx="22" cy="76" rx="9" ry="19" fill="#5f3dc4"
        style={{ transformOrigin: "26px 62px" }}
        animate={wingUp ? { rotate: [0, 40, 0, 40, 0] } : { rotate: 0 }}
        transition={{ duration: 0.9 }}
      />
      <motion.ellipse
        cx="98" cy="76" rx="9" ry="19" fill="#5f3dc4"
        style={{ transformOrigin: "94px 62px" }}
        animate={wingUp ? { rotate: [0, -40, 0, -40, 0] } : { rotate: 0 }}
        transition={{ duration: 0.9 }}
      />
      {/* 귀깃 */}
      <path d="M30 36 L22 12 L46 28 Z" fill="#7048e8" />
      <path d="M90 36 L98 12 L74 28 Z" fill="#7048e8" />
      {/* 몸 */}
      <ellipse cx="60" cy="68" rx="40" ry="42" fill="url(#owl-body)" />
      <ellipse cx="60" cy="86" rx="24" ry="22" fill="url(#owl-belly)" />
      <g stroke="#ffa94d" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M52 82 L56 86 L60 82 L64 86 L68 82" />
        <path d="M50 92 L54 96 L58 92 L62 96 L66 92 L70 96" />
      </g>
      {/* 발 */}
      <ellipse cx="50" cy="109" rx="6" ry="3.5" fill="#f76707" />
      <ellipse cx="70" cy="109" rx="6" ry="3.5" fill="#f76707" />
      <Eyes mood={mood} />
      {/* 볼 */}
      {(mood === "happy" || mood === "proud" || mood === "idle") && (
        <g fill="#ff8787" opacity={mood === "idle" ? 0.35 : 0.6}>
          <ellipse cx="30" cy="70" rx="6" ry="3.5" />
          <ellipse cx="90" cy="70" rx="6" ry="3.5" />
        </g>
      )}
      {/* 부리 */}
      {mood === "shock" ? <ellipse cx="60" cy="74" rx="5" ry="6.5" fill="#f76707" /> : <path d="M55 68 L65 68 L60 77 Z" fill="#f76707" />}
      {mood === "sad" && <path d="M86 66 q3 6 0 9 q-3 -3 0 -9 Z" fill="#74c0fc" />}
      {mood === "think" && (
        <text x="96" y="30" fontSize="22" fontWeight="900" fill={INK}>
          ?
        </text>
      )}
      {mood === "sleep" && (
        <text x="88" y="28" fontSize="16" fontWeight="900" fill={INK} className="zzz">
          z<tspan dy="-6" fontSize="12">z</tspan>
        </text>
      )}
      {mood === "proud" && (
        <g>
          <path d="M44 22 L50 8 L60 18 L70 8 L76 22 Z" fill="#fab005" stroke="#e67700" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="16" r="2.5" fill="#fff" />
        </g>
      )}
    </motion.svg>
  );
}

/** 말풍선 달린 새벽이(본문 안에 둘 때) */
export function Buddy({ mood = "idle", text, size = 88, side = "right" }: { mood?: Mood; text?: React.ReactNode; size?: number; side?: "right" | "top" }) {
  return (
    <div className={`buddy ${side}`}>
      <Owl mood={mood} size={size} />
      {text && (
        <motion.div className="bubble" key={String(text)} initial={{ opacity: 0, scale: 0.85, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
          {text}
        </motion.div>
      )}
    </div>
  );
}

/** 게임 화면 구석에 사는 새벽이. say() 로 말을 걸면 잠깐 말풍선을 띄운다. 누르면 팁 */
export function BuddyDock() {
  const [msg, setMsg] = useState<BuddyMsg | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const timer = useRef<number>();
  useEffect(
    () =>
      onBuddy((m) => {
        setMsg(m);
        setMood(m.mood);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setMsg(null);
          setMood((x) => (x === "sad" || x === "shock" ? "idle" : x === "proud" ? "proud" : "idle"));
        }, m.ms ?? 4200);
      }),
    [],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = () => {
    sfx("tick");
    if (msg) {
      setMsg(null);
      return;
    }
    const t = pickTip();
    setMsg({ mood: "think", text: t, ms: 5200 });
    setMood("think");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setMsg(null);
      setMood("idle");
    }, 5200);
  };
  return (
    <div className="dock">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.text}
            className="bubble dock-bubble"
            role="status"
            initial={{ opacity: 0, scale: 0.7, x: 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            onClick={() => setMsg(null)}
          >
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
      <button className="dock-owl" onClick={tap} aria-label="새벽이에게 팁 듣기">
        <Owl mood={mood} size={64} />
      </button>
    </div>
  );
}
