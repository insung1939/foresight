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
  run: "ant:run:v1", // 진행 중인 판 id
  last: "ant:last:v1", // 마지막으로 끝낸 판 id
  progress: "ant:progress:v1", // 완주 수·최고 등급·칭호 도감
  orders: "ant:orders:v1", // 아직 제출 안 한 이번 주 주문(새로고침 대비)
  tour: "ant:tour:v1", // 첫 판 안내를 봤는지
  nick: "ant:nick:v1",
} as const;
