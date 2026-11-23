// 홈(#/): 내 방(3D) + 한 문장 + 시작. 처음 온 사람은 버튼 하나(연습 시즌)만 보인다(점진적 공개).
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Ant, CHAR_META, type CharId } from "../components/Characters";
import { RoomView } from "../components/Scene";
import { Delta, Sheet, TopBar, toast } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { todayKst, won } from "../lib/format";
import { ALL_TITLES, charUnlocked, progress, save, unlocked } from "../lib/progress";
import { nextFurniture, unlockedFurniture } from "../lib/room";
import { go } from "../lib/router";
import { sfx } from "../lib/sfx";
import { KEYS, read, write } from "../lib/storage";
import type { Market, Mode, RunOut } from "../lib/types";

const MK: Record<Market, string> = { KRX: "🇰🇷 국내 주식", US: "🇺🇸 미국 주식", CRYPTO: "🪙 코인" };
const CHARS = Object.keys(CHAR_META) as CharId[];

export default function Home() {
  const [p, setP] = useState(progress);
  const open = unlocked(p);
  const runId = read<string>(KEYS.run);
  const [cont, setCont] = useState<RunOut | null>(null);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [pick, setPick] = useState<Mode | null>(null);
  const board = useAsync(() => api.board(), []);
  const first = !p.practiced && p.runs === 0;
  const playedToday = p.dailyDone === todayKst();
  const char = (charUnlocked(p.char, p) ? p.char : "office") as CharId;
  const items = unlockedFurniture(p.stars);
  const nf = nextFurniture(p.stars);

  useEffect(() => {
    if (!runId) return;
    api
      .run(runId)
      .then((r) => (r.view.done ? write(KEYS.run, null) : setCont(r)))
      .catch(() => write(KEYS.run, null));
  }, [runId]);

  const start = async (mode: Mode, c: CharId = char) => {
    setBusy(mode);
    sfx("confirm");
    try {
      const r = await api.newRun(mode, mode === "free" ? open : undefined, read<string>(KEYS.nick), mode === "practice" ? "office" : c);
      write(KEYS.run, r.id);
      write(KEYS.orders, null);
      go("/play");
    } catch (e) {
      toast((e as Error).message, { tone: "warn" });
    } finally {
      setBusy(null);
    }
  };

  const got = Object.keys(p.titles).length;

  return (
    <>
      <TopBar route="/" />
      <main className="page home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">실제 과거 시장 · 주 단위 투자 시뮬레이션</p>
            <h1>
              그때로 돌아가면
              <br />
              <span className="grad">부자 될 수 있을까?</span>
            </h1>
            <p className="lead">1,000만 원과 폰 하나 들고, 진짜 있었던 시장의 반년으로 떨어졌다. 유튜버보다, 코스피보다 더 벌 수 있을까?</p>
            <div className="cta">
              {cont && (
                <button className="btn primary block" onClick={() => go("/play")}>
                  이어하기 · {cont.view.t + 1}/{cont.view.season}주 <Delta x={cont.view.twr - 1} />
                </button>
              )}
              {first && !cont ? (
                <>
                  <motion.button className="btn primary block glow" onClick={() => start("practice")} disabled={!!busy} whileTap={{ scale: 0.97 }}>
                    {busy === "practice" ? "시장을 여는 중…" : "첫 출근하기 🐜 (3분)"}
                  </motion.button>
                  <p className="muted small center">연습 시즌: 8주 · 국내 6종목. 감을 잡고 나면 진짜 시즌이 열려요.</p>
                  <button className="link center" onClick={() => setPick("daily")}>
                    연습 건너뛰고 오늘의 시드 도전 →
                  </button>
                </>
              ) : (
                <>
                  <button className={`btn ${cont ? "ghost" : "primary"} block`} onClick={() => setPick("daily")} disabled={!!busy}>
                    {playedToday ? "오늘의 시드 다시 하기(순위엔 첫 판만)" : `🗓️ 오늘의 시드 도전 · 12주(5분)${p.streak ? ` · 🔥${p.streak}일 연속` : ""}`}
                  </button>
                  <button className="btn ghost block" onClick={() => setPick("free")} disabled={!!busy}>
                    🎲 자유 플레이 · 26주 (무작위 시장)
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="hero-room">
            <RoomView char={char} items={items} mood="happy" height={320} outfit={p.outfit} />
            <button className="room-cap" onClick={() => go("/room")} data-ux="Progress · Collection">
              <span>⭐ {p.stars}</span>
              <span className="muted small">{nf ? `${nf.stars - p.stars}개 더 모으면 ${nf.icon} ${nf.name}` : "모든 가구를 모았어요!"}</span>
              <span className="link">내 방 →</span>
            </button>
          </div>
        </section>

        <section className="how" aria-labelledby="how">
          <h2 id="how" className="sec-title">
            한 판은 이렇게
          </h2>
          <ol className="steps" data-ux="Stepper · Onboarding">
            <li>
              <span className="st-ic">📱</span>
              <b>월요일 아침 피드</b>
              <span>지난주 유튜브에서 뭐가 떴는지 봐요. 종목 이름은 비밀!</span>
            </li>
            <li>
              <span className="st-ic">🛒</span>
              <b>사고팔고, 물어보고</b>
              <span>최대 5종목까지. 궁금하면 🐳 범고래 박사한테 물어봐요.</span>
            </li>
            <li>
              <span className="st-ic">▶</span>
              <b>다음 주</b>
              <span>그 주 진짜 가격으로 결과가 나와요. 멘탈도 같이 출렁!</span>
            </li>
            <li>
              <span className="st-ic">🏁</span>
              <b>결산 · 별 모으기</b>
              <span>유튜버랑 순위를 겨루고, 모은 별로 내 방을 꾸며요.</span>
            </li>
          </ol>
        </section>

        <div className="home-grid">
          <section className="card" aria-labelledby="dex">
            <h2 id="dex" className="sec-title">
              🏅 내 칭호 {got}/{ALL_TITLES.length}
            </h2>
            <TitleDex owned={p.titles} />
            <p className="muted small">{p.runs ? `완주 ${p.runs}판 · 최고 등급 ${p.best}` : "판을 끝내면 투자 습관에 맞는 칭호가 붙어요."}</p>
          </section>

          <section className="card" aria-labelledby="mk">
            <h2 id="mk" className="sec-title">
              🗺️ 갈 수 있는 시장
            </h2>
            <ul className="unlocks">
              {(["KRX", "US", "CRYPTO"] as Market[]).map((m) => (
                <li key={m} className={open.includes(m) ? "on" : ""}>
                  <span>{MK[m]}</span>
                  <span className="muted small">{open.includes(m) ? "✅" : m === "US" ? "🔒 한 판 끝내면" : "🔒 B 등급 받으면"}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">오늘의 시드는 다 같이 하는 판이라 세 시장이 모두 열려 있어요.</p>
          </section>

          <section className="card" aria-labelledby="today">
            <h2 id="today" className="sec-title">
              🏆 오늘의 1등
            </h2>
            {board.status === "loading" && <p className="muted small">불러오는 중…</p>}
            {board.status === "error" && <p className="muted small">순위를 못 불러왔어요.</p>}
            {board.status === "ready" &&
              (board.data.rows.length === 0 ? (
                <p className="empty">아직 오늘 완주한 사람이 없어요. 1등 자리가 비어 있어요!</p>
              ) : (
                <ol className="mini-board">
                  {board.data.rows.slice(0, 3).map((r) => (
                    <li key={r.rank}>
                      <span>{["🥇", "🥈", "🥉"][r.rank - 1]}</span>
                      <Ant char={(r.char ?? "office") as CharId} size={26} />
                      <b>{r.nickname}</b>
                      <Delta x={r.ret} />
                    </li>
                  ))}
                </ol>
              ))}
            <a href="#/rank" className="link">
              전체 순위 →
            </a>
          </section>
        </div>

        <p className="disclaimer">
          과거 데이터로 만든 학습용 시뮬레이션이에요. 투자 권유가 아니며, 실제 종목명은 판이 끝난 뒤에만 공개해요.
          <br />
          데이터: hindsight(유튜브 51개 채널 언급 · 국내·미국 주가 · 업비트 코인 시세) · AI: Gemini · 저장: Supabase
        </p>
      </main>

      {/* 내 개미 고르기(킥루의 선수 고르기) */}
      <Sheet open={!!pick} onClose={() => setPick(null)} title="어떤 개미로 갈까요?" wide>
        <p className="muted small">개미마다 특성이 달라서 전략이 바뀌어요. {pick === "daily" ? "오늘의 시드는 모두 같은 시장에서 12주 · 12종목으로 가볍게 겨뤄요." : "자유 플레이는 시장 구간이 무작위인 26주예요."}</p>
        <ul className="char-grid" data-ux="Card Select · Radio Group">
          {CHARS.map((c) => {
            const m = CHAR_META[c];
            const ok = charUnlocked(c, p);
            return (
              <li key={c}>
                <button
                  className={`char-card ${char === c ? "on" : ""}`}
                  disabled={!ok}
                  aria-pressed={char === c}
                  onClick={() => {
                    save({ char: c });
                    setP(progress());
                    sfx("tick");
                  }}
                >
                  <Ant char={c} mood={char === c ? "happy" : "calm"} size={64} />
                  <b>
                    {m.icon} {m.name}
                  </b>
                  <span className="cc-cash">💵 시작 {won(m.cash)}</span>
                  <span className="muted small">{ok ? m.perk : `🔒 ${m.unlock}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="btn primary block" onClick={() => pick && start(pick, char)} disabled={!!busy}>
          {busy ? "시장을 여는 중…" : `${CHAR_META[char].name}로 시작 ▶`}
        </button>
      </Sheet>

    </>
  );
}


/** 칭호: 마우스를 올리거나 누르면 무슨 칭호인지, 어떻게 받는지 보여 준다(휴대폰에서도) */
function TitleDex({ owned }: { owned: Record<string, number> }) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = ALL_TITLES.find((t) => t.name === sel);
  return (
    <>
      <ul className="dex" role="listbox" aria-label="칭호">
        {ALL_TITLES.map((t) => {
          const has = !!owned[t.name];
          return (
            <li key={t.name}>
              <button
                className={`dex-btn ${has ? "on" : ""} ${sel === t.name ? "sel" : ""}`}
                onMouseEnter={() => setSel(t.name)}
                onFocus={() => setSel(t.name)}
                onClick={() => setSel(sel === t.name ? null : t.name)}
                aria-label={has ? `${t.name}: ${t.desc}` : `아직 없는 칭호: ${t.hint}`}
                aria-selected={sel === t.name}
              >
                {has ? t.icon : "❔"}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="dex-tip" aria-live="polite">
        {cur ? (
          owned[cur.name] ? (
            <>
              <b>
                {cur.icon} {cur.name}
              </b>
              <span>
                {cur.desc} · {owned[cur.name]}번 받음
              </span>
            </>
          ) : (
            <>
              <b>❔ 아직 없는 칭호</b>
              <span>힌트: {cur.hint}</span>
            </>
          )
        ) : (
          <span className="muted">칭호에 마우스를 올리거나 눌러 보세요</span>
        )}
      </div>
    </>
  );
}
