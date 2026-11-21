// 3D 개미(기본 도형만으로). 위아래로 통통 튀고, 누르면 점프한다.
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";

export function Ant3D({ color = "#5b3fd6", accent = "#e5383b", position = [0, 0, 0] as [number, number, number], scale = 1, mood = "calm", outfit, face = 0, onTap, walking }: { color?: string; accent?: string; position?: [number, number, number]; scale?: number; mood?: string; outfit?: string | null; face?: number; onTap?: () => void; walking?: { current: boolean } }) {
  const g = useRef<Group>(null);
  const [jump, setJump] = useState(0);
  useFrame((st, dt) => {
    if (!g.current) return;
    const t = st.clock.elapsedTime;
    const j = jump > 0 ? Math.sin((1 - jump) * Math.PI) * 0.6 : 0;
    const w = walking?.current;
    g.current.position.y = position[1] + Math.abs(Math.sin(t * (w ? 9 : 2.2))) * (w ? 0.14 : 0.08) + j;
    g.current.rotation.y = face + (w ? 0 : Math.sin(t * 0.7) * 0.25) + (jump > 0 ? (1 - jump) * Math.PI * 2 : 0);
    g.current.rotation.z = w ? Math.sin(t * 9) * 0.06 : 0;
    if (jump > 0) setJump(Math.max(0, jump - dt * 1.6));
  });
  const eyeScale = mood === "panic" ? 1.25 : 1;
  return (
    <group
      ref={g}
      position={position}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        setJump(1);
        onTap?.();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* 배·가슴 */}
      <mesh position={[0, 0.35, -0.35]} castShadow>
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.5, 0.05]} castShadow>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      {/* 머리 */}
      <mesh position={[0, 0.98, 0.25]} castShadow>
        <sphereGeometry args={[0.46, 32, 32]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      {/* 눈 */}
      {[-0.17, 0.17].map((x) => (
        <group key={x} position={[x, 1.05, 0.64]} scale={eyeScale}>
          <mesh>
            <sphereGeometry args={[0.15, 20, 20]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, -0.01, 0.1]}>
            <sphereGeometry args={[0.075, 16, 16]} />
            <meshStandardMaterial color="#1d1640" />
          </mesh>
          <mesh position={[0.03, 0.03, 0.16]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      {/* 볼 */}
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.86, 0.6]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color="#ff8fa3" />
        </mesh>
      ))}
      {/* 입 */}
      <mesh position={[0, 0.86, 0.68]} rotation={[0.25, 0, Math.PI]}>
        <torusGeometry args={[0.09, 0.022, 8, 16, mood === "panic" || mood === "worried" ? Math.PI * 0.6 : Math.PI]} />
        <meshStandardMaterial color="#1d1640" />
      </mesh>
      {/* 더듬이 */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.16, 1.38, 0.25]} rotation={[0.2, 0, -s * 0.45]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.4, 8]} />
            <meshStandardMaterial color="#1d1640" />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </group>
      ))}
      {/* 다리 */}
      {[-1, 1].flatMap((s) =>
        [0.25, 0, -0.3].map((z, i) => (
          <mesh key={`${s}${i}`} position={[s * 0.32, 0.2, z]} rotation={[0, 0, s * 0.9]}>
            <cylinderGeometry args={[0.03, 0.03, 0.42, 6]} />
            <meshStandardMaterial color="#1d1640" />
          </mesh>
        )),
      )}
      {outfit === "crown" && (
        <mesh position={[0, 1.48, 0.25]}>
          <cylinderGeometry args={[0.22, 0.26, 0.18, 6, 1, true]} />
          <meshStandardMaterial color="#ffd43b" metalness={0.6} roughness={0.3} side={2} />
        </mesh>
      )}
      {outfit === "shades" && (
        <mesh position={[0, 1.06, 0.72]}>
          <boxGeometry args={[0.55, 0.12, 0.04]} />
          <meshStandardMaterial color="#1d1640" />
        </mesh>
      )}
    </group>
  );
}

/** 군중용 작은 개미(간단한 모양) */
export function MiniAnt({ position, color = "#3c2a1e", phase = 0 }: { position: [number, number, number]; color?: string; phase?: number }) {
  const g = useRef<Group>(null);
  useFrame((st) => {
    if (!g.current) return;
    const t = st.clock.elapsedTime + phase;
    g.current.position.y = position[1] + Math.abs(Math.sin(t * 4)) * 0.06;
    g.current.rotation.y = Math.sin(t * 1.3) * 0.6;
  });
  return (
    <group ref={g} position={position}>
      <mesh position={[0, 0.12, -0.1]}>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.2, 0.05]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.22, 0.05]}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
