// 홈(#/): 내 방(3D) + 한 문장 + 시작. 처음 온 사람은 버튼 하나(연습 시즌)만 보인다(점진적 공개).
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Ant, CHAR_META, type CharId } from "../components/Characters";
import { RoomView } from "../components/Scene";
import { Delta, Sheet, TopBar, toast } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { todayKst } from "../lib/format";
import { ALL_TITLES, charUnlocked, progress, save, unlocked } from "../lib/progress";
import { FURNITURE, OUTFITS, nextFurniture, unlockedFurniture } from "../lib/room";
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
  const [room, setRoom] = useState(false);
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
            <p className="eyebrow">실제 과거 시장 · 26주 투자 시뮬레이션</p>
            <h1>
              그때로 돌아가면
              <br />
              <span className="grad">부자 될 수 있을까?</span>
            </h1>
            <p className="lead">1,000만 원과 폰 하나 들고 진짜 있었던 시장의 반년으로 떨어졌어요. 유튜버 라이벌보다, 코스피보다 많이 벌어 보세요.</p>
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
                    {playedToday ? "오늘의 시드 다시 하기(순위엔 첫 판만)" : `🗓️ 오늘의 시드 도전${p.streak ? ` · 🔥${p.streak}일 연속` : ""}`}
                  </button>
                  <button className="btn ghost block" onClick={() => setPick("free")} disabled={!!busy}>
                    🎲 자유 플레이 (무작위 시장)
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="hero-room">
            <RoomView char={char} items={items} mood="happy" height={320} outfit={p.outfit} />
            <button className="room-cap" onClick={() => setRoom(true)} data-ux="Progress · Collection">
              <span>⭐ {p.stars}</span>
              <span className="muted small">{nf ? `${nf.stars - p.stars}개 더 모으면 ${nf.icon} ${nf.name}` : "모든 가구를 모았어요!"}</span>
              <span className="link">내 방 →</span>
            </button>
          </div>
        </section>

        <section className="how" aria-labelledby="how">
          <h2 id="how" className="sec-title">
            이렇게 해요
          </h2>
          <ol className="steps" data-ux="Stepper · Onboarding">
            <li>
              <span className="st-ic">📱</span>
              <b>월요일 아침 피드</b>
              <span>지난주 실제 유튜브 영상 제목과 화제성이 와요. 종목 이름은 코드네임.</span>
            </li>
            <li>
              <span className="st-ic">🛒</span>
              <b>사고팔고, 물어보고</b>
              <span>최대 5종목. 궁금하면 🐳범고래 박사(AI)에게.</span>
            </li>
            <li>
              <span className="st-ic">▶</span>
              <b>다음 주</b>
              <span>진짜 그 주의 가격으로 결과가. 멘탈도 같이 흔들려요.</span>
            </li>
            <li>
              <span className="st-ic">🏁</span>
              <b>결산 · ⭐ 모으기</b>
              <span>유튜버·코스피와 순위, 미션 별로 내 방 꾸미기.</span>
            </li>
          </ol>
        </section>

        <div className="home-grid">
          <section className="card" aria-labelledby="dex">
            <h2 id="dex" className="sec-title">
              🏅 칭호 도감 {got}/{ALL_TITLES.length}
            </h2>
            <ul className="dex">
              {ALL_TITLES.map((t) => (
                <li key={t.name} className={p.titles[t.name] ? "on" : ""} title={p.titles[t.name] ? `${t.name} ×${p.titles[t.name]}` : `??? — ${t.hint}`}>
                  <span aria-hidden>{p.titles[t.name] ? t.icon : "❔"}</span>
                  <span className="sr-only">{p.titles[t.name] ? t.name : `잠김: ${t.hint}`}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">{p.runs ? `완주 ${p.runs}판 · 최고 등급 ${p.best}` : "판을 끝내면 투자 습관에 맞는 칭호를 받아요."}</p>
          </section>

          <section className="card" aria-labelledby="mk">
            <h2 id="mk" className="sec-title">
              🔓 열린 시장
            </h2>
            <ul className="unlocks">
              {(["KRX", "US", "CRYPTO"] as Market[]).map((m) => (
                <li key={m} className={open.includes(m) ? "on" : ""}>
                  <span>{MK[m]}</span>
                  <span className="muted small">{open.includes(m) ? "열림" : m === "US" ? "한 판 끝내면" : "B 등급 이상"}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">오늘의 시드는 모두 같은 조건이라 세 시장이 다 열려요.</p>
          </section>

          <section className="card" aria-labelledby="today">
            <h2 id="today" className="sec-title">
              🏆 오늘의 시드 순위
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
        <p className="muted small">개미마다 특성이 달라서 전략이 바뀌어요. {pick === "daily" ? "오늘의 시드는 모두 같은 시장이에요." : "자유 플레이는 시장 구간이 무작위예요."}</p>
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

      {/* 내 방 */}
      <Sheet open={room} onClose={() => setRoom(false)} title={`⭐ ${p.stars} · 내 방 꾸미기`} wide>
        <p className="muted small">미션을 달성하고 좋은 등급을 받으면 별이 쌓여요. 별 개수만큼 가구가 저절로 놓여요.</p>
        <ul className="furn">
          {FURNITURE.map((f) => (
            <li key={f.id} className={p.stars >= f.stars ? "on" : ""}>
              <span aria-hidden>{p.stars >= f.stars ? f.icon : "🔒"}</span>
              <b>{f.name}</b>
              <span className="muted small">⭐{f.stars}</span>
            </li>
          ))}
        </ul>
        <h3 className="sub">개미 옷</h3>
        <div className="chips left">
          <button className={`chip ${!p.outfit ? "on" : ""}`} onClick={() => (save({ outfit: null }), setP(progress()))}>
            없음
          </button>
          {OUTFITS.map((o) => (
            <button key={o.id} className={`chip ${p.outfit === o.id ? "on" : ""}`} disabled={p.stars < o.stars} onClick={() => (save({ outfit: o.id }), setP(progress()))}>
              {o.icon} {o.name} {p.stars < o.stars && `🔒⭐${o.stars}`}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
