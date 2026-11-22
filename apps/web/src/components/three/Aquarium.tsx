// 벽에 붙인 대형 수족관(가로 2.4m). 물고기 떼(인스턴싱) · 엔젤피시 · 꼬마 범고래(범고래 박사 카메오) ·
// 흔들리는 해초 · 산호 · 올라가는 기포 · 물결빛(코스틱) · LED 조명. 모두 코드로 그린다(외부 파일 없음).
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  type InstancedMesh,
  Object3D,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const TANK = { W: 2.4, D: 0.62, H: 1.05, base: 0.62 };

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

let causticTex: CanvasTexture | null = null;
function caustics() {
  if (causticTex) return causticTex;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 512, 512);
  const r = rnd(42);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 260; i++) {
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    const x = r() * 512;
    const y = r() * 512;
    g.arc(x, y, 18 + r() * 40, r() * 6, r() * 6 + 1.2 + r());
    g.stroke();
  }
  causticTex = new CanvasTexture(c);
  causticTex.wrapS = causticTex.wrapT = RepeatWrapping;
  return causticTex;
}
let waterTex: CanvasTexture | null = null;
function waterBack() {
  if (waterTex) return waterTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#3fb6e8");
  grd.addColorStop(0.5, "#127bb5");
  grd.addColorStop(1, "#05324f");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  waterTex = new CanvasTexture(c);
  return waterTex;
}

/** 작은 물고기 떼(네온테트라 등) — InstancedMesh 하나로 30마리 */
function School({ n = 30 }: { n?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const geo = useMemo(() => {
    const body = new SphereGeometry(0.035, 12, 8);
    body.scale(1.9, 0.85, 0.45);
    const tail = new ConeGeometry(0.03, 0.05, 4);
    tail.rotateZ(Math.PI / 2);
    tail.translate(-0.08, 0, 0);
    tail.scale(1, 1, 0.3);
    const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
    g.rotateY(-Math.PI / 2); // +z 가 머리(lookAt 방향)
    return g;
  }, []);
  const fish = useMemo(() => {
    const r = rnd(7);
    const pal = ["#3ad1ff", "#ff4d5e", "#ffd43b", "#e9ecef", "#3ad1ff", "#7cf5c5"];
    return Array.from({ length: n }, () => ({ p: [r() * 6, r() * 6, r() * 6], s: 0.8 + r() * 0.5, c: new Color(pal[Math.floor(r() * pal.length)]), prev: new Vector3() }));
  }, [n]);
  const dummy = useMemo(() => new Object3D(), []);
  const colored = useRef(false);
  useFrame((st) => {
    const m = mesh.current;
    if (!m) return;
    if (!colored.current) {
      fish.forEach((f, i) => m.setColorAt(i, f.c));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      colored.current = true;
    }
    const t = st.clock.elapsedTime;
    const { W, D, H } = TANK;
    const cx = Math.sin(t * 0.21) * W * 0.28;
    const cy = H * 0.5 + Math.sin(t * 0.33) * H * 0.16;
    const cz = Math.sin(t * 0.29) * D * 0.15;
    fish.forEach((f, i) => {
      const x = Math.max(-W / 2 + 0.12, Math.min(W / 2 - 0.12, cx + Math.sin(t * 0.9 * f.s + f.p[0]) * 0.3));
      const y = Math.max(0.2, Math.min(H - 0.12, cy + Math.cos(t * 1.2 * f.s + f.p[1]) * 0.12));
      const z = Math.max(-D / 2 + 0.07, Math.min(D / 2 - 0.07, cz + Math.sin(t * 0.7 + f.p[2]) * 0.12));
      dummy.position.set(x, y, z);
      const v = dummy.position.clone().sub(f.prev);
      if (v.lengthSq() > 1e-8) dummy.lookAt(dummy.position.clone().add(v));
      f.prev.copy(dummy.position);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[geo, undefined, n]} castShadow>
      <meshPhysicalMaterial roughness={0.3} clearcoat={0.6} />
    </instancedMesh>
  );
}

/** 엔젤피시: 납작하고 키 큰 삼각형 몸 + 줄무늬 */
function Angel({ phase, y, color }: { phase: number; y: number; color: string }) {
  const g = useRef<Group>(null);
  const geo = useMemo(() => {
    const s = new Shape();
    s.moveTo(0.09, 0);
    s.quadraticCurveTo(0.02, 0.09, -0.05, 0.16);
    s.lineTo(-0.04, 0.03);
    s.lineTo(-0.1, 0.02);
    s.lineTo(-0.1, -0.02);
    s.lineTo(-0.04, -0.03);
    s.lineTo(-0.05, -0.16);
    s.quadraticCurveTo(0.02, -0.09, 0.09, 0);
    const e = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
    e.translate(0, 0, -0.006);
    return e;
  }, []);
  useFrame((st) => {
    if (!g.current) return;
    const t = st.clock.elapsedTime * 0.25 + phase;
    const x = Math.sin(t) * (TANK.W / 2 - 0.3);
    g.current.position.set(x, y + Math.sin(t * 2.3) * 0.05, Math.cos(t * 1.4) * 0.12);
    g.current.rotation.y = Math.cos(t) >= 0 ? 0 : Math.PI;
  });
  return (
    <group ref={g}>
      <mesh geometry={geo} castShadow>
        <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.8} side={DoubleSide} />
      </mesh>
      {[0.03, -0.02].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.012, 0.2, 0.026]} />
          <meshStandardMaterial color="#1b1b1b" />
        </mesh>
      ))}
    </group>
  );
}

