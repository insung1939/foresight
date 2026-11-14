// 화면용 규칙. 수익률·정답 판정은 서버(api/app/rules.py)가 하고, 여기는 보여 주는 방법만 정한다.
// 해설 문장은 정답 공개 데이터의 실제 값으로 규칙에 따라 만든다(LLM 아님).
import { pct } from "./format";
import type { CardKey, Reveal, ReportRound, Weight } from "./types";

export const START_CASH = 10_000_000;

export interface CardDef {
  key: CardKey;
  icon: string;
  label: string;
  desc: string;
}

export const CARDS: CardDef[] = [
  { key: "chart", icon: "📈", label: "차트·거래량", desc: "최근 60거래일 주가와 거래량" },
  { key: "disclosure", icon: "📑", label: "최근 공시", desc: "30일 공시와 핵심 내용" },
  { key: "youtube", icon: "📺", label: "유튜버 의견", desc: "영상 논조와 그 유튜버 과거 성적" },
  { key: "finance", icon: "💰", label: "재무 요약", desc: "직전 보고서 실적·부채" },
  { key: "news", icon: "📰", label: "뉴스", desc: "산 날 전 1주 헤드라인" },
  { key: "ai", icon: "🤖", label: "AI 애널리스트", desc: "그 시점 자료로만 답해요" },
];
export const cardDef = (k: CardKey) => CARDS.find((c) => c.key === k)!;

export const WEIGHT_LABEL: Record<Weight, string> = { [-50]: "공매도", 0: "안 사요", 30: "조금", 70: "많이", 100: "풀매수" } as Record<Weight, string>;
export const weightText = (w: Weight) => (w < 0 ? `공매도 ${-w}%` : `${w}%`);

// ------------------------------------------------------------ 정답 해설(규칙)
export interface Fact {
  icon: string;
  text: string;
}

const pp = (x: number) => `${Math.abs(x * 100).toFixed(1)}%p`;

export function explain(rv: Reveal, w1: Weight, w2: Weight): Fact[] {
  const facts: Fact[] = [];
  const post = rv.chart.filter((p) => p.t > 0);
  const hi = post.reduce((a, b) => (b.p > a.p ? b : a));
  const lo = post.reduce((a, b) => (b.p < a.p ? b : a));
  const y = rv.youtube;
  const ytRight = (y.verdict === "bull") === rv.answer.r20 > 0;
  facts.push({
    icon: ytRight ? "📺" : "🙅",
    text: `유튜버는 '${y.verdict === "bull" ? "오른다" : "내린다"}' 쪽이었어요(오른다 ${y.bull} · 내린다 ${y.bear}). ${ytRight ? "이번엔 맞았어요." : "이번엔 빗나갔어요."}`,
  });
  if (hi.p > 103 && lo.p < 97) {
    facts.push({ icon: "🎢", text: `크게 흔들렸어요. ${hi.t}일째 ${pct(hi.p / 100 - 1, 0)}까지 올랐다가 ${lo.t}일째 ${pct(lo.p / 100 - 1, 0)}까지 내려갔어요.` });
  } else if (hi.p > 103) facts.push({ icon: "📈", text: `${hi.t}일째 가장 높았어요(${pct(hi.p / 100 - 1, 0)}).` });
  else if (lo.p < 97) facts.push({ icon: "📉", text: `${lo.t}일째 가장 낮았어요(${pct(lo.p / 100 - 1, 0)}).` });
  const x = rv.answer.x20;
  facts.push({
    icon: "🏛️",
    text: `같은 기간 코스피는 ${pct(rv.answer.kospi20)}. ${Math.abs(x) < 0.01 ? "시장과 비슷했어요." : x > 0 ? `시장보다 ${pp(x)} 앞섰어요.` : `시장보다 ${pp(x)} 뒤처졌어요.`}`,
  });
  if (rv.event) {
    const pe = rv.chart.find((p) => p.t === rv.event!.t)!.p;
    const after = rv.chart.find((p) => p.t === 20)!.p / pe - 1;
    const diff = rv.holdRet === undefined ? 0 : rv.mine - rv.holdRet;
    facts.push({
      icon: "⚡",
      text: `사건 뒤 20일째까지 주가는 ${pct(after)}. ${w1 === w2 ? "비중을 그대로 뒀어요." : diff >= 0 ? `비중을 바꾼 덕에 ${pp(diff)} 더 벌었어요.` : `비중을 바꿔서 ${pp(diff)} 손해였어요.`}`,
    });
  }
  if (w1 < 0) {
    facts.push({ icon: "🐻", text: `공매도는 주가가 내릴 때 벌어요. 빌린 주식 수수료(연 4%)도 냈어요.` });
  }
  return facts;
}

