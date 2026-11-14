// 새벽이에게 말 걸기: 어느 화면에서든 say() 를 부르면 구석의 새벽이(BuddyDock)가 말풍선을 띄운다.
export type Mood = "idle" | "happy" | "sad" | "shock" | "think" | "cool" | "sleep" | "proud";
export interface BuddyMsg {
  mood: Mood;
  text: string;
  ms?: number;
}

type Fn = (m: BuddyMsg) => void;
const subs = new Set<Fn>();

export function say(mood: Mood, text: string, ms?: number) {
  subs.forEach((f) => f({ mood, text, ms }));
}

export function onBuddy(f: Fn) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

// 축하 알림(배지·경험치·레벨업)도 같은 방식으로 띄운다
export type Cheer =
  | { kind: "xp"; amount: number; reason: string }
  | { kind: "badge"; icon: string; name: string; desc: string }
  | { kind: "level"; level: number; title: string; icon: string };
type CheerFn = (c: Cheer) => void;
const cheerSubs = new Set<CheerFn>();
export const cheer = (c: Cheer) => cheerSubs.forEach((f) => f(c));
export function onCheer(f: CheerFn) {
  cheerSubs.add(f);
  return () => {
    cheerSubs.delete(f);
  };
}
