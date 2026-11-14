// 숫자·날짜 표기. 화면 어디서나 같은 규칙을 쓴다.

/** +12.3% / −4.5% / 0.0% */
export const pct = (x: number, digits = 1) => {
  const v = (x * 100).toFixed(digits);
  if (Number(v) === 0) return `${(0).toFixed(digits)}%`;
  return x > 0 ? `+${v}%` : `−${v.slice(1)}%`;
};

/** 상승 빨강 · 하락 파랑 · 0 은 색 없음 (국내 관례) */
export const tone = (x: number) => (x > 0.00005 ? "up" : x < -0.00005 ? "down" : "flat");

/** 색만으로 구분하지 않도록 기호를 같이 쓴다 */
export const arrow = (x: number) => (x > 0.00005 ? "▲" : x < -0.00005 ? "▼" : "–");

export const won = (x: number) => {
  const man = Math.round(x / 10_000);
  const sign = man < 0 ? "−" : "";
  return `${sign}${Math.abs(man).toLocaleString("ko-KR")}만 원`;
};

export const views = (n: number) =>
  n >= 10_000 ? `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만회` : `${n.toLocaleString("ko-KR")}회`;

export const dday = (n: number) => (n === 0 ? "당일" : `${n}일 전`);

export const dateDot = (iso: string) => iso.replace(/-/g, ".");

/** 한국 시간 오늘 날짜 YYYY-MM-DD (오늘의 챌린지 기준) */
export const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
