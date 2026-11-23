// 캐릭터: 내 개미(SVG, 6종 × 표정) · 동물 유튜버 라이벌 · 범고래 박사. 외부 이미지 없이 그린다.
import { motion } from "motion/react";
import type { CSSProperties } from "react";

export type CharId = "office" | "student" | "whale" | "holder" | "trader" | "coin";
export type Mood = "happy" | "calm" | "worried" | "panic" | "wow";

// cash = 시작 금액(서버 season.CHARS 와 같게) — 카드에 따로 크게 보여 준다(후기: 직장인은 시작 금액이 안 보임)
export const CHAR_META: Record<CharId, { name: string; body: string; accent: string; perk: string; cash: number; icon: string; unlock?: string }> = {
  office: { name: "직장인 개미", body: "#5b3fd6", accent: "#e5383b", cash: 10_000_000, perk: "4주마다 월급 +50만 원", icon: "💼" },
  student: { name: "대학생 개미", body: "#1f9d6b", accent: "#1d1640", cash: 6_000_000, perk: "멘탈 회복 2배 · 끝내면 별 +1", icon: "🎓" },
  whale: {
    name: "큰손 개미",
    body: "#c78a00",
    accent: "#2b2b2b",
    cash: 30_000_000,
    perk: "인생 사건의 돈이 3배(월급·성과급 +100만 → +300만, 수리비 −80만 → −240만) · 큰돈이라 살 때 0.3% 비쌈 · 잃으면 멘탈이 더 깎임",
    icon: "💰",
    unlock: "한 판 끝내면",
  },
  holder: { name: "존버 개미", body: "#6b6984", accent: "#3c3a55", cash: 10_000_000, perk: "멘탈이 20 아래로 안 떨어짐 · 수수료 2배", icon: "🗿" },
  trader: { name: "단타 개미", body: "#e8590c", accent: "#ffd43b", cash: 10_000_000, perk: "수수료 절반 · 쉬어도 멘탈 회복 없음", icon: "⚡" },
  coin: { name: "코인 개미", body: "#f59f00", accent: "#5b3fd6", cash: 10_000_000, perk: "코인 처음부터 · 코인 수수료 0 · 주식 수수료 2배 · 시작 멘탈 50", icon: "🪙", unlock: "B 등급 받으면" },
};

export const moodOf = (mental: number): Mood => (mental >= 80 ? "happy" : mental >= 55 ? "calm" : mental >= 30 ? "worried" : "panic");

