// 플레이 화면 안의 부품이 판 동작(규칙 저장 등)을 쓰도록 하는 작은 컨텍스트
import { createContext, useContext } from "react";

export interface RunCtx {
  setRules: (rules: Record<string, boolean>) => Promise<void>;
}
export const RunContext = createContext<RunCtx | null>(null);
export const useRunCtx = () => useContext(RunContext);
