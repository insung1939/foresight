// 내 방(3D). 후기: '가구가 더 많고 방이 넓어서 채우는 재미' + '실제 같은 퀄리티'.
//  - 방 크기 3단계: 원룸 → 확장 공사(★20) → 펜트하우스(★40, 대리석·통유리·노을 도시)
//  - 재질: 캔버스로 그린 원목 마루·대리석·회벽·패브릭·러그 텍스처(외부 파일 없음)
//  - 빛: 햇빛 그림자 + 조명 반사(Lightformer 환경광) + (큰 화면) 앰비언트 오클루전·블룸·ACES 톤매핑
//  - 놀이: 바닥을 누르면 걸어가고, 가구를 누르면 다가가 한마디, 개미·고양이를 누르면 반응, 방향키 이동
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CanvasTexture,
  ExtrudeGeometry,
  CubicBezierCurve3,
  DoubleSide,
  LatheGeometry,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
  type Group,
  type PerspectiveCamera,
} from "three";
import { CHAR_META, type CharId } from "../Characters";
import { Ant3D } from "./Ant3D";

const Post = lazy(() => import("./Post"));

// ---------------------------------------------------------------- 결정적 난수(매번 같은 방 모양)
function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 텍스처(캔버스로 그린다)
const cache = new Map<string, CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, r: () => number, dark = true) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(0,0,0,${alpha * r()})` : `rgba(255,255,255,${alpha * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
/** 원목 마루: 판자마다 색·결이 다르고 이음매가 보인다 */
const woodFloor = () =>
  tex("wood", 1024, 1024, (g, w, h) => {
    const r = rnd(7);
    const rows = 8;
    const ph = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 400;
      while (x < w) {
        const len = 520 + r() * 480;
        const l = 57 + r() * 6;
        g.fillStyle = `hsl(${30 + r() * 4}, ${30 + r() * 6}%, ${l}%)`;
        g.fillRect(x, y * ph, len, ph);
        // 나뭇결
        for (let k = 0; k < 26; k++) {
          const yy = y * ph + r() * ph;
          g.strokeStyle = `rgba(90,55,30,${0.04 + r() * 0.07})`;
          g.lineWidth = 0.6 + r() * 1.6;
          g.beginPath();
          g.moveTo(x, yy);
          for (let s = 0; s <= len; s += 20) g.lineTo(x + s, yy + Math.sin((s + k * 30) / (40 + r() * 60)) * 2.2);
          g.stroke();
        }
        // 옹이 가끔
        if (r() < 0.25) {
          g.fillStyle = "rgba(60,30,10,0.25)";
          g.beginPath();
          g.ellipse(x + r() * len, y * ph + r() * ph, 6 + r() * 8, 3 + r() * 3, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(60,35,18,0.35)";
        g.fillRect(x, y * ph, 2, ph); // 판자 끝 이음매
        x += len;
      }
      g.fillStyle = "rgba(60,35,18,0.4)";
      g.fillRect(0, y * ph, w, 2); // 판자 사이 틈
    }
    noise(g, w, h, 9000, 0.06, r);
  });
/** 대리석: 흰 바탕에 회색 결, 큰 판 */
const marble = () =>
  tex("marble", 1024, 1024, (g, w, h) => {
    const r = rnd(11);
    g.fillStyle = "#efece7";
    g.fillRect(0, 0, w, h);
    for (let v = 0; v < 18; v++) {
      let x = r() * w;
      let y = r() * h;
      g.strokeStyle = `rgba(${110 + r() * 40},${110 + r() * 40},${125 + r() * 40},${0.12 + r() * 0.22})`;
      g.lineWidth = 0.6 + r() * 2.6;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 60; s++) {
        x += (r() - 0.35) * 28;
        y += (r() - 0.5) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    noise(g, w, h, 6000, 0.04, r);
    g.fillStyle = "rgba(90,90,100,0.22)";
    g.fillRect(0, h / 2, w, 1.5);
    g.fillRect(w / 2, 0, 1.5, h);
  });
const plaster = (key: string, base: string) =>
  tex(`plaster-${key}`, 512, 512, (g, w, h) => {
    const r = rnd(key.length * 13);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 14000, 0.035, r);
    noise(g, w, h, 6000, 0.05, r, false);
  });
const fabric = (key: string, base: string) =>
  tex(`fabric-${key}`, 256, 256, (g, w, h) => {
    const r = rnd(key.length * 17 + 3);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < h; i += 3) {
      g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.03})`;
      g.fillRect(0, i, w, 1);
    }
    for (let i = 0; i < w; i += 3) {
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.02})`;
      g.fillRect(i, 0, 1, h);
    }
    noise(g, w, h, 3000, 0.08, r);
  });
/** 손으로 짠 러그: 테두리 + 마름모 무늬 */
const rugTex = () =>
  tex("rug", 1024, 768, (g, w, h) => {
    const r = rnd(5);
    g.fillStyle = "#e8dcc4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#b5563a";
    g.lineWidth = 34;
    g.strokeRect(40, 40, w - 80, h - 80);
    g.strokeStyle = "#2f4858";
    g.lineWidth = 8;
    g.strokeRect(86, 86, w - 172, h - 172);
    for (let y = 150; y < h - 120; y += 90)
      for (let x = 150; x < w - 120; x += 90) {
        g.fillStyle = (x + y) % 180 === 0 ? "#b5563a" : "#c9a66b";
        g.beginPath();
        g.moveTo(x, y - 26);
        g.lineTo(x + 26, y);
        g.lineTo(x, y + 26);
        g.lineTo(x - 26, y);
        g.closePath();
        g.fill();
      }
    for (let i = 0; i < 60000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.05 * r()})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });
/** 창밖: 낮(하늘·먼 빌딩) / 노을(펜트하우스, 불 켜진 창) */
const sky = (dusk: boolean) =>
  tex(dusk ? "sky-dusk" : "sky-day", 2048, 1024, (g, w, h) => {
    const r = rnd(dusk ? 21 : 19);
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (dusk) {
      grd.addColorStop(0, "#1b1f4b");
      grd.addColorStop(0.45, "#6a4c93");
      grd.addColorStop(0.75, "#f28c6b");
      grd.addColorStop(1, "#ffd29d");
    } else {
      grd.addColorStop(0, "#6fb1f2");
      grd.addColorStop(0.7, "#cfe6fb");
      grd.addColorStop(1, "#f6f0e3");
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // 구름(낮)
    if (!dusk)
      for (let i = 0; i < 14; i++) {
        g.fillStyle = "rgba(255,255,255,0.55)";
        const cx = r() * w;
        const cy = r() * h * 0.45;
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.arc(cx + k * 30 * r(), cy + (r() - 0.5) * 20, 30 + r() * 40, 0, Math.PI * 2);
          g.fill();
        }
      }
    // 빌딩 두 겹(먼 것은 흐리게)
    for (const layer of [0, 1]) {
      let x = 0;
      while (x < w) {
        const bw = 60 + r() * 140;
        const bh = (layer ? 220 : 320) + r() * (layer ? 380 : 260);
        const top = h - bh;
        g.fillStyle = dusk ? (layer ? "#141833" : "#2a2a55") : layer ? "#8fa3bf" : "#b7c6da";
        g.fillRect(x, top, bw - 6, bh);
        if (layer || dusk)
          for (let wy = top + 14; wy < h - 10; wy += 22)
            for (let wx = x + 8; wx < x + bw - 16; wx += 16)
              if (r() < (dusk ? 0.55 : 0.25)) {
                g.fillStyle = dusk ? `rgba(255,${200 + r() * 40},${120 + r() * 60},${0.6 + r() * 0.4})` : "rgba(255,255,255,0.35)";
                g.fillRect(wx, wy, 8, 12);
              }
        x += bw;
      }
    }
  });