/** 꼬마 범고래(범고래 박사 카메오) */
function MiniOrca() {
  const g = useRef<Group>(null);
  useFrame((st) => {
    if (!g.current) return;
    const t = st.clock.elapsedTime * 0.16;
    const x = Math.sin(t) * (TANK.W / 2 - 0.35);
    g.current.position.set(x, 0.62 + Math.sin(t * 3) * 0.05, -0.08);
    g.current.rotation.y = Math.cos(t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    g.current.rotation.z = Math.sin(st.clock.elapsedTime * 2) * 0.05;
  });
  return (
    <group ref={g} scale={0.9}>
      <mesh scale={[0.7, 0.62, 1.8]} castShadow>
        <sphereGeometry args={[0.08, 24, 16]} />
        <meshPhysicalMaterial color="#111318" roughness={0.25} clearcoat={1} />
      </mesh>
      <mesh position={[0, -0.025, 0.02]} scale={[0.5, 0.35, 1.5]}>
        <sphereGeometry args={[0.08, 20, 12]} />
        <meshStandardMaterial color="#f8f9fa" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.035, 0.02, 0.09]} scale={[0.4, 0.25, 0.5]}>
          <sphereGeometry args={[0.04, 12, 8]} />
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>
      ))}
      <mesh position={[0, 0.07, -0.02]} rotation={[-0.4, 0, 0]}>
        <coneGeometry args={[0.022, 0.09, 8]} />
        <meshStandardMaterial color="#111318" />
      </mesh>
      <mesh position={[0, 0, -0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[2.2, 1, 0.3]}>
        <coneGeometry args={[0.03, 0.06, 3]} />
        <meshStandardMaterial color="#111318" />
      </mesh>
    </group>
  );
}

/** 해초: 마디마다 조금씩 휘어 물결처럼 흔들린다 */
function Kelp({ x, z, h, color, phase }: { x: number; z: number; h: number; color: string; phase: number }) {
  const segs = 7;
  const refs = useRef<(Group | null)[]>([]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (g) {
        g.rotation.z = Math.sin(t * 1.1 + phase + i * 0.5) * 0.12;
        g.rotation.x = Math.cos(t * 0.8 + phase + i * 0.4) * 0.06;
      }
    });
  });
  const len = h / segs;
  const build = (i: number): JSX.Element | null =>
    i >= segs ? null : (
      <group ref={(el) => (refs.current[i] = el)} position={[0, i ? len : 0, 0]}>
        <mesh position={[0, len / 2, 0]} castShadow>
          <boxGeometry args={[0.045 * (1 - i / (segs * 1.4)), len, 0.008]} />
          <meshStandardMaterial color={color} roughness={0.6} side={DoubleSide} />
        </mesh>
        {build(i + 1)}
      </group>
    );
  return <group position={[x, 0.06, z]}>{build(0)}</group>;
}

