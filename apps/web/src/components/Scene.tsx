// 3D 를 쓸 수 있으면 3D, 아니면 2D 로(WebGL 미지원 · 움직임 줄이기 설정 · 사용자가 3D 끔).
// three.js(약 200KB gzip)는 3D 를 실제로 그릴 때만 받는다(코드 분할).
import { Suspense, lazy, useState } from "react";
import { read, write } from "../lib/storage";
import { FURNITURE } from "../lib/room";
import { Ant, type CharId, type Mood } from "./Characters";
import type { Stall } from "./three/Scenes";

const Room3D = lazy(() => import("./three/Scenes").then((m) => ({ default: m.Room })));
const Plaza3D = lazy(() => import("./three/Scenes").then((m) => ({ default: m.Plaza })));

const KEY = "ant:3d:v1";
let webgl: boolean | null = null;
function canWebGL() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function use3D(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => read<boolean>(KEY) ?? (canWebGL() && !reduced()));
  return [on && canWebGL(), (v) => (write(KEY, v), setOn(v))];
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  if (!canWebGL()) return null;
  return (
    <button className="toggle-3d" onClick={() => set(!on)} aria-pressed={on} data-ux="Toggle Switch">
      {on ? "2D로 보기" : "3D로 보기"}
    </button>
  );
}

export function RoomView({ char, items, mood = "happy", height = 300, outfit }: { char: CharId; items: string[]; mood?: Mood; height?: number; outfit?: string | null }) {
  const [on, set] = use3D();
  return (
    <div className="scene-wrap" data-ux="3D Scene (three.js)">
      {on ? (
        <Suspense fallback={<div className="stage3d skeleton" style={{ height }} />}>
          <Room3D char={char} items={items} mood={mood} height={height} outfit={outfit} />
        </Suspense>
      ) : (
        <div className="room2d" style={{ minHeight: height * 0.7 }}>
          <Ant char={char} mood={mood} size={110} bounce outfit={outfit} />
          <div className="room2d-items" aria-label={`가구 ${items.length}개`}>
            {FURNITURE.filter((f) => items.includes(f.id)).map((f) => (
              <span key={f.id} title={f.name}>
                {f.icon}
              </span>
            ))}
          </div>
        </div>
      )}
      <Toggle on={on} set={set} />
    </div>
  );
}

export function PlazaView({ stalls, onOpen }: { stalls: Stall[]; onOpen: (k: string) => void }) {
  const [on, set] = use3D();
  const top = [...stalls].sort((a, b) => b.hype - a.hype).slice(0, 7);
  const max = Math.max(1, ...top.map((s) => s.hype));
  return (
    <div className="scene-wrap plaza" data-ux="3D Scene · Data Visualization">
      {on ? (
        <Suspense fallback={<div className="stage3d skeleton" style={{ height: 260 }} />}>
          <Plaza3D stalls={stalls} onOpen={onOpen} height={260} />
        </Suspense>
      ) : (
        <ul className="plaza2d">
          {top.map((s) => (
            <li key={s.k}>
              <button onClick={() => onOpen(s.k)}>
                <span>{s.code}</span>
                <span className="crowd" aria-hidden>
                  <i style={{ width: `${(s.hype / max) * 100}%` }} />
                </span>
                <b>🔥{s.hype}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="plaza-cap">
        🐜 군중 = 지난주 실제 유튜브 언급 수 · 가판대 높이 = 지난주 등락(<span className="up">빨강▲</span>/<span className="down">파랑▼</span>) · 눌러서 자세히
      </p>
      <Toggle on={on} set={set} />
    </div>
  );
}
