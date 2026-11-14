import { motion } from "motion/react";
import { won } from "../lib/format";
import { WEIGHT_LABEL } from "../lib/game";
import { WEIGHT_EMOJI } from "../lib/lines";
import type { Weight } from "../lib/types";

interface Props {
  weights: Weight[];
  value: Weight | null;
  onChange: (w: Weight) => void;
  cash: number;
  current?: Weight; // 중간 사건 때 지금 비중 표시
  disabled?: boolean;
}

export default function WeightPicker({ weights, value, onChange, cash, current, disabled }: Props) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = value === null ? -1 : weights.indexOf(value);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(weights[Math.min(i + 1, weights.length - 1)]);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(weights[Math.max(i - 1, 0)]);
  };
  const short = value !== null && value < 0;
  return (
    <div className="picker">
      <div className="weights" role="radiogroup" aria-label="투자 비중" onKeyDown={onKey} style={{ gridTemplateColumns: `repeat(${weights.length}, 1fr)` }}>
        {weights.map((w) => {
          const on = value === w;
          return (
            <button
              key={w}
              role="radio"
              aria-checked={on}
              disabled={disabled}
              tabIndex={on || (value === null && w === 0) ? 0 : -1}
              className={`weight ${on ? "on" : ""} ${w < 0 ? "short" : ""}`}
              onClick={() => onChange(w)}
            >
              {on && <motion.span layoutId="weight-pill" className="weight-pill" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
              <motion.span className="weight-emo" aria-hidden animate={on ? { scale: [1, 1.5, 1.15], rotate: [0, -12, 0] } : { scale: 1 }} transition={{ duration: 0.35 }}>
                {WEIGHT_EMOJI[w]}
              </motion.span>
              <span className="weight-num">{w < 0 ? "−50%" : `${w}%`}</span>
              <span className="weight-hint">{current === w ? "지금" : WEIGHT_LABEL[w]}</span>
            </button>
          );
        })}
      </div>
      <div className={`alloc ${short ? "short" : ""}`} aria-live="polite">
        <div className="alloc-bar">
          <motion.i animate={{ width: `${Math.abs(value ?? 0)}%` }} transition={{ type: "spring", stiffness: 200, damping: 26 }} />
        </div>
        <div className="alloc-text">
          {value === null ? (
            <span className="muted">비중을 고르면 금액이 보여요</span>
          ) : short ? (
            <span>
              <b>{won((cash * -value) / 100)}</b>어치 빌려서 팔아요 <span className="muted">· 내리면 이익, 오르면 손실</span>
            </span>
          ) : (
            <>
              <span>
                주식 <b>{won((cash * value) / 100)}</b>
              </span>
              <span className="muted">현금 {won((cash * (100 - value)) / 100)}</span>
            </>
          )}
        </div>
        {short && <p className="short-note">개인 공매도: 주식을 빌려 먼저 팔고 나중에 사서 갚아요. 게임에선 대차 수수료 연 4%만 반영해요. 실제로는 담보·상환 기한이 있어요.</p>}
      </div>
    </div>
  );
}
