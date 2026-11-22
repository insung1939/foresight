// 3D 장면 2개(코드 분할: three.js 는 이 파일을 열 때만 받는다)
//  - Room   : 내 방. 모은 ★ 로 열린 가구가 놓이고 내 개미가 논다(홈·결산)
//  - Plaza  : 화제 광장. 종목 가판대마다 개미 군중(= 지난주 실제 유튜브 언급 수)이 몰린다(플레이 피드)
import { Html, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Group } from "three";
import { MiniAnt } from "./Ant3D";

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
    <Stage height={height} camera={[0, 6.5, 8.5]} label={`화제 광장: ${top.map((s) => `${s.code} 언급 ${s.hype}건`).join(", ")}`}>
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
            const crowd = Math.min(18, Math.round(Math.sqrt(s.hype) * 3));
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
                    <b>{s.hype ? `🔥${s.hype}` : "조용"}</b>
                  </button>
                </Html>
                {Array.from({ length: crowd }, (_, j) => {
                  const ra = (j / crowd) * Math.PI * 2;
                  const rr = 0.85 + (j % 3) * 0.22;
                  return <MiniAnt key={j} position={[Math.cos(ra) * rr, 0, Math.sin(ra) * rr]} phase={j * 0.7 + i} />;
                })}
              </group>
            );
          })}
        </group>
      </Spin>
    </Stage>
  );
}