/** 주식 모니터 화면: 빨간 양봉 위주 차트 */
const screenTex = (seed: number) =>
  tex(`screen-${seed}`, 512, 300, (g, w, h) => {
    const r = rnd(seed);
    g.fillStyle = "#0b1020";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,140,200,0.18)";
    for (let y = 30; y < h; y += 40) g.fillRect(0, y, w, 1);
    let p = h * 0.7;
    for (let x = 16; x < w - 10; x += 14) {
      const o = p;
      p = Math.max(30, Math.min(h - 30, p + (r() - 0.58) * 26));
      const up = p < o;
      g.fillStyle = up ? "#ff4d57" : "#3d8bff";
      g.fillRect(x, Math.min(o, p), 8, Math.max(2, Math.abs(o - p)));
      g.fillRect(x + 3.5, Math.min(o, p) - 6, 1, Math.abs(o - p) + 12);
    }
    g.fillStyle = "#ff4d57";
    g.font = "bold 28px sans-serif";
    g.fillText("▲ +4.82%", 18, 34);
  });
const tvTex = () =>
  tex("tv", 640, 360, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#ff9a62");
    grd.addColorStop(0.6, "#ffd6a0");
    grd.addColorStop(1, "#5a7d9a");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff3c4";
    g.beginPath();
    g.arc(w * 0.68, h * 0.52, 40, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3e5c76";
    g.beginPath();
    g.moveTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, h * (0.62 + Math.sin(x / 70) * 0.06));
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
  });

function useTexRepeat(t: CanvasTexture, x: number, y: number) {
  return useMemo(() => {
    const c = t.clone();
    c.repeat.set(x, y);
    c.needsUpdate = true;
    return c;
  }, [t, x, y]);
}

// ---------------------------------------------------------------- 방 크기
type Tier = "small" | "wide" | "pent";
const SIZE: Record<Tier, { hx: number; hz: number; H: number }> = {
  small: { hx: 3.5, hz: 3.0, H: 3.0 },
  wide: { hx: 4.5, hz: 3.6, H: 3.1 },
  pent: { hx: 5.0, hz: 4.0, H: 3.4 },
};

interface Layout {
  hx: number;
  hz: number;
  H: number;
  deskX: number;
  tvX: number;
  sofaX: number;
  bedZ: number;
}
function layout(t: Tier): Layout {
  const { hx, hz, H } = SIZE[t];
  return { hx, hz, H, deskX: -hx + 2.45, tvX: hx - 1.9, sofaX: hx - 2.4, bedZ: -hz + 2.35 };
}

// ---------------------------------------------------------------- 재질 도우미
const Wood = ({ c = "#8a5a3b", r = 0.55 }: { c?: string; r?: number }) => <meshStandardMaterial color={c} roughness={r} />;
const Metal = ({ c = "#2b2b30", r = 0.35 }: { c?: string; r?: number }) => <meshStandardMaterial color={c} metalness={0.85} roughness={r} />;
const Gold = () => <meshStandardMaterial color="#f2c14e" metalness={1} roughness={0.22} />;
const Cloth = ({ map }: { map: CanvasTexture }) => <meshStandardMaterial map={map} roughness={0.95} />;

