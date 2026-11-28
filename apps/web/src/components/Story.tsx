// 이야기(시나리오): 교수님 피드백 '게임은 시각적으로 재밌어 보여야 하고, 이미지 → 스토리·시나리오가 있어야 한다'
// 그림은 ChatGPT 이미지 생성(codex exec)으로 만들었다(scripts/gen_image.sh). 왜 종목 이름이 가려져 있는지도 이야기로 설명한다.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Final } from "../lib/types";
import { sfx } from "../lib/sfx";

interface Panel {
  img: string;
  when: string;
  lines: string[];
  who?: "orca" | "ant";
}

const PANELS: Panel[] = [
  {
    img: "/story/story1.webp",
    when: "어느 밤",
    lines: ["'그때 그 종목만 샀어도…'", "신입 개미는 오늘도 지나간 차트를 보며 한숨을 쉬었다."],
  },
  {
    img: "/story/story2.webp",
    when: "그때, 방 안에 물방울이 떠올랐다",
    who: "orca",
    lines: ["🐳 범고래 박사: \"딱 한 번, 그때로 돌려보내 주지.\"", "\"대신 기억은 흐릿해질 걸세. 회사 이름도, 날짜도.\""],
  },
  {
    img: "/story/story3.webp",
    when: "시계 바늘이 거꾸로 돌기 시작했다",
    lines: ["달력이 넘어가고, 차트가 거꾸로 감긴다.", "…정신을 차려 보니."],
  },
  {
    img: "/story/story4.webp",
    when: "1년 전, 월요일 아침",
    who: "ant",
    lines: ["손에는 1,000만 원과 폰 하나.", "유튜버들은 오늘도 '무조건 오른다'고 외친다. 이번엔 다를 수 있을까?"],
  },
];

/** 오프닝: 처음 온 사람에게 한 번, 홈에서 다시 보기 */
export function StoryIntro({ open, onClose, onManual, onStart }: { open: boolean; onClose: () => void; onManual?: () => void; onStart?: () => void }) {
  const [i, setI] = useState(0);
  const p = PANELS[i];
  const last = i === PANELS.length - 1;
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    PANELS.forEach((x) => (new Image().src = x.img)); // 다음 장이 바로 뜨게 미리 받기
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !last) setI((n) => n + 1);
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, last, onClose]);
  if (!open) return null;
  return (
    <div className="story" role="dialog" aria-modal="true" aria-label="이야기: 타임슬립 개미">
      <AnimatePresence mode="wait">
        <motion.img
          key={p.img}
          src={p.img}
          alt=""
          className="st-img"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="st-shade" aria-hidden />
      <button className="st-skip" onClick={onClose}>
        건너뛰기 ✕
      </button>
      <AnimatePresence mode="wait">
        <motion.div key={i} className="st-text" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.25, duration: 0.4 }}>
          <p className="st-when">{p.when}</p>
          {p.lines.map((l, k) => (
            <motion.p key={l} className={k === 0 ? "st-l1" : "st-l2"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 + k * 0.5 }}>
              {l}
            </motion.p>
          ))}
        </motion.div>
      </AnimatePresence>
      <div className="st-nav">
        <div className="st-dots" aria-hidden>
          {PANELS.map((_, k) => (
            <i key={k} className={k === i ? "on" : ""} />
          ))}
        </div>
        {last ? (
          <div className="st-end">
            {onManual && (
              <button
                className="btn ghost"
                onClick={() => {
                  onClose();
                  onManual();
                }}
              >
                📖 게임 방법 보기
              </button>
            )}
            <button
              className="btn primary glow"
              onClick={() => {
                onClose();
                onStart?.();
              }}
            >
              {onStart ? "첫 출근하기 ▶" : "닫기"}
            </button>
          </div>
        ) : (
          <button
            className="btn primary"
            onClick={() => {
              sfx("whoosh");
              setI(i + 1);
            }}
          >
            다음 ▶
          </button>
        )}
      </div>
    </div>
  );
}

/** 엔딩: 결산 아래 한 장면. 이기면 옥상 파티, 아니면 비 오는 날 오답 노트 */
export function Epilogue({ f }: { f: Final }) {
  const win = ["S", "A", "B"].includes(f.grade);
  const line = win
    ? f.grade === "S"
      ? "유튜버도, 시장도 이겼다. 범고래 박사가 박수를 친다. \"자네, 원래 이 시대 사람 아닌가?\""
      : "흔들리는 시장에서 끝까지 버텼다. 범고래 박사가 웃는다. \"이게 바로 실력일세.\""
    : f.ret > 0
      ? "벌긴 벌었다. 그런데 라이벌들이 더 벌었다. 개미는 노트를 꺼냈다. \"다음엔 덜 흔들리자.\""
      : "생각보다 어려웠다. 지나고 보면 쉬워 보였는데. 범고래 박사: \"그걸 알았으면 반은 이긴 걸세. 한 번 더?\"";
  return (
    <figure className="epilogue">
      <img src={win ? "/story/end_win.webp" : "/story/end_learn.webp"} alt={win ? "옥상에서 트로피를 든 개미와 박수 치는 범고래 박사" : "비 오는 날 카페에서 오답 노트를 쓰는 개미"} loading="lazy" />
      <figcaption>
        <b>{win ? "🎉 엔딩: 이번엔 달랐다" : "☔ 엔딩: 다음 타임슬립을 기다리며"}</b>
        <span>{line}</span>
      </figcaption>
    </figure>
  );
}
