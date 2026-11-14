import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { pct } from "../lib/format";
import type { Point } from "../lib/types";

interface Props {
  points: Point[];
  upTo: number; // 이 거래일까지만 그린다(미래는 숨김)
  domainEnd?: number; // x 축 끝(기본 upTo)
  eventT?: number;
  exitT?: number; // 중도 매도한 날
  height?: number;
  volume?: boolean;
  /** 이 거래일 뒤 구간을 천천히 그린다(정답 공개 연출). 초 단위 */
  drawAfter?: { from: number; duration: number; delay?: number };
  label?: string;
}

const W = 600;

export default function Chart({ points, upTo, domainEnd, eventT, exitT, height = 220, volume = true, drawAfter, label }: Props) {
  const gid = useId();
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const shown = points.filter((p) => p.t <= upTo);
  const x0 = points[0].t;
  const x1 = domainEnd ?? upTo;
  const H = height;
  const volH = volume ? H * 0.18 : 0;
  const top = 14;
  const priceH = H - volH - top - 10;

  // y 축 범위는 '보이는 점'으로만 정한다 — 미래 고점·저점이 축으로 새지 않게
  const ys = shown.flatMap((p) => [p.p, p.b]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.1 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const sx = (t: number) => ((t - x0) / (x1 - x0)) * W;
  const sy = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * priceH;
  const path = (key: "p" | "b", from: number, to: number) =>
    shown
      .filter((p) => p.t >= from && p.t <= to)
      .map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)},${sy(p[key]).toFixed(1)}`)
      .join("");

  const vMax = Math.max(...shown.map((p) => p.v), 1);
  const bw = (W / (x1 - x0 + 1)) * 0.68;
  const last = shown[shown.length - 1];
  const up = last.p >= 100;
  const splitAt = drawAfter ? drawAfter.from : 0;
  const preLine = path("p", -Infinity, upTo > 0 ? splitAt : 0);
  const postLine = upTo > splitAt ? path("p", splitAt, upTo) : "";
  const area = `${preLine}L${sx(Math.min(upTo > 0 ? splitAt : 0, upTo)).toFixed(1)},${H - volH}L${sx(x0)},${H - volH}Z`;
  const dur = reduce ? 0 : drawAfter?.duration ?? 0;
  const delay = reduce ? 0 : drawAfter?.delay ?? 0;

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const t = Math.round(x0 + ((e.clientX - r.left) / r.width) * (x1 - x0));
    setHover(Math.max(x0, Math.min(upTo, t)));
  };
  const hp = hover !== null ? shown.find((p) => p.t === hover) : null;
  const tip = hp
    ? hp.t < 0
      ? `${-hp.t}거래일 전 · 산 값 대비 ${pct(hp.p / 100 - 1)}`
      : hp.t === 0
        ? "산 날"
        : `${hp.t}거래일째 · ${pct(hp.p / 100 - 1)}`
    : "";

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={label ?? `주가 차트, 산 날 대비 마지막 값 ${pct(last.p / 100 - 1)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--navy)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--navy)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {x1 > 0 && <rect x={sx(0)} y={0} width={W - sx(0)} height={H} className="chart-future" />}
        <line x1={0} x2={W} y1={sy(100)} y2={sy(100)} className="chart-base" />
        <path d={path("b", -Infinity, upTo)} className="chart-bench" />
        <path d={area} fill={`url(#${gid}-fill)`} />
        <motion.path
          d={preLine}
          className="chart-price"
          initial={reduce || drawAfter ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        {postLine && (
          <motion.path
            key={postLine}
            d={postLine}
            className={up ? "chart-after up" : "chart-after down"}
            initial={dur ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: dur, delay, ease: "linear" }}
          />
        )}
        {volume &&
          shown.map((p) => (
            <rect
              key={p.t}
              x={sx(p.t) - bw / 2}
              width={bw}
              y={H - (p.v / vMax) * volH}
              height={(p.v / vMax) * volH}
              className={p.v >= 2 ? "chart-vol hot" : "chart-vol"}
            />
          ))}
        <circle cx={sx(0)} cy={sy(100)} r={5} className="chart-dot" />
        {eventT !== undefined && eventT <= upTo && (
          <g>
            <line x1={sx(eventT)} x2={sx(eventT)} y1={0} y2={H - volH} className="chart-event" />
            <circle cx={sx(eventT)} cy={sy(points.find((p) => p.t === eventT)!.p)} r={5.5} className="chart-event-dot" />
          </g>
        )}
        {exitT !== undefined && exitT < 20 && exitT <= upTo && (
          <g className="chart-exit">
            <line x1={sx(exitT)} x2={sx(exitT)} y1={0} y2={H - volH} />
            <text x={sx(exitT) + 4} y={12}>
              판 날
            </text>
          </g>
        )}
        {upTo > 0 && (
          <motion.circle
            cx={sx(last.t)}
            cy={sy(last.p)}
            r={6.5}
            className={up ? "chart-end up" : "chart-end down"}
            initial={dur ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: delay + dur, type: "spring", stiffness: 400, damping: 15 }}
          />
        )}
        {hp && (
          <g className="chart-hover">
            <line x1={sx(hp.t)} x2={sx(hp.t)} y1={0} y2={H - volH} />
            <circle cx={sx(hp.t)} cy={sy(hp.p)} r={4.5} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${Math.min(Math.max((sx(hp.t) / W) * 100, 18), 82)}%` }}>
          {tip}
          {hp.v >= 1.5 && <b> · 거래량 {hp.v.toFixed(1)}배</b>}
        </div>
      )}
    </div>
  );
}
