// 플레이 화면의 계산(서버 규칙을 미리보기용으로 따라 한다 — 최종 판정은 서버).
import type { Asset, Market, View } from "../../lib/types";

export type Order = { k: string; q: number };

export interface Preview {
  cash: number;
  qty: Record<string, number>; // 주문 반영 뒤 보유 수량
  holdCount: number;
  spent: number;
}

/** 담아 둔 주문을 반영한 현금·보유 수량 */
export function preview(v: View, orders: Order[]): Preview {
  const byK = Object.fromEntries(v.assets.map((a) => [a.k, a]));
  const qty: Record<string, number> = Object.fromEntries(v.pos.map((p) => [p.k, p.qty]));
  let cash = v.cash;
  let spent = 0;
  // 서버와 같은 순서: 팔기 먼저, 그다음 사기
  for (const o of orders.filter((o) => o.q < 0)) {
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
  for (const k of Object.keys(qty)) if (qty[k] <= 0) delete qty[k];
  return { cash, qty, holdCount: Object.keys(qty).length, spent };
}

/** 같은 종목 주문은 하나로 합친다(0 이 되면 지운다) */
export function merge(orders: Order[], o: Order): Order[] {
  const i = orders.findIndex((x) => x.k === o.k);
  if (i < 0) return [...orders, o];
  const q = orders[i].q + o.q;
  return q === 0 ? orders.filter((_, j) => j !== i) : orders.map((x, j) => (j === i ? { ...x, q } : x));
}

/** 살 수 있는 최대 수량(수수료 포함) */
export function maxBuy(v: View, p: Preview, a: Asset): number {
  return Math.max(0, Math.floor(p.cash / (a.price * (1 + v.fees[a.market].buy))));
}

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
