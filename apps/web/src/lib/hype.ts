// 자극적인 제목 표현 사전. scripts/text_analysis.py 의 HYPE 와 같게 유지한다.
// hindsight 분석: 이런 말이 들어간 '오른다' 영상은 20거래일 뒤 평균 수익률이 더 낮았다(데이터 페이지 분석 5).
export const HYPE = ["폭등", "급등", "떡상", "대박", "무조건", "지금 당장", "당장", "마지막 기회", "놓치면", "터진다", "터질", "폭발", "10배", "100배", "수직", "상한가", "역대급", "충격", "미쳤", "필수", "확정", "강력"];

/** 제목을 [평문, 자극어, 평문, …] 조각으로 나눈다 */
export function splitHype(title: string): { text: string; hype: boolean }[] {
  const re = new RegExp(`(${[...HYPE].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return title
    .split(re)
    .filter(Boolean)
    .map((t) => ({ text: t, hype: HYPE.includes(t) }));
}
