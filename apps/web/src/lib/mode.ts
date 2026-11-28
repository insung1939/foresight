// 쉬운 모드(기본) · 고수 모드: 팀원·사용자 후기 '재미는 있는데 조금 어렵다, 단순했으면'
// 쉬운 모드는 공매도·전략 카드·수량 직접 입력·수수료/멘탈 구간 안내·유혹 알림을 숨기고, 금액 버튼 한 번으로 사고판다.
// 서버 규칙은 같다(같은 시장·같은 랭킹). 화면에서 보이는 것만 줄인다.
import { useEffect, useState } from "react";
import { read, write } from "./storage";

const KEY = "ant:pro";
const subs = new Set<(v: boolean) => void>();

export const isPro = () => read<boolean>(KEY) === true;
export function setPro(v: boolean) {
  write(KEY, v);
  subs.forEach((f) => f(v));
}
/** true = 고수 모드 */
export function usePro(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(isPro());
  useEffect(() => {
    subs.add(setV);
    return () => {
      subs.delete(setV);
    };
  }, []);
  return [v, setPro];
}
