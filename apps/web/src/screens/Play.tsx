import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Deck, Panels } from "../components/Cards";
import Chart from "../components/Chart";
import { BottomBar, Confetti, CountUp, Delta, ErrorState, LoadingPage, Marquee, NameReveal, ProgressDots, Stamp, TopBar, type Dot } from "../components/ui";
import WeightPicker from "../components/WeightPicker";
import { dateDot, pct, won } from "../lib/format";
import { explain, weightText } from "../lib/game";
import { go } from "../lib/router";
import { KEYS, read, write } from "../lib/storage";
import { useGame } from "../lib/store";
import { say } from "../lib/buddy";
import { cardLine, cardsDone, eventLine, revealLine, roundStart, weightLine } from "../lib/lines";
import { awardRound } from "../lib/progress";
import { buzz, sfx } from "../lib/sfx";
import type { CardKey } from "../lib/types";
import type { GameState, Reveal as RevealT, Weight } from "../lib/types";

const fade = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };
type G = ReturnType<typeof useGame>;

export default function Play() {
  const g = useGame();
  const { game, load, toast } = g;

  useEffect(() => {
    if (game?.done) go("/report");
  }, [game?.done]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [game?.round, game?.stage]);

  if (load.status === "loading") return <LoadingPage route="/play" slow={load.slow} />;
  if (load.status === "error" || !game?.current)
    return (
      <>
        <TopBar route="/play" />
        <main className="page">
          <ErrorState
            title={load.status === "error" ? load.error.message : "게임을 불러오지 못했어요"}
            detail="진행 상황은 서버에 저장돼 있어요. 다시 시도하면 이어서 할 수 있어요."
            onRetry={g.actions.retry}
          />
        </main>
      </>
    );

  const t = game.track;
  const reveal = game.stage === "reveal";
  const cashBefore = reveal ? t[t.length - 2].me : t[t.length - 1].me;
  const cashAfter = t[t.length - 1].me;
  // 연속 적중: 정답 공개 화면에선 그림이 끝나기 전까지 이번 라운드를 세지 않는다(스포일러 방지)
  const done = game.history.filter((h) => !(reveal && h.round === game.round)).sort((a, b) => a.round - b.round);
  let streak = 0;
  for (let i = done.length - 1; i >= 0 && done[i].hit; i--) streak++;
  const gain = cashAfter - cashBefore;
  const dots: Dot[] = Array.from({ length: game.rounds }, (_, i) => {
    const h = game.history.find((x) => x.round === i);
    if (h && !(reveal && i === game.round)) return h.hit ? "hit" : "miss";
    return i === game.round ? "now" : "todo";
  });

  return (
    <>
      <TopBar
        route="/play"
        right={
          <button className="link" onClick={() => go("/")}>
            나가기 <small>(저장됨)</small>
          </button>
        }
      />
      <div className="play-status">
        <div className="play-status-inner">
          <span className="round-no">
            <b>{game.round + 1}</b> / {game.rounds}
          </span>
          <ProgressDots dots={dots} />
          <AnimatePresence>
            {streak >= 2 && (
              <motion.span key={streak} className="streak" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                🔥 {streak}연속
              </motion.span>
            )}
          </AnimatePresence>
          <span className="cash" aria-label={`보유 자금 ${won(cashAfter)}`}>
            <CountUp key={`${game.round}-${game.stage}`} from={cashBefore} to={cashAfter} format={won} duration={reveal ? 1.2 : 0} delay={2.2} />
            {reveal && Math.abs(gain) >= 1 && (
              <motion.span
                key={`g-${game.round}`}
                className={`cash-float ${gain > 0 ? "up" : "down"}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: [0, 1, 1, 0], y: [6, -4, -14, -26] }}
                transition={{ delay: 2.2, duration: 1.8, times: [0, 0.15, 0.7, 1] }}
                aria-hidden
              >
                {gain > 0 ? "+" : "−"}
                {won(Math.abs(gain))}
              </motion.span>
            )}
          </span>
        </div>
      </div>
      <motion.div key={`${game.round}-${game.stage}`} {...fade} transition={{ duration: 0.25 }}>
        {game.stage === "pick" && <Pick g={g} game={game} cash={cashAfter} />}
        {game.stage === "replay" && <Replay g={g} game={game} cash={cashAfter} />}
        {game.stage === "event" && <EventStage g={g} game={game} cash={cashAfter} />}
        {reveal && <Reveal g={g} game={game} cash={cashBefore} />}
      </motion.div>
      <AnimatePresence>
        {toast && (
          <motion.div className="snack" role="alert" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Situation({ game }: { game: GameState }) {
  const q = game.current!.question;
  return (
    <section className="casefile">
      <p className="eyebrow">
        {game.mode === "daily" ? "🗓️ 오늘의 챌린지 · " : game.mode === "replay" ? "🗓️ 챌린지 다시 하기(순위 제외) · " : ""}CASE {String(game.round + 1).padStart(2, "0")} · {q.period} · {q.market}
      </p>
      <h1 className="case-title">
        상장사 <span className="masked">A사</span>,
        <br />
        최근 60거래일 <Delta x={q.ret60} digits={0} className="big-delta" />
      </h1>
      <p className="sub">오늘 종가에 산다면, 얼마나 담을까요? 떨어질 것 같으면 공매도도 돼요.</p>
    </section>
  );
}

function Coach({ limit, onClose }: { limit: number; onClose: () => void }) {
  return (
    <motion.div className="coach" role="note" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
      <ol>
        <li>
          카드 6장 중 <b>{limit}장</b>만 골라 열어요. 다 볼 수는 없어요.
        </li>
        <li>
          <b>얼마나 살지</b> 정해요. 내릴 것 같으면 <b>공매도</b>도 돼요.
        </li>
        <li>판단하면 <b>20일이 하루씩 재생</b>돼요. 언제든 <b>💰 지금 팔기</b>로 익절·손절!</li>
      </ol>
      <button className="coach-x" onClick={onClose} aria-label="안내 닫기">
        알겠어요
      </button>
    </motion.div>
  );
}

/** 라운드 시작: 그 시점으로 시간을 되돌리는 짧은 연출(누르면 바로 닫힘) */
function RoundIntro({ game, onDone }: { game: GameState; onDone: () => void }) {
  const q = game.current!.question;
  const year = Number(q.period.slice(0, 4)) || new Date().getFullYear();
  const now = new Date().getFullYear();
  useEffect(() => {
    const id = setTimeout(onDone, 1700);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <motion.div className="intro" onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} role="presentation">
      <motion.div className="intro-inner" initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 1.06 }}>
        <p className="intro-case">CASE {String(game.round + 1).padStart(2, "0")}</p>
        <p className="intro-rw" aria-hidden>
          ⏪
        </p>
        <p className="intro-year">{year < now ? <CountUp from={now} to={year} format={(v) => `${Math.round(v)}년`} duration={0.9} delay={0.15} /> : `${year}년`}</p>
        <p className="intro-period">{q.period}로 돌아가는 중</p>
        <div className="intro-bar">
          <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.5, ease: "easeInOut" }} />
        </div>
        <p className="intro-skip">눌러서 건너뛰기</p>
      </motion.div>
    </motion.div>
  );
}

function Pick({ g, game, cash }: { g: G; game: GameState; cash: number }) {
  const cur = game.current!;
  const [w, setW] = useState<Weight | null>(null);
  const introKey = `fs:intro:${game.gameId}:${game.round}`;
  const [intro, setIntro] = useState(() => {
    try {
      return !sessionStorage.getItem(introKey) && cur.opened.length === 0;
    } catch {
      return false;
    }
  });
  const closeIntro = useCallback(() => {
    setIntro(false);
    try {
      sessionStorage.setItem(introKey, "1");
    } catch {
      /* 저장 못 해도 진행 */
    }
  }, [introKey]);
  const [coach, setCoach] = useState(() => game.round === 0 && !read<boolean>(KEYS.coach));
  const closeCoach = () => {
    setCoach(false);
    write(KEYS.coach, true);
  };
  const deciding = g.busy === "decide";

  // 라운드 시작 인사(되감기 연출이 끝난 뒤)
  useEffect(() => {
    if (intro) return;
    const id = setTimeout(() => say("think", roundStart(game.round, cur.question.ret60), 5200), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, game.round]);

  const open = async (k: CardKey) => {
    sfx("flip");
    const st = await g.actions.open(k);
    if (!st?.current) return;
    // 휴대폰: 방금 연 카드 내용으로 스크롤(아래 고정 비중 패널에 가리지 않게)
    if (window.innerWidth < 980)
      setTimeout(() => document.getElementById(`panel-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 160);
    say("happy", st.current.opened.length >= game.openLimit ? cardsDone() : cardLine(k), 3800);
  };
  const choose = (x: Weight) => {
    setW(x);
    sfx("tick");
    const l = weightLine(x);
    say(l.mood, l.text, 3000);
  };

  return (
    <main className="page play-grid decide-grid">
      <AnimatePresence>{intro && <RoundIntro game={game} onDone={closeIntro} />}</AnimatePresence>
      <div className="play-main">
        <Situation game={game} />
        <AnimatePresence>{coach && <Coach limit={game.openLimit} onClose={closeCoach} />}</AnimatePresence>
        <Deck opened={cur.opened} limit={game.openLimit} busyKey={g.busy} onOpen={open} />
        <Panels
          opened={cur.opened}
          cards={cur.cards}
          ret60={cur.question.ret60}
          ai={{ gameKey: `${game.gameId}:${game.round}`, asked: cur.asked, limit: game.askLimit, ask: g.actions.ask }}
        />
      </div>
      <aside className="play-side">
        <h2 className="side-title">얼마나 살까요?</h2>
        <WeightPicker weights={game.weights} value={w} onChange={choose} cash={cash} disabled={deciding} />
        <BottomBar>
          <button
            className="btn primary block"
            disabled={w === null || deciding}
            onClick={() => {
              if (coach) closeCoach();
              if (w !== null) {
                sfx("confirm");
                g.actions.decide(w);
              }
            }}
          >
            {deciding ? <span className="spinner light" /> : w === null ? "비중을 골라 주세요" : cur.opened.length === 0 ? `정보 없이 ${weightText(w)}` : w < 0 ? `${weightText(w)} 하기` : `${w}% 담기`}
          </button>
        </BottomBar>
        <p className="fineprint center">확정하면 바꿀 수 없어요.</p>
      </aside>
    </main>
  );
}

/** 20거래일 리플레이: 하루씩 주가가 움직이고 내 돈이 실시간으로 변한다. 언제든 '지금 팔기' */
function Replay({ g, game, cash }: { g: G; game: GameState; cash: number }) {
  const cur = game.current!;
  const r = cur.replay!;
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [fast, setFast] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const prev = useRef({ day: r.day, value: r.value, price: r.points[r.points.length - 1].p });
  const w = r.eventDay !== null ? (cur.w2 ?? cur.w1 ?? 0) : (cur.w1 ?? 0);
  const holding = w !== 0;
  const last = r.points[r.points.length - 1];
  const price = last.p / 100 - 1;
  const money = cash * r.value;
  const pnl = money - cash;
  const dayMove = r.day > 0 ? last.p / (r.points[r.points.length - 2]?.p ?? last.p) - 1 : 0;
  const [flash, setFlash] = useState<"" | "up" | "down">("");

  // 자동 진행
  useEffect(() => {
    if (!playing || confirm || g.busy) return;
    // 실패하면(연결 끊김 등) 자동 진행을 멈춰 오류가 반복되지 않게 → '▶ 재생'으로 이어서
    const id = setTimeout(() => g.actions.tick(1).then((st) => !st && setPlaying(false)), r.day === 0 ? 900 : fast ? 380 : 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, confirm, fast, r.day, g.busy]);

  // 하루가 지날 때: 크게 움직이면 번쩍 + 새벽이
  useEffect(() => {
    const p0 = prev.current;
    if (r.day !== p0.day && r.day > 0) {
      const mv = last.p / p0.price - 1;
      const mine = r.value / p0.value - 1;
      if (Math.abs(mv) >= 0.04) {
        setFlash(mine >= 0 ? "up" : "down");
        setTimeout(() => setFlash(""), 450);
        if (holding) {
          sfx(mine >= 0 ? "coin" : "miss");
          say(mine >= 0 ? "happy" : "shock", mine >= 0 ? `하루 만에 ${pct(mv, 1)}! 💸 지금 팔까요, 더 갈까요?` : `으악 하루 ${pct(mv, 1)} 😱 버틸까요?`, 2600);
        } else say("think", `하루 ${pct(mv, 1)}… 구경만 해도 심장이 쫄깃 👀`, 2200);
      }
    }
    prev.current = { day: r.day, value: r.value, price: last.p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.day]);

  const sell = () => {
    if (!confirm) {
      setConfirm(true);
      sfx("tick");
      return;
    }
    sfx(pnl >= 0 ? "coin" : "confirm");
    g.actions.exit();
  };
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(false), 3500);
    return () => clearTimeout(id);
  }, [confirm]);

  const tone = pnl > 0.5 ? "up" : pnl < -0.5 ? "down" : "";
  return (
    <main className="page play-grid decide-grid replay-grid">
      <div className="play-main">
        <section className="replay-head">
          <div className="replay-day">
            <span className="d-label">D+</span>
            <motion.b key={r.day} initial={reduce ? false : { y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              {r.day}
            </motion.b>
            <span className="d-of">/ 20 거래일</span>
          </div>
          <div className="day-track" aria-hidden>
            {Array.from({ length: 20 }, (_, i) => (
              <i key={i} className={`${i < r.day ? "on" : ""} ${r.eventDay === i + 1 ? "ev" : ""}`} />
            ))}
          </div>
        </section>
        <section className={`panel replay-panel flash-${flash}`}>
          <div className="replay-stats">
            <div>
              <small>산 뒤 주가</small>
              <Delta x={price} />
              {r.day > 0 && (
                <span className={`day-move ${dayMove > 0 ? "up" : dayMove < 0 ? "down" : ""}`}>
                  오늘 {dayMove > 0 ? "▲" : dayMove < 0 ? "▼" : "–"} {Math.abs(dayMove * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <div>
              <small>내 돈 · {holding ? weightText(w as Weight) : "관망"}</small>
              <b className="money">
                <CountUp key={r.day} from={cash * prev.current.value} to={money} format={won} duration={0.5} />
              </b>
              <span className={`pnl ${tone}`}>
                {pnl >= 0 ? "+" : "−"}
                {won(Math.abs(pnl))}
              </span>
            </div>
          </div>
          <Chart points={r.points} upTo={r.day} domainEnd={20} eventT={r.eventDay ?? undefined} height={220} drawAfter={{ from: Math.max(r.day - 1, 0), duration: reduce ? 0 : 0.45 }} />
          <p className="legend">회색 칸은 아직 오지 않은 날이에요. 하루씩 열려요.</p>
        </section>
      </div>
      <aside className="play-side">
        <h2 className="side-title">{holding ? (pnl >= 0 ? "익절할까, 더 갈까?" : "손절할까, 버틸까?") : "구경 중이에요"}</h2>
        <div className="replay-ctrl">
          <button className="btn ghost" onClick={() => (setPlaying((x) => !x), sfx("tick"))} aria-label={playing ? "일시정지" : "재생"}>
            {playing ? "⏸ 멈춤" : "▶ 재생"}
          </button>
          <button className={`btn ghost ${fast ? "on" : ""}`} onClick={() => setFast((x) => !x)} aria-pressed={fast}>
            ⏩ 2배
          </button>
          <button className="btn ghost" onClick={() => (sfx("whoosh"), g.actions.tick(20))} disabled={!!g.busy}>
            ⏭ 끝까지
          </button>
        </div>
        <BottomBar>
          {holding ? (
            <motion.button
              className={`btn primary block sell ${confirm ? "confirm" : ""} ${tone}`}
              onClick={sell}
              disabled={r.day < 1 || g.busy === "exit" || (confirm && !!g.busy)}
              animate={confirm ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ repeat: confirm ? Infinity : 0, duration: 0.8 }}
            >
              {r.day < 1 ? "내일부터 팔 수 있어요" : confirm ? `한 번 더 누르면 팔아요 (${pnl >= 0 ? "+" : "−"}${won(Math.abs(pnl))})` : `💰 지금 팔기 · ${pnl >= 0 ? "익절" : "손절"}`}
            </motion.button>
          ) : (
            <button className="btn primary block" onClick={() => g.actions.tick(20)} disabled={!!g.busy}>
              ⏭ 결과 바로 보기
            </button>
          )}
        </BottomBar>
        <p className="fineprint center">팔면 그날 종가로 정리하고 남은 날은 현금이에요. 맞혔는지는 처음 판단으로 봐요.</p>
      </aside>
    </main>
  );
}

function EventStage({ g, game, cash }: { g: G; game: GameState; cash: number }) {
  const cur = game.current!;
  const ev = cur.event!;
  const w1 = cur.w1!;
  const [w2, setW2] = useState<Weight>(w1);
  const pe = ev.points[ev.points.length - 1].p / 100 - 1;
  const now = cash * (cur.replay?.value ?? 1 + (w1 / 100) * pe);
  const verb = w2 === w1 ? `${weightText(w1)} 그대로 두기` : w2 < 0 ? `${weightText(w2)}로 바꾸기` : w2 > w1 ? `${w2}%로 늘리기` : `${w2}%로 줄이기`;
  const busy = g.busy === "adjust";
  useEffect(() => {
    sfx("alarm");
    buzz([80, 60, 80]);
    say("shock", eventLine(ev.type === "shock" ? (ev.change ?? 0) > 0 : false), 4500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page play-grid decide-grid">
      <div className="play-main">
        <motion.div className="flash" aria-hidden initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} />
        <motion.div
          className="breaking"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
          transition={{ type: "spring", stiffness: 300, damping: 14, x: { delay: 0.2, duration: 0.45 } }}
        >
          <span className="breaking-badge">⚡ 속보</span>
          <span>산 지 {ev.t}거래일 뒤</span>
        </motion.div>
        <Marquee className="breaking-tape" speed={18} items={Array.from({ length: 4 }, (_, i) => <span key={i}>⚡ 속보 · {ev.title}</span>)} />
        <motion.section className="panel event" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}>
          <span className="chip strong">{ev.type === "disclosure" ? `공시 · ${ev.kind}` : "주가 급변"}</span>
          <p className="event-title">{ev.title}</p>
          {ev.facts.length > 0 && (
            <dl className="facts-dl big">
              {ev.facts.slice(0, 5).map((f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="event-hint">
            {ev.type === "disclosure" ? "회사가 실제로 낸 공시예요(DART 원문 핵심)." : "실제로 있었던 하루 등락이에요."} 사건일 종가에 비중을 바꿀 수 있어요.
          </p>
        </motion.section>
        <motion.section className="panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="stats">
            <div>
              <small>산 뒤 주가</small>
              <Delta x={pe} />
            </div>
            <div>
              <small>내 {weightText(w1)} 평가액</small>
              <b>{won(now)}</b>
            </div>
          </div>
          <Chart points={ev.points} upTo={ev.t} domainEnd={20} eventT={ev.t} height={200} drawAfter={{ from: 0, duration: 1.1, delay: 0.5 }} />
          <p className="legend">남은 {20 - ev.t}거래일은 아직 가려져 있어요. 비중을 정하면 리플레이가 이어져요.</p>
        </motion.section>
      </div>
      <aside className="play-side">
        <h2 className="side-title">비중을 바꿀까요?</h2>
        <WeightPicker weights={game.weights} value={w2} onChange={(x) => (setW2(x), sfx("tick"))} cash={now} current={w1} disabled={busy} />
        <BottomBar>
          <button className="btn primary block" disabled={busy} onClick={() => (sfx("confirm"), g.actions.adjust(w2))}>
            {busy ? <span className="spinner light" /> : `${verb} → 리플레이 계속`}
          </button>
        </BottomBar>
        {w1 !== 0 && (
          <button className="link center-link" onClick={() => g.actions.exit()} disabled={!!g.busy}>
            💰 여기서 다 팔고 끝내기
          </button>
        )}
      </aside>
    </main>
  );
}

function Reveal({ g, game, cash }: { g: G; game: GameState; cash: number }) {
  const cur = game.current!;
  const rv = cur.reveal as RevealT;
  const w1 = cur.w1!;
  const w2 = cur.w2 ?? w1;
  const reduce = useReducedMotion();
  const [fast, setFast] = useState(!!reduce);
  const D = fast ? 0 : 1.2; // 리플레이로 이미 봤으니 짧게
  const [shown, setShown] = useState(fast);
  useEffect(() => {
    if (fast) {
      setShown(true);
      return;
    }
    const id = setTimeout(() => setShown(true), D * 1000 + 200);
    return () => clearTimeout(id);
  }, [fast, D]);

  const a = rv.answer;
  const last = game.round === game.rounds - 1;
  const facts = explain(rv, w1, w2);
  const rows = [
    { who: "나", how: `${w1 === w2 ? weightText(w1) : `${weightText(w1)} → ${weightText(w2)}`}${rv.exitDay && rv.exitDay < 20 ? ` · D+${rv.exitDay} 매도` : ""}`, r: rv.mine, me: true },
    { who: "📺 유튜버 말대로", how: rv.youtube.verdict === "bull" ? "오른다 → 100%" : "내린다 → 0%", r: rv.youtuberRet },
    ...(rv.ai ? [{ who: "🤖 AI", how: weightText(rv.ai.weight), r: rv.ai.ret ?? 0 }] : []),
    { who: "🏛️ 코스피", how: "지수 100%", r: rv.kospiRet },
  ];
  const best = Math.max(...rows.map((r) => r.r));
  const scale = Math.max(...rows.map((r) => Math.abs(r.r)), 0.01);
  const busy = g.busy === "next";
  const hs = game.history.slice().sort((a, b) => a.round - b.round);
  let streakNow = 0;
  for (let i = hs.length - 1; i >= 0 && hs[i].hit; i--) streakNow++;

  // 정답이 드러나는 순간: 소리·진동·새벽이 반응·경험치
  useEffect(() => {
    if (!shown) return;
    sfx(rv.hit ? "hit" : "miss");
    buzz(rv.hit ? [40, 40, 40] : 200);
    const l = revealLine(rv.hit, rv.mine, streakNow);
    say(l.mood, l.text, 5000);
    awardRound(game); // 같은 라운드는 한 번만 보상(새로고침해도 안전)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <main className="page play-grid reveal-grid">
      <div className="play-main">
        <section className="reveal-head">
          <div className="reveal-top">
            <p className="eyebrow">{shown ? "정답 공개" : "20거래일이 지나는 중…"}</p>
            {!shown && (
              <button className="link" onClick={() => setFast(true)}>
                건너뛰기
              </button>
            )}
          </div>
          <h1 className="reveal-name">
            {shown ? <NameReveal name={a.name} /> : <span className="masked">A사</span>}
            {shown && <small>{a.symbol}</small>}
          </h1>
          <p className="muted">{shown ? `${dateDot(a.t0)} 종가에 샀다면, 20거래일 뒤` : "산 날 이후 주가가 그려지고 있어요"}</p>
          <p className={`big ${a.r20 > 0 ? "up" : a.r20 < 0 ? "down" : ""}`}>
            <CountUp key={String(fast)} to={a.r20} format={(v) => `${v > 0 ? "▲ +" : v < 0 ? "▼ −" : ""}${Math.abs(v * 100).toFixed(1)}%`} duration={D || 0.01} />
          </p>
        </section>
        <section className="panel chart-panel">
          <Chart key={String(fast)} points={rv.chart} upTo={20} domainEnd={20} eventT={rv.event?.t} exitT={rv.exitDay} height={240} drawAfter={{ from: 0, duration: D, delay: 0.1 }} />
          <p className="legend">
            <span className="key price" /> 산 날까지 <span className={`key ${a.r20 >= 0 ? "after-up" : "after-down"}`} /> 산 뒤 20거래일 <span className="key bench" /> 코스피
            {rv.event && (
              <>
                {" "}
                <span className="key event" /> 사건
              </>
            )}
          </p>
        </section>
        {shown && rv.newsAfter.length > 0 && (
          <motion.section className="panel news-after" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <h3 className="panel-title">📰 그 뒤 뉴스</h3>
            <ul className="news">
              {rv.newsAfter.map((n, i) => (
                <li key={i}>
                  <span className="when">{dateDot(n.at.slice(5, 10))}</span>
                  <div>
                    <p className="news-title">{n.title}</p>
                    <span className="meta">{n.source}</span>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </div>

      <aside className="play-side">
        {!shown && (
          <div className="reveal-wait" aria-hidden>
            <span className="spinner" /> 결과를 맞춰 보는 중
          </div>
        )}
        <AnimatePresence>
          {shown && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="reveal-side">
              <Confetti fire={rv.hit && rv.mine > 0} />
              {!rv.hit && rv.mine < -0.05 && <Rain />}
              <div className={`verdict ${rv.hit ? "hit" : "miss"}`} role="status">
                <Stamp tone={rv.hit ? "hit" : "miss"}>{rv.hit ? "적중" : "빗나감"}</Stamp>
                <div className="verdict-text">
                  <motion.b initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
                    {rv.hit ? (streakNow >= 2 ? `🔥 ${streakNow}연속 적중!` : "🎯 판단 적중") : "🫠 이번엔 빗나갔어요"}
                  </motion.b>
                  <small>
                    이번 라운드 <b className={rv.mine > 0 ? "up" : rv.mine < 0 ? "down" : ""}>{won(cash * rv.mine)}</b>
                  </small>
                </div>
              </div>

              <section className="panel">
                <h3 className="panel-title">누가 더 잘했나</h3>
                <ul className="versus">
                  {rows.map((r, i) => (
                    <motion.li key={r.who} className={r.me ? "me" : ""} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * i }}>
                      <span className="who">
                        {r.who}
                        {r.r === best && <span aria-label="1등"> 👑</span>}
                      </span>
                      <span className="how">{r.how}</span>
                      <span className="vbar">
                        <motion.i
                          className={r.r >= 0 ? "pos" : "neg"}
                          initial={{ width: 0 }}
                          animate={{ width: `${(Math.abs(r.r) / scale) * 50}%` }}
                          transition={{ delay: 0.2 + 0.12 * i, duration: 0.6 }}
                        />
                      </span>
                      <Delta x={r.r} />
                    </motion.li>
                  ))}
                  {!rv.ai && (
                    <li className="soon">
                      <span className="who">🤖 AI</span>
                      <span className="how">이 문제는 AI 판단이 아직 없어요</span>
                    </li>
                  )}
                </ul>
              </section>

              <CrowdPanel rv={rv} mine={w1} weights={game.weights} />

              {rv.ai && (
                <section className="panel">
                  <h3 className="panel-title">🤖 AI는 왜 {weightText(rv.ai.weight)}였나</h3>
                  <ul className="facts">
                    {rv.ai.reasons.map((r, i) => (
                      <li key={i}>
                        <span className="src-tag">{r.cite}</span>
                        <p>{r.text}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="fineprint">
                    확신도 {Math.round(rv.ai.confidence * 100)}% · 같은 시점 자료만 보고 미리 판단 · {rv.ai.model}
                  </p>
                </section>
              )}

              <section className="panel">
                <h3 className="panel-title">무슨 일이 있었나</h3>
                <ul className="facts">
                  {rv.exitDay !== undefined && rv.exitDay < 20 && rv.holdRet !== undefined && (
                    <li>
                      <span aria-hidden>💰</span>
                      <p>
                        D+{rv.exitDay}에 팔았어요({pct(rv.mine)}). 끝까지 그대로 들고 있었다면 {pct(rv.holdRet)}.{" "}
                        {rv.mine > rv.holdRet ? <b className="up">판 덕분에 {Math.abs((rv.mine - rv.holdRet) * 100).toFixed(1)}%p 더 벌었어요 👏</b> : <b className="down">조금 일찍 팔았어요 😅</b>}
                      </p>
                    </li>
                  )}
                  {facts.map((f, i) => (
                    <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + 0.1 * i }}>
                      <span aria-hidden>{f.icon}</span>
                      <p>{f.text}</p>
                    </motion.li>
                  ))}
                </ul>
                {a.after.length > 0 && (
                  <>
                    <h4 className="sub-title">그 사이 나온 공시</h4>
                    <ul className="timeline">
                      {a.after.map((d, i) => (
                        <li key={i}>
                          <span className="when">{dateDot(d.date.slice(5))}</span>
                          <span className="chip strong">{d.kind}</span>
                          <span className="tl-title">{d.title}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="fineprint">해설은 실제 주가·공시 값으로 규칙에 따라 만든 문장이에요.</p>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
        <BottomBar>
          <button className="btn primary block" disabled={!shown || busy} onClick={() => g.actions.next()}>
            {busy ? <span className="spinner light" /> : last ? "결과 리포트 보기" : "다음 라운드 →"}
          </button>
        </BottomBar>
      </aside>
    </main>
  );
}

function CrowdPanel({ rv, mine, weights }: { rv: RevealT; mine: Weight; weights: Weight[] }) {
  const c = rv.crowd;
  const total = c.n + 1; // 나 포함
  return (
    <section className="panel">
      <h3 className="panel-title">👥 다른 사람들은</h3>
      {c.n === 0 ? (
        <p className="muted small">이 문제를 처음 푼 사람이에요. 다음 사람부터 내 판단이 비교에 들어가요.</p>
      ) : (
        <>
          <div className="crowd-bar" role="img" aria-label="다른 사람들의 선택 분포">
            {weights.map((w) => {
              const n = (c.dist[String(w)] ?? 0) + (w === mine ? 1 : 0);
              if (!n) return null;
              return (
                <motion.span
                  key={w}
                  className={`seg w${w < 0 ? "s" : w} ${w === mine ? "mine" : ""}`}
                  initial={{ flexGrow: 0 }}
                  animate={{ flexGrow: n }}
                  transition={{ duration: 0.6 }}
                  title={`${weightText(w)}: ${n}명`}
                >
                  {n / total >= 0.12 ? weightText(w) : ""}
                </motion.span>
              );
            })}
          </div>
          <p className="muted small">
            나 포함 {total}명 · 다른 사람들 적중률 <b>{Math.round((c.hitRate ?? 0) * 100)}%</b> · 평균 수익 <Delta x={c.avgRet ?? 0} />
          </p>
        </>
      )}
    </section>
  );
}

/** 크게 잃은 라운드에 잠깐 내리는 파란 비 */
function Rain() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="rain" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => (
        <motion.i
          key={i}
          style={{ left: `${(i * 37) % 100}%` }}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 260, opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.9 + (i % 5) * 0.12, delay: (i % 7) * 0.08, repeat: 1 }}
        />
      ))}
    </div>
  );
}
