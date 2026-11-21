// 3D 장면 2개(코드 분할: three.js 는 이 파일을 열 때만 받는다)
//  - Room   : 내 방. 모은 ★ 로 열린 가구가 놓이고 내 개미가 논다(홈·결산)
//  - Plaza  : 화제 광장. 종목 가판대마다 개미 군중(= 지난주 실제 유튜브 언급 수)이 몰린다(플레이 피드)
import { Html, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Group } from "three";
import { CHAR_META, type CharId } from "../Characters";
import { Ant3D, MiniAnt } from "./Ant3D";

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

// ---------------------------------------------------------------- 내 방
// 가구를 누르면 개미가 그 앞으로 걸어가 한마디(위치 = 방 좌표 x, z)
const SPOTS: Record<string, { at: [number, number]; box: [number, number, number, number, number]; lines: string[] }> = {
  desk: { at: [-1.6, -1.3], box: [-1.6, 0.6, -2.2, 2.1, 1.2], lines: ["오늘도 차트 공부! 📈", "책상 앞에 앉으니 전문가 같아"] },
  monitor: { at: [-1.6, -1.3], box: [-1.6, 1.4, -2.4, 1.2, 0.8], lines: ["모니터 속 빨간 불… 오르는 중?", "화면만 보면 손이 근질근질"] },
  plant: { at: [1.9, -1.7], box: [2.3, 0.7, -2.3, 1.0, 1.4], lines: ["물 줘야지 🌱", "몬스테라처럼 쑥쑥 크자!"] },
  lamp: { at: [-1.9, 1.2], box: [-2.5, 1, 1.6, 0.8, 2] , lines: ["밝아졌다 💡", "밤샘 차트는 이제 그만…"] },
  sofa: { at: [1.6, 1.0], box: [1.6, 0.5, 1.9, 2.3, 1.1], lines: ["잠깐 쉬어 갈까… 멘탈 회복 중", "소파 최고야 🛋️"] },
  shelf: { at: [-2.2, -0.6], box: [-2.85, 1.1, -0.6, 0.5, 2.2], lines: ["투자 책 한 권 📚", "'존버의 기술'… 읽어 볼까?"] },
  window: { at: [1.2, -2.2], box: [1.2, 1.9, -2.9, 2.2, 1.4], lines: ["시티뷰 최고 🌃", "저 불빛 중 하나는 내 거…?"] },
  trophy: { at: [1.9, 0.3], box: [2.4, 0.5, 0.3, 0.7, 1.1], lines: ["내 트로피 반짝반짝 🏆", "다음 시즌도 1등 가자!"] },
  coins: { at: [1.0, -0.3], box: [1.4, 0.15, -0.5, 0.9, 0.4], lines: ["동전 세는 중… 하나, 둘 🪙", "티끌 모아 태산!"] },
  statue: { at: [1.8, -0.9], box: [2.2, 0.8, -1.2, 0.9, 1.6], lines: ["황금 개미 선배님…!", "언젠가 나도 황금 개미"] },
};
const ANT_LINES = ["안녕! 🐜", "오늘의 시드 해 볼래?", "미션 깨면 별을 받아!", "별 모으면 가구가 생겨", "간지러워 ㅋㅋ", "범고래 박사님 보고 싶다 🐳"];
const clamp = (v: number) => Math.max(-2.5, Math.min(2.6, v));

function Walker({ color, accent, mood, outfit, target, say, onTapAnt }: { color: string; accent: string; mood: string; outfit?: string | null; target: { current: [number, number] }; say: string | null; onTapAnt: () => void }) {
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
      const want = Math.atan2(dx, dz);
      let diff = want - g.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.current.rotation.y += diff * Math.min(1, dt * 10);
    } else {
      // 멈추면 천천히 카메라 쪽(대각선 앞)을 본다
      let diff = 0.75 - g.current.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.current.rotation.y += diff * Math.min(1, dt * 2);
    }
  });
  return (
    <group ref={g} position={[0.3, 0, 0.6]}>
      <Ant3D color={color} accent={accent} scale={1.1} mood={mood} outfit={outfit} onTap={onTapAnt} walking={walking} />
      {say && (
        <Html position={[0, 2.3, 0]} center distanceFactor={7} zIndexRange={[20, 0]}>
          <div className="ant-bubble">{say}</div>
        </Html>
      )}
    </group>
  );
}

