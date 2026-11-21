// 캐릭터: 내 개미(SVG, 6종 × 표정) · 동물 유튜버 라이벌 · 부엉이 박사. 외부 이미지 없이 그린다.
import { motion } from "motion/react";
import type { CSSProperties } from "react";

export type CharId = "office" | "student" | "whale" | "holder" | "trader" | "coin";
export type Mood = "happy" | "calm" | "worried" | "panic" | "wow";

export const CHAR_META: Record<CharId, { name: string; body: string; accent: string; perk: string; icon: string; unlock?: string }> = {
  office: { name: "직장인 개미", body: "#5b3fd6", accent: "#e5383b", perk: "4주마다 월급 +50만 원", icon: "💼" },
  student: { name: "대학생 개미", body: "#1f9d6b", accent: "#1d1640", perk: "시작 600만 원 · 멘탈 회복 2배 · 끝내면 별 +1", icon: "🎓" },
  whale: { name: "큰손 개미", body: "#c78a00", accent: "#2b2b2b", perk: "시작 3,000만 원 · 사건 금액 3배 · 살 때 0.3% 비쌈 · 손실에 약함", icon: "💰", unlock: "한 판 끝내면" },
  holder: { name: "존버 개미", body: "#6b6984", accent: "#3c3a55", perk: "멘탈이 20 아래로 안 떨어짐 · 수수료 2배", icon: "🗿" },
  trader: { name: "단타 개미", body: "#e8590c", accent: "#ffd43b", perk: "수수료 절반 · 쉬어도 멘탈 회복 없음", icon: "⚡" },
  coin: { name: "코인 개미", body: "#f59f00", accent: "#5b3fd6", perk: "코인 처음부터 · 코인 수수료 0 · 주식 수수료 2배 · 시작 멘탈 50", icon: "🪙", unlock: "B 등급 받으면" },
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

// ---------------------------------------------------------------- 부엉이 박사(코치·개미 비서)
export function Owl({ size = 56, talking = false }: { size?: number; talking?: boolean }) {
  return (
    <motion.svg viewBox="0 0 100 100" width={size} height={size} aria-hidden animate={talking ? { rotate: [0, -4, 4, 0] } : undefined} transition={{ duration: 0.8, repeat: talking ? Infinity : 0 }}>
      <path d="M22 30 L30 12 L40 26 Z M78 30 L70 12 L60 26 Z" fill="#7b5b3a" />
      <ellipse cx="50" cy="58" rx="34" ry="36" fill="#9c7a52" />
      <ellipse cx="50" cy="66" rx="22" ry="24" fill="#f1e3c8" />
      <circle cx="36" cy="44" r="13" fill="#fff" />
      <circle cx="64" cy="44" r="13" fill="#fff" />
      <circle cx="36" cy="44" r="13" fill="none" stroke="#1d1640" strokeWidth="2.5" />
      <circle cx="64" cy="44" r="13" fill="none" stroke="#1d1640" strokeWidth="2.5" />
      <line x1="49" y1="44" x2="51" y2="44" stroke="#1d1640" strokeWidth="2.5" />
      <circle cx="37" cy="45" r="5" fill="#1d1640" />
      <circle cx="63" cy="45" r="5" fill="#1d1640" />
      <path d="M46 54 L54 54 L50 62 Z" fill="#f59f00" />
      <path d="M38 76 q4 4 8 0 M54 76 q4 4 8 0" stroke="#c9b28a" strokeWidth="2" fill="none" />
    </motion.svg>
  );
}
