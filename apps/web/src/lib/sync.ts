// 로그인했을 때만: 이 기기의 XP·배지를 계정과 합치고, 로그인 전에 한 게임을 계정으로 옮긴다.
import { api } from "./api";
import { isLoggedIn, onLogin } from "./auth";
import { loadProgress, replaceProgress, setAfterSave, type Progress } from "./progress";
import { read } from "./storage";

export const myGames = () => read<string[]>("fs:games:v1") ?? [];

async function pushProgress() {
  if (!isLoggedIn()) return;
  try {
    const r = await api.syncProgress(loadProgress());
    replaceProgress(r.progress as Progress);
  } catch {
    /* 다음에 다시 합친다 */
  }
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  setAfterSave(() => void pushProgress());
  onLogin(async () => {
    try {
      const ids = myGames();
      if (ids.length) await api.claim(ids.slice(-50));
    } catch {
      /* 무시 */
    }
    await pushProgress();
  });
}