// ---------------------------------------------------------------- 가구
function Desk({ L, dual, monitor }: { L: Layout; dual: boolean; monitor: boolean }) {
  const oak = useTexRepeat(woodFloor(), 0.6, 0.3);
  return (
    <group position={[L.deskX, 0, -L.hz + 0.42]}>
      <RoundedBox args={[1.6, 0.05, 0.72]} radius={0.015} position={[0, 0.76, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={oak} roughness={0.45} />
      </RoundedBox>
      {[-0.74, 0.74].flatMap((x) =>
        [-0.3, 0.3].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.37, z]} castShadow>
            <boxGeometry args={[0.04, 0.74, 0.04]} />
            <Metal />
          </mesh>
        )),
      )}
      {/* 서랍장 */}
      <RoundedBox args={[0.42, 0.55, 0.6]} radius={0.01} position={[0.5, 0.29, 0]} castShadow>
        <Wood c="#efe9df" r={0.6} />
      </RoundedBox>
      {[0.42, 0.22].map((y) => (
        <mesh key={y} position={[0.5, y, 0.305]}>
          <boxGeometry args={[0.14, 0.015, 0.01]} />
          <Metal c="#b8b8b8" />
        </mesh>
      ))}
      {/* 키보드·마우스·머그 */}
      <RoundedBox args={[0.46, 0.02, 0.15]} radius={0.006} position={[-0.05, 0.795, 0.17]} castShadow>
        <meshStandardMaterial color="#e9ecef" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0.3, 0.8, 0.18]} scale={[1, 0.5, 1.4]} castShadow>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshStandardMaterial color="#e9ecef" />
      </mesh>
      <Mug position={[-0.58, 0.785, 0.12]} color="#d9480f" />
      {monitor && (dual ? [-0.33, 0.33] : [0]).map((x, i) => <Monitor key={x} position={[x, 0.785, -0.12]} rot={dual ? (i ? -0.22 : 0.22) : 0} seed={3 + i} />)}
      <Chair position={[0, 0, 0.75]} />
    </group>
  );
}
function Monitor({ position, rot, seed }: { position: [number, number, number]; rot: number; seed: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.01, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.12, 0.02, 24]} />
        <Metal c="#3a3a40" />
      </mesh>
      <mesh position={[0, 0.16, -0.02]} castShadow>
        <boxGeometry args={[0.04, 0.3, 0.02]} />
        <Metal c="#3a3a40" />
      </mesh>
      <RoundedBox args={[0.66, 0.4, 0.025]} radius={0.01} position={[0, 0.42, 0]} castShadow>
        <meshStandardMaterial color="#111" roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.425, 0.0135]}>
        <planeGeometry args={[0.63, 0.37]} />
        <meshBasicMaterial map={screenTex(seed)} toneMapped={false} />
      </mesh>
    </group>
  );
}
function Mug({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.045, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.036, 0.09, 24]} />
        <meshStandardMaterial color={color} roughness={0.25} />
      </mesh>
      <mesh position={[0.045, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.022, 0.007, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.25} />
      </mesh>
    </group>
  );
}
function Chair({ position }: { position: [number, number, number] }) {
  const f = fabric("chair", "#3b3f46");
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      <RoundedBox args={[0.5, 0.08, 0.48]} radius={0.035} position={[0, 0.48, 0]} castShadow>
        <Cloth map={f} />
      </RoundedBox>
      <RoundedBox args={[0.48, 0.6, 0.07]} radius={0.035} position={[0, 0.86, 0.23]} rotation={[0.1, 0, 0]} castShadow>
        <Cloth map={f} />
      </RoundedBox>
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.4, 12]} />
        <Metal />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0.15, 0.06, 0]} rotation={[0, 0, 0.08]} castShadow>
              <boxGeometry args={[0.3, 0.03, 0.04]} />
              <Metal />
            </mesh>
            <mesh position={[0.29, 0.025, 0]}>
              <sphereGeometry args={[0.025, 10, 10]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
function Bed({ L }: { L: Layout }) {
  const duvet = fabric("duvet", "#9bb5a0");
  const head = fabric("head", "#c8b6a6");
  return (
    <group position={[-L.hx + 1.12, 0, L.bedZ]} rotation={[0, Math.PI / 2, 0]}>
      {/* 프레임 */}
      <RoundedBox args={[1.6, 0.3, 2.1]} radius={0.03} position={[0, 0.17, 0]} castShadow receiveShadow>
        <Wood c="#7a5236" />
      </RoundedBox>
      {/* 매트리스·이불 */}
      <RoundedBox args={[1.5, 0.24, 2.0]} radius={0.08} position={[0, 0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8f6f1" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[1.56, 0.12, 1.35]} radius={0.06} position={[0, 0.55, 0.3]} castShadow>
        <Cloth map={duvet} />
      </RoundedBox>
      <RoundedBox args={[1.6, 0.06, 0.5]} radius={0.03} position={[0, 0.6, 0.95]} rotation={[0.2, 0, 0]}>
        <Cloth map={duvet} />
      </RoundedBox>
      {/* 베개 */}
      {[-0.38, 0.38].map((x) => (
        <RoundedBox key={x} args={[0.62, 0.14, 0.38]} radius={0.07} position={[x, 0.62, -0.72]} rotation={[-0.15, 0, 0]} castShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </RoundedBox>
      ))}
      {/* 헤드보드(벽 쪽) */}
      <RoundedBox args={[1.7, 1.05, 0.12]} radius={0.05} position={[0, 0.75, -1.06]} castShadow>
        <Cloth map={head} />
      </RoundedBox>
      {/* 협탁 */}
      <group position={[1.15, 0, -0.85]}>
        <RoundedBox args={[0.45, 0.5, 0.4]} radius={0.02} position={[0, 0.25, 0]} castShadow>
          <Wood c="#a77b54" />
        </RoundedBox>
        <mesh position={[0, 0.58, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.08, 0.16, 16]} />
          <meshStandardMaterial color="#e9e2d6" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.09, 0.13, 0.14, 24, 1, true]} />
          <meshStandardMaterial color="#fff4e0" emissive="#ffd8a0" emissiveIntensity={0.6} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
/** 몬스테라: 구멍 뚫린 하트 잎 */
const leafGeo = (() => {
  let g: Shape | null = null;
  return () => {
    if (g) return g;
    const s = new Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.3, 0.02, 0.38, 0.38, 0, 0.62);
    s.bezierCurveTo(-0.38, 0.38, -0.3, 0.02, 0, 0);
    for (const [x, y] of [
      [0.14, 0.2],
      [0.17, 0.34],
      [-0.14, 0.22],
      [-0.16, 0.36],
    ]) {
      const h = new Path();
      h.absellipse(x, y, 0.035, 0.018, 0, Math.PI * 2, false, x > 0 ? 0.5 : -0.5);
      s.holes.push(h);
    }
    g = s;
    return s;
  };
})();
function Plant({ L }: { L: Layout }) {
  const leaves = useMemo(() => {
    const r = rnd(4);
    return Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2 + r() * 0.4;
      const h = 0.75 + r() * 0.75;
      const out = 0.15 + r() * 0.3;
      const end = new Vector3(Math.cos(a) * out, h, Math.sin(a) * out);
      const curve = new CubicBezierCurve3(new Vector3(0, 0.45, 0), new Vector3(0, h * 0.6, 0), new Vector3(end.x * 0.6, h * 0.95, end.z * 0.6), end);
      return { a, end, stem: new TubeGeometry(curve, 16, 0.012, 6, false), tilt: 0.6 + r() * 0.6, s: 0.75 + r() * 0.45 };
    });
  }, []);
  return (
    <group position={[L.hx - 0.5, 0, -L.hz + 0.5]}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.5, 32]} />
        <meshStandardMaterial color="#f1ede6" roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.02, 24]} />
        <meshStandardMaterial color="#3b2a1e" roughness={1} />
      </mesh>
      {leaves.map((l, i) => (
        <group key={i}>
          <mesh geometry={l.stem} castShadow>
            <meshStandardMaterial color="#4f7a3a" roughness={0.7} />
          </mesh>
          <mesh position={l.end} rotation={[-l.tilt, -l.a + Math.PI / 2, 0]} scale={l.s} castShadow>
            <shapeGeometry args={[leafGeo(), 24]} />
            <meshStandardMaterial color={i % 3 ? "#2f6b3a" : "#3c7d45"} roughness={0.55} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function ArcLamp({ L }: { L: Layout }) {
  const arc = useMemo(() => new TubeGeometry(new CubicBezierCurve3(new Vector3(0, 0.05, 0), new Vector3(0, 2.0, 0), new Vector3(0.7, 2.35, 0), new Vector3(1.25, 1.85, 0)), 48, 0.018, 8, false), []);
  return (
    <group position={[-L.hx + 0.4, 0, L.bedZ + 1.4]}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.08, 32]} />
        <meshStandardMaterial map={marble()} roughness={0.2} />
      </mesh>
      <mesh geometry={arc} castShadow>
        <Metal c="#c9a227" r={0.25} />
      </mesh>
      <group position={[1.25, 1.85, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.25} side={DoubleSide} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color="#fff3d6" emissive="#ffd9a0" emissiveIntensity={4} toneMapped={false} />
        </mesh>
        <pointLight position={[0, -0.15, 0]} intensity={6} distance={5} decay={2} color="#ffcf8a" />
      </group>
    </group>
  );
}
function Sofa({ L }: { L: Layout }) {
  const f = fabric("sofa", "#5f7a96");
  return (
    <group position={[L.sofaX, 0, L.hz - 0.6]} rotation={[0, Math.PI, 0]}>
      <RoundedBox args={[2.3, 0.3, 0.95]} radius={0.06} position={[0, 0.25, 0]} castShadow receiveShadow>
        <Cloth map={f} />
      </RoundedBox>
      {[-0.68, 0, 0.68].map((x) => (
        <group key={x}>
          <RoundedBox args={[0.66, 0.16, 0.7]} radius={0.07} position={[x, 0.47, 0.08]} castShadow>
            <Cloth map={f} />
          </RoundedBox>
          <RoundedBox args={[0.66, 0.5, 0.2]} radius={0.09} position={[x, 0.72, -0.34]} rotation={[-0.12, 0, 0]} castShadow>
            <Cloth map={f} />
          </RoundedBox>
        </group>
      ))}
      {[-1.08, 1.08].map((x) => (
        <RoundedBox key={x} args={[0.18, 0.55, 0.95]} radius={0.08} position={[x, 0.45, 0]} castShadow>
          <Cloth map={f} />
        </RoundedBox>
      ))}
      {[-0.95, 0.95].flatMap((x) =>
        [-0.38, 0.38].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.05, z]} castShadow>
            <cylinderGeometry args={[0.025, 0.018, 0.1, 10]} />
            <Wood c="#5a3b25" />
          </mesh>
        )),
      )}
      {/* 쿠션 */}
      <RoundedBox args={[0.42, 0.38, 0.12]} radius={0.06} position={[-0.75, 0.72, -0.18]} rotation={[-0.3, 0.3, 0.1]} castShadow>
        <meshStandardMaterial color="#e0a458" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.42, 0.38, 0.12]} radius={0.06} position={[0.78, 0.72, -0.18]} rotation={[-0.3, -0.25, -0.08]} castShadow>
        <meshStandardMaterial color="#f3efe7" roughness={0.9} />
      </RoundedBox>
    </group>
  );
}
function Shelf({ L }: { L: Layout }) {
  const books = useMemo(() => {
    const r = rnd(9);
    const pal = ["#7b2d26", "#2f4858", "#b5563a", "#d9b26f", "#33658a", "#55443d", "#86bbd8", "#3a5a40", "#f6ae2d", "#e9e2d6"];
    const out: { x: number; y: number; w: number; h: number; c: string; lean: number }[] = [];
    for (const y of [0.08, 0.56, 1.04, 1.52]) {
      let x = -0.52;
      while (x < 0.5) {
        if (r() < 0.12) {
          x += 0.1;
          continue;
        }
        const w = 0.03 + r() * 0.035;
        const h = 0.24 + r() * 0.14;
        out.push({ x: x + w / 2, y, w, h, c: pal[Math.floor(r() * pal.length)], lean: r() < 0.08 ? 0.25 : 0 });
        x += w + 0.004;
      }
    }
    return out;
  }, []);
  return (
    <group position={[-L.hx + 0.78, 0, -L.hz + 0.2]}>
      {[-0.58, 0.58].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 2.0, 0.32]} />
          <Wood c="#e9e1d4" r={0.6} />
        </mesh>
      ))}
      {[0.04, 0.52, 1.0, 1.48, 1.98].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.16, 0.035, 0.32]} />
          <Wood c="#e9e1d4" r={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, -0.15]} receiveShadow>
        <boxGeometry args={[1.16, 2.0, 0.01]} />
        <Wood c="#d8cfc0" />
      </mesh>
      {books.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.h / 2 + 0.02, 0.02]} rotation={[0, 0, b.lean]} castShadow>
          <boxGeometry args={[b.w, b.h, 0.22]} />
          <meshStandardMaterial color={b.c} roughness={0.7} />
        </mesh>
      ))}
      {/* 작은 화분 */}
      <mesh position={[0.4, 1.58, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.1, 16]} />
        <meshStandardMaterial color="#c8553d" roughness={0.6} />
      </mesh>
      <mesh position={[0.4, 1.68, 0]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#4f7a3a" roughness={0.8} />
      </mesh>
    </group>
  );
}
function Curtain({ x, w, h }: { x: number; w: number; h: number }) {
  const geo = useMemo(() => {
    const g = new PlaneGeometry(w, h, 32, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI * 7) * 0.035);
    g.computeVertexNormals();
    return g;
  }, [w, h]);
  return (
    <mesh geometry={geo} position={[x, 0, 0.12]} castShadow>
      <meshStandardMaterial color="#efe6d6" roughness={0.95} side={DoubleSide} />
    </mesh>
  );
}
function Window({ L, pent }: { L: Layout; pent: boolean }) {
  if (pent) {
    // 펜트하우스: 책상 오른쪽 벽 전체가 통유리. 밖은 노을 진 도시
    const x0 = L.deskX + 1.15;
    const w = L.hx - x0;
    const cx = x0 + w / 2;
    return (
      <group>
        <mesh position={[cx, L.H / 2, -L.hz - 0.35]}>
          <planeGeometry args={[w + 0.02, L.H]} />
          <meshBasicMaterial map={sky(true)} toneMapped={false} />
        </mesh>
        <mesh position={[cx, L.H / 2, -L.hz + 0.02]}>
          <planeGeometry args={[w, L.H]} />
          <meshPhysicalMaterial color="#cfe3ff" transparent opacity={0.12} roughness={0.05} metalness={0} />
        </mesh>
        {Array.from({ length: Math.round(w / 1.1) + 1 }, (_, i) => (
          <mesh key={i} position={[x0 + (i * w) / Math.round(w / 1.1), L.H / 2, -L.hz + 0.03]} castShadow>
            <boxGeometry args={[0.05, L.H, 0.08]} />
            <Metal c="#1f1f24" />
          </mesh>
        ))}
        <mesh position={[cx, 0.02, -L.hz + 0.03]}>
          <boxGeometry args={[w, 0.05, 0.1]} />
          <Metal c="#1f1f24" />
        </mesh>
        <mesh position={[cx, L.H - 0.02, -L.hz + 0.03]}>
          <boxGeometry args={[w, 0.05, 0.1]} />
          <Metal c="#1f1f24" />
        </mesh>
      </group>
    );
  }
  const w = 1.7;
  const h = 1.2;
  const y = 1.9;
  return (
    <group position={[L.tvX, y, -L.hz + 0.08]}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={sky(false)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.08} roughness={0.05} />
      </mesh>
      {/* 창틀 */}
      {[
        [0, h / 2, w + 0.1, 0.06],
        [0, -h / 2, w + 0.1, 0.06],
        [-w / 2, 0, 0.06, h],
        [w / 2, 0, 0.06, h],
        [0, 0, 0.035, h],
        [0, 0.08, w, 0.035],
      ].map(([x, yy, ww, hh], i) => (
        <mesh key={i} position={[x, yy, 0.03]} castShadow>
          <boxGeometry args={[ww, hh, 0.07]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, -h / 2 - 0.04, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.25, 0.04, 0.2]} />
        <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
      </mesh>
      {/* 커튼과 봉 */}
      <mesh position={[0, h / 2 + 0.18, 0.13]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, w + 0.9, 10]} />
        <Metal c="#2b2b30" />
      </mesh>
      <group position={[0, -0.12, 0]}>
        <Curtain x={-w / 2 - 0.22} w={0.5} h={1.75} />
        <Curtain x={w / 2 + 0.22} w={0.5} h={1.75} />
      </group>
    </group>
  );
}
function TV({ L, pent }: { L: Layout; pent: boolean }) {
  return (
    <group position={[L.tvX, 0, -L.hz + (pent ? 0.45 : 0.28)]}>
      <RoundedBox args={[1.7, 0.46, 0.42]} radius={0.02} position={[0, 0.25, 0]} castShadow receiveShadow>
        <Wood c="#6b4a33" r={0.5} />
      </RoundedBox>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.26, 0.212]}>
          <boxGeometry args={[0.8, 0.38, 0.005]} />
          <Wood c="#7a5538" r={0.45} />
        </mesh>
      ))}
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.01, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.36]} />
          <Metal />
        </mesh>
      ))}
      <mesh position={[0, 0.5, -0.05]} castShadow>
        <boxGeometry args={[0.3, 0.02, 0.18]} />
        <Metal />
      </mesh>
      <mesh position={[0, 0.58, -0.07]}>
        <boxGeometry args={[0.04, 0.14, 0.03]} />
        <Metal />
      </mesh>
      <RoundedBox args={[1.25, 0.72, 0.035]} radius={0.01} position={[0, 0.88, -0.06]} castShadow>
        <meshStandardMaterial color="#0c0c0e" roughness={0.25} />
      </RoundedBox>
      <mesh position={[0, 0.88, -0.04]}>
        <planeGeometry args={[1.21, 0.68]} />
        <meshBasicMaterial map={tvTex()} toneMapped={false} />
      </mesh>
      {/* 장식: 책 두 권과 작은 꽃병 */}
      <mesh position={[0.6, 0.5, 0.05]} castShadow>
        <boxGeometry args={[0.24, 0.05, 0.17]} />
        <meshStandardMaterial color="#2f4858" />
      </mesh>
      <mesh position={[-0.62, 0.58, 0.05]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.2, 20]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.2} />
      </mesh>
    </group>
  );
}
function CoffeeTable({ L }: { L: Layout }) {
  const oak = useTexRepeat(woodFloor(), 0.4, 0.25);
  return (
    <group position={[L.sofaX, 0, L.hz - 1.85]}>
      <RoundedBox args={[1.15, 0.05, 0.6]} radius={0.02} position={[0, 0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={oak} roughness={0.4} />
      </RoundedBox>
      {[-0.5, 0.5].flatMap((x) =>
        [-0.24, 0.24].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.2, z]} castShadow>
            <cylinderGeometry args={[0.022, 0.016, 0.4, 10]} />
            <Wood c="#4a3020" />
          </mesh>
        )),
      )}
      <Mug position={[0.25, 0.445, 0.08]} color="#f8f9fa" />
      <mesh position={[-0.22, 0.47, -0.02]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.04, 0.22]} />
        <meshStandardMaterial color="#b5563a" />
      </mesh>
      <mesh position={[-0.2, 0.505, -0.02]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.26, 0.03, 0.19]} />
        <meshStandardMaterial color="#e9e2d6" />
      </mesh>
    </group>
  );
}
function Fish({ phase, color, len }: { phase: number; color: string; len: number }) {
  const g = useRef<Group>(null);
  useFrame((st) => {
    if (!g.current) return;
    const t = st.clock.elapsedTime * 0.6 + phase;
    g.current.position.set(Math.sin(t) * len, 0.32 + Math.sin(t * 1.7) * 0.07, Math.cos(t * 0.8) * 0.08);
    g.current.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
  });
  return (
    <group ref={g}>
      <mesh scale={[1.6, 0.8, 0.5]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      <mesh position={[-0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.03, 0.05, 4]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
    </group>
  );
}
function Aquarium({ L }: { L: Layout }) {
  return (
    <group position={[-L.hx + 0.33, 0, L.hz - 0.85]} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[1.0, 0.7, 0.42]} radius={0.02} position={[0, 0.35, 0]} castShadow receiveShadow>
        <Wood c="#2f2a26" r={0.5} />
      </RoundedBox>
      <group position={[0, 0.7, 0]}>
        <mesh position={[0, 0.27, 0]}>
          <boxGeometry args={[0.96, 0.54, 0.38]} />
          <meshPhysicalMaterial color="#bfe6ff" transparent opacity={0.18} roughness={0.02} />
        </mesh>
        <mesh position={[0, 0.24, 0]}>
          <boxGeometry args={[0.92, 0.46, 0.34]} />
          <meshStandardMaterial color="#4dabf7" transparent opacity={0.28} emissive="#1c7ed6" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.92, 0.05, 0.34]} />
          <meshStandardMaterial color="#d8c3a5" roughness={1} />
        </mesh>
        {[-0.3, -0.1, 0.25, 0.35].map((x, i) => (
          <mesh key={x} position={[x, 0.15 + (i % 2) * 0.04, -0.08]}>
            <coneGeometry args={[0.04, 0.22 + (i % 2) * 0.1, 6]} />
            <meshStandardMaterial color="#2b8a3e" />
          </mesh>
        ))}
        <Fish phase={0} color="#ff922b" len={0.36} />
        <Fish phase={2.1} color="#f03e3e" len={0.32} />
        <Fish phase={4.2} color="#ffd43b" len={0.3} />
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[0.98, 0.03, 0.4]} />
          <meshStandardMaterial color="#222" emissive="#a5d8ff" emissiveIntensity={0.4} />
        </mesh>
      </group>
    </group>
  );
}
/** 그림 한 점(캔버스로 그린 추상화) */
const artTex = (seed: number) =>
  tex(`art-${seed}`, 400, 500, (g, w, h) => {
    const r = rnd(seed * 31);
    const pals = [
      ["#f4f1de", "#e07a5f", "#3d405b", "#81b29a", "#f2cc8f"],
      ["#fefae0", "#283618", "#606c38", "#dda15e", "#bc6c25"],
      ["#edf2f4", "#2b2d42", "#8d99ae", "#ef233c", "#d90429"],
    ][seed % 3];
    g.fillStyle = pals[0];
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = pals[1 + Math.floor(r() * 4)];
      g.globalAlpha = 0.85;
      if (r() < 0.5) {
        g.beginPath();
        g.arc(r() * w, r() * h, 30 + r() * 110, 0, Math.PI * (1 + r()));
        g.fill();
      } else g.fillRect(r() * w * 0.8, r() * h * 0.8, 40 + r() * 160, 20 + r() * 120);
    }
    g.globalAlpha = 1;
  });
