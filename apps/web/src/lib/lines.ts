// 새벽이 대사. 같은 상황에서도 매번 조금씩 다르게 말하도록 후보를 여러 개 둔다.
import type { CardKey, Weight } from "./types";

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const p0 = (x: number) => `${x > 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

export function roundStart(round: number, ret60: number): string {
  if (round === 0) return "안녕하세요, 새벽이예요 🦉 카드 6장 중 3장만 골라서 단서를 모아 봐요!";
  if (round === 9) return "마지막 라운드예요! 🏁 유종의 미를 거둬 봐요";
  if (ret60 >= 0.3) return pick([`60일 동안 ${p0(ret60)}나 올랐어요 😮 더 갈까요, 꺾일까요?`, `벌써 ${p0(ret60)}… 지금 타도 될까요? 🎢`]);
  if (ret60 <= -0.2) return pick([`60일 동안 ${p0(ret60)} 빠졌어요 🫣 바닥일까요, 지하실일까요?`, `많이 떨어졌네요. 싸 보이는 걸까요? 🤔`]);
  return pick(["조용한 종목이에요. 단서를 찾아봐요 🔍", "흠… 아직 감이 안 와요. 카드부터 열어 볼까요? 🃏", "이번엔 어떤 카드가 도움이 될까요? 🦉"]);
}

const CARD_LINES: Record<CardKey, string[]> = {
  chart: ["📈 차트부터! 정석이네요", "거래량 막대도 같이 보세요. 주황색이면 평소의 2배예요 🔥"],
  disclosure: ["📑 회사가 직접 낸 자료예요. 숫자를 잘 보세요", "공시는 거짓말을 잘 안 해요 🧐"],
  youtube: ["📺 유튜버 말도 들어 봐요. 과거 적중률도 꼭 같이!", "말하는 사람이 얼마나 맞혀 왔는지가 중요해요 🎯"],
  finance: ["💰 숫자파시군요! 영업이익 흐름을 보세요", "부채비율 200% 넘으면 조심 ⚠️"],
  news: ["📰 그때 무슨 일이 있었는지 볼까요", "제목만 보고 흥분하면 안 돼요 😤"],
  ai: ["🤖 저보다 똑똑한 친구예요… 아마도요", "AI한테 근거를 꼭 물어보세요. 자료에 없으면 없다고 해요"],
};
export const cardLine = (k: CardKey) => pick(CARD_LINES[k]);
export const cardsDone = () => pick(["카드 다 썼어요! 이제 결정할 시간 ⏰", "단서는 모였어요. 얼마나 담을까요? 🤔"]);

export const WEIGHT_EMOJI: Record<number, string> = { [-50]: "🐻", 0: "🙅", 30: "🌱", 70: "🚀", 100: "🔥" };

export function weightLine(w: Weight): { text: string; mood: "think" | "shock" | "cool" | "happy" | "idle" } {
  if (w < 0) return { text: pick(["🐻 곰 모드 ON! 내리면 벌어요", "공매도라니, 대담한데요? 🐻"]), mood: "cool" };
  if (w === 0) return { text: pick(["🙅 이번엔 구경만! 그것도 실력이에요", "안 사는 것도 판단이에요 🧘"]), mood: "idle" };
  if (w === 30) return { text: pick(["🌱 살짝 발만 담가 볼까요", "조심조심… 좋아요 🌱"]), mood: "happy" };
  if (w === 70) return { text: pick(["🚀 꽤 자신 있군요?", "70%면 진심이네요 😎"]), mood: "cool" };
  return { text: pick(["🔥 풀매수!! 괜찮겠어요?", "전부요?! 심장이 쫄깃해요 😱"]), mood: "shock" };
}

export const eventLine = (up: boolean) =>
  up ? pick(["속보예요!! 😱 급등이에요. 차익 실현? 더 담기?", "와 크게 올랐어요! 🚀 이제 어떻게 할까요?"]) : pick(["속보예요!! 😱 그대로 갈까요, 바꿀까요?", "앗, 무슨 일이죠?! 🫨 침착하게 판단해요"]);

export function revealLine(hit: boolean, mine: number, streak: number): { text: string; mood: "happy" | "sad" | "cool" | "proud" } {
  if (hit && streak >= 3) return { text: pick([`🔥 ${streak}연속!! 혹시 미래에서 오셨어요?`, `${streak}연속 적중 👑 전설의 시작인가요?`]), mood: "proud" };
  if (hit && mine >= 0.1) return { text: pick(["대박!! 🎉 촉이 살아 있네요", "이거죠!! 💸 오늘 치킨은 제가… 아니 당신이"]), mood: "cool" };
  if (hit) return { text: pick(["맞혔어요! 🎯 좋은 판단이었어요", "나이스! 👏 근거가 통했네요"]), mood: "happy" };
  if (mine <= -0.1) return { text: pick(["아이고… 😭 이럴 때도 있어요. 다음엔 꼭!", "괜찮아요, 진짜 돈이 아니잖아요 🫂"]), mood: "sad" };
  return { text: pick(["아깝다 🫠 시장은 늘 어려워요", "빗나갔지만 크게 안 잃었어요. 그것도 실력! 🛡️"]), mood: "sad" };
}

const TIPS = [
  "hindsight 기록에서 유튜버가 '오른다'고 한 종목은 20일 뒤 평균 −4%였어요 😳",
  "정보 카드 없이 맞히면 숨은 배지가 있어요 🤫",
  "공매도는 −50%까지. 내리면 벌고, 오르면 잃어요 🐻",
  "유튜버 카드의 '과거 적중'은 그 시점까지의 기록만 셌어요. 미래는 안 봤어요 🔒",
  "속보가 터지면 비중을 바꿀 수 있어요. 그대로 버티는 것도 선택! 💎",
  "이미 많이 오른 종목, 그 뒤 20일은 어땠을까요? 데이터 페이지에 답이 있어요 📊",
  "3연속으로 맞히면 불꽃이 붙어요 🔥",
  "저를 누르면 팁을 하나씩 알려 줘요 🦉",
];
export const pickTip = () => pick(TIPS);

export function homeLine(level: number, games: number): string {
  if (!games) return "그때로 돌아가 볼까요? 🦉";
  if (level >= 6) return "어서 오세요, 예언가님 🔮";
  return pick(["또 왔군요! 이번엔 몇 개 맞힐까요? 😆", "오늘의 촉은 어때요? 🦉", "기다리고 있었어요! 🌅"]);
}
