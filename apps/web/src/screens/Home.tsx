import { motion } from "motion/react";
import { CountUp, ErrorState, Marquee, Skeleton, TopBar } from "../components/ui";
import { pct } from "../lib/format";
import { Buddy } from "../components/Buddy";
import { BadgeShelf, LevelCard } from "../components/Cheers";
import { homeLine } from "../lib/lines";
import { levelOf, loadProgress } from "../lib/progress";
import { useState } from "react";
import { NickSheet } from "../components/NickSheet";
import { KEYS, read, write } from "../lib/storage";
import type { Mode } from "../lib/types";
import { todayKst } from "../lib/format";
import type { Meta } from "../lib/types";
import { api, loadMeta, useAsync } from "../lib/api";
import { go } from "../lib/router";
import { forgetGame, lastGameId, savedGameId } from "../lib/store";

const ROUNDS = 10;
const OPEN_LIMIT = 3;

const STEPS = [
  { icon: "🕶️", title: "이름을 가린 실제 상황", text: "회사 이름과 날짜를 가린, 실제로 있었던 순간이 나와요." },
  { icon: "🃏", title: `6장 중 ${OPEN_LIMIT}장만`, text: "차트·공시·재무·뉴스·유튜버·AI 중 무엇을 볼지 고르는 것도 실력이에요." },
  { icon: "⚖️", title: "살지, 공매도할지", text: "공매도 · 0 · 30 · 70 · 100% 중 하나. 중간에 속보가 터지기도 해요." },
  { icon: "🎬", title: "20일 리플레이", text: "주가가 하루씩 움직여요. 언제든 '지금 팔기'로 익절·손절, 끝나면 유튜버·AI와 비교." },
];

const nf = (n: number) => Math.round(n).toLocaleString("ko-KR");

