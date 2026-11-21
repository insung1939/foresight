// 이 기기의 성장 기록: 완주 수 · 최고 등급 · 칭호 도감 · 시장 해금. 서버 없이 localStorage 에만.
import { KEYS, read, write } from "./storage";
import type { Final, Market } from "./types";

export interface Progress {
  runs: number;
  best: string | null; // 최고 등급
  bestRet: number | null;
  titles: Record<string, number>; // 칭호 이름 → 얻은 횟수
  dailyDone: string | null; // 마지막으로 끝낸 오늘의 시드 날짜
  streak: number; // 오늘의 시드 연속 참여
  seen: string[]; // 결산을 본 판 id(중복 기록 방지)
  stars: number; // 모은 별(미션·등급) → 내 방 가구
  char: string; // 마지막으로 고른 내 개미
  outfit: string | null;
  practiced: boolean; // 연습 시즌을 끝냈나
  boxes: string[]; // 행운 상자를 연 판 id
  pity: number; // 연속 '작은 보상' 수(3번이면 다음은 큰 보상 확정)
}

const EMPTY: Progress = { runs: 0, best: null, bestRet: null, titles: {}, dailyDone: null, streak: 0, seen: [], stars: 0, char: "office", outfit: null, practiced: false, boxes: [], pity: 0 };
const ORDER = ["F", "D", "C", "B", "A", "S"];

export const ALL_TITLES: { name: string; icon: string; hint: string; desc: string }[] = [
  { name: "존버의 신", icon: "🗿", hint: "거의 안 건드리고 수익 내기", desc: "거래 4번 이하로 버텨서 벌었어요" },
  { name: "익절 장인", icon: "💎", hint: "오른 종목을 제때 팔기", desc: "+10% 넘게 오른 종목을 여러 번 챙겼어요" },
  { name: "칼손절러", icon: "✂️", hint: "크게 잃은 종목 정리하기", desc: "−15% 넘게 빠진 종목을 미련 없이 팔았어요" },
  { name: "균형 잡힌 개미", icon: "🐜", hint: "골고루 나눠 담기", desc: "분산도 보유 기간도 고른 편이에요" },
  { name: "현금 수호자", icon: "🛡️", hint: "현금을 넉넉히 들고 있기", desc: "평균 60% 넘게 현금으로 버텼어요" },
  { name: "몰빵러", icon: "🎯", hint: "한 종목에 크게 걸기", desc: "한 종목 비중이 70%를 넘는 주가 많았어요" },
  { name: "단타의 민족", icon: "⚡", hint: "매주 바쁘게 사고팔기", desc: "한 주에 평균 3번 넘게 거래했어요" },
  { name: "FOMO 장인", icon: "🔥", hint: "화제 종목 따라 사기", desc: "화제 1·2위나 급등한 종목을 5번 넘게 쫓아갔어요" },
  { name: "코인 탐험가", icon: "🪙", hint: "코인 바람 타기", desc: "코인에 올라탔다가 쓴맛을 봤어요" },
  { name: "방치형 개미", icon: "💤", hint: "거의 아무것도 안 하기", desc: "거래가 거의 없었는데 수익도 없었어요" },
  { name: "패닉셀러", icon: "😱", hint: "멘탈이 바닥나기", desc: "멘탈이 0이 돼서 한꺼번에 다 팔았어요" },
];

export function progress(): Progress {
  return { ...EMPTY, ...(read<Progress>(KEYS.progress) ?? {}) };
}

/** 시장 해금: 국내는 처음부터, 미국은 1판 완주, 코인은 B 등급 이상 */
export function unlocked(p = progress()): Market[] {
  const m: Market[] = ["KRX"];
  if (p.runs >= 1) m.push("US");
  if (p.best && ORDER.indexOf(p.best) >= ORDER.indexOf("B")) m.push("CRYPTO");
  return m;
}

export function save(patch: Partial<Progress>) {
  write(KEYS.progress, { ...progress(), ...patch });
}

/** 내 개미 해금: 큰손은 1판 완주, 코인은 B 등급 이상 */
export function charUnlocked(id: string, p = progress()): boolean {
  if (id === "whale") return p.runs >= 1;
  if (id === "coin") return !!p.best && ORDER.indexOf(p.best) >= ORDER.indexOf("B");
  return true;
}

/** 결산을 처음 볼 때 한 번 기록. 새로 열린 것들을 돌려준다 */
export function record(id: string, f: Final): { newTitle: boolean; newMarkets: Market[]; best: boolean; starsBefore: number; starsAfter: number } {
  const p = progress();
  if (p.seen.includes(id)) return { newTitle: false, newMarkets: [], best: false, starsBefore: p.stars, starsAfter: p.stars };
  const starsBefore = p.stars;
  p.stars += f.stars ?? 0;
  if (f.mode === "practice") p.practiced = true;
  const before = unlocked(p);
  const newTitle = !p.titles[f.title.name];
  const best = p.bestRet === null || f.ret > p.bestRet;
  p.runs += 1;
  p.titles[f.title.name] = (p.titles[f.title.name] ?? 0) + 1;
  if (!p.best || ORDER.indexOf(f.grade) > ORDER.indexOf(p.best)) p.best = f.grade;
  if (best) p.bestRet = f.ret;
  if (f.mode === "daily" && f.day && p.dailyDone !== f.day) {
    const y = new Date(new Date(f.day).getTime() - 86_400_000).toISOString().slice(0, 10);
    p.streak = p.dailyDone === y ? p.streak + 1 : 1;
    p.dailyDone = f.day;
  }
  p.seen = [...p.seen.slice(-50), id];
  write(KEYS.progress, p);
  const after = unlocked(p);
  return { newTitle, newMarkets: after.filter((m) => !before.includes(m)), best, starsBefore, starsAfter: p.stars };
}


/** 행운 상자(판이 끝날 때 한 번): 별 +1(65%) · +2(25%) · +3(9%) · +5(1%). 작은 보상 3번 뒤엔 +3 이상 확정(천장) */
export function openBox(id: string): { stars: number; label: string; rare: boolean } | null {
  const p = progress();
  if (p.boxes.includes(id)) return null;
  const r = Math.random();
  let stars = r < 0.01 ? 5 : r < 0.1 ? 3 : r < 0.35 ? 2 : 1;
  if (p.pity >= 3 && stars < 3) stars = 3;
  p.pity = stars >= 3 ? 0 : p.pity + 1;
  p.stars += stars;
  p.boxes = [...p.boxes.slice(-50), id];
  write(KEYS.progress, p);
  const label = stars >= 5 ? "전설의 황금 상자!" : stars >= 3 ? "반짝이는 상자!" : stars === 2 ? "꽤 괜찮은 상자" : "작은 상자";
  return { stars, label, rare: stars >= 3 };
}
export const boxOpened = (id: string) => progress().boxes.includes(id);
