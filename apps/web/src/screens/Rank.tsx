// 랭킹(#/rank): 오늘의 시드 순위. 기기당 첫 완주만. 강의실 시연용 QR 포함.
import { useEffect, useState } from "react";
import { QR } from "../components/QR";
import { Delta, ErrorState, Loading, TopBar } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { pct, todayKst } from "../lib/format";

export default function Rank() {
  const [day, setDay] = useState(todayKst());
  const [tick, setTick] = useState(0);
  const res = useAsync(() => api.board(day), [day, tick]);
  useEffect(() => {
    // 발표 중 실시간처럼: 10초마다 새로고침(화면이 보일 때만)
    const id = window.setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);
  const shift = (d: number) => setDay(new Date(new Date(day).getTime() + d * 86_400_000).toISOString().slice(0, 10));
  return (
    <>
      <TopBar route="/rank" />
      <main className="page rank">
        <header className="rank-head">
          <div>
            <p className="eyebrow">오늘의 시드 · 모두 같은 시장, 같은 코드네임</p>
            <h1>🏆 순위</h1>
          </div>
          <div className="day-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="전날">
              ‹
            </button>
            <b>{day}</b>
            <button className="icon-btn" onClick={() => shift(1)} disabled={day >= todayKst()} aria-label="다음 날">
              ›
            </button>
          </div>
        </header>
        <div className="rank-grid">
          <section className="card">
            {res.status === "loading" && <Loading slow={res.slow} />}
            {res.status === "error" && <ErrorState title="순위를 불러오지 못했어요" detail={res.error.message} onRetry={res.retry} />}
            {res.status === "ready" &&
              (res.data.rows.length === 0 ? (
                <div className="empty big">
                  <p>🐜</p>
                  <p>이 날은 아직 완주한 사람이 없어요.</p>
                  <a className="btn primary" href="#/">
                    첫 번째로 도전하기
                  </a>
                </div>
              ) : (
                <>
                  <p className="muted small">
                    {res.data.total.toLocaleString()}명 완주 · 중간값 {res.data.median !== null ? pct(res.data.median) : "-"}
                    {res.data.bench && ` · 유튜버 3명과 코스피를 모두 이긴 사람 ${Math.round(res.data.bench.beatAll * 100)}%`}
                  </p>
                  <ol className="board">
                    {res.data.rows.map((r) => (
                      <li key={r.rank} className={r.rank <= 3 ? `top top${r.rank}` : ""}>
                        <span className="rk">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
                        <span className="bd-name">
                          <b>{r.nickname}</b>
                          <span className="muted small">{r.title}</span>
                        </span>
                        <span className={`g-chip g-${r.grade}`}>{r.grade}</span>
                        <Delta x={r.ret} />
                      </li>
                    ))}
                  </ol>
                  {res.data.bench && (
                    <p className="muted small">
                      오늘 라이벌 기준: 유튜버 {res.data.bench.youtubers.map((x) => pct(x)).join(" · ")} / 코스피 {pct(res.data.bench.index)}
                    </p>
                  )}
                </>
              ))}
          </section>
          <aside className="card qr-card">
            <h2 className="sec-title">📱 폰으로 같이 하기</h2>
            <QR url={window.location.origin} size={200} />
            <p className="muted small">카메라로 찍으면 바로 시작해요.</p>
          </aside>
        </div>
      </main>
    </>
  );
}
