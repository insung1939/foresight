// 성장 요소: 경험치(XP) · 레벨 · 배지. 이 기기(localStorage)에만 저장한다(로그인 없음).
// 같은 라운드·같은 게임은 두 번 보상하지 않는다(새로고침해도 안전).
import { cheer } from "./buddy";
import { read, write } from "./storage";
import type { GameState, Reveal } from "./types";

const KEY = "fs:progress:v1";

export interface Progress {
  xp: number;
  games: number;
  rounds: number;
  hits: number;
  badges: Record<string, { at: string; game: string }>;
  paid: Record<string, number[]>; // gameId → 보상한 라운드(게임 완주 보상은 -1)
  xpByGame: Record<string, number>;
}

const empty = (): Progress => ({ xp: 0, games: 0, rounds: 0, hits: 0, badges: {}, paid: {}, xpByGame: {} });
export const loadProgress = (): Progress => ({ ...empty(), ...(read<Progress>(KEY) ?? {}) });
let afterSave: (() => void) | null = null;
/** 저장할 때마다 부를 함수(로그인했으면 계정과 합치기). sync.ts 가 등록한다 */
export const setAfterSave = (f: () => void) => {
  afterSave = f;
};
/** 계정에서 합친 결과로 이 기기 기록을 바꾼다(다시 합치기를 부르지 않음) */
export const replaceProgress = (p: Progress) => write(KEY, { ...empty(), ...p });

const save = (p: Progress) => {
  const ids = Object.keys(p.paid);
  if (ids.length > 30) ids.slice(0, ids.length - 30).forEach((id) => delete p.paid[id]); // 오래된 게임 기록은 정리
  write(KEY, p);
  afterSave?.();
};

// ------------------------------------------------------------ 레벨
export const LEVELS = [
  { xp: 0, title: "새싹 개미", icon: "🌱" },
  { xp: 120, title: "개미", icon: "🐜" },
  { xp: 300, title: "부지런한 개미", icon: "🐜" },
  { xp: 550, title: "슈퍼개미", icon: "💪" },
  { xp: 850, title: "차트 탐정", icon: "🔍" },
  { xp: 1250, title: "공시 사냥꾼", icon: "📑" },
  { xp: 1750, title: "시장 관찰자", icon: "🦉" },
  { xp: 2400, title: "새벽 예언가", icon: "🔮" },
  { xp: 3200, title: "전설의 Foresight", icon: "🌅" },
];

export function levelOf(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return { level: i + 1, ...cur, next: next?.xp ?? null, into: xp - cur.xp, span: next ? next.xp - cur.xp : 1 };
}

// ------------------------------------------------------------ 배지
export interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  hidden?: boolean; // 얻기 전엔 설명을 가린다
}

export const BADGES: BadgeDef[] = [
  { id: "first_round", icon: "👣", name: "첫 발", desc: "첫 라운드를 끝냈어요" },
  { id: "first_hit", icon: "🎯", name: "첫 적중", desc: "처음으로 맞혔어요" },
  { id: "streak3", icon: "🔥", name: "불붙었다", desc: "3연속 적중" },
  { id: "streak5", icon: "☄️", name: "멈출 수 없어", desc: "5연속 적중" },
  { id: "first_short", icon: "🐻", name: "곰 등장", desc: "처음으로 공매도" },
  { id: "short_win", icon: "🧊", name: "하락에 웃다", desc: "공매도로 돈을 벌었어요" },
  { id: "blind", icon: "🙈", name: "직감", desc: "카드를 하나도 안 열고 맞혔어요", hidden: true },
  { id: "contrarian", icon: "🔄", name: "역발상", desc: "유튜버가 틀린 문제를 맞혔어요" },
  { id: "beat_ai", icon: "🤖", name: "AI 잡는 개미", desc: "AI보다 많이 벌었어요" },
  { id: "diamond", icon: "💎", name: "다이아 손", desc: "속보에도 비중을 지키고 맞혔어요" },
  { id: "switch", icon: "🔀", name: "갈아타기 장인", desc: "속보 뒤 비중을 바꿔서 더 벌었어요" },
  { id: "allin", icon: "🎰", name: "풀매수 성공", desc: "100% 담아서 10% 넘게 벌었어요", hidden: true },
  { id: "dodge", icon: "🛡️", name: "폭락 회피", desc: "15% 넘게 빠진 종목을 피했어요" },
  { id: "moon", icon: "🚀", name: "급등 탑승", desc: "20% 넘게 오른 종목을 70% 이상 담았어요" },
  { id: "finish", icon: "🏁", name: "완주", desc: "10라운드를 끝까지" },
  { id: "sharp", icon: "🦉", name: "새벽의 눈", desc: "한 판에 7개 이상 적중" },
  { id: "regular", icon: "🗓️", name: "단골", desc: "3판 완주" },
  { id: "beat_yt", icon: "📺", name: "유튜버보다 낫다", desc: "한 판 수익이 '유튜버 말대로'보다 높았어요" },
];
export const badgeDef = (id: string) => BADGES.find((b) => b.id === id)!;

