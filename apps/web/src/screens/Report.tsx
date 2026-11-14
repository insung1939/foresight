import { toPng } from "html-to-image";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import Chart from "../components/Chart";
import { Confetti, CountUp, Delta, ErrorState, LoadingPage, Logo, Stamp, TopBar } from "../components/ui";
import { api, loadMeta, useAsync } from "../lib/api";
import { pct, won } from "../lib/format";
import { START_CASH, cardDef, cardHitRates, infoHabit, investStyle, weightText } from "../lib/game";
import { go } from "../lib/router";
import { forgetGame, lastGameId } from "../lib/store";
import { Buddy, Owl } from "../components/Buddy";
import { BadgeShelf, LevelCard } from "../components/Cheers";
import { awardGame, badgesOfGame, loadProgress } from "../lib/progress";
import { useEffect } from "react";
import { NickSheet } from "../components/NickSheet";
import { KEYS, write } from "../lib/storage";
import { SurveyCard } from "../components/SurveyCard";
import type { Hindsight, Report as ReportT, Track } from "../lib/types";

export default function Report() {
  const id = lastGameId();
  const st = useAsync(() => (id ? api.report(id) : Promise.reject(null)), [id]);
  const [sheet, setSheet] = useState(false);
  const restart = () => setSheet(true);
  const start = () => {
    setSheet(false);
    write(KEYS.mode, "free");
    forgetGame();
    go("/play");
  };

  if (!id)
    return (
      <>
        <TopBar route="/report" />
        <main className="page">
          <div className="state">
            <div className="state-icon" aria-hidden>
              📭
            </div>
            <h2>아직 끝낸 게임이 없어요</h2>
            <p className="muted">10라운드를 마치면 여기에 성향 리포트가 생겨요.</p>
            <div className="state-actions">
              <button className="btn primary" onClick={restart}>
                게임 시작
              </button>
            </div>
          </div>
        </main>
        <NickSheet open={sheet} onClose={() => setSheet(false)} onStart={start} />
      </>
    );
  if (st.status === "loading") return <LoadingPage route="/report" slow={st.slow} />;
  if (st.status === "error")
    return (
      <>
        <TopBar route="/report" />
        <main className="page">
          <ErrorState title={st.error?.message ?? "리포트를 불러오지 못했어요"} onRetry={st.retry} />
        </main>
      </>
    );
  return (
    <>
      <Body r={st.data} restart={restart} />
      <NickSheet open={sheet} onClose={() => setSheet(false)} onStart={start} />
    </>
  );
}