export default function Home() {
  const state = useAsync(loadMeta, []);
  const meta = state.status === "ready" ? state.data : null;
  const savedId = savedGameId();
  const saved = useAsync(() => (savedId ? api.game(savedId) : Promise.resolve(null)), [savedId]);
  const progress = saved.status === "ready" && saved.data && !saved.data.done ? saved.data.round : null;
  const finished = !!lastGameId();
  const [prog] = useState(loadProgress);
  const [line] = useState(() => homeLine(levelOf(prog.xp).level, prog.games));

  const [sheet, setSheet] = useState<Mode | null>(null);
  const today = todayKst();
  const dailyDone = !!read<boolean>(`fs:daily:${today}`);
  const start = () => {
    const mode = sheet ?? "free";
    setSheet(null);
    write(KEYS.mode, mode);
    if (mode === "daily") write(`fs:daily:${today}`, true);
    forgetGame();
    go("/play");
  };

  return (
    <>
      <TopBar route="/" />
      <main className="page home">
        <section className="hero">
          <div className="hero-copy">
            <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              실제 데이터로 겨루는 투자 판단 게임
            </motion.p>
            <motion.h1 className="brand-title" initial={{ opacity: 0, y: 16, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.05, duration: 0.6 }}>
              Foresight
            </motion.h1>
            <motion.p className="tagline" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              지나고 보면 다 쉬워 보여요.
              <br />
              <b>그때로 돌아가면, 맞힐 수 있을까요?</b>
            </motion.p>
            <motion.p className="lead" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
              같은 정보를 보고 <b>나, 유튜버, AI</b> 중 누가 더 잘 맞힐까?
            </motion.p>

            <motion.div className="cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              {state.status === "error" ? null : progress !== null ? (
                <button className="btn primary lg" onClick={() => go("/play")}>
                  이어하기 · {progress + 1}/{ROUNDS} 라운드
                </button>
              ) : null}
              {finished && (
                <button className="link" onClick={() => go("/report")}>
                  지난 결과 보기 →
                </button>
              )}
              <button className="link" onClick={() => go("/live")}>
                🏆 실시간 랭킹 →
              </button>
            </motion.div>
            {state.status !== "error" && (
              <motion.div className="modes" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
                <button className="mode-btn daily" disabled={!meta} onClick={() => setSheet("daily")}>
                  <span className="ic">🗓️</span>
                  <span>
                    <b>
                      오늘의 챌린지
                      {dailyDone && <span className="badge-done">오늘 참여함</span>}
                    </b>
                    <small>{dailyDone ? "다시 할 수 있지만 순위는 첫 판만" : "오늘은 모두 같은 10문제 · 공정한 랭킹"}</small>
                  </span>
                  <span className="go">→</span>
                </button>
                <button className="mode-btn" disabled={!meta} onClick={() => setSheet("free")}>
                  <span className="ic">🎲</span>
                  <span>
                    <b>자유 연습</b>
                    <small>{meta ? `${nf(meta.summary.cases)}문제 중 무작위 10개` : state.status === "loading" && state.slow ? "서버를 깨우는 중…" : "불러오는 중…"}</small>
                  </span>
                  <span className="go">→</span>
                </button>
              </motion.div>
            )}
            <p className="fineprint">
              {ROUNDS}라운드 · 3~5분 · 가상 자금 1,000만 원 · 로그인은 선택(하면 기록이 계정에 남아요)
            </p>
          </div>
          <HeroArt line={line} />
        </section>

        {meta?.summary.hindsight && <Ticker meta={meta} />}

        {state.status === "error" ? (
          <ErrorState title={state.error.message} detail="서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." onRetry={state.retry} />
        ) : (
          <section className="numbers" aria-busy={!meta}>
            {[
              { k: "실제 사례", v: meta?.summary.cases, unit: "개", note: `후보 ${meta ? nf(meta.summary.candidates) : "…"}개 중 선별` },
              { k: "분석한 유튜브 영상", v: meta?.summary.source.videos, unit: "편", note: `채널 ${meta?.summary.source.channels ?? "…"}개` },
              { k: "공시 · 뉴스", v: meta ? meta.summary.source.disclosures + meta.enrich.news : undefined, unit: "건", note: "DART · Google 뉴스" },
              { k: "유튜버 적중률", v: meta ? meta.summary.youtubeHitRate * 100 : undefined, unit: "%", note: meta?.ai.hitRate != null ? `AI는 ${Math.round(meta.ai.hitRate * 100)}%` : "이 게임 문제 기준" },
            ].map((n, i) => (
              <motion.div key={n.k} className="num" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <small>{n.k}</small>
                {n.v === undefined ? (
                  <Skeleton w="70%" h={34} />
                ) : (
                  <b>
                    <CountUp to={n.v} format={nf} duration={1.4} />
                    <span className="unit">{n.unit}</span>
                  </b>
                )}
                <span className="note">{n.note}</span>
              </motion.div>
            ))}
          </section>
        )}

        <section className="record">
          <h2 className="section-title">내 기록</h2>
          <div className="record-grid">
            <LevelCard p={prog} />
            <BadgeShelf p={prog} />
          </div>
          {prog.rounds === 0 && <p className="muted small">아직 기록이 없어요. 한 판 하면 경험치와 배지가 쌓여요. 이 기기에만 저장돼요.</p>}
        </section>

        <section className="steps">
          <h2 className="section-title">이렇게 해요</h2>
          <ol>
            {STEPS.map((s, i) => (
              <motion.li key={s.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.08 }}>
                <span className="step-no">{i + 1}</span>
                <span className="step-icon" aria-hidden>
                  {s.icon}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        <section className="why">
          <h2 className="section-title">hindsight → foresight</h2>
          <p>
            <b>hindsight</b>는 유튜버가 종목을 말한 뒤 실제 주가가 어떻게 됐는지 모아 온 서비스예요. 지나고 보면 정답은 늘 뻔해 보이죠.
          </p>
          <p>
            <b>Foresight</b>는 그 기록을 거꾸로 써요. 결과를 가리고 그 시점으로 돌아가서, 내 판단이 유튜버·AI보다 나은지 안전하게 확인하는 연습장이에요.
          </p>
          <button className="link" onClick={() => go("/data")}>
            데이터 출처와 분석 보기 →
          </button>
          <button className="link" onClick={() => go("/team")}>
            팀 페이지(발표) 보기 →
          </button>
        </section>
        <p className="disclaimer">학습용 시뮬레이션이며 투자 권유가 아닙니다.</p>
      </main>
      <NickSheet open={sheet !== null} onClose={() => setSheet(null)} onStart={start} />
    </>
  );
}

