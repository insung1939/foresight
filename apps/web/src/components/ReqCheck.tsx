// 요구사항 점검표: 교수님 피드백(기능·비기능 요구사항)을 항목별로 '무엇을 했고, 지금 살아 있는지' 한 장에.
// 숫자는 이 화면을 여는 순간 서버에 직접 물어본 값(상태 점검 왕복 시간 포함)이다.
import { useEffect, useState } from "react";
import { api, type Health } from "../lib/api";
import type { Meta } from "../lib/types";

type Row = [group: string, item: string, did: string, live?: string];

export function ReqCheck({ p95, ux }: { p95?: number; ux?: Meta["ux"] }) {
  const [h, setH] = useState<Health | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const t = performance.now();
    api
      .health()
      .then((x) => {
        setH(x);
        setMs(Math.round(performance.now() - t));
      })
      .catch(() => setErr(true));
  }, []);
  const up = h ? `${Math.floor(h.uptime / 3600)}시간 ${Math.floor((h.uptime % 3600) / 60)}분` : "";
  const md = ux?.modes ?? {};
  const fmtMode = (k: string, label: string) => (md[k]?.n ? `${label} 완주 ${Math.round((md[k].rate ?? 0) * 100)}%${md[k].minutes ? `·${md[k].minutes}분` : ""}` : "");
  const usab = [fmtMode("practice", "연습"), fmtMode("daily", "시드"), fmtMode("free", "자유")].filter(Boolean).join(" · ");
  const rows: Row[] = [
    ["기능 · 데이터", "신뢰성 · 정확성", "hindsight 원천(유튜브 51채널 · 국내·미국 주가 · 업비트) 읽기만. 끊긴 종목 제외 · 빈 주는 직전 종가 · 시점 단서 지우기(아래 ③)", h ? `시즌 팩 ${h.data.weeks}주 ✅` : undefined],
    ["기능 · 데이터", "주기(매일·실시간)", "원천은 hindsight 가 매일 수집 → 매주 월요일 자동 갱신(GitHub Actions: 시즌 팩·검색 색인 재생성 → 품질 관문·테스트 통과 시에만 배포). 오늘의 시드는 매일 새 시장. 과거를 다시 사는 게임이라 실시간 시세는 쓰지 않음", h ? `데이터 마지막 주 ${h.data.lastWeek ?? "-"} ${h.stale ? "⚠️ 오래됨" : "✅"}` : undefined],
    ["기능 · 데이터", "시각화", "화제 광장(언급 수만큼 개미), 주봉 차트, 결산 곡선, 이 페이지 분석 5개"],
    ["기능 · 아키텍처", "UI · 백엔드 · DB", "React(Vercel) → FastAPI(Render) → Supabase Postgres + pgvector → Gemini", h ? `서버 ${h.ok ? "✅" : "⚠️"} · DB ${h.db ? `✅ ${h.dbMs}ms` : "⚠️"} · 검색 ${h.rag} · AI ${h.ai}` : undefined],
    ["기능 · 아키텍처", "견고함", "규칙·가격은 서버만(미래 정보 차단) · 랭킹 서버 재계산 · AI 실패 시 규칙 답 · DB 순간 끊김은 503 + 화면 자동 재시도 · 데이터가 갱신돼도 진행 중인 판은 종목 id 로 그대로", h ? `가동 ${up}` : undefined],
    ["기능 · 시나리오", "의미 있는 시나리오 · 쉬움", "페르소나(28세 직장인·월 50만 원·출퇴근 유튜브) → 하루 시나리오 → 니즈별 기능(팀 페이지). 타임슬립 이야기 → 8주 연습 → 12주. 쉬운 모드(금액 버튼·이번 주 할 일), 사건마다 '💡 실제로는'"],
    ["기능 · UI/UX", "반응형", "휴대폰 390px ~ 데스크톱. 바텀시트 · 엄지 영역 버튼 · 3D 는 화면에 맞춰 품질 조절"],
    ["비기능", "신뢰성 · 정확성", "자동 테스트 35개(미래 정보 차단 · 수수료 · 공매도 · 랭킹 · RAG 시점 제한 · 데이터 갱신 뒤 판 유지) · AI 답은 인용·권유 검증 후에만 노출 · 화면 오류는 자동으로 서버에 모아 센다", ux ? `지난 7일 화면 오류 ${ux.errors7d}건 · 진행된 턴 ${ux.turns7d.toLocaleString()}` : undefined],
    ["비기능", "사용성", "쉬운 모드(기본): 금액 버튼 한 번·이번 주 할 일 한 줄 · 1분 게임 방법·오프닝 이야기 · 업종 풀이 · 키보드 N = 다음 주 · 색+세모 함께(색약) · 모드별 완주율·걸린 시간을 직접 잰다", usab || undefined],
    ["비기능", "속도", "응답 압축(gzip) · 3D 는 화면이 먼저 뜬 뒤 한가할 때 불러옴 · 해시 붙은 파일은 1년 캐시(다시 오면 내려받지 않음) · 그림 webp · 경로별 p50/p95 측정", ms !== null ? `지금 왕복 ${ms}ms${p95 ? ` · 턴 p95 ${p95}ms` : ""}` : undefined],
    ["비기능", "보안", "콘텐츠 보안 정책(CSP: 허용한 곳의 스크립트만) · HSTS · 다른 사이트 iframe 금지 · 카메라·위치 권한 차단 · API 요청 한도(IP+기기, AI 더 엄격) · 비밀키는 서버 환경변수만 · 의존성 취약점 0(npm audit) · 진짜 종목명은 결산 뒤에만"],
    ["비기능", "안정성 · 지속가능성", "10분마다 밖에서 상태 점검(GitHub Actions uptime → 이상하면 메일, 무료 서버가 잠들지 않게) · 자동 저장/이어하기 · 주간 데이터 갱신 + 품질 관문(나빠지면 배포 안 함)"],
    ["비기능", "유지보수성", "게임 규칙 한 파일(season.py) · TypeScript · 결정 기록(docs/ux-log.md) · 그림 생성도 스크립트(scripts/gen_image.sh)"],
  ];
  return (
    <section className="card req" aria-labelledby="req-h">
      <h2 id="req-h" className="sec-title">
        ✅ 요구사항 점검표 <span className={`req-live ${err ? "bad" : h?.ok ? "ok" : ""}`}>{err ? "서버 응답 없음" : h ? (h.ok ? "● 지금 정상" : "● 일부 이상") : "확인 중…"}</span>
      </h2>
      <div className="req-wrap">
        <table className="req-t">
          <thead>
            <tr>
              <th>구분</th>
              <th>요구사항</th>
              <th>어떻게 했나</th>
              <th>지금 상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([g, it, did, live]) => (
              <tr key={it + g}>
                <td className="muted small">{g}</td>
                <td>
                  <b>{it}</b>
                </td>
                <td>{did}</td>
                <td className="req-v">{live ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
