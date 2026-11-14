// 서버 호출은 전부 여기서. 화면은 이 함수들만 쓴다.
// 개발: vite 가 /api → http://localhost:8000 으로 넘긴다. 배포: VITE_API_URL.
import { useCallback, useEffect, useState } from "react";
import { authHeader } from "./auth";
import { deviceId } from "./device";
import type { AskResult, CardKey, GameState, Live, Me, Meta, Mode, Report, Weight } from "./types";

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

async function call<T>(path: string, init?: { method?: string; body?: unknown; timeout?: number }): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("offline", "인터넷 연결이 끊겨 있어요.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeout ?? TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), "X-Device": deviceId(), ...(await authHeader()) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = `서버 오류 (${res.status})`;
      try {
        const j = await res.json();
        if (typeof j.detail === "string") detail = j.detail;
      } catch {
        /* 본문 없음 */
      }
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
  newGame: (nickname?: string | null, mode: Mode = "free") => call<GameState>("/v1/games", { method: "POST", body: { nickname: nickname || null, mode: mode === "free" ? "free" : "daily" } }),
  tick: (id: string, days = 1) => call<GameState>(`/v1/games/${id}/tick`, { method: "POST", body: { days } }),
  exit: (id: string) => call<GameState>(`/v1/games/${id}/exit`, { method: "POST" }),
  me: () => call<Me>("/v1/me"),
  setMe: (nickname: string) => call<{ nickname: string }>("/v1/me", { method: "PUT", body: { nickname } }),
  syncProgress: (progress: unknown) => call<{ progress: unknown }>("/v1/me/progress", { method: "POST", body: { progress } }),
  claim: (gameIds: string[]) => call<{ claimed: number }>("/v1/me/claim", { method: "POST", body: { gameIds } }),
  setNickname: (id: string, nickname: string) => call<{ nickname: string }>(`/v1/games/${id}/nickname`, { method: "POST", body: { nickname } }),
  live: (scope: "daily" | "today" | "all") => call<Live>(`/v1/live?scope=${scope}`),
  game: (id: string) => call<GameState>(`/v1/games/${id}`),
  open: (id: string, card: CardKey) => call<GameState>(`/v1/games/${id}/cards`, { method: "POST", body: { card } }),
  decide: (id: string, weight: Weight) => call<GameState>(`/v1/games/${id}/decide`, { method: "POST", body: { weight } }),
  adjust: (id: string, weight: Weight) => call<GameState>(`/v1/games/${id}/adjust`, { method: "POST", body: { weight } }),
  next: (id: string) => call<GameState>(`/v1/games/${id}/next`, { method: "POST" }),
  report: (id: string) => call<Report>(`/v1/games/${id}/report`),
  ask: (id: string, question: string) => call<AskResult>(`/v1/games/${id}/ask`, { method: "POST", body: { question }, timeout: 60_000 }),
  meta: () => call<Meta>("/v1/meta"),
  feedback: (logId: number, vote: 1 | -1) => call<{ ok: boolean }>(`/v1/ai/${logId}/feedback`, { method: "POST", body: { vote } }),
  survey: (id: string, body: { youtube: string; helpful: number; lesson: string }) => call<{ ok: boolean }>(`/v1/games/${id}/survey`, { method: "POST", body }),
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
