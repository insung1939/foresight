// 서버 호출은 전부 여기서. 화면은 이 함수들만 쓴다.
// 개발: vite 가 /api → http://localhost:8000 으로 넘긴다. 배포: VITE_API_URL.
import { useCallback, useEffect, useState } from "react";
import { deviceId } from "./device";
import type { AskOut, Board, Coach, Day, Final, Market, Meta, Mode, RunOut, Trade } from "./types";

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/$/, "");
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    public kind: "offline" | "timeout" | "server" | "conflict" | "notfound" | "auth",
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export interface Health {
  ok: boolean; pack: boolean; db: boolean; dbMs: number; ai: string; rag: string; uptime: number;
  data: { builtAt: string | null; lastWeek: string | null; weeks: number };
}

async function call<T>(path: string, init?: { method?: string; body?: unknown; timeout?: number }): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("offline", "인터넷 연결이 끊겨 있어요.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeout ?? TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), "X-Device": deviceId() },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = `서버 오류 (${res.status})`;
      try {
        const j = await res.json();
        if (typeof j.detail === "string") detail = j.detail;
        else if (res.status === 422) detail = "입력한 값을 다시 확인해 주세요.";
      } catch {
        /* 본문 없음 */
      }
      if (res.status === 429) detail = detail.includes("초") ? detail : "요청이 너무 많아요. 잠시 뒤 다시 해 주세요.";
      throw new ApiError(res.status === 404 ? "notfound" : res.status === 409 ? "conflict" : res.status === 401 ? "auth" : "server", detail, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("timeout", "응답이 너무 오래 걸려요.");
    throw new ApiError("server", "서버에 연결하지 못했어요.");
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  newRun: (mode: Mode, markets?: Market[], nickname?: string | null, char = "office", weeks?: number) =>
    call<RunOut>("/v1/runs", { method: "POST", body: { mode, markets: markets ?? null, nickname: nickname || null, char, weeks: weeks ?? null } }),
  skip: (id: string, weeks = 4) => call<RunOut>(`/v1/runs/${id}/skip`, { method: "POST", body: { weeks } }),
  ask: (id: string, question: string, k?: string) => call<AskOut>(`/v1/runs/${id}/ask`, { method: "POST", body: { question, k: k ?? null }, timeout: 60_000 }),
  vote: (logId: number, vote: 1 | -1) => call<{ ok: boolean }>(`/v1/ai/${logId}/feedback`, { method: "POST", body: { vote } }),
  run: (id: string) => call<RunOut>(`/v1/runs/${id}`),
  event: (id: string, choice: number) => call<RunOut & { event: { id: string; choice: number; trades: Trade[] } }>(`/v1/runs/${id}/event`, { method: "POST", body: { choice } }),
  turn: (id: string, orders: { k: string; q: number }[], choice: number | null) =>
    call<RunOut>(`/v1/runs/${id}/turn`, { method: "POST", body: { orders, choice } }),
  final: (id: string) => call<Final>(`/v1/runs/${id}/final`),
  nickname: (id: string, nickname: string) => call<{ nickname: string }>(`/v1/runs/${id}/nickname`, { method: "POST", body: { nickname } }),
  coach: (id: string) => call<Coach>(`/v1/runs/${id}/coach`, { method: "POST", timeout: 60_000 }),
  board: (day?: string) => call<Board>(`/v1/leaderboard${day ? `?day=${day}` : ""}`),
  renameDay: (day: string, nickname: string) => call<{ nickname: string }>("/v1/leaderboard/nickname", { method: "POST", body: { day, nickname } }),
  days: () => call<{ days: Day[]; today: string }>("/v1/leaderboard/days"),
  hall: () => call<{ rows: (Board["rows"][number] & { day: string })[] }>("/v1/leaderboard/all"),
  luck: (id: string, card: number) => call<RunOut>(`/v1/runs/${id}/luck`, { method: "POST", body: { card } }),
  rules: (id: string, rules: Record<string, boolean>) => call<RunOut>(`/v1/runs/${id}/rules`, { method: "POST", body: { rules } }),
  meta: () => call<Meta>("/v1/meta"),
  health: () => call<Health>("/v1/health"),
};

export type Async<T> =
  | { status: "loading"; slow: boolean }
  | { status: "error"; error: ApiError; retry: () => void }
  | { status: "ready"; data: T; reload: () => void };

/** 로딩 · 느림(3초+, Render 무료 서버가 깨어나는 중) · 오류 · 완료 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ status: "loading", slow: false });
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", slow: false });
    const slow = setTimeout(() => {
      if (alive) setState((s) => (s.status === "loading" ? { status: "loading", slow: true } : s));
    }, 3000);
    fn()
      .then((data) => {
        if (alive) setState({ status: "ready", data, reload: retry });
      })
      .catch((error: ApiError) => {
        if (alive) setState({ status: "error", error, retry });
      })
      .finally(() => clearTimeout(slow));
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return state;
}

let metaCache: Promise<Meta> | null = null;
export function loadMeta(): Promise<Meta> {
  if (!metaCache) metaCache = api.meta().catch((e) => ((metaCache = null), Promise.reject(e)));
  return metaCache;
}
