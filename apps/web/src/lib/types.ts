// 서버(api/app/season.py·main.py)가 보내는 모양. 화면은 이 타입만 믿는다.

export type Market = "KRX" | "US" | "CRYPTO";
export type Mode = "daily" | "free" | "practice";

export interface Title {
  t: string; // 제목(종목 이름은 코드네임, 다른 종목은 ○○)
  ch: string; // 채널 이름
  st: "b" | "n"; // 낙관(bull)·그 밖
  v: number; // 조회수
}

export interface Asset {
  k: string;
  code: string; // 코드네임 '반도체 A'
  sector: string;
  market: Market;
  locked: boolean;
  price: number;
  chg: number; // 지난주 등락
  hist: number[]; // 최근 12주 종가(마지막 = 지금 가격)
  hype: number; // 지난주 유튜브 언급 수
  hypePrev: number;
  bull: number;
  bear: number;
  titles: Title[];
  disc: string[];
}

export interface LuckCard {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export interface Mission {
  id: string;
  icon: string;
  label: string;
  state: "ing" | "done" | "fail";
  now?: string; // 지금 진행 상황 한 줄
  cur?: number | null;
  goal?: number | null;
}

export interface Cite {
  id: string;
  code: string;
  k: string;
  kind: string;
  ago: string;
  text: string;
  ch: string;
  score: number;
}

export interface AskOut {
  answer: string;
  cites: Cite[];
  source: "ai" | "search";
  reason?: string;
  model?: string;
  logId?: number;
  left: number;
  searched: number;
  backend: string;
}

export interface Position {
  k: string;
  qty: number;
  cost: number;
  price: number;
  value: number;
  gain: number;
}

export interface Rival {
  name: string;
  twr: number;
  picks: number;
}

export interface EventCard {
  id: string;
  icon: string;
  title: string;
  body: string;
  choices: { label: string; hint: string }[];
}

export interface View {
  t: number;
  season: number;
  mode: Mode;
  char: string;
  perk: string;
  missions: Mission[];
  asksLeft: number;
  tier: { id: "calm" | "ok" | "anxious" | "shaky"; name: string; icon: string; desc: string };
  rules: Record<string, boolean>;
  luck: LuckCard | null;
  luckPick: boolean;
  etf: string;
  done: boolean;
  skip: boolean;
  cash: number;
  value: number;
  twr: number;
  mental: number;
  deposits: number;
  pos: Position[];
  assets: Asset[];
  index: number[];
  rivals: Rival[];
  kospi: number;
  pending: EventCard | null;
  hist: { r: number; v: number; m: number; n: number }[];
  markets: Market[];
  maxHold: number;
  fees: Record<Market, { buy: number; sell: number }>;
  headlines: (Title & { k: string })[];
  goal?: { i: number; stars: number } | null; // 이번 시즌 목표 라이벌(rivals[i])
  miles?: { at: number; stars: number; hit: boolean }[]; // 중간 상자: 수익률 선
}

export interface Trade {
  k: string;
  q: number;
  px: number;
  auto?: boolean;
  gain?: number;
}

export interface Week {
  t: number;
  r: number;
  value: number;
  mental: number;
  dm: number;
  why: [string, number][];
  panic: boolean;
  trades: (Trade & { rule?: string })[];
  event: { id: string; choice: number } | null;
  mine: Record<string, number>;
  top: [string, number][];
  bottom: [string, number][];
  index: number;
  rivals: number[];
  salary?: number;
  luck?: { icon: string; text: string; cash?: number; mental?: number } | null;
  miles?: { at: number; stars: number }[];
}

export interface Final {
  ret: number;
  value: number;
  deposits: number;
  grade: "S" | "A" | "B" | "C" | "D" | "F";
  rank: number;
  of: number;
  board: { who: "me" | "yt" | "index"; name: string; ret: number }[];
  title: { name: string; icon: string; why: string; stats: Record<string, number> };
  reveal: { k: string; code: string; name: string; market: Market; ret: number }[];
  curves: { me: number[]; index: number[]; rivals: number[][] };
  rivalNames: string[];
  period: { from: string; to: string };
  weeks: number[];
  mental: number[];
  missions: Mission[];
  stars: number;
  goal?: { name: string; ret: number; hit: boolean; stars: number } | null;
  mileStars?: number;
  char: string;
  len: number;
  place?: { rank: number; total: number; top: number } | null;
  id?: string;
  nickname?: string | null;
  mode?: Mode;
  day?: string | null;
}

export interface RunOut {
  id: string;
  mode: Mode;
  day: string | null;
  nickname: string | null;
  view: View;
  week?: Week;
  weeks?: Week[];
  card?: LuckCard & { others: LuckCard[] };
  final?: Final | null;
}

export interface Day {
  day: string;
  n: number;
  best: number;
  winner: string | null;
  char: string | null;
}

export interface Coach {
  headline: string;
  points: string[];
  tip: string;
  source: "ai" | "rule";
  model?: string;
}

export interface Board {
  day: string;
  total: number;
  rows: { rank: number; nickname: string; ret: number; grade: string; title: string; char: string | null; me?: boolean }[];
  median: number | null;
  bench: { youtubers: number[]; index: number; beatAll: number } | null;
}

interface Stat {
  n: number;
  mean: number | null;
  median: number | null;
  win: number | null;
}

export interface Meta {
  hype: Record<string, Stat>;
  all: Stat;
  momentum: { afterJump: Stat; afterDrop: Stat };
  ghosts: {
    kospi: number;
    n: number;
    beat: number;
    top: { name: string; ret: number; weeks: number }[];
    bottom: { name: string; ret: number; weeks: number }[];
    hist: [number, number][];
  };
  quality: { channelsAll: number; ghosts: number; ghostRule: string; poolRule: string; weeksWithTitles: number; assetWeeks: number; ragIndexed: number; ragTotal: number; masking: string };
  pack: { weeks: number; playable: number; from: string; to: string; assets: Record<Market, number>; channels: number; builtAt: string };
  source: Record<string, number | string>;
  plays: { runs: number; done: number; median: number | null; grades: Record<string, number>; titles: Record<string, number>; funnel: { turn: number; n: number }[] };
  coach: { n: number; ok: number; p50: number | null; provider: string };
  ask: { n: number; ok: number; retried: number; p50: number | null };
  rag: { docs: number; backend: string; model: string; dim: number; window: number };
  players: {
    n: number;
    beatIndex: number | null;
    beatYt: Record<string, number>;
    fomo: Record<string, { n: number; median: number | null }>;
    chars: Record<string, { n: number; median: number }>;
  };
  perf: { path: string; n: number; p50: number; p95: number; max: number }[];
}
