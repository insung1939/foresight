// 게임 시작 전 랭킹 이름 정하기(아래에서 올라오는 시트). 비워 두면 '익명 부엉이'.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { NICK_RE, getNick, randomNick, setNick } from "../lib/nick";
import { sfx } from "../lib/sfx";
import { Owl } from "./Buddy";

export function NickSheet({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (nick: string) => void }) {
  const [name, setName] = useState(() => getNick() ?? randomNick());
  const ref = useRef<HTMLInputElement>(null);
  const clean = name.replace(/\s+/g, " ").trim();
  const ok = NICK_RE.test(clean);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const start = () => {
    if (!ok) return;
    setNick(clean);
    sfx("confirm");
    onStart(clean);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal
            aria-labelledby="nick-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            onAnimationComplete={() => ref.current?.focus({ preventScroll: true })}
          >
            <span className="sheet-grip" aria-hidden />
            <div className="sheet-owl">
              <Owl mood="happy" size={72} />
            </div>
            <h2 id="nick-title">랭킹에 올라갈 이름</h2>
            <p className="muted small">실시간 랭킹에 이 이름으로 보여요. 실명은 쓰지 마세요.</p>
            <form
              className="nick-row"
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <input
                ref={ref}
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                aria-label="닉네임"
                aria-invalid={!ok}
                enterKeyHint="go"
                autoComplete="off"
              />
              <button
                type="button"
                className="dice"
                aria-label="이름 새로 뽑기"
                onClick={() => {
                  setName(randomNick());
                  sfx("tick");
                }}
              >
                🎲
              </button>
            </form>
            <p className={`nick-hint ${ok ? "" : "bad"}`}>{ok ? "한글·영문·숫자 2~12자" : "한글·영문·숫자로 2~12자만 돼요"}</p>
            <button className="btn primary block" disabled={!ok} onClick={start}>
              이 이름으로 시작 🚀
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
