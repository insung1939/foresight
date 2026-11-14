// 실시간 랭킹 · 대시보드. 4초마다 새로 받는다(탭이 안 보이면 멈춤). 발표 때 프로젝터에 띄우고 QR 로 참여.
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Owl } from "../components/Buddy";
import { Confetti, CountUp, Delta, ErrorState, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { pct } from "../lib/format";
import { CARDS } from "../lib/game";
import { go } from "../lib/router";
import { sfx } from "../lib/sfx";
import { read, write } from "../lib/storage";
import { lastGameId } from "../lib/store";
import type { FeedItem, Live as LiveT, LiveRow } from "../lib/types";

const POLL = 4000;
type Scope = "daily" | "today" | "all";
const MEDAL = ["🥇", "🥈", "🥉"];
const JOIN_KEY = "fs:join:v1";

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export default function Live() {
  const [scope, setScope] = useState<Scope>(() => read<Scope>("fs:scope:v2") ?? "daily");
  const [data, setData] = useState<LiveT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [party, setParty] = useState(0);
  const prevTop = useRef<string | null>(null);
  const me = lastGameId()?.slice(0, 6);

  useEffect(() => {
    let alive = true;
    let id: number | undefined;
    const load = async () => {
      if (document.hidden) {
        id = window.setTimeout(load, POLL);
        return;
      }
      try {
        const d = await api.live(scope);
        if (!alive) return;
        const top = d.leaders[0]?.id ?? null;
        if (prevTop.current && top && top !== prevTop.current) {
          setParty((n) => n + 1); // 1등이 바뀌면 축하
          sfx("level");
        }
        prevTop.current = top;
        setData(d);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
      if (alive) id = window.setTimeout(load, POLL);
    };
    prevTop.current = null;
    load();
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [scope]);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pick = (s: Scope) => {
    setScope(s);
    write("fs:scope:v2", s);
    setData(null);
  };

  return (
    <>
      <TopBar route="/live" />
      <main className="page live">
        <header className="live-head">
          <div>
            <p className="live-badge">
              <i /> LIVE
            </p>
            <h1>{scope === "daily" ? "오늘의 챌린지" : "실시간 랭킹"}</h1>
            <p className="muted small" aria-live="off">
              {data ? `${Math.round((Date.now() - new Date(data.at).getTime()) / 1000) || 0}초 전 갱신 · 4초마다` : "불러오는 중…"}
              <span hidden>{tick}</span>
            </p>
          </div>
          <div className="live-tools">
            <div className="seg" role="tablist" aria-label="기간">
              {(["daily", "today", "all"] as const).map((s) => (
                <button key={s} role="tab" aria-selected={scope === s} className={scope === s ? "on" : ""} onClick={() => pick(s)}>
                  {s === "daily" ? "🗓️ 챌린지" : s === "today" ? "오늘" : "전체"}
                </button>
              ))}
            </div>
            <button
              className="btn ghost small-btn"
              onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
            >
              ⛶ 크게
            </button>
          </div>
        </header>

        {err && !data ? (
          <ErrorState title="랭킹을 불러오지 못했어요" detail={err} onRetry={() => pick(scope)} />
        ) : (
          <div className="live-grid">
            <section className="kpis">
              <Kpi icon="🟢" label="지금 플레이 중" v={data?.stats.playing} pulse />
              <Kpi icon="🏁" label="완주" v={data?.stats.finished} />
              <Kpi icon="🎲" label="푼 라운드" v={data?.stats.rounds} />
              <Kpi icon="🎯" label="평균 적중률" v={data?.stats.hitRate} rate />
              <Kpi icon="📺" label="유튜버를 이긴 판" v={data?.stats.beatYtShare} rate />
              <Kpi icon="🐻" label="공매도 비율" v={data?.stats.shortShare} rate />
            </section>

            <section className="panel board-panel">
              <Confetti key={party} fire={party > 0} />
              <h2 className="panel-title">🏆 수익률 랭킹</h2>
              {!data ? (
                <p className="muted">불러오는 중…</p>
              ) : data.leaders.length === 0 ? (
                <Empty scope={scope} />
              ) : (
                <>
                  <Podium rows={data.leaders.slice(0, 3)} me={me} />
                  <ol className="lb" start={4}>
                    <AnimatePresence initial={false}>
                      {data.leaders.slice(3).map((r, i) => (
                        <motion.li key={r.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className={r.id === me ? "me" : ""}>
                          <span className="rk">{i + 4}</span>
                          <span className="nm">
                            {r.nickname}
                            {r.id === me && <em> 나</em>}
                          </span>
                          <span className={`gr g-${r.grade}`}>{r.grade}</span>
                          <span className="ht">🎯 {r.hits}/10</span>
                          <Delta x={r.ret} />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ol>
                </>
              )}
            </section>

            <section className="panel feed-panel">
              <h2 className="panel-title">⚡ 방금 일어난 일</h2>
              {!data || data.feed.length === 0 ? (
                <p className="muted small">아직 소식이 없어요. 첫 주인공이 돼 보세요!</p>
              ) : (
                <ul className="feed">
                  <AnimatePresence initial={false}>
                    {data.feed.map((f) => (
                      <motion.li key={`${f.kind}-${f.nickname}-${f.at}`} layout initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                        <FeedLine f={f} />
                        <time>{ago(f.at)}</time>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>

            <Join />

            <section className="panel">
              <h2 className="panel-title">🎯 적중왕</h2>
              {data && data.sharp.length > 0 ? (
                <ol className="lb compact">
                  {data.sharp.map((r, i) => (
                    <li key={r.id} className={r.id === me ? "me" : ""}>
                      <span className="rk">{i + 1}</span>
                      <span className="nm">{r.nickname}</span>
                      <span className="hits-dots" aria-label={`${r.hits}개 적중`}>
                        {Array.from({ length: 10 }, (_, k) => (
                          <i key={k} className={k < r.hits ? "on" : ""} />
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted small">완주한 사람이 생기면 보여요.</p>
              )}
            </section>

            <section className="panel">
              <h2 className="panel-title">🃏 어떤 카드를 많이 열었나</h2>
              {data ? <CardBars cards={data.cards} /> : <p className="muted small">불러오는 중…</p>}
            </section>

            <section className="panel">
              <h2 className="panel-title">📊 최종 수익률 분포</h2>
              {data ? <Histo h={data.histogram} /> : null}
              {data && Object.keys(data.grades).length > 0 && (
                <p className="grades">
                  {(["S", "A", "B", "C", "D"] as const).map((g) => (
                    <span key={g} className={`gr g-${g}`}>
                      {g} <b>{data.grades[g] ?? 0}</b>
                    </span>
                  ))}
                </p>
              )}
            </section>
          </div>
        )}
        <p className="disclaimer">닉네임은 플레이어가 정한 이름이에요. 랭킹에는 회사 이름(정답)이 나오지 않아요.</p>
      </main>
    </>
  );
}

function Kpi({ icon, label, v, rate, pulse }: { icon: string; label: string; v: number | null | undefined; rate?: boolean; pulse?: boolean }) {
  const prev = useRef(0);
  const to = v ?? 0;
  const from = prev.current;
  useEffect(() => {
    prev.current = to;
  }, [to]);
  return (
    <div className={`kpi ${pulse && to > 0 ? "pulse" : ""}`}>
      <small>
        <span aria-hidden>{icon}</span> {label}
      </small>
      <b>{v === undefined ? "…" : v === null ? "—" : <CountUp key={to} from={from} to={rate ? to * 100 : to} format={(x) => (rate ? `${Math.round(x)}%` : Math.round(x).toLocaleString("ko-KR"))} duration={0.8} />}</b>
    </div>
  );
}

function Podium({ rows, me }: { rows: LiveRow[]; me?: string }) {
  const order = [1, 0, 2].filter((i) => rows[i]);
  return (
    <div className="podium">
      {order.map((i) => {
        const r = rows[i];
        return (
          <motion.div key={r.id} layout className={`pod p${i + 1} ${r.id === me ? "me" : ""}`} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 * i }}>
            {i === 0 && (
              <span className="pod-owl" aria-hidden>
                <Owl mood="proud" size={56} />
              </span>
            )}
            <span className="medal">{MEDAL[i]}</span>
            <b className="pod-name">
              {r.nickname}
              {r.id === me && <em> 나</em>}
            </b>
            <Delta x={r.ret} />
            <small>
              🎯 {r.hits}/10 · <span className={`gr g-${r.grade}`}>{r.grade}</span>
            </small>
            <span className="pod-block">{i + 1}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeedLine({ f }: { f: FeedItem }) {
  if (f.kind === "finish")
    return (
      <p>
        🏁 <b>{f.nickname}</b> 님 완주! <Delta x={f.ret} /> · 🎯 {f.hits}/10 · <span className={`gr g-${f.grade}`}>{f.grade}</span>
        {f.beatYt && " · 유튜버 격파 📺"}
      </p>
    );
  return (
    <p>
      {f.short ? "🐻" : "🔥"} <b>{f.nickname}</b> 님 {f.round}라운드 {f.short ? "공매도로 " : ""}
      <Delta x={f.ret} /> 적중!
    </p>
  );
}

function Empty({ scope }: { scope: string }) {
  return (
    <div className="lb-empty">
      <Owl mood="sleep" size={80} />
      <p>{scope === "daily" ? "오늘의 챌린지를 끝낸 사람이 아직 없어요. 모두 같은 10문제예요!" : scope === "today" ? "오늘은 아직 완주한 사람이 없어요." : "아직 완주한 사람이 없어요."}</p>
      <button className="btn primary" onClick={() => go("/")}>
        첫 1등 되기 🚀
      </button>
    </div>
  );
}

function CardBars({ cards }: { cards: LiveT["cards"] }) {
  const max = Math.max(1, ...Object.values(cards).map((c) => c.opened));
  return (
    <ul className="hbars-mini">
      {CARDS.map((d) => {
        const c = cards[d.key];
        return (
          <li key={d.key}>
            <span>
              {d.icon} {d.label}
            </span>
            <span className="t">
              <motion.i animate={{ width: `${(c.opened / max) * 100}%` }} transition={{ duration: 0.6 }} />
            </span>
            <small>
              {c.opened}번{c.hitRate !== null ? ` · 적중 ${Math.round(c.hitRate * 100)}%` : ""}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function Histo({ h }: { h: LiveT["histogram"] }) {
  const max = Math.max(1, ...h.map((b) => b.n));
  const label = (b: LiveT["histogram"][number]) => (b.lo <= -1 ? `${pct(b.hi, 0)} 미만` : b.hi >= 99 ? `${pct(b.lo, 0)} 이상` : `${pct(b.lo, 0)}~${pct(b.hi, 0)}`);
  return (
    <div className="mini-histo">
      {h.map((b, i) => (
        <div key={i} className="col">
          <span className="n">{b.n}</span>
          <motion.i className={b.lo >= 0 ? "pos" : "neg"} animate={{ height: `${(b.n / max) * 100}%` }} transition={{ duration: 0.6 }} />
          <small>{label(b)}</small>
        </div>
      ))}
    </div>
  );
}

/** 폰으로 참여: QR. localhost 로 열었으면 같은 와이파이 주소로 바꿔 쓸 수 있게 */
function Join() {
  const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname);
  const [url, setUrl] = useState(() => read<string>(JOIN_KEY) ?? window.location.origin);
  const [svg, setSvg] = useState("");
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1d1640", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);
  return (
    <section className="panel join">
      <h2 className="panel-title">📱 폰으로 참여</h2>
      <div className="qr" aria-label={`참여 주소 ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="join-url">{url.replace(/^https?:\/\//, "")}</p>
      {local && <p className="fineprint">지금 주소(localhost)는 이 컴퓨터에서만 열려요. 배포 주소나 같은 와이파이 주소로 바꿔 주세요.</p>}
      {edit ? (
        <form
          className="join-edit"
          onSubmit={(e) => {
            e.preventDefault();
            write(JOIN_KEY, url);
            setEdit(false);
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="참여 주소" />
          <button className="btn primary">저장</button>
        </form>
      ) : (
        <button className="link" onClick={() => setEdit(true)}>
          주소 바꾸기
        </button>
      )}
    </section>
  );
}