function Bubbles({ x, n = 14 }: { x: number; n?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => ({ o: i / n, s: 0.006 + (i % 4) * 0.003, w: (i % 3) * 0.6 })), [n]);
  useFrame((st) => {
    const m = mesh.current;
    if (!m) return;
    const t = st.clock.elapsedTime;
    seeds.forEach((b, i) => {
      const k = (t * 0.25 + b.o) % 1;
      dummy.position.set(x + Math.sin(t * 3 + b.w) * 0.015, 0.08 + k * (TANK.H - 0.15), -0.18 + Math.cos(t * 2 + b.w) * 0.01);
      dummy.scale.setScalar(b.s * (0.6 + k));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshPhysicalMaterial color="#e7f8ff" transparent opacity={0.6} roughness={0} clearcoat={1} />
    </instancedMesh>
  );
}

function Coral() {
  const parts = useMemo(() => {
    const r = rnd(12);
    const pal = ["#ff6b8b", "#ff922b", "#b197fc", "#ffd43b", "#ff8787", "#63e6be"];
    return Array.from({ length: 16 }, () => ({
      x: (r() - 0.5) * (TANK.W - 0.3),
      z: (r() - 0.6) * (TANK.D - 0.2),
      k: Math.floor(r() * 3),
      s: 0.5 + r() * 0.8,
      c: pal[Math.floor(r() * pal.length)],
      ry: r() * 6,
    }));
  }, []);
  return (
    <group>
      {parts.map((p, i) => (
        <group key={i} position={[p.x, 0.07, p.z]} rotation={[0, p.ry, 0]} scale={p.s}>
          {p.k === 0 &&
            [0, 1, 2, 3].map((j) => (
              <mesh key={j} position={[Math.cos(j * 1.6) * 0.03, 0.06 + j * 0.01, Math.sin(j * 1.6) * 0.03]} rotation={[Math.cos(j) * 0.4, 0, Math.sin(j) * 0.4]} castShadow>
                <cylinderGeometry args={[0.008, 0.014, 0.13 + j * 0.02, 8]} />
                <meshStandardMaterial color={p.c} roughness={0.7} emissive={p.c} emissiveIntensity={0.15} />
              </mesh>
            ))}
          {p.k === 1 && (
            <mesh position={[0, 0.04, 0]} scale={[1, 0.7, 1]} castShadow>
              <icosahedronGeometry args={[0.06, 1]} />
              <meshStandardMaterial color={p.c} roughness={0.9} flatShading />
            </mesh>
          )}
          {p.k === 2 && (
            <mesh position={[0, 0.05, 0]} castShadow>
              <dodecahedronGeometry args={[0.07, 0]} />
              <meshStandardMaterial color="#8d8a84" roughness={0.95} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Caustics({ w, h, y, z, rot }: { w: number; h: number; y: number; z: number; rot: [number, number, number] }) {
  const t1 = useMemo(() => {
    const t = caustics().clone();
    t.repeat.set(w * 1.5, h * 1.5);
    t.needsUpdate = true;
    return t;
  }, [w, h]);
  const t2 = useMemo(() => {
    const t = caustics().clone();
    t.repeat.set(w * 1.1, h * 1.1);
    t.needsUpdate = true;
    return t;
  }, [w, h]);
  useFrame((_, dt) => {
    t1.offset.x += dt * 0.03;
    t1.offset.y += dt * 0.017;
    t2.offset.x -= dt * 0.022;
    t2.offset.y += dt * 0.026;
  });
  return (
    <group position={[0, y, z]} rotation={rot}>
      {[t1, t2].map((t, i) => (
        <mesh key={i} position={[0, 0, i * 0.001]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={t} color="#9fe6ff" transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** 대형 수족관 전체. 원점 = 받침장 바닥 가운데, 앞면 = +z */
export function BigAquarium() {
  const { W, D, H, base } = TANK;
  return (
    <group>
      {/* 받침장: 짙은 월넛 + 황동 테두리 */}
      <RoundedBox args={[W + 0.1, base, D + 0.08]} radius={0.02} position={[0, base / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2a1d15" roughness={0.45} />
      </RoundedBox>
      {[-W / 4, W / 4].map((x) => (
        <mesh key={x} position={[x, base / 2, D / 2 + 0.045]}>
          <boxGeometry args={[W / 2 - 0.08, base - 0.1, 0.01]} />
          <meshStandardMaterial color="#33241a" roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, base - 0.01, D / 2 + 0.05]}>
        <boxGeometry args={[W + 0.1, 0.02, 0.012]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.25} />
      </mesh>

      <group position={[0, base, 0]}>
        {/* 물 뒤판(깊은 바다색) + 물빛 */}
        <mesh position={[0, H / 2, -D / 2 + 0.01]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={waterBack()} toneMapped={false} />
        </mesh>
        <Caustics w={W} h={H} y={H / 2} z={-D / 2 + 0.015} rot={[0, 0, 0]} />
        {/* 모래 바닥 + 물결빛 */}
        <mesh position={[0, 0.04, 0]} receiveShadow>
          <boxGeometry args={[W - 0.02, 0.08, D - 0.02]} />
          <meshStandardMaterial color="#c9ae82" roughness={1} />
        </mesh>
        <Caustics w={W - 0.02} h={D - 0.02} y={0.081} z={0} rot={[-Math.PI / 2, 0, 0]} />
        <Coral />
        {[-1.0, -0.82, -0.6, 0.55, 0.75, 0.95, 1.05, -0.2].map((x, i) => (
          <Kelp key={x} x={x} z={-0.18 + (i % 3) * 0.06} h={0.55 + (i % 4) * 0.12} color={i % 2 ? "#2f9e44" : "#5c940d"} phase={i * 0.9} />
        ))}
        <School />
        <Angel phase={0} y={0.5} color="#f1f3f5" />
        <Angel phase={2.4} y={0.7} color="#ffd8a8" />
        <MiniOrca />
        <Bubbles x={-0.95} />
        <Bubbles x={0.85} n={10} />
        {/* 물(옅은 파랑) */}
        <mesh position={[0, H / 2 - 0.03, 0]}>
          <boxGeometry args={[W - 0.02, H - 0.06, D - 0.02]} />
          <meshPhysicalMaterial color="#5cc8ff" transparent opacity={0.12} roughness={0.05} depthWrite={false} />
        </mesh>
        {/* 유리(반사) */}
        <mesh position={[0, H / 2, D / 2]}>
          <planeGeometry args={[W, H]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.08} roughness={0} metalness={0} clearcoat={1} clearcoatRoughness={0} depthWrite={false} />
        </mesh>
        {[-W / 2, W / 2].map((x) => (
          <mesh key={x} position={[x, H / 2, 0]}>
            <boxGeometry args={[0.012, H, D]} />
            <meshPhysicalMaterial color="#cfefff" transparent opacity={0.2} roughness={0} depthWrite={false} />
          </mesh>
        ))}
        {/* 검은 프레임 + LED 후드 */}
        {[0, H].map((y) => (
          <mesh key={y} position={[0, y, D / 2]}>
            <boxGeometry args={[W + 0.03, 0.025, 0.025]} />
            <meshStandardMaterial color="#111" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
        <RoundedBox args={[W + 0.08, 0.1, D + 0.06]} radius={0.015} position={[0, H + 0.06, 0]} castShadow>
          <meshStandardMaterial color="#141414" metalness={0.5} roughness={0.35} />
        </RoundedBox>
        <mesh position={[0, H + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W - 0.1, 0.06]} />
          <meshBasicMaterial color="#e3f6ff" toneMapped={false} side={DoubleSide} />
        </mesh>
        <pointLight position={[0, H - 0.1, 0]} intensity={3} distance={1.6} decay={2} color="#bde8ff" />
        {/* 방 쪽으로 번지는 푸른빛 */}
        <pointLight position={[0, H * 0.55, D / 2 + 0.35]} intensity={2.2} distance={3.2} decay={2} color="#4fc3ff" />
      </group>
    </group>
  );
}
