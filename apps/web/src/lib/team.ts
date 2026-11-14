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

// 최적화 전후(직접 잰 값, 2026-11-14, 로컬). docs/perf.md 와 같은 숫자.
export const MEASURED = {
  date: "2026-11-14",
  payload: [
    { what: "게임 시작 때 받는 데이터", before: "1.2 MB (문제 150개 정답 포함 파일 통째로)", after: "0.4 KB (지금 라운드 상황만)", why: "정답을 서버로 옮기고, 단계마다 볼 수 있는 것만 보냄" },
    { what: "카드 한 장", before: "(위 파일에 이미 포함)", after: "약 3 KB", why: "카드는 열 때 한 장씩 받음 → 안 연 카드는 개발자도구로도 못 봄" },
    { what: "첫 화면 자바스크립트", before: "420 KB (gzip 141 KB)", after: "340 KB (gzip 116 KB, −18%)", why: "리포트·랭킹·데이터·팀 페이지는 열 때 따로 받기(코드 분할)" },
    { what: "실시간 랭킹 응답", before: "4.0 KB · 6.8 ms", after: "0.8 KB(gzip) · 1.5 ms(2초 캐시)", why: "여러 화면이 4초마다 불러도 DB 계산은 2초에 한 번" },
  ],
};
