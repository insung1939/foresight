// 게임 진행은 서버가 쥐고, 이 기기에는 게임 id 만 저장한다(새로고침·이어하기).
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api";
import { KEYS, read, write } from "./storage";
import type { AskResult, CardKey, GameState, Mode, Weight } from "./types";
import { getNick } from "./nick";

export const savedGameId = () => read<string>(KEYS.game);
export const lastGameId = () => read<string>(KEYS.last);
export const forgetGame = () => write(KEYS.game, null);

type Load = { status: "loading"; slow: boolean } | { status: "error"; error: ApiError } | { status: "ready" };

export function useGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading", slow: false });
  const [busy, setBusy] = useState<string | null>(null); // 진행 중인 동작
  const [toast, setToast] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoad({ status: "loading", slow: false });
    const slow = setTimeout(() => alive.current && setLoad((l) => (l.status === "loading" ? { status: "loading", slow: true } : l)), 3000);
    (async () => {
      const id = savedGameId();
      let st: GameState;
      try {
        st = id ? await api.game(id) : await api.newGame(getNick(), read<Mode>(KEYS.mode) ?? "free");
      } catch (e) {
        if (id && e instanceof ApiError && e.kind === "notfound") st = await api.newGame(getNick(), read<Mode>(KEYS.mode) ?? "free"); // 서버에서 지워진 게임
        else throw e;
      }
      if (st.done) {
        write(KEYS.last, st.gameId);
        st = await api.newGame(getNick(), read<Mode>(KEYS.mode) ?? "free");
      }
      write(KEYS.game, st.gameId);
      if (alive.current) {
        setGame(st);
        setLoad({ status: "ready" });
      }
    })()
      .catch((error: ApiError) => alive.current && setLoad({ status: "error", error }))
      .finally(() => clearTimeout(slow));
    return () => {
      alive.current = false;
      clearTimeout(slow);
    };
  }, [nonce]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const run = useCallback(
    async (label: string, fn: (id: string) => Promise<GameState>) => {
      if (!game || busy) return null;
      setBusy(label);
      try {
        const st = await fn(game.gameId);
        setGame(st);
        if (st.done) {
          write(KEYS.last, st.gameId);
          write(KEYS.game, null);
          const mine = read<string[]>("fs:games:v1") ?? [];
          if (!mine.includes(st.gameId)) write("fs:games:v1", [...mine, st.gameId].slice(-100)); // 로그인하면 계정으로 옮길 목록
        }
        return st;
      } catch (e) {
        const err = e as ApiError;
        setToast(err.message);
        if (err.kind === "conflict") {
          // 다른 탭에서 진행했거나 단계가 어긋남 → 서버 상태로 맞춘다
          api.game(game.gameId).then(setGame).catch(() => undefined);
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [game, busy],
  );

  const actions = {
    open: (k: CardKey) => run(`card:${k}`, (id) => api.open(id, k)),
    decide: (w: Weight) => run("decide", (id) => api.decide(id, w)),
    adjust: (w: Weight) => run("adjust", (id) => api.adjust(id, w)),
    next: () => run("next", (id) => api.next(id)),
    tick: (days = 1) => run(days > 1 ? "skip" : "tick", (id) => api.tick(id, days)),
    exit: () => run("exit", (id) => api.exit(id)),
    async ask(q: string): Promise<AskResult | null> {
      if (!game) return null;
      try {
        const r = await api.ask(game.gameId, q);
        if (!r.error) setGame((g) => (g && g.current ? { ...g, current: { ...g.current, asked: g.current.asked + 1 } } : g));
        return r;
      } catch (e) {
        return { error: (e as ApiError).message, remaining: 0 };
      }
    },
    retry: () => setNonce((n) => n + 1),
  };

  return { game, load, busy, toast, setToast, actions };
}
