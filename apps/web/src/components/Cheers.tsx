// 경험치·배지·레벨업 알림, 레벨 카드, 배지 진열장, 소리 버튼
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { onCheer, type Cheer } from "../lib/buddy";
import { BADGES, levelOf, loadProgress, type Progress } from "../lib/progress";
import { onSound, setSound, sfx, soundOn } from "../lib/sfx";
import { Owl } from "./Buddy";
import { Confetti } from "./ui";

type Item = Cheer & { id: number };
let seq = 0;

export function Cheers() {
  const [items, setItems] = useState<Item[]>([]);
  const [level, setLevel] = useState<Extract<Cheer, { kind: "level" }> | null>(null);
  useEffect(
    () =>
      onCheer((c) => {
        if (c.kind === "level") {
          sfx("level");
          setLevel(c);
          return;
        }
        sfx(c.kind === "badge" ? "badge" : "coin");
        const id = ++seq;
        setItems((xs) => [...xs, { ...c, id }]);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), c.kind === "badge" ? 3600 : 2400);
      }),
    [],
  );
  return (
    <>
      <div className="cheers" aria-live="polite">
        <AnimatePresence>
          {items.map((c) => (
            <motion.div
              key={c.id}
              layout
              className={`cheer ${c.kind}`}
              initial={{ opacity: 0, y: -24, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 26 }}
            >
              {c.kind === "xp" ? (
                <>
                  <b className="xp-amt">+{c.amount} XP</b>
                  <span>{c.reason}</span>
                </>
              ) : c.kind === "badge" ? (
                <>
                  <motion.span className="badge-ic" initial={{ rotate: -30, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 500, damping: 12 }}>
                    {c.icon}
                  </motion.span>
                  <span>
                    <small>배지 획득!</small>
                    <b>{c.name}</b>
                    <em>{c.desc}</em>
                  </span>
                </>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {level && (
          <motion.div className="levelup" onClick={() => setLevel(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="레벨 업">
            <Confetti fire />
            <motion.div className="levelup-card" initial={{ scale: 0.5, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
              <Owl mood="proud" size={110} />
              <p className="lv-kicker">LEVEL UP!</p>
              <p className="lv-num">Lv.{level.level}</p>
              <p className="lv-title">
                {level.icon} {level.title}
              </p>
              <button className="btn primary" onClick={() => setLevel(null)}>
                좋아요!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 레벨 · 경험치 막대 */
export function LevelCard({ p = loadProgress(), compact = false, gained = 0 }: { p?: Progress; compact?: boolean; gained?: number }) {
  const lv = levelOf(p.xp);
  const prev = levelOf(Math.max(p.xp - gained, 0));
  const startPct = prev.level === lv.level ? (prev.into / lv.span) * 100 : 0;
  const pctNow = lv.next === null ? 100 : (lv.into / lv.span) * 100;
  return (
    <div className={`levelcard ${compact ? "compact" : ""}`}>
      <span className="lv-badge" aria-hidden>
        {lv.icon}
      </span>
      <div className="lv-body">
        <div className="lv-row">
          <b>
            Lv.{lv.level} {lv.title}
          </b>
          <small>{lv.next === null ? "최고 레벨" : `다음 레벨까지 ${lv.next - p.xp} XP`}</small>
        </div>
        <div className="xpbar" role="progressbar" aria-valuenow={Math.round(pctNow)} aria-valuemin={0} aria-valuemax={100}>
          <motion.i initial={{ width: `${startPct}%` }} animate={{ width: `${pctNow}%` }} transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        {!compact && (
          <small className="muted">
            총 {p.xp.toLocaleString("ko-KR")} XP · 완주 {p.games}판 · 적중 {p.hits}/{p.rounds}
          </small>
        )}
      </div>
    </div>
  );
}

/** 배지 진열장. 못 얻은 건 흐리게, 숨은 배지는 ? */
export function BadgeShelf({ p = loadProgress(), highlight = [] as string[] }: { p?: Progress; highlight?: string[] }) {
  const n = Object.keys(p.badges).length;
  return (
    <div className="shelf">
      <p className="shelf-head">
        배지 <b>{n}</b> / {BADGES.length}
      </p>
      <ul>
        {BADGES.map((b, i) => {
          const got = !!p.badges[b.id];
          const fresh = highlight.includes(b.id);
          return (
            <motion.li
              key={b.id}
              className={`${got ? "got" : "locked"} ${fresh ? "fresh" : ""}`}
              title={got || !b.hidden ? `${b.name} — ${b.desc}` : "숨은 배지"}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.025 * i, type: "spring", stiffness: 400, damping: 20 }}
            >
              <span className="ic">{got ? b.icon : b.hidden ? "❓" : b.icon}</span>
              <span className="nm">{got || !b.hidden ? b.name : "???"}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSound(setOn), []);
  return (
    <button className="sound-btn" onClick={() => setSound(!on)} aria-label={on ? "효과음 끄기" : "효과음 켜기"} aria-pressed={on} title={on ? "효과음 끄기" : "효과음 켜기"}>
      {on ? "🔊" : "🔈"}
    </button>
  );
}
