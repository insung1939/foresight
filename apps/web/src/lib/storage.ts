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
  game: "geuttae:game:v1",
  last: "geuttae:last:v1",
  coach: "geuttae:coach:v1",
  mode: "fs:mode:v1", // 다음 새 게임 모드(free · daily)
} as const;
