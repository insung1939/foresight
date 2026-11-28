// 교수님 코멘트 1·2를 화면으로: ① 데이터가 바뀐 기록과 원천 대조 ② UI–백엔드–DB 구조와 장애 때 무슨 일이 일어나는지(지금 상태 포함)
import { useEffect, useState } from "react";
import { api, type Health } from "../lib/api";
import type { Meta } from "../lib/types";

const d8 = (iso?: string) => (iso ? iso.slice(0, 10).replace(/-/g, ".") : "-");

export function UpdateLog({ m }: { m: Meta }) {
  const u = m.updates;
  if (!u?.history?.length) return null;
  const rows = [...u.history].reverse();
  const v = u.verify;
  return (
    <section className="card" aria-labelledby="upd-h">
      <h2 id="upd-h" className="sec-title">
        🔄 데이터 갱신 기록 · 정합성
      </h2>
      <p className="muted small">
        매주 월요일 아침 hindsight 원천에서 시즌 팩을 다시 만든다. 품질 관문(주·종목 순서 유지, 지난 종가 불변, 이상 급등락, 색인 감소, <b>원천 대조</b>)을 모두 통과해야만 서비스에 반영되고, 하나라도 걸리면 이전 데이터로 계속 서비스한다.
      </p>
      {v?.n ? (
        <p className="callout">
          ✅ 최근 갱신 원천 대조 <b>{v.ok}/{v.n}</b> 일치 — {v.rule}
        </p>
      ) : null}
      <div className="req-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>갱신 시각</th>
              <th>데이터 마지막 주</th>
              <th>주 수</th>
              <th>새로 들어온 주</th>
              <th>원천 대조</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.builtAt + i}>
                <td>{h.builtAt ? h.builtAt.slice(0, 16).replace("T", " ") : "-"}</td>
                <td>{d8(h.lastWeek)} 주</td>
                <td>{h.weeks}</td>
                <td>{h.added?.length ? h.added.map(d8).join(", ") : i === rows.length - 1 ? "(첫 팩)" : "변화 없음"}</td>
                <td>{h.verify ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Node = { id: string; t: string; sub: string; host: string };
const NODES: Node[] = [
  { id: "ui", t: "화면", sub: "React · Vite · three.js", host: "Vercel" },
  { id: "api", t: "서버", sub: "FastAPI · 게임 규칙·가격(미래 차단)", host: "Render" },
  { id: "db", t: "DB", sub: "Postgres · pgvector(검색)", host: "Supabase" },
  { id: "ai", t: "AI", sub: "범고래 박사 · 결산 코치", host: "Gemini" },
];

export function ArchMap() {
  const [h, setH] = useState<Health | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const t = performance.now();
    api.health().then((x) => (setH(x), setMs(Math.round(performance.now() - t)))).catch(() => setH(null));
  }, []);
  const st: Record<string, string> = h
    ? { ui: "ok", api: h.ok ? "ok" : "bad", db: h.db ? "ok" : "bad", ai: h.ai !== "off" ? "ok" : "warn" }
    : { ui: "ok", api: "wait", db: "wait", ai: "wait" };
  const live: Record<string, string> = h
    ? { ui: "지금 보고 있는 화면", api: `왕복 ${ms}ms · 가동 ${Math.floor(h.uptime / 3600)}시간`, db: `응답 ${h.dbMs}ms · 검색 ${h.rag}`, ai: h.ai }
    : { ui: "", api: "확인 중…", db: "", ai: "" };
  return (
    <section className="card" aria-labelledby="arch-h">
      <h2 id="arch-h" className="sec-title">
        🏗️ 구조 — UI · 백엔드 · DB, 그리고 고장 났을 때
      </h2>
      <div className="arch" role="list">
        {NODES.map((n, i) => (
          <div key={n.id} className="arch-cell" role="listitem">
            <div className={`arch-node s-${st[n.id]}`}>
              <span className="arch-dot" aria-hidden />
              <b>{n.t}</b>
              <small>{n.sub}</small>
              <em>{n.host}</em>
              <span className="arch-live">{live[n.id]}</span>
            </div>
            {i < NODES.length - 1 && <span className="arch-arrow" aria-hidden>→</span>}
          </div>
        ))}
      </div>
      <div className="arch-side">
        <span>⚙️ GitHub Actions</span> 매주 데이터 갱신(품질 관문) · 올릴 때마다 테스트 · 10분마다 상태 점검
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>이럴 때</th>
            <th>이렇게 버틴다</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>서버가 잠들어 있음(무료 서버 첫 요청)</td>
            <td>화면이 1.5 → 3 → 6초 자동 재시도 + &lsquo;깨우는 중&rsquo; 안내, 10분 점검이 깨워 둠</td>
          </tr>
          <tr>
            <td>DB 순간 끊김</td>
            <td>503 &lsquo;잠시 뒤 다시&rsquo; → 화면 자동 재시도, 진행은 매 턴 저장돼 있음</td>
          </tr>
          <tr>
            <td>AI(Gemini) 실패·한도 초과</td>
            <td>대체 모델 → 규칙 기반 답. 게임은 AI 없이도 끝까지 진행</td>
          </tr>
          <tr>
            <td>pgvector 사용 불가</td>
            <td>메모리 검색으로 자동 전환(답은 같음, 조금 느림)</td>
          </tr>
          <tr>
            <td>새 데이터가 이상함</td>
            <td>품질 관문에서 멈추고 이전 데이터로 계속 서비스, 메일 알림</td>
          </tr>
          <tr>
            <td>데이터가 바뀌는 중에 진행 중인 판</td>
            <td>종목 순서를 지키고, 판은 종목 id 로 다시 연결 → 같은 종목 그대로</td>
          </tr>
          <tr>
            <td>누군가 요청을 쏟아냄</td>
            <td>IP+기기별 요청 한도(429), AI 는 서버 전체 상한까지</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