function Gallery({ L }: { L: Layout }) {
  const z0 = L.hz - 0.85; // 어항·장식장 위 왼쪽 벽
  return (
    <group position={[-L.hx + 0.02, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      {[
        [-z0 - 0.0, 2.15, 0.55, 0.7, 1],
        [-z0 + 0.75, 2.3, 0.45, 0.45, 2],
        [-z0 + 0.75, 1.75, 0.45, 0.45, 3],
      ].map(([x, y, w, h, seed]) => (
        <group key={seed} position={[x, y, 0]}>
          <mesh castShadow>
            <boxGeometry args={[w + 0.06, h + 0.06, 0.035]} />
            <meshStandardMaterial color={seed === 1 ? "#c9a227" : "#1f1f24"} metalness={seed === 1 ? 0.8 : 0} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.019]}>
            <planeGeometry args={[w - 0.04, h - 0.04]} />
            <meshStandardMaterial map={artTex(seed)} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* 벽 선반 + 소품 */}
      <group position={[-z0 + 1.55, 2.05, 0.1]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.03, 0.2]} />
          <Wood c="#a77b54" />
        </mesh>
        <mesh position={[-0.2, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.15, 16]} />
          <meshStandardMaterial color="#e07a5f" roughness={0.4} />
        </mesh>
        <mesh position={[0.05, 0.08, 0]} castShadow>
          <boxGeometry args={[0.18, 0.13, 0.12]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0.24, 0.07, 0]} castShadow>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color="#81b29a" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}
const cupGeo = (() => {
  let g: LatheGeometry | null = null;
  return () =>
    (g ??= new LatheGeometry(
      [
        [0, 0],
        [0.06, 0],
        [0.06, 0.02],
        [0.015, 0.04],
        [0.015, 0.1],
        [0.06, 0.13],
        [0.075, 0.22],
        [0.07, 0.225],
      ].map(([x, y]) => new Vector2(x, y)),
      32,
    ));
})();
function Cabinet({ L }: { L: Layout }) {
  return (
    <group position={[-L.hx + 0.28, 0, L.bedZ + 2.45]} rotation={[0, Math.PI / 2, 0]}>
      <RoundedBox args={[0.9, 1.7, 0.4]} radius={0.015} position={[0, 0.85, -0.02]} castShadow receiveShadow>
        <Wood c="#3d2b1f" r={0.45} />
      </RoundedBox>
      <mesh position={[0, 0.95, 0.19]}>
        <planeGeometry args={[0.8, 1.4]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.14} roughness={0.02} />
      </mesh>
      <mesh position={[0, 0.95, 0.15]}>
        <planeGeometry args={[0.8, 1.4]} />
        <meshStandardMaterial color="#2a1f17" />
      </mesh>
      {[0.5, 0.95, 1.4].map((y, i) => (
        <group key={y}>
          <mesh position={[0, y - 0.22, 0.04]}>
            <boxGeometry args={[0.8, 0.02, 0.26]} />
            <meshPhysicalMaterial color="#ffffff" transparent opacity={0.3} />
          </mesh>
          {[-0.22, 0.04, 0.26].map((x, j) =>
            (i + j) % 2 === 0 ? (
              <mesh key={x} geometry={cupGeo()} position={[x, y - 0.21, 0.04]} scale={0.9 + j * 0.1} castShadow>
                <Gold />
              </mesh>
            ) : (
              <group key={x} position={[x, y - 0.05, 0.08]}>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.05, 0.012, 24]} />
                  <meshStandardMaterial color={j === 1 ? "#c0c0c8" : "#cd7f32"} metalness={1} roughness={0.25} />
                </mesh>
              </group>
            ),
          )}
        </group>
      ))}
      <pointLight position={[0, 1.6, 0.15]} intensity={1.2} distance={1.5} color="#fff2d0" />
    </group>
  );
}
function Safe({ L }: { L: Layout }) {
  return (
    <group position={[L.deskX + 1.3, 0, -L.hz + 0.38]} rotation={[0, -0.35, 0]}>
      <RoundedBox args={[0.6, 0.7, 0.55]} radius={0.03} position={[0, 0.36, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3a3f47" metalness={0.7} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.36, 0.26]}>
        <boxGeometry args={[0.5, 0.6, 0.02]} />
        <meshStandardMaterial color="#141619" />
      </mesh>
      {[0, 1, 2].flatMap((row) =>
        [0, 1].map((c) => (
          <mesh key={`${row}${c}`} position={[-0.09 + c * 0.18, 0.12 + row * 0.07, 0.15 - row * 0.02]} castShadow>
            <boxGeometry args={[0.16, 0.06, 0.08]} />
            <Gold />
          </mesh>
        )),
      )}
      {/* 열린 문 */}
      <group position={[0.3, 0.36, 0.28]} rotation={[0, 1.9, 0]}>
        <mesh position={[-0.27, 0, 0]} castShadow>
          <boxGeometry args={[0.54, 0.64, 0.07]} />
          <meshStandardMaterial color="#454b54" metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh position={[-0.27, 0.05, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 32]} />
          <Metal c="#c9ced6" r={0.2} />
        </mesh>
      </group>
    </group>
  );
}
function Cat({ L, onTap }: { L: Layout; onTap: () => void }) {
  const g = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const goal = useRef(new Vector3(0.5, 0, 1));
  const wait = useRef(0);
  useFrame((st, dt) => {
    if (!g.current) return;
    const p = g.current.position;
    const d = goal.current.clone().sub(p);
    d.y = 0;
    const dist = d.length();
    if (dist < 0.05) {
      wait.current -= dt;
      if (wait.current <= 0) {
        goal.current.set((Math.random() * 2 - 1) * (L.hx - 0.8), 0, (Math.random() * 2 - 1) * (L.hz - 0.8));
        wait.current = 2 + Math.random() * 4;
      }
    } else {
      p.addScaledVector(d.normalize(), Math.min(dist, dt * 0.7));
      const want = Math.atan2(d.x, d.z);
      let diff = want - g.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.current.rotation.y += diff * Math.min(1, dt * 6);
    }
    if (tail.current) tail.current.rotation.x = -0.9 + Math.sin(st.clock.elapsedTime * 3) * 0.25;
    g.current.children[0].position.y = 0.2 + (dist > 0.05 ? Math.abs(Math.sin(st.clock.elapsedTime * 10)) * 0.015 : 0);
  });
  const fur = "#d9822b";
  return (
    <group
      ref={g}
      position={[0.5, 0, 1]}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
    >
      <group position={[0, 0.2, 0]}>
        <mesh scale={[0.75, 0.7, 1.3]} castShadow>
          <sphereGeometry args={[0.15, 20, 16]} />
          <meshStandardMaterial color={fur} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.1, 0.2]} castShadow>
          <sphereGeometry args={[0.1, 20, 16]} />
          <meshStandardMaterial color={fur} roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.055, 0.2, 0.2]} rotation={[0, 0, -s * 0.2]} castShadow>
            <coneGeometry args={[0.035, 0.07, 4]} />
            <meshStandardMaterial color={fur} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.035, 0.12, 0.29]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color="#1b1b1b" />
          </mesh>
        ))}
        <mesh position={[0, 0.09, 0.3]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#ff8fa3" />
        </mesh>
        {[-1, 1].flatMap((s) =>
          [0.1, -0.12].map((z) => (
            <mesh key={`${s}${z}`} position={[s * 0.06, -0.12, z]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.14, 8]} />
              <meshStandardMaterial color={fur} />
            </mesh>
          )),
        )}
        <group ref={tail} position={[0, 0.02, -0.18]}>
          <mesh position={[0, 0, -0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.015, 0.26, 8]} />
            <meshStandardMaterial color={fur} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