/** 내 개미. 표정은 멘탈에 따라, 소품은 캐릭터에 따라 */
export function Ant({ char = "office", mood = "calm", size = 96, bounce = false, style, outfit }: { char?: CharId; mood?: Mood; size?: number; bounce?: boolean; style?: CSSProperties; outfit?: string | null }) {
  const m = CHAR_META[char] ?? CHAR_META.office;
  const eyeY = mood === "panic" ? 47 : 46;
  const mouth =
    mood === "happy" || mood === "wow" ? (
      <path d="M44 58 Q50 66 56 58" stroke="#1d1640" strokeWidth="2.6" fill={mood === "wow" ? "#ff8fa3" : "none"} strokeLinecap="round" />
    ) : mood === "calm" ? (
      <path d="M45 59 Q50 63 55 59" stroke="#1d1640" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    ) : mood === "worried" ? (
      <path d="M45 61 Q50 58 55 61" stroke="#1d1640" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    ) : (
      <ellipse cx="50" cy="61" rx="4" ry="5" fill="#1d1640" />
    );
  const svg = (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} style={style} role="img" aria-label={`${m.name}(${mood === "happy" ? "신남" : mood === "calm" ? "평온" : mood === "worried" ? "걱정" : mood === "wow" ? "놀람" : "패닉"})`}>
      {/* 더듬이 */}
      <path d="M40 28 Q32 10 24 8" stroke="#1d1640" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M60 28 Q68 10 76 8" stroke="#1d1640" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="8" r="4.5" fill={m.accent} />
      <circle cx="76" cy="8" r="4.5" fill={m.accent} />
      {/* 몸 */}
      <ellipse cx="50" cy="96" rx="20" ry="12" fill={m.body} />
      <ellipse cx="50" cy="80" rx="15" ry="11" fill={m.body} />
      <path d="M36 82 L22 76 M64 82 L78 76 M38 92 L24 100 M62 92 L76 100" stroke="#1d1640" strokeWidth="3" strokeLinecap="round" />
      {/* 머리 */}
      <circle cx="50" cy="50" r="25" fill={m.body} />
      <circle cx="50" cy="50" r="25" fill="url(#shine)" />
      <defs>
        <radialGradient id="shine" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 눈 */}
      <ellipse cx="41" cy={eyeY} rx="6.5" ry={mood === "panic" ? 7.5 : 7} fill="#fff" />
      <ellipse cx="59" cy={eyeY} rx="6.5" ry={mood === "panic" ? 7.5 : 7} fill="#fff" />
      {mood === "happy" ? (
        <>
          <path d="M37 47 Q41 42 45 47" stroke="#1d1640" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M55 47 Q59 42 63 47" stroke="#1d1640" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="42" cy={eyeY + 1} r={mood === "panic" ? 2 : 3.4} fill="#1d1640" />
          <circle cx="60" cy={eyeY + 1} r={mood === "panic" ? 2 : 3.4} fill="#1d1640" />
          <circle cx="43.2" cy={eyeY - 0.5} r="1.1" fill="#fff" />
          <circle cx="61.2" cy={eyeY - 0.5} r="1.1" fill="#fff" />
        </>
      )}
      {mood === "worried" && <path d="M35 37 L45 40 M65 37 L55 40" stroke="#1d1640" strokeWidth="2.2" strokeLinecap="round" />}
      {mood === "panic" && <path d="M72 34 q4 6 0 9 q-4 -3 0 -9" fill="#74c0fc" />}
      {/* 볼 */}
      <ellipse cx="34" cy="56" rx="4" ry="2.6" fill="#ff8fa3" opacity="0.75" />
      <ellipse cx="66" cy="56" rx="4" ry="2.6" fill="#ff8fa3" opacity="0.75" />
      {mouth}
      {/* 캐릭터 소품 */}
      {char === "office" && <path d="M47 70 L53 70 L51.5 74 L54 86 L50 90 L46 86 L48.5 74 Z" fill={m.accent} />}
      {char === "student" && (
        <g>
          <path d="M28 30 L50 20 L72 30 L50 38 Z" fill="#1d1640" />
          <path d="M66 31 L66 40" stroke="#ffd43b" strokeWidth="2" />
          <circle cx="66" cy="41" r="2" fill="#ffd43b" />
        </g>
      )}
      {char === "whale" && (
        <g>
          <rect x="33" y="40" width="34" height="9" rx="4" fill="#1d1640" opacity="0.92" />
          <text x="50" y="104" fontSize="12" textAnchor="middle">💰</text>
        </g>
      )}
      {char === "holder" && <path d="M26 30 Q50 14 74 30 L74 34 Q50 22 26 34 Z" fill="#8d8aa3" />}
      {char === "trader" && <rect x="25" y="30" width="50" height="6" rx="3" fill={m.accent} />}
      {char === "coin" && (
        <g>
          <circle cx="74" cy="84" r="9" fill="#ffd43b" stroke="#c78a00" strokeWidth="2" />
          <text x="74" y="88" fontSize="10" textAnchor="middle" fontWeight="900" fill="#c78a00">₿</text>
        </g>
      )}
      {outfit === "crown" && <path d="M36 28 L40 16 L46 24 L50 12 L54 24 L60 16 L64 28 Z" fill="#ffd43b" stroke="#c78a00" strokeWidth="1.5" />}
      {outfit === "shades" && <rect x="32" y="40" width="36" height="10" rx="5" fill="#1d1640" />}
    </svg>
  );
  if (!bounce) return svg;
  return (
    <motion.div style={{ display: "inline-block" }} animate={{ y: [0, -6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
      {svg}
    </motion.div>
  );
}

// ---------------------------------------------------------------- 동물 유튜버(실제 채널마다 정해진 동물)
const ANIMALS = ["🦊", "🐻", "🐰", "🐼", "🐯", "🐱", "🐶", "🐸", "🐧", "🐨", "🦁", "🐹", "🦝", "🐮"];
const COLORS = ["#ffe8cc", "#e7f5ff", "#fff0f6", "#ebfbee", "#fff9db", "#f3f0ff", "#e3fafc", "#fff4e6"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
export const animalOf = (name: string) => ANIMALS[hash(name) % ANIMALS.length];

export function Tuber({ name, size = 36 }: { name: string; size?: number }) {
  const h = hash(name);
  return (
    <span className="tuber" style={{ width: size, height: size, fontSize: size * 0.58, background: COLORS[h % COLORS.length] }} aria-hidden>
      {ANIMALS[h % ANIMALS.length]}
      <i className="yt-dot">▶</i>
    </span>
  );
}

/** 라이벌의 한마디(그 주 성적에 따라). 실제 채널 말이 아니라 게임 속 캐릭터 대사 */
export function rivalLine(name: string, r: number, t: number): string {
  const pick = (xs: string[]) => xs[(hash(name) + t) % xs.length];
  if (r >= 0.05) return pick(["이번 주 대박! 구독·좋아요·알림 설정 🔔", "제가 뭐랬어요? 떡상 갑니다 🚀", "개미 여러분 따라오세요~ 😎"]);
  if (r > 0.005) return pick(["소소하게 올랐네요 ☕", "차곡차곡 쌓는 중!", "다음 주도 지켜보세요 👀"]);
  if (r <= -0.05) return pick(["…이건 세력의 장난입니다 😤", "존버는 승리한다…(아마도) 🥲", "오늘 방송은 쉬겠습니다…"]);
  if (r < -0.005) return pick(["조정은 기회입니다!", "잠깐 숨 고르기예요 😅", "흔들리지 마세요~"]);
  return pick(["이번 주는 관망 🍵", "현금도 종목이죠 😌", "조용한 한 주네요"]);
}

// ---------------------------------------------------------------- 범고래 박사(코치·개미 비서) — 바다에서 제일 똑똑한 친구
export function Orca({ size = 56, talking = false }: { size?: number; talking?: boolean }) {
  return (
    <span className="orca-badge" style={{ width: size, height: size }}>
    <motion.svg
      viewBox="0 0 100 100"
      width={size * 0.92}
      height={size * 0.92}
      aria-hidden
      animate={talking ? { rotate: [0, -5, 5, 0], y: [0, -2, 0] } : { y: [0, -1.5, 0] }}
      transition={{ duration: talking ? 0.8 : 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* 물결 */}
      <path d="M8 88 q10 -6 20 0 t20 0 t20 0 t20 0" stroke="#74c0fc" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      {/* 등지느러미 */}
      <path d="M52 22 Q60 6 66 12 Q60 18 62 28 Z" fill="#1d2433" />
      {/* 꼬리 */}
      <path d="M84 60 Q96 50 97 40 Q90 48 82 50 Q92 38 88 30 Q82 44 76 52 Z" fill="#1d2433" />
      {/* 몸 */}
      <ellipse cx="48" cy="56" rx="38" ry="30" fill="#1d2433" />
      {/* 배 */}
      <path d="M14 62 Q30 84 62 80 Q46 74 40 64 Q26 66 14 62 Z" fill="#ffffff" />
      {/* 눈 위 흰 무늬 */}
      <ellipse cx="34" cy="44" rx="9" ry="5.5" fill="#ffffff" transform="rotate(-12 34 44)" />
      {/* 눈 */}
      <circle cx="31" cy="51" r="3.6" fill="#ffffff" />
      <circle cx="31.6" cy="51.4" r="2.2" fill="#1d2433" />
      <circle cx="32.4" cy="50.4" r="0.8" fill="#ffffff" />
      {/* 동그란 안경 */}
      <circle cx="31" cy="51" r="6.5" fill="none" stroke="#f59f00" strokeWidth="2" />
      <path d="M37.5 50 Q44 47 48 49" stroke="#f59f00" strokeWidth="2" fill="none" />
      {/* 볼·입 */}
      <ellipse cx="22" cy="60" rx="4" ry="2.4" fill="#ff8fa3" opacity="0.85" />
      <path d="M14 58 Q20 64 27 61" stroke="#ffffff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {/* 가슴지느러미 */}
      <path d="M44 74 Q50 86 60 84 Q54 78 52 70 Z" fill="#1d2433" />
      {/* 박사 모자 */}
      <g transform="rotate(-10 40 26)">
        <path d="M22 24 L42 15 L62 24 L42 32 Z" fill="#5b3fd6" />
        <rect x="34" y="26" width="16" height="6" rx="2" fill="#4a32b8" />
        <path d="M58 25 L60 36" stroke="#ffd43b" strokeWidth="2" />
        <circle cx="60" cy="37" r="2.4" fill="#ffd43b" />
      </g>
    </motion.svg>
    </span>
  );
}
