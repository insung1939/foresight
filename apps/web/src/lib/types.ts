// 서버(api/app/main.py) 응답 모양. 서버는 지금 단계에서 볼 수 있는 것만 보낸다.

export type Stance = "bull" | "bear" | "neutral";
export type CardKey = "chart" | "disclosure" | "youtube" | "finance" | "news" | "ai";
export type Weight = -50 | 0 | 30 | 70 | 100;
export type Stage = "pick" | "replay" | "event" | "reveal" | "done";
export type Mode = "free" | "daily" | "replay";

export interface Point {
  t: number; // T0 기준 거래일. 0 = 산 날
  p: number; // 종가 지수(T0 = 100)
  v: number; // 거래량 ÷ 이전 60일 평균
  b: number; // 코스피 지수(T0 = 100)
}

export interface Fact {
  label: string;
  value: string;
}

export interface Video {
  channel: string;
  title: string;
  stance: Stance;
  views: number;
  daysBefore: number;
  /** 산 날 전에 결과가 확정된 이 유튜버의 방향 예측 기록. 5번 미만이면 null */
  record?: { n: number; hit: number } | null;
}

export interface Finance {
  report: string;
  daysBefore: number;
  basis: string;
  revenueBand: string | null;
  revenueGrowth: number | null;
  opMargin: number | null;
  opGrowth: number | null;
  opTurn: string | null;
  netTurn: string | null;
  netLoss: boolean;
  debtRatio: number | null;
  compare: string;
}

export interface Cards {
  chart?: { points: Point[] };
  disclosure?: { items: { kind: string; title: string; daysBefore: number; facts: Fact[] }[]; stakeReports: number };
  youtube?: { bull: number; bear: number; neutral: number; verdict: "bull" | "bear"; videos: Video[] };
  finance?: { finance: Finance | null };
  news?: { items: { title: string; source: string; daysBefore: number }[] };
  ai?: { intro: string; suggestions: string[] };
}

export interface GameEvent {
  t: number;
  type: "disclosure" | "shock";
  kind?: string;
  change?: number;
  title: string;
  facts: Fact[];
  points: Point[];
}

export interface Answer {
  name: string;
  symbol: string;
  t0: string;
  r20: number;
  kospi20: number;
  x20: number;
  after: { date: string; kind: string; title: string }[];
}

export interface AiJudgment {
  weight: Weight;
  confidence: number;
  reasons: { text: string; cite: string; source: string }[];
  model?: string;
  ret?: number;
  hit?: boolean;
}

export interface Crowd {
  n: number;
  dist: Record<string, number>;
  hitRate: number | null;
  avgRet: number | null;
}

export interface Reveal {
  exitDay?: number;
  answer: Answer;
  chart: Point[];
  event: GameEvent | null;
  youtube: { verdict: "bull" | "bear"; bull: number; bear: number };
  ai: AiJudgment | null;
  newsAfter: { title: string; source: string; at: string }[];
  ret60: number;
  period: string;
  mine: number;
  hit: boolean;
  youtuberRet: number;
  kospiRet: number;
  holdRet?: number;
  crowd: Crowd;
}

export interface Track {
  me: number;
  youtuber: number;
  kospi: number;
  ai: number;
}

export interface GameState {
  gameId: string;
  nickname?: string | null;
  mode?: Mode;
  daily?: string | null;
  rounds: number;
  round: number;
  stage: Stage;
  done: boolean;
  weights: Weight[];
  openLimit: number;
  askLimit: number;
  track: Track[];
  history: { round: number; name: string; r20: number; w1: Weight; w2: Weight; ret: number; hit: boolean; event: boolean; opened: CardKey[]; exitDay?: number }[];
  current?: {
    question: { period: string; market: string; ret60: number };
    opened: CardKey[];
    w1: Weight | null;
    w2: Weight | null;
    asked: number;
    cards: Cards;
    event?: GameEvent | null;
    replay?: { day: number; points: Point[]; value: number; eventDay: number | null };
    reveal?: Reveal;
  };
}

export interface AskResult {
  answer?: string;
  citations?: string[];
  sources?: { id: string; label: string; text: string }[];
  grounded?: boolean;
  fallback?: boolean;
  checks?: Record<string, string>;
  attempts?: number;
  latencyMs?: number;
  remaining: number;
  error?: string;
  errorKind?: "unconfigured" | "quota" | "timeout" | "busy" | "network" | "model";
  retryAfter?: number | null;
  logId?: number;
}

export interface ReportRound {
  round: number;
  opened: CardKey[];
  w1: Weight;
  w2: Weight;
  ret: number;
  hit: boolean;
  ms: number;
  period: string;
  ret60: number;
  chart: Point[];
  answer: Answer;
  event: boolean;
  youtube: { verdict: "bull" | "bear" };
  ai: { weight: Weight; hit: boolean } | null;
  exitDay?: number;
}