function grant(p: Progress, id: string, game: string, out: BadgeDef[]) {
  if (p.badges[id]) return;
  p.badges[id] = { at: new Date().toISOString(), game };
  out.push(badgeDef(id));
}

function announce(before: number, p: Progress, xp: number, reason: string, got: BadgeDef[]) {
  if (xp > 0) cheer({ kind: "xp", amount: xp, reason });
  got.forEach((b, i) => setTimeout(() => cheer({ kind: "badge", icon: b.icon, name: b.name, desc: b.desc }), 700 + i * 1300));
  const a = levelOf(before);
  const b = levelOf(p.xp);
  if (b.level > a.level) setTimeout(() => cheer({ kind: "level", level: b.level, title: b.title, icon: b.icon }), 600 + got.length * 1300);
}

/** 정답 공개 때 한 번: 라운드 경험치·배지 */
export function awardRound(game: GameState): { xp: number; badges: BadgeDef[] } | null {
  const cur = game.current;
  const rv = cur?.reveal as Reveal | undefined;
  if (!cur || !rv) return null;
  const p = loadProgress();
  const paid = (p.paid[game.gameId] ??= []);
  if (paid.includes(game.round)) return null;
  paid.push(game.round);

  const hs = game.history.slice().sort((a, b) => a.round - b.round);
  let streak = 0;
  for (let i = hs.length - 1; i >= 0 && hs[i].hit; i--) streak++;
  const w1 = cur.w1 ?? 0;
  const w2 = cur.w2 ?? w1;
  const r20 = rv.answer.r20;
  const ytRight = (rv.youtube.verdict === "bull") === r20 > 0;

  let xp = 10;
  const why = ["완료 +10"];
  if (rv.hit) {
    xp += 20;
    why.push("적중 +20");
  }
  if (rv.hit && streak >= 2) {
    const b = Math.min(5 * (streak - 1), 25);
    xp += b;
    why.push(`${streak}연속 +${b}`);
  }
  if (rv.hit && !ytRight) {
    xp += 10;
    why.push("역발상 +10");
  }

  const got: BadgeDef[] = [];
  const g = game.gameId;
  grant(p, "first_round", g, got);
  if (rv.hit) grant(p, "first_hit", g, got);
  if (streak >= 3) grant(p, "streak3", g, got);
  if (streak >= 5) grant(p, "streak5", g, got);
  if (w1 < 0 || w2 < 0) grant(p, "first_short", g, got);
  if ((w1 < 0 || w2 < 0) && rv.mine > 0) grant(p, "short_win", g, got);
  if (rv.hit && cur.opened.length === 0) grant(p, "blind", g, got);
  if (rv.hit && !ytRight) grant(p, "contrarian", g, got);
  if (rv.ai && rv.ai.ret !== undefined && rv.ai.ret !== null && rv.mine > rv.ai.ret) grant(p, "beat_ai", g, got);
  if (rv.event && w1 === w2 && rv.hit) grant(p, "diamond", g, got);
  if (rv.event && w1 !== w2 && rv.holdRet !== undefined && rv.mine > rv.holdRet) grant(p, "switch", g, got);
  if (w1 === 100 && r20 >= 0.1) grant(p, "allin", g, got);
  if (r20 <= -0.15 && Math.max(w1, w2) <= 0) grant(p, "dodge", g, got);
  if (r20 >= 0.2 && w1 >= 70) grant(p, "moon", g, got);

  const before = p.xp;
  p.xp += xp;
  p.rounds += 1;
  p.hits += rv.hit ? 1 : 0;
  p.xpByGame[g] = (p.xpByGame[g] ?? 0) + xp;
  save(p);
  announce(before, p, xp, why.join(" · "), got);
  return { xp, badges: got };
}

/** 리포트를 처음 열 때 한 번: 완주 보상 */
export function awardGame(gameId: string, hits: number, beatYt: boolean): void {
  const p = loadProgress();
  const paid = (p.paid[gameId] ??= []);
  if (paid.includes(-1)) return;
  paid.push(-1);
  const got: BadgeDef[] = [];
  p.games += 1;
  grant(p, "finish", gameId, got);
  if (hits >= 7) grant(p, "sharp", gameId, got);
  if (p.games >= 3) grant(p, "regular", gameId, got);
  if (beatYt) grant(p, "beat_yt", gameId, got);
  const xp = 50 + hits * 5;
  const before = p.xp;
  p.xp += xp;
  p.xpByGame[gameId] = (p.xpByGame[gameId] ?? 0) + xp;
  save(p);
  announce(before, p, xp, `완주 +50 · 적중 ${hits}개 +${hits * 5}`, got);
}

export const badgesOfGame = (p: Progress, gameId: string) =>
  Object.entries(p.badges)
    .filter(([, v]) => v.game === gameId)
    .map(([id]) => badgeDef(id));
