// 3D 장면 2개(코드 분할: three.js 는 이 파일을 열 때만 받는다)
//  - Room   : 내 방. 모은 ★ 로 열린 가구가 놓이고 내 개미가 논다(홈·결산)
//  - Plaza  : 화제 광장. 종목 가판대마다 개미 군중이 몰린다 — 개미 한 마리 = 지난주 실제 유튜브 언급 1건(플레이 피드)
import { Html, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Object3D, type Group, type InstancedMesh } from "three";

function useVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, vis] as const;
}

function Stage({ children, height, camera, label }: { children: ReactNode; height: number; camera: [number, number, number]; label: string }) {
  const [ref, vis] = useVisible<HTMLDivElement>();
  return (
    <div ref={ref} className="stage3d" style={{ height }} role="img" aria-label={label}>
      <Canvas shadows dpr={[1, 1.75]} frameloop={vis ? "always" : "never"} camera={{ position: camera, fov: 38 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <hemisphereLight args={["#ffffff", "#c8b8ff", 0.4]} />
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}

function Spin({ children, speed = 0.15 }: { children: ReactNode; speed?: number }) {
  const g = useRef<Group>(null);
  useFrame((st) => {
    if (g.current) g.current.rotation.y = Math.sin(st.clock.elapsedTime * speed) * 0.45;
  });
  return <group ref={g}>{children}</group>;
}

// 내 방은 Room3D.tsx(가구·재질·후처리가 많아 따로 나눠 받는다)

// ---------------------------------------------------------------- 화제 광장
export const CROWD_MAX = 220; // 이보다 많으면 가판대 둘레가 넘친다(데이터 최댓값 210)

/** 가판대 둘레에 동심원으로 n 마리(바깥 원일수록 많이). 한 마리 = 언급 1건 */
function crowdSpots(n: number): [number, number][] {
  const out: [number, number][] = [];
  let r = 0.72;
  while (out.length < n) {
    const k = Math.max(6, Math.floor((2 * Math.PI * r) / 0.17));
    const off = (out.length % 2) * 0.5;
    for (let j = 0; j < k && out.length < n; j++) {
      const a = ((j + off) / k) * Math.PI * 2;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    r += 0.16;
  }
  return out;
}

/** 개미 군중: 수백 마리라 인스턴싱(몸·머리 두 덩어리를 한 번에 그린다) */
function Crowd({ n, seed }: { n: number; seed: number }) {
  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const spots = useMemo(() => crowdSpots(Math.min(n, CROWD_MAX)), [n]);
  const tmp = useMemo(() => new Object3D(), []);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    spots.forEach(([x, z], i) => {
      const ph = t + i * 0.7 + seed;
      const y = Math.abs(Math.sin(ph * 4)) * 0.05;
      const rot = Math.atan2(-x, -z) + Math.sin(ph * 1.3) * 0.5; // 가판대를 바라본다
      tmp.position.set(x, 0.1 + y, z);
      tmp.rotation.set(0, rot, 0);
      tmp.scale.setScalar(0.8);
      tmp.updateMatrix();
      body.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x + Math.sin(rot) * 0.11, 0.17 + y, z + Math.cos(rot) * 0.11);
      tmp.updateMatrix();
      head.current?.setMatrixAt(i, tmp.matrix);
    });
    if (body.current) body.current.instanceMatrix.needsUpdate = true;
    if (head.current) head.current.instanceMatrix.needsUpdate = true;
  });
  if (!spots.length) return null;
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, spots.length]} castShadow>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#3c2a1e" />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, spots.length]}>
        <sphereGeometry args={[0.085, 8, 8]} />
        <meshStandardMaterial color="#5a4030" />
      </instancedMesh>
    </>
  );
}

export interface Stall {
  k: string;
  code: string;
  hype: number;
  chg: number;
}

export function Plaza({ stalls, onOpen, height = 280 }: { stalls: Stall[]; onOpen: (k: string) => void; height?: number }) {
  const top = useMemo(() => [...stalls].sort((a, b) => b.hype - a.hype).slice(0, 7), [stalls]);
  const n = top.length;
  return (
    <Stage height={height} camera={[0, 6.5, 8.5]} label={`화제 광장(개미 한 마리 = 언급 1건): ${top.map((s) => `${s.code} 개미 ${s.hype}마리, 지난주 ${s.chg >= 0 ? "상승" : "하락"}`).join(", ")}`}>
      <Spin speed={0.12}>
        <group position={[0, -1, 0]}>
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[6, 48]} />
            <meshStandardMaterial color="#e9e4ff" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[1.0, 1.15, 40]} />
            <meshStandardMaterial color="#c8b8ff" />
          </mesh>
          {top.map((s, i) => {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * 3.6;
            const z = Math.sin(a) * 3.6;
            const up = s.chg >= 0;
            const h = 0.6 + Math.min(1.6, Math.abs(s.chg) * 8);

            return (
              <group key={s.k} position={[x, 0, z]}>
                <group
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(s.k);
                  }}
                  onPointerOver={() => (document.body.style.cursor = "pointer")}
                  onPointerOut={() => (document.body.style.cursor = "")}
                >
                  <RoundedBox args={[0.9, h, 0.9]} radius={0.08} position={[0, h / 2, 0]} castShadow>
                    <meshStandardMaterial color={up ? "#ff6b6e" : "#5b9dff"} />
                  </RoundedBox>
                  <mesh position={[0, h + 0.12, 0]} castShadow>
                    <coneGeometry args={[0.75, 0.35, 4]} />
                    <meshStandardMaterial color={up ? "#e5383b" : "#1f6feb"} />
                  </mesh>
                </group>
                <Html position={[0, h + 0.55, 0]} center distanceFactor={6.5} zIndexRange={[10, 0]}>
                  <button className="plaza-tag" onClick={() => onOpen(s.k)}>
                    {s.code}
                    <b className={up ? "up" : "down"}>
                      {up ? "▲" : "▼"} 🐜{s.hype}
                    </b>
                  </button>
                </Html>
                <Crowd n={s.hype} seed={i} />
              </group>
            );
          })}
        </group>
      </Spin>
    </Stage>
  );
}
