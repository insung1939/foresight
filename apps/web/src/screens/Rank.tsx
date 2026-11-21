// 랭킹(#/rank): 오늘의 시드 · 지난 날짜(날짜 칩 + 1등) · 명예의 전당. 강의실 시연용 QR.
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Ant, type CharId } from "../components/Characters";
import { QR } from "../components/QR";
import { Delta, ErrorState, Loading, TopBar } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { pct, todayKst } from "../lib/format";
import { query } from "../lib/router";
import type { Board } from "../lib/types";

type Tab = "day" | "hall";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const label = (d: string) => {
  const t = new Date(d + "T00:00:00+09:00");
  return { md: `${t.getMonth() + 1}.${t.getDate()}`, wd: WD[t.getDay()] };
};

export default function Rank() {
  const [tab, setTab] = useState<Tab>("day");
  const [day, setDay] = useState(query().day ?? todayKst());
  const [tick, setTick] = useState(0);
  const days = useAsync(() => api.days(), [tick]);
  const res = useAsync(() => api.board(day), [day, tick]);
  const hall = useAsync(() => api.hall(), [tab === "hall", tick]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 발표 중 실시간처럼: 10초마다 새로고침(화면이 보일 때만)
    const id = window.setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);
  // 최근 14일은 참여가 없어도 칩으로 보여준다(빈 날도 고를 수 있게)
  const today = todayKst();
  const known = days.status === "ready" ? Object.fromEntries(days.data.days.map((d) => [d.day, d])) : {};
  const chips = Array.from({ length: 14 }, (_, i) => new Date(new Date(today).getTime() - i * 86_400_000).toISOString().slice(0, 10));
  for (const d of Object.keys(known)) if (!chips.includes(d)) chips.push(d);
  chips.sort((a, b) => (a < b ? 1 : -1));

  return (
    <>
      <TopBar route="/rank" />
      <main className="page rank">
        <header className="rank-head">
          <div>
            <p className="eyebrow">오늘의 시드 · 모두 같은 시장, 같은 코드네임</p>
            <h1>🏆 순위</h1>
          </div>
          <div className="seg rank-tabs" role="tablist" aria-label="순위 종류" data-ux="Tabs">
            <button role="tab" aria-selected={tab === "day"} className={tab === "day" ? "on" : ""} onClick={() => setTab("day")}>
              날짜별
            </button>
            <button role="tab" aria-selected={tab === "hall"} className={tab === "hall" ? "on" : ""} onClick={() => setTab("hall")}>
              명예의 전당
            </button>
          </div>
        </header>

        {tab === "day" && (
          <div className="day-strip" ref={strip} role="radiogroup" aria-label="날짜 고르기" data-ux="Date Chips · Horizontal Scroll">
            {chips.map((d) => {
              const k = known[d];
              const l = label(d);
              return (
                <button key={d} role="radio" aria-checked={day === d} className={`dchip ${day === d ? "on" : ""} ${k ? "has" : ""}`} onClick={() => setDay(d)}>
                  <small>{d === today ? "오늘" : l.wd}</small>
                  <b>{l.md}</b>
                  <span>{k ? `${k.n}명` : "–"}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="rank-grid">
          <section className="card">
            {tab === "day" ? (
              <>
                {res.status === "loading" && <Loading slow={res.slow} />}
                {res.status === "error" && <ErrorState title="순위를 불러오지 못했어요" detail={res.error.message} onRetry={res.retry} />}
                {res.status === "ready" && <DayBoard b={res.data} isToday={day === today} />}
              </>
            ) : (
              <>
                {hall.status === "loading" && <Loading slow={hall.slow} />}
                {hall.status === "error" && <ErrorState title="불러오지 못했어요" detail={hall.error.message} onRetry={hall.retry} />}
                {hall.status === "ready" &&
                  (hall.data.rows.length === 0 ? (
                    <div className="empty big">
                      <p>🏛️</p>
                      <p>아직 명예의 전당이 비어 있어요.</p>
                    </div>
                  ) : (
                    <>
                      <p className="muted small">모든 날짜의 오늘의 시드를 통틀어 가장 높은 수익률</p>
                      <Rows rows={hall.data.rows} showDay />
                    </>
                  ))}
              </>
            )}
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

function DayBoard({ b, isToday }: { b: Board; isToday: boolean }) {
  if (b.rows.length === 0)
    return (
      <div className="empty big">
        <p>🐜</p>
        <p>{isToday ? "아직 오늘 완주한 사람이 없어요. 1등 자리가 비어 있어요!" : "이 날은 완주한 사람이 없었어요."}</p>
        {isToday && (
          <a className="btn primary" href="#/">
            첫 번째로 도전하기
          </a>
        )}
      </div>
    );
  const top3 = b.rows.slice(0, 3);
  return (
    <>
      <div className="podium" aria-label="1~3등">
        {[1, 0, 2].map((i) =>
          top3[i] ? (
            <motion.div key={i} className={`pod p${i + 1}`} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 * i }}>
              <Ant char={(top3[i].char ?? "office") as CharId} mood="happy" size={i === 0 ? 54 : 44} />
              <b>{top3[i].nickname}</b>
              <Delta x={top3[i].ret} />
              <span className="pod-base">{["🥇", "🥈", "🥉"][i]}</span>
            </motion.div>
          ) : (
            <div key={i} className={`pod p${i + 1} empty-pod`} />
          ),
        )}
      </div>
      <p className="muted small">
        {b.total.toLocaleString()}명 완주 · 중간값 {b.median !== null ? pct(b.median) : "-"}
        {b.bench && ` · 유튜버 3명과 코스피를 모두 이긴 사람 ${Math.round(b.bench.beatAll * 100)}%`}
      </p>
      <Rows rows={b.rows.slice(3)} start={4} />
      {b.bench && (
        <p className="muted small">
          이날 라이벌: 유튜버 {b.bench.youtubers.map((x) => pct(x)).join(" · ")} / 코스피 {pct(b.bench.index)}
        </p>
      )}
    </>
  );
}

function Rows({ rows, start = 1, showDay }: { rows: (Board["rows"][number] & { day?: string })[]; start?: number; showDay?: boolean }) {
  return (
    <ol className="board" start={start}>
      {rows.map((r) => (
        <li key={`${r.rank}${r.day ?? ""}`} className={r.rank <= 3 ? `top top${r.rank}` : ""}>
          <span className="rk">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
          <span className="bd-name">
            <b>
              <Ant char={(r.char ?? "office") as CharId} size={20} /> {r.nickname}
            </b>
            <span className="muted small">
              {r.title}
              {showDay && r.day ? ` · ${r.day}` : ""}
            </span>
          </span>
          <span className={`g-chip g-${r.grade}`}>{r.grade}</span>
          <Delta x={r.ret} />
        </li>
      ))}
    </ol>
  );
}