function Body({ r, restart }: { r: ReportT; restart: () => void }) {
  const t = r.track;
  const end = t[t.length - 1];
  const rounds = r.rounds;
  const hits = rounds.filter((x) => x.hit).length;
  const ytHits = rounds.filter((x) => (x.youtube.verdict === "bull") === x.answer.r20 > 0).length;
  const aiRounds = rounds.filter((x) => x.ai);
  const aiHits = aiRounds.filter((x) => x.ai!.hit).length;
  const habit = infoHabit(rounds);
  const style = investStyle(rounds);
  const rates = cardHitRates(rounds);
  const avgSec = Math.round(rounds.reduce((a, x) => a + x.ms, 0) / rounds.length / 1000);
  const myRet = end.me / START_CASH - 1;

  const board = [
    { who: "나", v: end.me, me: true },
    { who: "📺 유튜버 말대로", v: end.youtuber },
    ...(aiRounds.length === rounds.length ? [{ who: "🤖 AI", v: end.ai }] : []),
    { who: "🏛️ 코스피", v: end.kospi },
  ].sort((a, b) => b.v - a.v);
  const rank = board.findIndex((b) => b.me) + 1;
  const grade = gradeOf(hits);
  const meta = useAsync(loadMeta, []);
  const hs = meta.status === "ready" ? meta.data.summary.hindsight : undefined;
  const [prog, setProg] = useState(loadProgress);
  useEffect(() => {
    const id = setTimeout(() => {
      awardGame(r.gameId, hits, end.me >= end.youtuber);
      setProg(loadProgress());
    }, 1600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.gameId]);
  const earned = badgesOfGame(prog, r.gameId);
  const gained = prog.xpByGame[r.gameId] ?? 0;
  const owlMood = grade.g === "S" || grade.g === "A" ? "proud" : grade.g === "B" ? "happy" : "sad";

  return (
    <>
      <TopBar route="/report" />
      <main className="page report">
        <Confetti fire={grade.g === "S" || grade.g === "A"} />
        <ShareCard grade={grade} habit={habit} style={style} myRet={myRet} hits={hits} rank={rank} of={board.length} beatYt={end.me >= end.youtuber} beatAi={aiRounds.length === rounds.length ? end.me >= end.ai : null} />

        {r.rank && (
          <motion.button className="rank-banner" onClick={() => go("/live")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <span className="rk-ic">🏆</span>
            <span>
              <b>{r.nickname ?? "익명 부엉이"}</b> 님은 {r.mode === "daily" ? "🗓️ 오늘의 챌린지" : r.mode === "replay" ? "챌린지 다시 하기(순위 제외) ·" : "전체"} 랭킹{" "}
              <b className="rk-n">{r.rank}위</b>
            </span>
            <span className="rk-go">랭킹 보기 →</span>
          </motion.button>
        )}

        <section className="panel">
          <h2 className="panel-title">성적 비교</h2>
          <ol className="board">
            {board.map((b, i) => (
              <motion.li key={b.who} className={b.me ? "me" : ""} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.12 }}>
                <span className="rank">{i + 1}</span>
                <span className="who">{b.who}</span>
                <span className="v">
                  <CountUp from={START_CASH} to={b.v} format={won} delay={0.3} />
                </span>
                <Delta x={b.v / START_CASH - 1} />
              </motion.li>
            ))}
          </ol>
          <Equity track={t} withAi={aiRounds.length === rounds.length} />
          <p className="fineprint">코스피는 매 라운드 같은 20거래일 동안 지수에 100% 넣었다고 보고 10개 구간을 이어 붙인 값이에요.</p>
          <div className="score-row">
            <div>
              <small>방향 적중</small>
              <b>나 {hits}/10</b>
            </div>
            <div>
              <small>유튜버</small>
              <b>{ytHits}/10</b>
            </div>
            {aiRounds.length > 0 && (
              <div>
                <small>AI</small>
                <b>
                  {aiHits}/{aiRounds.length}
                </b>
              </div>
            )}
            {r.players.n >= 5 && r.players.beatShare !== null && (
              <div>
                <small>끝까지 한 {r.players.n}명 중</small>
                <b>상위 {Math.max(1, Math.round((1 - r.players.beatShare) * 100))}%</b>
              </div>
            )}
          </div>
        </section>

        <section className="panel reward">
          <h2 className="panel-title">이번 판 보상</h2>
          <div className="reward-top">
            <Buddy mood={owlMood} size={84} text={GRADE_LINE[grade.g]} />
            <div className="reward-xp">
              <small>얻은 경험치</small>
              <b>
                +<CountUp to={gained} format={(v) => Math.round(v).toLocaleString("ko-KR")} delay={0.4} /> XP
              </b>
            </div>
          </div>
          <LevelCard p={prog} gained={gained} />
          {earned.length > 0 && (
            <ul className="earned">
              {earned.map((b, i) => (
                <motion.li key={b.id} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 420, damping: 14 }}>
                  <span>{b.icon}</span>
                  <b>{b.name}</b>
                  <small>{b.desc}</small>
                </motion.li>
              ))}
            </ul>
          )}
          <details className="shelf-more">
            <summary>배지 전체 보기</summary>
            <BadgeShelf p={prog} highlight={earned.map((b) => b.id)} />
          </details>
        </section>

        {hs && <VsHindsight h={hs} hits={hits} n={rounds.length} />}

        <section className="panel">
          <h2 className="panel-title">정보 습관</h2>
          <p className="muted small">{habit.line}</p>
          <ul className="habits">
            {rates.map((x) => (
              <li key={x.card.key}>
                <span className="who">
                  {x.card.icon} {x.card.label}
                </span>
                <span className="bar">
                  <motion.i initial={{ width: 0 }} animate={{ width: `${(x.n / rounds.length) * 100}%` }} transition={{ duration: 0.7, delay: 0.3 }} />
                </span>
                <span className="v">
                  {x.n}번
                  <small>{x.rate === null ? "—" : `그때 적중 ${Math.round(x.rate * 100)}%`}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            한 라운드 평균 <b>{avgSec}초</b> 고민했어요.
          </p>
        </section>

        <section className="panel">
          <h2 className="panel-title">라운드 다시 보기</h2>
          <ul className="rounds">
            {rounds.map((x) => (
              <RoundRow key={x.round} x={x} />
            ))}
          </ul>
        </section>

        <SurveyCard gameId={r.gameId} />

        <div className="actions-row">
          <button className="btn primary" onClick={restart}>
            새 문제로 다시 하기
          </button>
          <button className="btn ghost" onClick={() => go("/data")}>
            데이터·분석 보기
          </button>
        </div>
        <p className="disclaimer">학습용 시뮬레이션이며 투자 권유가 아닙니다.</p>
      </main>
    </>
  );
}

function RoundRow({ x }: { x: ReportT["rounds"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={open ? "open" : ""}>
      <button className="round-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="rno">{x.round + 1}</span>
        <span className={x.hit ? "chip hit" : "chip"}>{x.hit ? "적중" : "빗나감"}</span>
        <span className="name">{x.answer.name}</span>
        <span className="meta">
          {x.w1 === x.w2 ? weightText(x.w1) : `${weightText(x.w1)}→${weightText(x.w2)}`}
          {x.event && " ⚡"}
          {x.exitDay !== undefined && x.exitDay < 20 && ` 💰D+${x.exitDay}`}
        </span>
        <Delta x={x.answer.r20} digits={0} />
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="round-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Chart points={x.chart} upTo={20} domainEnd={20} height={160} volume={false} />
            <p className="muted small">
              {x.period} · 열어 본 카드: {x.opened.length ? x.opened.map((k) => cardDef(k).label).join(", ") : "없음"} · 유튜버 '
              {x.youtube.verdict === "bull" ? "오른다" : "내린다"}' {(x.youtube.verdict === "bull") === x.answer.r20 > 0 ? "적중" : "빗나감"}
              {x.ai && ` · AI ${weightText(x.ai.weight)} ${x.ai.hit ? "적중" : "빗나감"}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function ShareCard(props: {
  grade: Grade;
  habit: { icon: string; name: string };
  style: { icon: string; name: string; line: string };
  myRet: number;
  hits: number;
  rank: number;
  of: number;
  beatYt: boolean;
  beatAi: boolean | null; // AI 판단이 없는 문제가 있으면 비교하지 않는다
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { grade, habit, style, myRet, hits, rank, of, beatYt, beatAi } = props;
  const text = `Foresight ${grade.g}등급 — 나는 ${habit.name} · ${style.name}. 10라운드 ${pct(myRet)} · 적중 ${hits}/10`;
  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 2400);
  };

  const save = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = "foresight-result.png";
      a.click();
      flash("이미지를 저장했어요.");
    } catch {
      flash("이미지를 만들지 못했어요. 화면을 캡처해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Foresight", text, url: window.location.origin });
      else {
        await navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
        flash("결과 문구를 복사했어요.");
      }
    } catch {
      /* 공유 취소 */
    }
  };

  return (
    <section className="share">
      <motion.div ref={ref} className="share-card" initial={{ opacity: 0, y: 24, rotateX: 18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ type: "spring", stiffness: 140, damping: 16 }}>
        <div className="share-top">
          <Logo small />
          <span>10라운드 결과</span>
        </div>
        <Stamp tone="grade" delay={0.9} className={`grade g-${grade.g}`}>
          <b>{grade.g}</b>
          <small>{grade.label}</small>
        </Stamp>
        <p className="share-label">나의 투자 성향</p>
        <div className="share-types">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.35, type: "spring" }}>
            {habit.icon}
          </motion.span>
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: "spring" }}>
            {style.icon}
          </motion.span>
        </div>
        <h1 className="share-name">
          {habit.name}
          <br />
          {style.name}
        </h1>
        <p className="share-line">{style.line}</p>
        <div className="share-stats">
          <div>
            <small>수익률</small>
            <b>{pct(myRet)}</b>
          </div>
          <div>
            <small>적중</small>
            <b>{hits}/10</b>
          </div>
          <div>
            <small>순위</small>
            <b>
              {rank}/{of}
            </b>
          </div>
        </div>
        <span className="share-owl" aria-hidden>
          <Owl mood={grade.g === "S" || grade.g === "A" ? "proud" : grade.g === "B" ? "happy" : "think"} size={64} />
        </span>
        <p className="share-foot">{beatAi === null
            ? beatYt
              ? "유튜버 말대로 한 것보다 잘했어요 🎉"
              : "이번엔 유튜버 말대로가 더 나았어요"
            : beatYt && beatAi
              ? "유튜버도 AI도 이겼어요 🎉"
              : beatYt
                ? "유튜버는 이겼어요 🎉"
                : beatAi
                  ? "AI는 이겼어요"
                  : "이번엔 유튜버·AI가 더 나았어요"}</p>
      </motion.div>
      <div className="share-actions">
        <button className="btn ghost" onClick={save} disabled={busy}>
          {busy ? "만드는 중…" : "이미지로 저장"}
        </button>
        <button className="btn ghost" onClick={share}>
          결과 공유
        </button>
      </div>
      <AnimatePresence>
        {note && (
          <motion.p className="toast" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

function Equity({ track, withAi }: { track: Track[]; withAi: boolean }) {
  const W = 600;
  const H = 200;
  const pad = { l: 8, r: 96, t: 14, b: 22 };
  const series: { k: keyof Track; name: string; cls: string }[] = [
    { k: "kospi", name: "코스피", cls: "eq-kospi" },
    { k: "youtuber", name: "유튜버", cls: "eq-yt" },
    ...(withAi ? [{ k: "ai" as const, name: "AI", cls: "eq-ai" }] : []),
    { k: "me", name: "나", cls: "eq-me" },
  ];
  const all = track.flatMap((t) => series.map((s) => t[s.k]));
  const lo = Math.min(...all) * 0.98;
  const hi = Math.max(...all) * 1.02;
  const sx = (i: number) => pad.l + (i / (track.length - 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (k: keyof Track) => track.map((t, i) => `${i ? "L" : "M"}${sx(i)},${sy(t[k])}`).join("");
  const ends = series.map((s) => ({ ...s, y: sy(track[track.length - 1][s.k]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="equity" role="img" aria-label="라운드별 자금 변화">
      <line x1={pad.l} x2={W - pad.r} y1={sy(START_CASH)} y2={sy(START_CASH)} className="chart-base" />
      {track.map((_, i) => (
        <text key={i} x={sx(i)} y={H - 6} className="eq-tick" textAnchor="middle">
          {i === 0 ? "시작" : i}
        </text>
      ))}
      {series.map((s, i) => (
        <motion.path key={s.k} d={line(s.k)} className={s.cls} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.3 + i * 0.15, ease: "easeInOut" }} />
      ))}
      {ends.map((e) => (
        <motion.text key={e.k} x={W - pad.r + 8} y={e.y + 4} className={`eq-label ${e.cls}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}>
          {e.name} {won(track[track.length - 1][e.k]).replace(" 원", "")}
        </motion.text>
      ))}
    </svg>
  );
}