/** hindsight 실제 기록이 흐르는 전광판 */
function Ticker({ meta }: { meta: Meta }) {
  const h = meta.summary.hindsight!;
  const good = h.channels.filter((c) => c.hit > 0.5).length;
  const items = [
    <>📺 유튜버가 <b>‘오른다’</b>고 한 {nf(h.bull.n)}번 → 20거래일 뒤 평균 <b className={h.bull.avg >= 0 ? "up" : "down"}>{pct(h.bull.avg)}</b></>,
    <>🎯 ‘오른다’가 맞은 비율 <b>{Math.round(h.bull.hit * 100)}%</b></>,
    <>🐻 ‘내린다’ {nf(h.bear.n)}번 → 맞은 비율 <b>{Math.round(h.bear.hit * 100)}%</b></>,
    <>🧑‍💼 기록 30번 넘는 유튜버 {h.channels.length}명 중 적중률 50% 넘는 사람 <b>{good}명</b></>,
    <>🗂️ hindsight 언급 뒤 수익률 기록 <b>{nf(h.eventReturns)}건</b></>,
    <>🧩 그중 문제로 쓸 수 있는 순간 {nf(meta.summary.candidates)}개 → <b>{meta.summary.cases}문제</b></>,
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
      <Marquee items={items} speed={46} className="home-ticker" />
    </motion.div>
  );
}

/** 떠 있는 카드 세 장 + 그려지는 차트 */
function HeroArt({ line }: { line: string }) {
  const d = "M10,110 L40,96 L62,102 L88,70 L112,78 L136,52 L160,60 L186,30";
  const future = "M186,30 L206,48 L224,40 L246,88";
  return (
    <div className="hero-art" aria-hidden>
      <motion.div className="float c1" animate={{ y: [0, -8, 0], rotate: [-8, -6, -8] }} transition={{ duration: 5, repeat: Infinity }}>
        <span>📑</span>최근 공시
      </motion.div>
      <motion.div className="float c2" animate={{ y: [0, -10, 0], rotate: [7, 9, 7] }} transition={{ duration: 6, repeat: Infinity, delay: 0.4 }}>
        <span>📺</span>유튜버 의견
      </motion.div>
      <motion.div className="float main" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: "spring" }}>
        <div className="main-top">
          <span className="masked">A사</span>
          <span className="up">▲ 59%</span>
        </div>
        <svg viewBox="0 0 260 130">
          <motion.path d={d} className="art-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: 0.5 }} />
          <motion.path
            d={future}
            className="art-future"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 1, 0], opacity: [1, 1, 1, 0] }}
            transition={{ duration: 4, delay: 2.2, repeat: Infinity, repeatDelay: 1, times: [0, 0.4, 0.85, 1] }}
          />
          <line x1="186" x2="186" y1="0" y2="130" className="art-today" />
          <text x="190" y="124" className="art-label">
            오늘
          </text>
        </svg>
        <div className="main-q">살까, 말까?</div>
      </motion.div>
      <motion.div className="hero-owl" initial={{ opacity: 0, y: 30, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 14 }}>
        <Buddy mood="idle" size={92} text={line} side="top" />
      </motion.div>
    </div>
  );
}