export function Room({ char = "office", items, mood = "happy", height = 300, outfit, keys = false }: { char?: CharId; items: string[]; mood?: string; height?: number; outfit?: string | null; keys?: boolean }) {
  const m = CHAR_META[char] ?? CHAR_META.office;
  const has = (id: string) => items.includes(id);
  const gold = has("penthouse");
  const target = useRef<[number, number]>([0.3, 0.6]);
  const [say, setSay] = useState<string | null>(null);
  const timer = useRef<number>();
  const speak = useCallback((line: string, delay = 0) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSay(line);
      timer.current = window.setTimeout(() => setSay(null), 2600);
    }, delay);
  }, []);
  const walkTo = (x: number, z: number) => {
    target.current = [clamp(x), clamp(z)];
  };
  const onFloor = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    walkTo(e.point.x, e.point.z);
  };
  const visit = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = SPOTS[id];
    walkTo(s.at[0], s.at[1]);
    speak(s.lines[Math.floor(Math.random() * s.lines.length)], 900);
  };
  // 방향키·WASD 로 걷기(내 방 화면)
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
  }, [keys]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Stage height={height} camera={[5.5, 4.6, 6.5]} label={`내 방: 가구 ${items.length}개, ${m.name}. 바닥을 누르면 걸어가고, 가구를 누르면 말해요`}>
      <group>
        <group position={[0, -1.2, 0]}>
          {/* 바닥·벽 — 바닥을 누르면 그곳으로 걸어간다 */}
          <mesh receiveShadow position={[0, -0.05, 0]} onPointerDown={onFloor}>
            <boxGeometry args={[6, 0.1, 6]} />
            <meshStandardMaterial color={gold ? "#f1e3c8" : "#f4dcc0"} />
          </mesh>
          <mesh position={[0, 1.6, -3]} receiveShadow>
            <boxGeometry args={[6, 3.3, 0.12]} />
            <meshStandardMaterial color={gold ? "#fff4d6" : "#ffe3ec"} emissive={gold ? "#fff4d6" : "#ffd6e3"} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[-3, 1.6, 0]} receiveShadow>
            <boxGeometry args={[0.12, 3.3, 6]} />
            <meshStandardMaterial color={gold ? "#ffe8a3" : "#e7e0ff"} emissive={gold ? "#ffe8a3" : "#ddd3ff"} emissiveIntensity={0.25} />
          </mesh>
          {has("rug") && (
            <mesh position={[0.4, 0.01, 0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[1.5, 40]} />
              <meshStandardMaterial color="#b197fc" />
            </mesh>
          )}
          {has("desk") && (
            <group position={[-1.6, 0, -2.2]}>
              <RoundedBox args={[2, 0.12, 0.9]} radius={0.04} position={[0, 0.9, 0]} castShadow>
                <meshStandardMaterial color="#c08457" />
              </RoundedBox>
              {[-0.9, 0.9].map((x) => (
                <mesh key={x} position={[x, 0.45, 0]}>
                  <boxGeometry args={[0.1, 0.9, 0.8]} />
                  <meshStandardMaterial color="#a0673d" />
                </mesh>
              ))}
            </group>
          )}
          {has("monitor") && (
            <group position={[-1.6, 1.38, -2.4]}>
              <RoundedBox args={[1.1, 0.7, 0.06]} radius={0.03} castShadow>
                <meshStandardMaterial color="#1d1640" />
              </RoundedBox>
              <mesh position={[0, 0, 0.035]}>
                <planeGeometry args={[1, 0.6]} />
                <meshStandardMaterial color="#0f2b1f" emissive="#12b886" emissiveIntensity={0.35} />
              </mesh>
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} position={[-0.36 + i * 0.18, -0.18 + i * 0.07, 0.04]} rotation={[0, 0, 0.35]}>
                  <boxGeometry args={[0.2, 0.03, 0.01]} />
                  <meshStandardMaterial color="#ff6b6e" emissive="#ff6b6e" emissiveIntensity={0.8} />
                </mesh>
              ))}
            </group>
          )}
          {has("plant") && (
            <group position={[2.3, 0, -2.3]}>
              <mesh position={[0, 0.3, 0]} castShadow>
                <cylinderGeometry args={[0.28, 0.22, 0.6, 16]} />
                <meshStandardMaterial color="#e8590c" />
              </mesh>
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} position={[Math.cos(i * 1.3) * 0.25, 0.9 + (i % 2) * 0.25, Math.sin(i * 1.3) * 0.25]} castShadow>
                  <sphereGeometry args={[0.3, 12, 12]} />
                  <meshStandardMaterial color="#2b8a3e" />
                </mesh>
              ))}
            </group>
          )}
          {has("lamp") && (
            <group position={[-2.5, 0, 1.6]}>
              <mesh position={[0, 0.8, 0]}>
                <cylinderGeometry args={[0.04, 0.04, 1.6, 8]} />
                <meshStandardMaterial color="#495057" />
              </mesh>
              <mesh position={[0, 1.7, 0]}>
                <coneGeometry args={[0.35, 0.4, 20, 1, true]} />
                <meshStandardMaterial color="#ffd43b" emissive="#ffd43b" emissiveIntensity={0.6} side={2} />
              </mesh>
              <pointLight position={[0, 1.5, 0]} intensity={2} distance={4} color="#ffe066" />
            </group>
          )}
          {has("sofa") && (
            <group position={[1.6, 0, 1.9]} rotation={[0, Math.PI, 0]}>
              <RoundedBox args={[2.2, 0.5, 0.9]} radius={0.15} position={[0, 0.35, 0]} castShadow>
                <meshStandardMaterial color="#ff8787" />
              </RoundedBox>
              <RoundedBox args={[2.2, 0.8, 0.25]} radius={0.12} position={[0, 0.7, -0.35]} castShadow>
                <meshStandardMaterial color="#fa5252" />
              </RoundedBox>
            </group>
          )}
          {has("shelf") && (
            <group position={[-2.85, 0, -0.6]} rotation={[0, Math.PI / 2, 0]}>
              <mesh position={[0, 1.1, 0]} castShadow>
                <boxGeometry args={[1.4, 2.2, 0.3]} />
                <meshStandardMaterial color="#8d6e63" />
              </mesh>
              {[0.5, 1.1, 1.7].flatMap((y) =>
                [-0.45, -0.2, 0.05, 0.3].map((x, i) => (
                  <mesh key={`${y}${x}`} position={[x, y, 0.1]}>
                    <boxGeometry args={[0.18, 0.4, 0.2]} />
                    <meshStandardMaterial color={["#5b3fd6", "#12b886", "#f59f00", "#e5383b"][i]} />
                  </mesh>
                )),
              )}
            </group>
          )}
          {has("window") && (
            <group position={[1.2, 1.9, -2.92]}>
              <mesh>
                <planeGeometry args={[2.2, 1.4]} />
                <meshStandardMaterial color="#1c2a5b" emissive="#3b5bdb" emissiveIntensity={0.25} />
              </mesh>
              {[-0.8, -0.45, -0.1, 0.25, 0.6, 0.85].map((x, i) => (
                <mesh key={x} position={[x, -0.7 + ((i * 37) % 5) * 0.12, 0.01]}>
                  <planeGeometry args={[0.28, 0.6 + ((i * 53) % 7) * 0.12]} />
                  <meshStandardMaterial color="#0b1230" emissive="#ffd43b" emissiveIntensity={0.08} />
                </mesh>
              ))}
            </group>
          )}
          {has("trophy") && (
            <group position={[2.4, 0, 0.3]}>
              <mesh position={[0, 0.2, 0]}>
                <boxGeometry args={[0.5, 0.4, 0.5]} />
                <meshStandardMaterial color="#495057" />
              </mesh>
              <mesh position={[0, 0.65, 0]} castShadow>
                <cylinderGeometry args={[0.28, 0.1, 0.5, 20]} />
                <meshStandardMaterial color="#ffd43b" metalness={0.7} roughness={0.25} />
              </mesh>
            </group>
          )}
          {has("coins") &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <mesh key={i} position={[1.2 + (i % 3) * 0.22, 0.05 + Math.floor(i / 3) * 0.08, -0.6 + (i % 2) * 0.2]} castShadow>
                <cylinderGeometry args={[0.16, 0.16, 0.06, 20]} />
                <meshStandardMaterial color="#ffd43b" metalness={0.8} roughness={0.25} />
              </mesh>
            ))}
          {has("statue") && <Ant3D color="#ffd43b" accent="#c78a00" position={[2.2, 0.4, -1.2]} scale={0.6} mood="happy" />}
          {/* 가구 누르는 자리(보이지 않는 상자) */}
          {Object.entries(SPOTS)
            .filter(([id]) => has(id))
            .map(([id, s]) => (
              <mesh
                key={id}
                position={[s.box[0], s.box[1], s.box[2]]}
                onClick={visit(id)}
                onPointerOver={() => (document.body.style.cursor = "pointer")}
                onPointerOut={() => (document.body.style.cursor = "")}
              >
                <boxGeometry args={[s.box[3], s.box[4], s.box[3]]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            ))}
          {/* 내 개미 */}
          <Walker color={m.body} accent={m.accent} mood={mood} outfit={outfit} target={target} say={say} onTapAnt={() => speak(ANT_LINES[Math.floor(Math.random() * ANT_LINES.length)])} />
        </group>
      </group>
    </Stage>
  );
}

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