// ------------------------------------------------------------ 리포트
export interface Persona {
  icon: string;
  name: string;
  line: string;
}

export function infoHabit(rounds: ReportRound[]): Persona & { counts: Record<CardKey, number> } {
  const counts = { chart: 0, disclosure: 0, youtube: 0, finance: 0, news: 0, ai: 0 } as Record<CardKey, number>;
  rounds.forEach((r) => r.opened.forEach((k) => counts[k]++));
  const n = rounds.length || 1;
  const [k, top] = (Object.entries(counts) as [CardKey, number][]).sort((a, b) => b[1] - a[1])[0];
  const habits: Record<CardKey, Persona> = {
    chart: { icon: "📈", name: "차트파", line: "그림부터 봐요." },
    disclosure: { icon: "📑", name: "공시파", line: "회사가 직접 낸 자료를 먼저 챙겨요." },
    youtube: { icon: "📺", name: "유튜브파", line: "남들이 뭐라는지 먼저 들어요." },
    finance: { icon: "💰", name: "숫자파", line: "실적과 재무부터 확인해요." },
    news: { icon: "📰", name: "뉴스파", line: "요즘 무슨 일이 있는지부터 봐요." },
    ai: { icon: "🤖", name: "AI파", line: "AI에게 먼저 물어봐요." },
  };
  if (top / n >= 0.8) return { ...habits[k], counts };
  return { icon: "🧭", name: "골고루파", line: "한쪽에 치우치지 않고 번갈아 봐요.", counts };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function investStyle(rounds: ReportRound[]): Persona {
  const shorts = rounds.filter((r) => r.w1 < 0).length;
  const meanW = avg(rounds.map((r) => Math.max(r.w1, 0)));
  const hot = avg(rounds.filter((r) => r.ret60 >= 0.2).map((r) => r.w1));
  const cold = avg(rounds.filter((r) => r.ret60 < 0).map((r) => r.w1));
  const sawYt = rounds.filter((r) => r.opened.includes("youtube"));
  const follow = sawYt.length >= 3 ? avg(sawYt.map((r) => ((r.w1 >= 70) === (r.youtube.verdict === "bull") ? 1 : 0))) : NaN;

  if (shorts >= 3) return { icon: "🐻", name: "하락에 거는 편", line: "오를 것보다 떨어질 것을 먼저 찾아요." };
  if (meanW <= 25 && shorts === 0) return { icon: "🐢", name: "신중한 편", line: "확신이 없으면 들어가지 않아요." };
  if (follow >= 0.8) return { icon: "🐑", name: "군중을 따라가는 편", line: "유튜버가 오른다면 같이 샀어요." };
  if (hot - cold >= 30) return { icon: "🚀", name: "이미 오른 걸 쫓는 편", line: "많이 오른 종목에 더 크게 걸었어요." };
  if (cold - hot >= 30 || follow <= 0.3) return { icon: "🔄", name: "반대로 가는 편", line: "남들이 외면할 때 들어갔어요." };
  return { icon: "⚖️", name: "균형 잡힌 편", line: "상황마다 비중을 다르게 가져갔어요." };
}

export function cardHitRates(rounds: ReportRound[]) {
  return CARDS.map((d) => {
    const rs = rounds.filter((r) => r.opened.includes(d.key));
    const hits = rs.filter((r) => r.hit).length;
    return { card: d, n: rs.length, rate: rs.length ? hits / rs.length : null };
  });
}
