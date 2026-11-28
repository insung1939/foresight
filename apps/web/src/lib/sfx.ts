// 효과음 + 배경음악: 파일 없이 Web Audio 로 합성한다. 기본은 꺼짐(강의실), 상단 🔈 버튼으로 켠다.
// 교수님 피드백 '게임은 사운드가 중요하다' → 소리를 켜면 잔잔한 로파이 배경음악(4마디 반복)도 같이 흐른다.
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
  if (v) {
    sfx("badge");
    music(true);
  } else music(false);
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

// ── 배경음악: Fmaj7 → Em7 → Dm7 → Cmaj7, 80bpm. 패드·베이스·아르페지오·하이햇을 0.1초 앞서 예약한다
const CHORDS = [
  [174.6, 220, 261.6, 329.6],
  [164.8, 196, 246.9, 293.7],
  [146.8, 174.6, 220, 261.6],
  [130.8, 164.8, 196, 246.9],
];
const BEAT = 60 / 80;
let bus: GainNode | null = null;
let timer: number | null = null;
let nextAt = 0;
let step = 0; // 8분음표 단위(마디당 8)

function note(f: number, at: number, dur: number, type: OscillatorType, vol: number, cutoff = 2400) {
  if (!ctx || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + Math.min(0.08, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(lp).connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function hat(at: number, vol: number) {
  if (!ctx || !bus) return;
  const n = ctx.createBufferSource();
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = b;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.value = vol;
  n.connect(hp).connect(g).connect(bus);
  n.start(at);
}

const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
function schedule() {
  if (!ctx) return;
  while (nextAt < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 8) % 4;
    const k = step % 8;
    const ch = CHORDS[bar];
    const e8 = BEAT / 2;
    if (k === 0) {
      ch.forEach((f) => note(f, nextAt, BEAT * 4, "triangle", 0.05, 900)); // 패드
      note(ch[0] / 2, nextAt, BEAT * 1.8, "sine", 0.16, 400); // 베이스
    }
    if (k === 5) note(ch[0] / 2, nextAt, BEAT, "sine", 0.1, 400);
    if (step % 16 !== 15) note(ch[ARP[k]] * 2, nextAt + (k % 2 ? 0.02 : 0), e8 * 1.6, "sine", 0.045, 3000); // 아르페지오(살짝 스윙)
    hat(nextAt + (k % 2 ? 0.03 : 0), k % 2 ? 0.05 : 0.025);
    nextAt += e8;
    step++;
  }
}

/** 배경음악 켜고 끄기(소리 버튼과 함께) */
export function music(v: boolean) {
  try {
    if (v) {
      if (timer !== null) return;
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.5);
      bus.connect(ctx.destination);
      nextAt = ctx.currentTime + 0.1;
      step = 0;
      timer = window.setInterval(schedule, 100);
    } else if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
      if (ctx && bus) {
        const b = bus;
        b.gain.cancelScheduledValues(ctx.currentTime);
        b.gain.setValueAtTime(b.gain.value, ctx.currentTime);
        b.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        setTimeout(() => b.disconnect(), 600);
      }
      bus = null;
    }
  } catch {
    /* 음악을 못 틀어도 게임은 계속 */
  }
}

// 소리를 켜 둔 채 다시 들어오면 첫 터치 때 음악을 다시 튼다(브라우저 자동재생 정책)
if (typeof window !== "undefined" && on) {
  const kick = () => {
    if (on) music(true);
    window.removeEventListener("pointerdown", kick);
    window.removeEventListener("keydown", kick);
  };
  window.addEventListener("pointerdown", kick);
  window.addEventListener("keydown", kick);
}
