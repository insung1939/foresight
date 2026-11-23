// 플레이 화면의 계산(서버 규칙을 미리보기용으로 따라 한다 — 최종 판정은 서버).
import type { Asset, Market, View } from "../../lib/types";

/** q: 사면 +(공매도 종목이면 갚기) · 팔면 − · s: 공매도(빌려서 팔기, q 는 −) */
export type Order = { k: string; q: number; s?: boolean };

export interface Preview {
  cash: number;
  qty: Record<string, number>; // 주문 반영 뒤 보유 수량(공매도는 음수)
  holdCount: number;
  spent: number;
  shortUsed: number; // 주문 반영 뒤 공매도 총액
}

/** 담아 둔 주문을 반영한 현금·보유 수량 */
export function preview(v: View, orders: Order[]): Preview {
  const byK = Object.fromEntries(v.assets.map((a) => [a.k, a]));
  const qty: Record<string, number> = Object.fromEntries(v.pos.map((p) => [p.k, p.qty]));
  let cash = v.cash;
  let spent = 0;
  // 서버와 같은 순서: 팔기 → 공매도 → 사기(갚기)
  for (const o of [...orders.filter((o) => o.q < 0 && !o.s), ...orders.filter((o) => o.q < 0 && o.s)]) {
    const a = byK[o.k];
    cash += -o.q * a.price * (1 - v.fees[a.market].sell);
    qty[o.k] = (qty[o.k] ?? 0) + o.q;
  }
  for (const o of orders.filter((o) => o.q > 0)) {
    const a = byK[o.k];
    const c = o.q * a.price * (1 + v.fees[a.market].buy);
    cash -= c;
    spent += c;
    qty[o.k] = (qty[o.k] ?? 0) + o.q;
  }
  for (const k of Object.keys(qty)) if (qty[k] === 0) delete qty[k];
  const shortUsed = Object.entries(qty).reduce((s, [k, q]) => s + (q < 0 ? -q * byK[k].price : 0), 0);
  return { cash, qty, holdCount: Object.keys(qty).length, spent, shortUsed };
}

/** 같은 종목 주문은 하나로 합친다(0 이 되면 지운다) */
export function merge(orders: Order[], o: Order): Order[] {
  const i = orders.findIndex((x) => x.k === o.k && !!x.s === !!o.s);
  if (i < 0) return [...orders, o];
  const q = orders[i].q + o.q;
  return q === 0 ? orders.filter((_, j) => j !== i) : orders.map((x, j) => (j === i ? { ...x, q } : x));
}

/** 살 수 있는 최대 수량(수수료 포함) */
export function maxBuy(v: View, p: Preview, a: Asset): number {
  // 화면 가격은 소수 둘째 자리 반올림이라 아주 조금 여유(0.05%)를 둔다 → '최대'가 서버에서 현금 부족으로 거절되지 않게
  return Math.max(0, Math.floor((p.cash * 0.9995) / (a.price * (1 + v.fees[a.market].buy))));
}

/** 총자산(주문 미리보기 반영, 지난주 종가 기준) */
export const valueOf = (v: View, p: Preview) => p.cash + Object.entries(p.qty).reduce((s, [k, q]) => s + q * (v.assets.find((a) => a.k === k)?.price ?? 0), 0);

/** 공매도할 수 있는 최대 수량: 공매도 총액이 총자산의 50%를 넘지 않게 */
export function maxShort(v: View, p: Preview, a: Asset): number {
  const cap = (v.short?.cap ?? 0.5) * valueOf(v, p) - p.shortUsed;
  return Math.max(0, Math.floor((cap * 0.999) / a.price));
}

/** 공매도 갚기: 갚을 수량과 현금 중 작은 쪽 */
export const maxCover = (v: View, p: Preview, a: Asset) => Math.min(-(p.qty[a.k] ?? 0), maxBuy(v, p, a));

export function canShort(v: View, p: Preview, a: Asset): string | null {
  if (v.skip) return "이번 주는 거래할 수 없어요";
  if (a.locked) return lockHint(a.market);
  if ((p.qty[a.k] ?? 0) > 0) return "가진 종목은 공매도 대신 '팔기'를 써요";
  if (!p.qty[a.k] && p.holdCount >= v.maxHold) return `동시에 담을 수 있는 종목은 ${v.maxHold}개예요(공매도 포함)`;
  if (maxShort(v, p, a) < 1) return `공매도는 총자산의 ${Math.round((v.short?.cap ?? 0.5) * 100)}%까지만 할 수 있어요`;
  return null;
}

/** 주문 한 건의 동사(공매도 종목에 '사기'는 '갚기') */
export const orderVerb = (v: View, o: Order) => (o.s ? "공매도" : o.q > 0 ? (v.pos.find((x) => x.k === o.k)?.short ? "갚기" : "사기") : "팔기");
/** 체결된 거래의 동사 */
export const tradeVerb = (t: { q: number; short?: boolean; cover?: boolean }) => (t.short ? "공매도" : t.cover ? "갚기" : t.q > 0 ? "매수" : "매도");

export function canBuy(v: View, p: Preview, a: Asset): string | null {
  if (v.skip) return "이번 주는 거래할 수 없어요";
  if (a.locked) return lockHint(a.market);
  if (!p.qty[a.k] && p.holdCount >= v.maxHold) return `동시에 담을 수 있는 종목은 ${v.maxHold}개예요`;
  if (maxBuy(v, p, a) < 1) return "현금이 부족해요";
  return null;
}

export const lockHint = (m: Market) => (m === "US" ? "미국 주식은 한 판을 끝내면 열려요" : m === "CRYPTO" ? "코인은 B 등급 이상을 받으면 열려요" : "");

export const MARKET_KO: Record<Market, string> = { KRX: "국내", US: "미국", CRYPTO: "코인" };

/** 이번 주 화제성: 🔥 개수(0~3) */
export const flames = (h: number) => (h >= 10 ? 3 : h >= 3 ? 2 : h >= 1 ? 1 : 0);

/** 주간 수익 → 이모지(공유 그리드) */
export const weekEmoji = (r: number) => (r >= 0.03 ? "🟥" : r > 0.0005 ? "🔴" : r <= -0.03 ? "🟦" : r < -0.0005 ? "🔵" : "⬜");
