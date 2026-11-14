// 효과음: 파일 없이 Web Audio 로 짧게 합성한다. 기본은 꺼짐(강의실), 상단 🔈 버튼으로 켠다.
import { read, write } from "./storage";

const KEY = "fs:sound:v1";
type Name = "flip" | "tick" | "confirm" | "hit" | "miss" | "alarm" | "coin" | "level" | "badge" | "whoosh";

let ctx: AudioContext | null = null;
let on = read<boolean>(KEY) ?? false;
const subs = new Set<(v: boolean) => void>();

export const soundOn = () => on;
export function setSound(v: boolean) {
  on = v;
  write(KEY, v);
  subs.forEach((f) => f(v));
  if (v) sfx("badge");
}
export function onSound(f: (v: boolean) => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.12, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur + 0.02);
}

const seq = (notes: number[], step: number, type: OscillatorType, vol?: number, dur?: number) =>
  notes.forEach((f, i) => tone(f, i * step, dur ?? step * 1.6, type, vol));

export function sfx(name: Name) {
  if (!on) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    switch (name) {
      case "flip":
        tone(520, 0, 0.08, "triangle", 0.1, 980);
        break;
      case "tick":
        tone(880, 0, 0.05, "sine", 0.07);
        break;
      case "whoosh":
        tone(300, 0, 0.35, "sine", 0.06, 1200);
        break;
      case "confirm":
        seq([523, 784], 0.07, "triangle", 0.1);
        break;
      case "hit":
        seq([523, 659, 784, 1047], 0.08, "triangle", 0.12);
        break;
      case "miss":
        tone(392, 0, 0.4, "sawtooth", 0.05, 196);
        break;
      case "alarm":
        seq([880, 660, 880, 660], 0.12, "square", 0.05, 0.1);
        break;
      case "coin":
        tone(988, 0, 0.08, "square", 0.05);
        tone(1319, 0.08, 0.25, "square", 0.05);
        break;
      case "level":
        seq([523, 659, 784, 1047, 784, 1047, 1319], 0.09, "triangle", 0.12);
        break;
      case "badge":
        seq([784, 1175, 1568], 0.08, "sine", 0.1);
        break;
    }
  } catch {
    /* 소리를 못 내도 게임은 계속 */
  }
}

/** 휴대폰 진동(지원할 때만) */
export function buzz(pattern: number | number[]) {
  if (!on) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 무시 */
  }
}