interface Grade {
  g: "S" | "A" | "B" | "C" | "D";
  label: string;
}

function gradeOf(hits: number): Grade {
  if (hits >= 9) return { g: "S", label: "예언가" };
  if (hits >= 7) return { g: "A", label: "촉이 좋음" };
  if (hits >= 5) return { g: "B", label: "동전보다 나음" };
  if (hits >= 3) return { g: "C", label: "흔들림" };
  return { g: "D", label: "반대로 하면?" };
}

/** hindsight 실제 기록(유튜버 수천 번의 예측)과 내 적중률 비교 */
function VsHindsight({ h, hits, n }: { h: Hindsight; hits: number; n: number }) {
  const me = hits / n;
  const chs = h.channels;
  const below = chs.filter((c) => c.hit < me).length;
  const bars = [
    { k: "나", v: me, note: `${n}번 중 ${hits}번`, me: true },
    { k: "유튜버 ‘오른다’", v: h.bull.hit, note: `${h.bull.n.toLocaleString("ko-KR")}번` },
    { k: "유튜버 ‘내린다’", v: h.bear.hit, note: `${h.bear.n.toLocaleString("ko-KR")}번` },
  ];
  return (
    <section className="panel vs-hs">
      <h2 className="panel-title">hindsight 실제 기록과 비교</h2>
      <p className="muted small">
        hindsight가 모은 국내 주식 유튜브 언급 {(h.bull.n + h.bear.n).toLocaleString("ko-KR")}번의 20거래일 뒤 결과와 비교했어요. ‘오른다’고 한 종목은 평균{" "}
        <Delta x={h.bull.avg} />였어요.
      </p>
      <ul className="hs-bars">
        {bars.map((b, i) => (
          <li key={b.k} className={b.me ? "me" : ""}>
            <span className="lbl">
              {b.k}
              <small>{b.note}</small>
            </span>
            <span className="track">
              <motion.i initial={{ width: 0 }} whileInView={{ width: `${b.v * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 * i }} />
              <span className="half" title="50%" />
            </span>
            <b>{Math.round(b.v * 100)}%</b>
          </li>
        ))}
      </ul>
      {chs.length > 0 && (
        <>
          <h3 className="sub-title">유튜버 {chs.length}명 사이 내 자리</h3>
          <div className="strip" role="img" aria-label={`유튜버 ${chs.length}명 중 ${below}명보다 적중률이 높아요`}>
            <span className="strip-axis" />
            {chs.map((c, i) => (
              <motion.i
                key={i}
                className="strip-dot"
                style={{ left: `${c.hit * 100}%`, width: 6 + Math.min(c.n / 120, 10), height: 6 + Math.min(c.n / 120, 10) }}
                initial={{ opacity: 0, y: -12 }}
                whileInView={{ opacity: 0.55, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.02 * i }}
              />
            ))}
            <motion.span className="strip-me" style={{ left: `${me * 100}%` }} initial={{ y: -30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.8, type: "spring", stiffness: 300, damping: 14 }}>
              나
            </motion.span>
            <span className="strip-tick l" style={{ left: "0%" }}>0%</span>
            <span className="strip-tick" style={{ left: "50%" }}>50%</span>
            <span className="strip-tick r" style={{ left: "100%" }}>100%</span>
          </div>
          <p className="finding small">
            방향 예측 30번 넘는 유튜버 {chs.length}명 중 <b>{below}명</b>보다 높아요. 유튜버 중 적중률 1등은 {Math.round(chs[0].hit * 100)}%, 꼴찌는 {Math.round(chs[chs.length - 1].hit * 100)}%예요.
          </p>
          <p className="fineprint">점 크기는 예측 횟수. 내 기록은 10번뿐이라 운이 크게 섞여 있어요.</p>
        </>
      )}
    </section>
  );
}

const GRADE_LINE: Record<Grade["g"], string> = {
  S: "미래에서 오셨죠?! 🔮 왕관 드릴게요",
  A: "촉이 장난 아니에요 😎",
  B: "동전 던지기보단 확실히 나아요 👍",
  C: "시장은 원래 어려워요. 한 판 더? 💪",
  D: "반대로 하면 S등급… 농담이에요 🫂",
};
