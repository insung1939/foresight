// 내 전적(#/me). 로그인은 선택: 안 하면 이 기기 기록만, 하면 계정에 모든 판·레벨·배지가 남는다.
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Owl } from "../components/Buddy";
import { BadgeShelf, LevelCard } from "../components/Cheers";
import { Delta, ErrorState, Skeleton, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { authEnabled, displayName, signInWithGoogle, signOut, useSession } from "../lib/auth";
import { pct } from "../lib/format";
import { CARDS } from "../lib/game";
import { NICK_RE } from "../lib/nick";
import { loadProgress, replaceProgress, type Progress } from "../lib/progress";
import { go } from "../lib/router";
import type { Me as MeT } from "../lib/types";

export default function Me() {
  const session = useSession();
  return (
    <>
      <TopBar route="/me" />
      <main className="page me">{session ? <Account name={displayName(session)} /> : <Guest />}</main>
    </>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  if (!authEnabled)
    return (
      <button className="btn ghost lg" disabled title="배포 때 Supabase 를 연결하면 켜져요">
        구글 로그인 · 준비 중
      </button>
    );
  return (
    <button
      className="btn google lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithGoogle();
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {busy ? "구글로 이동 중…" : "구글로 로그인"}
    </button>
  );
}

function Guest() {
  const p = loadProgress();
  return (
    <>
      <section className="me-hero">
        <Owl mood="think" size={96} />
        <div>
          <h1>내 전적</h1>
          <p className="muted">로그인은 선택이에요. 안 해도 게임은 그대로 할 수 있어요.</p>
        </div>
      </section>
      <section className="panel perks">
        <h2 className="panel-title">로그인하면</h2>
        <ul>
          {[
            ["📱", "기기를 바꿔도", " 레벨·배지·전적이 그대로"],
            ["📈", "모든 판 기록", "과 수익률·적중률이 어떻게 변했는지"],
            ["🧭", "내 성향(차트파·유튜브파…)", "이 판마다 어떻게 바뀌었는지"],
            ["🔁", "로그인 전에 한 판도", " 계정으로 옮겨요"],
          ].map(([i, b, t]) => (
            <li key={b}>
              <span aria-hidden>{i}</span>
              <p>
                <b>{b}</b>
                {t}
              </p>
            </li>
          ))}
        </ul>
        <GoogleButton />
        <p className="fineprint">구글 이름·이메일은 저장하지 않아요. 서버에는 로그인 확인용 번호와 닉네임만 남아요.</p>
      </section>
      <h2 className="section-title">이 기기의 기록</h2>
      <div className="record-grid">
        <LevelCard p={p} />
        <BadgeShelf p={p} />
      </div>
    </>
  );
}

function Account({ name }: { name: string }) {
  const [me, setMe] = useState<MeT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    api
      .me()
      .then((m) => {
        setMe(m);
        if (m.progress && Object.keys(m.progress).length) replaceProgress(m.progress as unknown as Progress);
      })
      .catch((e) => setErr((e as Error).message));
  }, [n]);
  if (err) return <ErrorState title="내 기록을 불러오지 못했어요" detail={err} onRetry={() => (setErr(null), setN((x) => x + 1))} />;
  if (!me)
    return (
      <div className="loading-page">
        <Skeleton w="40%" h={30} />
        <Skeleton h={120} r={16} />
        <Skeleton h={200} r={16} />
      </div>
    );
  const p = loadProgress();
  const s = me.stats;
  return (
    <>
      <section className="me-hero">
        <Owl mood={s.games ? "proud" : "happy"} size={96} />
        <div>
          <p className="eyebrow">로그인됨 · {name}</p>
          <Nick initial={me.user.nickname ?? ""} />
        </div>
        <button className="link" onClick={() => signOut()}>
          로그아웃
        </button>
      </section>
      <div className="record-grid">
        <LevelCard p={p} />
        <BadgeShelf p={p} />
      </div>
      <section className="kpis me-kpis">
        <div className="kpi">
          <small>완주</small>
          <b>{s.games}판</b>
        </div>
        <div className="kpi">
          <small>적중률</small>
          <b>{s.hitRate === null ? "—" : `${Math.round(s.hitRate * 100)}%`}</b>
        </div>
        <div className="kpi">
          <small>최고 수익률</small>
          <b>{s.bestRet === null ? "—" : pct(s.bestRet)}</b>
        </div>
        <div className="kpi">
          <small>유튜버를 이긴 판</small>
          <b>
            {s.beatYt}/{s.games}
          </b>
        </div>
        <div className="kpi">
          <small>공매도 비율</small>
          <b>{s.shortShare === null ? "—" : `${Math.round(s.shortShare * 100)}%`}</b>
        </div>
        <div className="kpi">
          <small>중도 매도 비율</small>
          <b>{s.exitShare === null ? "—" : `${Math.round(s.exitShare * 100)}%`}</b>
        </div>
      </section>
      {me.games.length === 0 ? (
        <section className="panel lb-empty">
          <Owl mood="sleep" size={72} />
          <p>아직 끝낸 판이 없어요.</p>
          <button className="btn primary" onClick={() => go("/")}>
            첫 판 하러 가기 🚀
          </button>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2 className="panel-title">📈 판마다 수익률 · 적중</h2>
            <Trend games={[...me.games].reverse()} />
          </section>
          <section className="panel">
            <h2 className="panel-title">🃏 내가 연 카드와 그때 적중률</h2>
            <ul className="hbars-mini">
              {CARDS.map((d) => {
                const c = s.cards[d.key];
                const max = Math.max(1, ...Object.values(s.cards).map((x) => x.opened));
                return (
                  <li key={d.key}>
                    <span>
                      {d.icon} {d.label}
                    </span>
                    <span className="t">
                      <motion.i initial={{ width: 0 }} animate={{ width: `${(c.opened / max) * 100}%` }} />
                    </span>
                    <small>
                      {c.opened}번{c.hitRate !== null ? ` · 적중 ${Math.round(c.hitRate * 100)}%` : ""}
                    </small>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="panel">
            <h2 className="panel-title">🗂️ 모든 판 ({me.games.length})</h2>
            <ul className="me-games">
              {me.games.map((g) => (
                <li key={g.id}>
                  <span className={`gr g-${g.grade}`}>{g.grade}</span>
                  <span className="mg-main">
                    <b>{g.mode === "daily" ? "🗓️ 챌린지" : g.mode === "replay" ? "챌린지 다시" : "자유 연습"}</b>
                    <small>
                      {g.at ? new Date(g.at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : ""} · {g.habit} · 🎯 {g.hits}/10
                      {g.shorts ? ` · 🐻${g.shorts}` : ""}
                      {g.exits ? ` · 💰${g.exits}` : ""}
                    </small>
                  </span>
                  <Delta x={g.ret} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function Nick({ initial }: { initial: string }) {
  const [v, setV] = useState(initial);
  const [edit, setEdit] = useState(!initial);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = NICK_RE.test(v.trim());
  if (!edit)
    return (
      <h1 className="me-name">
        {v}{" "}
        <button className="link" onClick={() => setEdit(true)}>
          바꾸기
        </button>
      </h1>
    );
  return (
    <form
      className="nick-row me-nick"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        try {
          const r = await api.setMe(v.trim());
          setV(r.nickname);
          setEdit(false);
          setMsg(null);
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={12} placeholder="랭킹에 보일 이름" aria-label="닉네임" />
      <button className="btn primary" disabled={!ok}>
        저장
      </button>
      {msg && <p className="nick-hint bad">{msg}</p>}
    </form>
  );
}

/** 판마다 최종 수익률(막대) + 적중 수(점) */
function Trend({ games }: { games: MeT["games"] }) {
  const W = 600;
  const H = 180;
  const n = games.length;
  const max = Math.max(0.05, ...games.map((g) => Math.abs(g.ret)));
  const bw = Math.min(36, (W - 20) / n - 6);
  const x = (i: number) => 10 + ((i + 0.5) * (W - 20)) / n;
  const mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="trend" role="img" aria-label="판마다 수익률과 적중 수">
      <line x1={0} x2={W} y1={mid} y2={mid} className="chart-base" />
      {games.map((g, i) => {
        const h = (Math.abs(g.ret) / max) * (mid - 12);
        return (
          <g key={g.id}>
            <motion.rect
              x={x(i) - bw / 2}
              width={bw}
              rx={4}
              className={g.ret >= 0 ? "bar-up" : "bar-down"}
              initial={{ height: 0, y: mid }}
              animate={{ height: h, y: g.ret >= 0 ? mid - h : mid }}
              transition={{ delay: i * 0.04, duration: 0.5 }}
            />
            <circle cx={x(i)} cy={H - 6 - (g.hits / 10) * 40} r={3.5} className="hit-dot" />
            <text x={x(i)} y={H + 18} textAnchor="middle" className="eq-tick">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