function Statue({ L, pent }: { L: Layout; pent: boolean }) {
  return (
    <group position={pent ? [L.hx - 0.6, 0, -1.6] : [L.hx - 0.75, 0, 0.1]}>
      <RoundedBox args={[0.6, 0.7, 0.6]} radius={0.02} position={[0, 0.35, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={marble()} roughness={0.15} />
      </RoundedBox>
      <Ant3D color="#f2c14e" accent="#c78a00" position={[0, 0.7, 0]} scale={0.55} mood="happy" metal face={-0.6} />
      <spotLight position={[0.4, 3, 0.8]} angle={0.35} penumbra={0.6} intensity={18} distance={6} color="#fff1d0" />
    </group>
  );
}

/** 펜트하우스 전용: 그랜드 피아노 */
function Piano({ L }: { L: Layout }) {
  const body = useMemo(() => {
    const s = new Shape();
    s.moveTo(-0.7, 0);
    s.lineTo(0.7, 0);
    s.lineTo(0.7, 0.9);
    s.bezierCurveTo(0.7, 1.6, 0.15, 1.9, -0.1, 1.5);
    s.bezierCurveTo(-0.3, 1.2, -0.7, 1.3, -0.7, 0.8);
    s.lineTo(-0.7, 0);
    return new ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 32 });
  }, []);
  const gloss = <meshPhysicalMaterial color="#0d0d10" roughness={0.12} clearcoat={1} clearcoatRoughness={0.05} />;
  return (
    <group position={[L.hx - 1.35, 0, 0.35]} rotation={[0, -2.4, 0]}>
      <mesh geometry={body} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]} castShadow receiveShadow>
        {gloss}
      </mesh>
      {/* 열린 뚜껑 */}
      <mesh geometry={body} rotation={[-Math.PI / 2 + 0.55, 0, 0]} position={[0, 0.98, -0.02]} scale={[1, 1, 0.08]} castShadow>
        {gloss}
      </mesh>
      {[
        [-0.6, 0.15],
        [0.6, 0.15],
        [0.3, 1.5],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.31, -z]} castShadow>
          <cylinderGeometry args={[0.05, 0.04, 0.62, 12]} />
          {gloss}
        </mesh>
      ))}
      {/* 건반 */}
      <mesh position={[0, 0.9, 0.12]} castShadow>
        <boxGeometry args={[1.3, 0.04, 0.2]} />
        <meshStandardMaterial color="#f8f6f0" roughness={0.3} />
      </mesh>
      {Array.from({ length: 22 }, (_, i) => (i % 7 === 2 || i % 7 === 6 ? null : (
        <mesh key={i} position={[-0.62 + i * 0.059, 0.925, 0.08]}>
          <boxGeometry args={[0.03, 0.025, 0.11]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      )))}
      {/* 의자 */}
      <RoundedBox args={[0.7, 0.08, 0.35]} radius={0.03} position={[0, 0.48, 0.62]} castShadow>
        {gloss}
      </RoundedBox>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.22, 0.62]} castShadow>
          <boxGeometry args={[0.04, 0.44, 0.3]} />
          {gloss}
        </mesh>
      ))}
    </group>
  );
}
/** 펜트하우스 전용: 대리석 원형 식탁과 의자 넷 */
function Dining({ L }: { L: Layout }) {
  const seat = fabric("dining", "#c9b59a");
  return (
    <group position={[-L.hx + 2.6, 0, 0.75]}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.6, 0.6, 0.04, 48]} />
        <meshStandardMaterial map={marble()} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.72, 16]} />
        <Gold />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.04, 32]} />
        <Gold />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <group key={i} position={[Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85]} rotation={[0, -a - Math.PI / 2, 0]}>
            <RoundedBox args={[0.44, 0.08, 0.42]} radius={0.04} position={[0, 0.47, 0]} castShadow>
              <Cloth map={seat} />
            </RoundedBox>
            <RoundedBox args={[0.44, 0.42, 0.06]} radius={0.03} position={[0, 0.72, -0.2]} castShadow>
              <Cloth map={seat} />
            </RoundedBox>
            {[-0.18, 0.18].flatMap((x) =>
              [-0.17, 0.17].map((z) => (
                <mesh key={`${x}${z}`} position={[x, 0.22, z]} castShadow>
                  <cylinderGeometry args={[0.015, 0.012, 0.44, 8]} />
                  <Gold />
                </mesh>
              )),
            )}
          </group>
        );
      })}
      <mesh position={[0, 0.84, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.18, 20]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.4} roughness={0.05} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos(i * 2) * 0.04, 0.98 + i * 0.02, Math.sin(i * 2) * 0.04]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color={["#ffadad", "#ffd6a5", "#fdffb6"][i]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- 개미(걷기 + 말풍선)
function Walker({ color, accent, mood, outfit, target, say, onTapAnt, start }: { color: string; accent: string; mood: string; outfit?: string | null; target: { current: [number, number] }; say: string | null; onTapAnt: () => void; start: [number, number] }) {
  const g = useRef<Group>(null);
  const walking = useRef(false);
  useFrame((_, dt) => {
    if (!g.current) return;
    const p = g.current.position;
    const [tx, tz] = target.current;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    walking.current = d > 0.05;
    if (walking.current) {
      const step = Math.min(d, dt * 2.2);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      let diff = Math.atan2(dx, dz) - g.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.current.rotation.y += diff * Math.min(1, dt * 10);
    } else {
      let diff = 0.75 - g.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.current.rotation.y += diff * Math.min(1, dt * 2);
    }
  });
  return (
    <group ref={g} position={[start[0], 0, start[1]]}>
      <Ant3D color={color} accent={accent} scale={0.62} mood={mood} outfit={outfit} onTap={onTapAnt} walking={walking} />
      {say && (
        <Html position={[0, 1.45, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
          <div className="ant-bubble">{say}</div>
        </Html>
      )}
    </group>
  );
}

/** 화면 비율에 맞춰 방 전체가 들어오게 카메라 거리 조절 */
function Rig({ L, explore }: { L: Layout; explore: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vHalf = (cam.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const radius = Math.hypot(L.hx, L.hz) * (aspect < 1 ? 1.12 : 0.92); // 세로 화면(휴대폰)은 양옆이 잘리지 않게 조금 더 멀리
    const dist = radius / Math.sin(Math.min(vHalf * 1.25, hHalf));
    const dir = new Vector3(0.95, 0.85, 1.15).normalize();
    cam.position.copy(dir.multiplyScalar(dist)).add(new Vector3(0, 0.4, 0));
    cam.lookAt(0.2, 0.9, 0);
    cam.near = 0.1;
    cam.far = 80;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, L.hx, L.hz]);
  return explore ? <OrbitControls makeDefault target={[0.2, 0.9, 0]} enablePan={false} enableDamping minPolarAngle={0.55} maxPolarAngle={1.3} minAzimuthAngle={-0.25} maxAzimuthAngle={1.55} minDistance={4} maxDistance={Math.hypot(L.hx, L.hz) * 4} /> : null;
}

/** 누를 수 있는 가구(바깥에 둬야 다시 그릴 때 가구가 새로 만들어지지 않는다) */
function Spot({ id, stand, onVisit, children }: { id: string; stand: [number, number]; onVisit: (id: string, stand: [number, number]) => (e: ThreeEvent<MouseEvent>) => void; children: ReactNode }) {
  return (
    <group onClick={onVisit(id, stand)} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      {children}
    </group>
  );
}

// ---------------------------------------------------------------- 대사
const LINES: Record<string, string[]> = {
  desk: ["오늘도 차트 공부! 📈", "책상 앞에 앉으니 전문가 같아"],
  bed: ["5분만 더 잘래… 😴", "꿈에서도 차트가 보여"],
  plant: ["물 줘야지 🌱", "몬스테라처럼 쑥쑥 크자!"],
  lamp: ["불빛이 따뜻해 💡", "밤샘 차트는 이제 그만…"],
  sofa: ["잠깐 쉬어 갈까… 멘탈 회복 중", "소파 최고야 🛋️"],
  shelf: ["투자 책 한 권 📚", "'존버의 기술'… 읽어 볼까?"],
  window: ["바깥 날씨 좋다 ☀️", "저 빌딩 중 하나는 내 거…?"],
  tv: ["오늘 뉴스 뭐 나왔지? 📺", "드라마 한 편만…"],
  table: ["커피 한 잔 ☕", "여유가 생겼어"],
  aquarium: ["물고기야 안녕 🐠", "너희도 떼로 몰려다니는구나"],
  cabinet: ["내 트로피들 반짝반짝 🏆", "다음 시즌도 1등 가자!"],
  safe: ["금괴 세는 중… 하나, 둘 💰", "티끌 모아 태산!"],
  statue: ["황금 개미 선배님…!", "언젠가 나도 황금 개미"],
  pent: ["야경 미쳤다 🌆", "여기까지 왔다니…!"],
  gallery: ["이 그림 얼마였더라… 🖼️", "예술은 장기 투자지"],
  piano: ["🎹 도레미… 수익률 송", "연주는 못 하지만 멋있잖아"],
  dining: ["오늘은 파티다 🥂", "다 같이 밥 먹자!"],
};
const ANT_LINES = ["안녕! 🐜", "오늘의 시드 해 볼래?", "미션 깨면 별을 받아!", "별 모으면 가구가 생겨", "간지러워 ㅋㅋ", "범고래 박사님 보고 싶다 🐳"];

// ---------------------------------------------------------------- 방
export function Room({ char = "office", items, mood = "happy", height = 300, outfit, keys = false }: { char?: CharId; items: string[]; mood?: string; height?: number; outfit?: string | null; keys?: boolean }) {
  const m = CHAR_META[char] ?? CHAR_META.office;
  const has = (id: string) => items.includes(id);
  const tier: Tier = has("penthouse") ? "pent" : has("wide") ? "wide" : "small";
  const L = layout(tier);
  const pent = tier === "pent";
  const hq = keys && typeof window !== "undefined" && window.innerWidth >= 700; // 큰 '내 방' 화면에서만 후처리(휴대폰·작은 미리보기는 가볍게)
  const start: [number, number] = [L.sofaX - 0.9, 0.2];
  const target = useRef<[number, number]>(start);
  const [say, setSay] = useState<string | null>(null);
  const timer = useRef<number>();
  const speak = useCallback((line: string, delay = 0) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSay(line);
      timer.current = window.setTimeout(() => setSay(null), 2600);
    }, delay);
  }, []);
  const clampX = (x: number) => Math.max(-L.hx + 0.45, Math.min(L.hx - 0.35, x));
  const clampZ = (z: number) => Math.max(-L.hz + 0.45, Math.min(L.hz - 0.35, z));
  const walkTo = (x: number, z: number) => {
    target.current = [clampX(x), clampZ(z)];
  };
  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // 끌어서 둘러보기는 걷기 아님
    e.stopPropagation();
    walkTo(e.point.x, e.point.z);
  };
  /** 가구를 누르면 그 앞(stand)으로 걸어가 한마디 */
  const visit = (id: string, stand: [number, number]) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    e.stopPropagation();
    walkTo(stand[0], stand[1]);
    const ls = LINES[id] ?? ANT_LINES;
    speak(ls[Math.floor(Math.random() * ls.length)], 900);
  };
  useEffect(() => {
    if (!keys) return;
    const on = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      const d: Record<string, [number, number]> = { arrowup: [0, -0.6], w: [0, -0.6], arrowdown: [0, 0.6], s: [0, 0.6], arrowleft: [-0.6, 0], a: [-0.6, 0], arrowright: [0.6, 0], d: [0.6, 0] };
      if (!d[k]) return;
      e.preventDefault();
      const [x, z] = target.current;
      walkTo(x + d[k][0], z + d[k][1]);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, tier]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // 방이 바뀌면(확장 공사) 개미를 가운데로
  useEffect(() => {
    target.current = [clampX(target.current[0]), clampZ(target.current[1])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  const floorMap = useTexRepeat(pent ? marble() : woodFloor(), pent ? (L.hx * 2) / 3 : (L.hx * 2) / 1.5, pent ? (L.hz * 2) / 3 : (L.hz * 2) / 1.5);
  const backWall = useTexRepeat(plaster(pent ? "pb" : "b", pent ? "#e4ded6" : "#efe9e1"), 3, 2);
  const leftWall = useTexRepeat(plaster(pent ? "pl" : "l", pent ? "#d9d3ca" : "#dfe6da"), 3, 2);
  const rug = rugTex();
  const [vis, setVis] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className={`stage3d room3d ${keys ? "explore" : ""}`} style={{ height }} role="img" aria-label={`내 방: 가구 ${items.length}개, ${m.name}. 바닥을 누르면 걸어가고, 가구를 누르면 말해요`}>
      <Canvas shadows="soft" dpr={hq ? [1, 2] : [1, 1.6]} frameloop={vis ? "always" : "never"} flat={hq} camera={{ position: [6, 5, 7], fov: 35 }} gl={{ antialias: !hq, alpha: true, powerPreference: "high-performance" }}>
        <Rig L={L} explore={keys} />
        {/* 빛: 하늘·바닥 반사 + 해(그림자) + 실내 반사용 환경광 */}
        <hemisphereLight args={[pent ? "#ffd9c2" : "#fff7ea", pent ? "#6d5a8a" : "#b8a08a", pent ? 0.45 : 0.6]} />
        <directionalLight
          position={[L.hx + 3, 8, L.hz + 4]}
          intensity={pent ? 1.4 : 2.2}
          color={pent ? "#ffc9a0" : "#fff1dc"}
          castShadow
          shadow-mapSize={[hq ? 2048 : 1024, hq ? 2048 : 1024]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-left={-L.hx - 2}
          shadow-camera-right={L.hx + 2}
          shadow-camera-top={L.hz + 3}
          shadow-camera-bottom={-L.hz - 3}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={pent ? 1.2 : 2} color={pent ? "#ffb38a" : "#ffffff"} position={[0, 4, -6]} scale={[10, 4, 1]} />
          <Lightformer form="rect" intensity={1} color="#fff3e0" position={[6, 3, 4]} scale={[6, 4, 1]} rotation-y={-Math.PI / 4} />
          <Lightformer form="circle" intensity={0.8} color="#ffffff" position={[0, 8, 0]} scale={4} rotation-x={Math.PI / 2} />
        </Environment>

        {/* 바닥(누르면 걸어감) · 벽 · 걸레받이 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={onFloor}>
          <planeGeometry args={[L.hx * 2, L.hz * 2]} />
          <meshStandardMaterial map={floorMap} roughness={pent ? 0.18 : 0.5} metalness={pent ? 0.05 : 0} />
        </mesh>
        <mesh position={[0, -0.075, 0]} receiveShadow>
          <boxGeometry args={[L.hx * 2 + 0.3, 0.12, L.hz * 2 + 0.3]} />
          <meshStandardMaterial color="#d8d0c4" roughness={0.8} />
        </mesh>
        {pent ? (
          // 통유리 왼쪽만 벽
          <mesh position={[(-L.hx + L.deskX + 1.15) / 2, L.H / 2, -L.hz - 0.075]} receiveShadow>
            <boxGeometry args={[L.deskX + 1.15 + L.hx, L.H, 0.15]} />
            <meshStandardMaterial map={backWall} roughness={0.9} />
          </mesh>
        ) : (
          <mesh position={[0, L.H / 2, -L.hz - 0.075]} receiveShadow>
            <boxGeometry args={[L.hx * 2 + 0.15, L.H, 0.15]} />
            <meshStandardMaterial map={backWall} roughness={0.9} />
          </mesh>
        )}
        <mesh position={[-L.hx - 0.075, L.H / 2, 0]} receiveShadow>
          <boxGeometry args={[0.15, L.H, L.hz * 2]} />
          <meshStandardMaterial map={leftWall} roughness={0.9} />
        </mesh>
        <mesh position={[pent ? (-L.hx + L.deskX + 1.15) / 2 : 0, 0.05, -L.hz + 0.01]}>
          <boxGeometry args={[pent ? L.deskX + 1.15 + L.hx : L.hx * 2, 0.1, 0.02]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
        </mesh>
        <mesh position={[-L.hx + 0.01, 0.05, 0]}>
          <boxGeometry args={[0.02, 0.1, L.hz * 2]} />
          <meshStandardMaterial color="#fbfaf7" roughness={0.5} />
        </mesh>
        {/* 벽 액자(항상): 내 첫 코스피 차트 */}
        <mesh position={[-L.hx + 0.02, 1.85, L.bedZ]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <boxGeometry args={[0.9, 0.6, 0.03]} />
          <meshStandardMaterial color="#2b2b30" />
        </mesh>
        <mesh position={[-L.hx + 0.04, 1.85, L.bedZ]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.82, 0.52]} />
          <meshBasicMaterial map={screenTex(8)} toneMapped={false} />
        </mesh>

        {has("rug") && (
          <mesh position={[L.sofaX, 0.006, L.hz - 1.85]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[2.7, 1.95]} />
            <meshStandardMaterial map={rug} roughness={1} />
          </mesh>
        )}
        {has("desk") && (
          <Spot onVisit={visit} id="desk" stand={[L.deskX + 0.2, -L.hz + 1.6]}>
            <Desk L={L} dual={has("dual")} monitor={has("monitor")} />
          </Spot>
        )}
        {has("bed") && (
          <Spot onVisit={visit} id="bed" stand={[-L.hx + 2.2, L.bedZ + 0.2]}>
            <Bed L={L} />
          </Spot>
        )}
        {has("plant") && (
          <Spot onVisit={visit} id="plant" stand={[L.hx - 1.1, -L.hz + 1.1]}>
            <Plant L={L} />
          </Spot>
        )}
        {has("lamp") && (
          <Spot onVisit={visit} id="lamp" stand={[-L.hx + 1.0, L.bedZ + 1.5]}>
            <ArcLamp L={L} />
          </Spot>
        )}
        {has("sofa") && (
          <Spot onVisit={visit} id="sofa" stand={[L.sofaX - 1.5, L.hz - 1.0]}>
            <Sofa L={L} />
          </Spot>
        )}
        {has("shelf") && (
          <Spot onVisit={visit} id="shelf" stand={[-L.hx + 0.8, -L.hz + 1.0]}>
            <Shelf L={L} />
          </Spot>
        )}
        {(has("window") || pent) && (
          <Spot onVisit={visit} id={pent ? "pent" : "window"} stand={[L.tvX, -L.hz + 1.3]}>
            <Window L={L} pent={pent} />
          </Spot>
        )}
        {has("tv") && (
          <Spot onVisit={visit} id="tv" stand={[L.tvX - 0.3, -L.hz + 1.4]}>
            <TV L={L} pent={pent} />
          </Spot>
        )}
        {has("table") && (
          <Spot onVisit={visit} id="table" stand={[L.sofaX - 0.9, L.hz - 1.85]}>
            <CoffeeTable L={L} />
          </Spot>
        )}
        {has("aquarium") && (
          <Spot onVisit={visit} id="aquarium" stand={[-L.hx + 1.1, L.hz - 0.85]}>
            <Aquarium L={L} />
          </Spot>
        )}
        {has("gallery") && (
          <Spot onVisit={visit} id="gallery" stand={[-L.hx + 1.0, L.hz - 1.3]}>
            <Gallery L={L} />
          </Spot>
        )}
        {has("cabinet") && (
          <Spot onVisit={visit} id="cabinet" stand={[-L.hx + 1.0, L.bedZ + 2.45]}>
            <Cabinet L={L} />
          </Spot>
        )}
        {has("safe") && (
          <Spot onVisit={visit} id="safe" stand={[L.deskX + 1.4, -L.hz + 1.2]}>
            <Safe L={L} />
          </Spot>
        )}
        {has("statue") && (
          <Spot onVisit={visit} id="statue" stand={pent ? [L.hx - 1.3, -1.3] : [L.hx - 1.4, 0.4]}>
            <Statue L={L} pent={pent} />
          </Spot>
        )}
        {pent && (
          <>
            <Spot onVisit={visit} id="piano" stand={[L.hx - 2.6, 0.9]}>
              <Piano L={L} />
            </Spot>
            <Spot onVisit={visit} id="dining" stand={[-L.hx + 2.6, 1.9]}>
              <Dining L={L} />
            </Spot>
          </>
        )}
        {has("cat") && <Cat L={L} onTap={() => speak("냐옹~ 🐈 (고양이가 쳐다본다)")} />}

        <Walker color={m.body} accent={m.accent} mood={mood} outfit={outfit} target={target} say={say} start={start} onTapAnt={() => speak(ANT_LINES[Math.floor(Math.random() * ANT_LINES.length)])} />
        {!hq && <ContactShadows position={[0, 0.005, 0]} scale={[L.hx * 2, L.hz * 2]} opacity={0.35} blur={2.2} far={1.2} resolution={512} />}

        {hq && (
          <Suspense fallback={null}>
            <Post />
          </Suspense>
        )}
      </Canvas>
    </div>
  );
}
