// 팀 페이지(#/team)에 들어갈 정보 중 코드로 알 수 없는 것. 발표 전에 채운다.
// 비어 있으면 화면에 '배포 후 추가' 처럼 표시된다.

export const TEAM = {
  name: "5조",
  course: "KAIST 디지털금융MBA · 금융빅데이터분석실습 (선수: 클라우드컴퓨팅실습 hindsight)",
  // hindsight 와 같은 5조. 역할은 확정되면 role·did 에(발표: 조인성)
  members: [
    { name: "김지환", role: "", did: "" },
    { name: "김현준", role: "", did: "" },
    { name: "오선호", role: "", did: "" },
    { name: "조인성", role: "발표", did: "" },
    { name: "채재희", role: "", did: "" },
  ] as { name: string; role: string; did: string }[],
  links: {
    service: "https://foresight-rho-teal.vercel.app",
    github: "https://github.com/insung1939/foresight",
    swagger: "https://foresight-api-yda3.onrender.com/docs",
  },
};
