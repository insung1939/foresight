// 데이터 출처(데이터 페이지·팀 페이지가 같이 쓴다)
export const SOURCES = [
  { name: "YouTube Data API v3", org: "Google", url: "https://developers.google.com/youtube/v3", what: "주식 채널 영상 제목·게시 시각·조회수", use: "유튜버 의견 카드, 오른다/내린다 판정" },
  { name: "전자공시 OpenAPI (DART)", org: "금융감독원", url: "https://opendart.fss.or.kr", what: "공시 목록, 공시 원문(document), 정기보고서 주요 계정(fnlttSinglAcnt)", use: "공시 카드 핵심 내용, 재무 요약 카드, 중간 사건" },
  { name: "주식시세정보 (GetStockSecuritiesInfoService_V2)", org: "금융위원회 · 공공데이터포털", url: "https://www.data.go.kr", what: "국내 종목 일별 종가·거래량", use: "차트 카드, 20거래일 정답 수익률" },
  { name: "Google 뉴스 RSS", org: "Google", url: "https://news.google.com", what: "날짜 구간을 정한 기사 제목·매체·시각", use: "뉴스 카드(산 날 15:30 전 기사만), 결과 공개 때 '그 뒤 뉴스'" },
  { name: "코스피 지수 일별 종가", org: "Yahoo Finance", url: "https://finance.yahoo.com/quote/%5EKS11", what: "코스피 지수", use: "시장과 비교" },
  { name: "Gemini API", org: "Google AI Studio", url: "https://ai.google.dev", what: "LLM (서버에서만 호출, 키는 화면에 없음)", use: "AI 애널리스트 답변, 문제마다 AI의 판단" },
];
