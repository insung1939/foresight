// localStorage 는 사생활 모드·차단 설정에서 실패할 수 있다. 실패해도 게임은 그대로 돌아가게 감싼다.

export function read<T>(key: string): T | null {
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 진행 */
  }
}

export const KEYS = {
  game: "fs:game:v1",
  last: "fs:last:v1",
  coach: "fs:coach:v1",
  mode: "fs:mode:v1", // 다음 새 게임 모드(free · daily)
} as const;

/** 예전 이름(geuttae:…)으로 저장된 진행 중 게임·지난 결과·AI 대화를 새 이름(fs:…)으로 한 번 옮긴다.
 *  서비스 이름을 바꿔도 이용자의 이어하기가 끊기지 않게. */
export function migrateOldKeys() {
  try {
    const ls = window.localStorage;
    const old: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith("geuttae:")) old.push(k);
    }
    for (const k of old) {
      const nk = "fs:" + k.slice("geuttae:".length);
      if (ls.getItem(nk) === null) ls.setItem(nk, ls.getItem(k) ?? "");
      ls.removeItem(k);
    }
  } catch {
    /* 저장소를 못 쓰면 건너뛴다 */
  }
}