export interface Report {
  gameId: string;
  nickname?: string | null;
  rank?: number;
  mode?: Mode;
  daily?: string | null;
  rounds: ReportRound[];
  track: Track[];
  players: { n: number; beatShare: number | null; avgHit: number | null };
}

export interface Meta {
  summary: {
    cases: number;
    withEvent: number;
    buckets?: { up: number; down: number; flat: number };
    youtubeHitRate: number;
    candidates: number;
    krxMentions: number;
    withRecord?: number;
    hindsight?: Hindsight;
    source: { channels: number; videos: number; mentions: number; prices: number; disclosures: number; through: string };
  };
  confusion: Record<"bull_up" | "bull_down" | "bear_up" | "bear_down", number>;
  chase: { label: string; n: number; avg: number | null; upShare: number | null }[];
  events: { label: string; n: number; avg: number | null }[];
  histogram: number[];
  ai: { n: number; hitRate: number | null; dist: Record<string, number>; youtubeHitRate: number };
  plays: { games: number; plays: number; hitRate: number | null; shortShare: number | null; cards: Record<string, { opened: number; hitRate: number }>; avgMs: number | null };
  aiOps: {
    asks: number; passed: number; retried: number; fallback: number; unavailable: number; avgLatencyMs: number | null;
    unavailableKinds?: Record<string, number>; thumbsUp?: number; thumbsDown?: number; avgTokensIn?: number | null; avgTokensOut?: number | null;
  };
  funnel?: { started: number; reached: number[]; finished: number; medianMin: number | null; exitShare: number | null; learning: { nth: number; games: number; avgHits: number }[] };
  aiEval?: AiEvalSummary[];
  aiProvider?: string | null;
  aiModel?: string;
  survey?: { n: number; youtube: Record<string, number>; lesson: Record<string, number>; helpful: number | null; helpfulDist: Record<string, number> };
  quality?: Quality;
  text?: TextAnalysis;
  perf?: { routes: { path: string; n: number; p50: number; p95: number; max: number }[]; uptimeSec: number };
  enrich: { finance: number; docs: number; facts: number; news: number };
}

export interface SideStat {
  n: number;
  avg: number;
  median: number;
  hit: number;
}

/** hindsight 전체 기록(국내 주식 유튜브 언급 → 20거래일 뒤) */
export interface Hindsight {
  bull: SideStat;
  bear: SideStat;
  channels: { n: number; hit: number }[]; // 방향 예측 30번 이상인 유튜버, 적중률 높은 순
  eventReturns: number;
}

export interface LiveRow {
  id: string;
  nickname: string;
  ret: number;
  hits: number;
  grade: "S" | "A" | "B" | "C" | "D";
  beatYt: boolean;
  at: string | null;
}

export type FeedItem =
  | ({ kind: "finish" } & LiveRow)
  | { kind: "bighit"; nickname: string; ret: number; short: boolean; round: number; at: string };

export interface Live {
  scope: "today" | "all" | "daily";
  daily?: string;
  at: string;
  stats: { started: number; finished: number; playing: number; rounds: number; hitRate: number | null; shortShare: number | null; avgRet: number | null; beatYtShare: number | null };
  leaders: LiveRow[];
  sharp: LiveRow[];
  feed: FeedItem[];
  cards: Record<CardKey, { opened: number; hitRate: number | null }>;
  histogram: { lo: number; hi: number; n: number }[];
  grades: Record<string, number>;
}

export interface Quality {
  cases: number;
  future: Record<string, number>;
  futureViolations: number;
  textsChecked: number;
  leaks: number;
  answerMismatch: number;
  absoluteAmounts?: number;
  coverage: Record<"finance" | "news" | "facts" | "record" | "event", { n: number; share: number }>;
  checkedAt: string;
}

export interface TextAnalysis {
  titles: number;
  bull: number;
  bear: number;
  keywords: Record<"bull" | "bear", { word: string; n: number; score: number }[]>;
  hype: {
    lexicon: string[];
    with: { n: number; avg: number; upShare: number };
    without: { n: number; avg: number; upShare: number };
    byWord: { word: string; n: number; avg: number; upShare: number }[];
  };
  method: string;
}

export interface MeGame {
  id: string;
  at: string | null;
  mode: Mode;
  ret: number;
  ytRet: number;
  hits: number;
  grade: "S" | "A" | "B" | "C" | "D";
  habit: string;
  shorts: number;
  exits: number;
}

export interface Me {
  user: { id: string; nickname: string | null };
  progress: Record<string, unknown>;
  stats: {
    games: number; rounds: number; hitRate: number | null; bestRet: number | null; avgRet: number | null; beatYt: number;
    shortShare: number | null; exitShare: number | null; cards: Record<CardKey, { opened: number; hitRate: number | null }>;
  };
  games: MeGame[];
}

export interface AiEvalSummary {
  tag: string;
  model: string;
  at: string;
  n: number;
  called: number;
  pass: number;
  byCat: Record<string, { n: number; pass: number; retried: number; hidden: number }>;
  avgMs: number | null;
  avgTokensIn: number | null;
  avgTokensOut: number | null;
}
