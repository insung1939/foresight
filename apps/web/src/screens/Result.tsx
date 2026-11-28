// 결산(#/result?id=): 등급 → 순위 → 칭호 → 곡선 → 코드네임 정체 공개 → 공유·코치·이름
import { motion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CountUp, Delta, ErrorState, LineChart, Loading, Sheet, TopBar, WeekBars, toast } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { dateDot, pct, won } from "../lib/format";
import { Ant, Orca, Tuber, type CharId } from "../components/Characters";
import { RoomView } from "../components/Scene";
import { Epilogue } from "../components/Story";
import { boxOpened, openBox, progress, record } from "../lib/progress";
import { nextFurniture, unlockedFurniture } from "../lib/room";
import { go, query } from "../lib/router";
import { sfx } from "../lib/sfx";
import { KEYS, read, write } from "../lib/storage";
import type { Coach, Final } from "../lib/types";
import { MARKET_KO, weekEmoji } from "./play/logic";

const GRADE_LINE: Record<Final["grade"], string> = {
  S: "전설의 개미. 유튜버도 코스피도 다 제쳤어요!",
  A: "1등! 유튜버 라이벌과 코스피를 이겼어요.",
  B: "벌었고, 꽤 높은 순위예요.",
  C: "잃지는 않았어요.",
  D: "조금 잃었어요. 시장이 만만치 않죠?",
  F: "크게 잃었어요. 다음 판엔 다르게!",
};

export default function Result() {
  const id = query().id ?? read<string>(KEYS.last) ?? "";
  const res = useAsync(() => api.final(id), [id]);
  if (!id) {
    go("/");
    return null;
  }
  return (
    <>
      <TopBar route="/result" />
      <main className="page result">
        {res.status === "loading" && <Loading slow={res.slow} label="결산하는 중…" />}
        {res.status === "error" && <ErrorState title="결산을 불러오지 못했어요" detail={res.error.message} onRetry={res.retry} />}
        {res.status === "ready" && <Body f={res.data} id={id} />}
      </main>
    </>
  );
}

function Body({ f, id }: { f: Final; id: string }) {
  const demo = query().demo === "1";
  const [gain] = useState(() => (demo ? { newTitle: false, newMarkets: [], best: false, starsBefore: 0, starsAfter: 0 } : record(id, f)));
  const [starsNow, setStarsNow] = useState(() => (demo ? 0 : progress().stars));
  const [revealed, setRevealed] = useState(false);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [nick, setNick] = useState(f.nickname ?? read<string>(KEYS.nick) ?? "");
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sfx(["S", "A", "B"].includes(f.grade) ? "level" : "tick");
    const before = unlockedFurniture(gain.starsBefore);
    const fresh = unlockedFurniture(gain.starsAfter).filter((x) => !before.includes(x));
    const news = [
      gain.newTitle ? `새 칭호 ${f.title.icon} ${f.title.name}` : "",
      ...gain.newMarkets.map((m) => `🔓 ${MARKET_KO[m]} 시장`),
      fresh.length ? `🛋️ 새 가구 ${fresh.length}개` : "",
    ].filter(Boolean);
    if (news.length) window.setTimeout(() => toast(`획득! ${news.join(" · ")}`, { tone: "ok", ms: 5000 }), 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yts = f.board.filter((b) => b.who === "yt");
  const beatYt = yts.filter((b) => b.ret < f.ret).length;
  const shareText = [
    `타임슬립 개미 ${f.mode === "daily" && f.day ? `${f.day} 오늘의 시드` : f.mode === "practice" ? "연습 시즌" : "자유 플레이"} 🐜`,
    `${f.grade} 등급 · ${pct(f.ret)} · ${f.title.icon} ${f.title.name}`,
    `유튜버 ${yts.length}명 중 ${beatYt}명 이김${f.place ? ` · ${f.place.total}명 중 ${f.place.rank}등` : ""}`,
    f.weeks.map(weekEmoji).join(""),
    window.location.origin,
  ].join("\n");

  const [shareOpen, setShareOpen] = useState(false);
  const askCoach = async () => {
    setCoachBusy(true);
    try {
      setCoach(await api.coach(id));
    } catch (e) {
      toast((e as Error).message, { tone: "warn" });
    } finally {
      setCoachBusy(false);
    }
  };
  const [savedNick, setSavedNick] = useState(f.nickname ?? "");
  const saveNick = async () => {
    const n = nick.trim();
    if (!n || n === savedNick) return;
    try {
      const r = await api.nickname(id, n);
      write(KEYS.nick, r.nickname);
      setSavedNick(r.nickname);
      toast(`'${r.nickname}'(으)로 순위에 올렸어요`, { tone: "ok" });
    } catch (e) {
      toast((e as Error).message, { tone: "warn" });
    }
  };

  return (
    <>
      <div className="res-card" ref={card}>
        <button className="icon-btn res-share no-cap" onClick={() => setShareOpen(true)} aria-label="결과 공유하기">
          📤
        </button>
        <p className="eyebrow">
          {f.len}주 결산 · {f.mode === "daily" ? `오늘의 시드 ${f.day}` : f.mode === "practice" ? "연습 시즌" : "자유 플레이"}
        </p>
        <div className="res-ant">
          <Ant char={f.char as CharId} mood={f.ret > 0 ? "happy" : f.ret < -0.1 ? "panic" : "worried"} size={70} bounce />
        </div>
        <motion.div className={`grade g-${f.grade}`} initial={{ scale: 2.4, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}>
          {f.grade}
        </motion.div>
        <p className="res-ret">
          <span className={f.ret > 0 ? "up" : f.ret < 0 ? "down" : ""}>
            <CountUp to={f.ret * 100} format={(n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`} duration={1.4} delay={0.4} />
          </span>
        </p>
        <p className="res-line">{f.grade === "C" && f.ret > 0.0005 ? "벌었어요! 그런데 라이벌들이 더 벌었어요." : GRADE_LINE[f.grade]}</p>
        <p className="muted small">
          최종 자산 {won(f.value)} (넣은 돈 {won(f.deposits)})
        </p>

        <motion.div className="title-badge" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2 }}>
          <span className="tb-icon" aria-hidden>
            {f.title.icon}
          </span>
          <span>
            <b>{f.title.name}</b>
            <span className="muted small">{f.title.why}</span>
          </span>
        </motion.div>

        <ol className="res-board">
          {f.board.map((b, i) => (
            <motion.li key={b.name} className={b.who === "me" ? "me" : ""} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.5 + i * 0.12 }}>
              <span className="rk">{i + 1}</span>
              <span className="wk-who">
                {b.who === "yt" && <Tuber name={b.name} size={22} />}
                {b.who === "me" ? "🐜 나" : b.who === "yt" ? b.name : `📊 ${b.name}`}
              </span>
              <Delta x={b.ret} />
            </motion.li>
          ))}
        </ol>
        <p className="week-grid big" aria-label="주별 수익">
          {f.weeks.map((r, i) => (
            <span key={i} title={`${i + 1}주차 ${pct(r)}`}>
              {weekEmoji(r)}
            </span>
          ))}
        </p>
        {f.place && (
          <p className="res-place">
            오늘의 시드 <b>{f.place.total.toLocaleString()}명 중 {f.place.rank}등</b> (상위 {Math.max(1, Math.round(f.place.top * 100))}%)
          </p>
        )}
        <p className="res-foot">🐜 타임슬립 개미 · {window.location.host}</p>
      </div>

      <Epilogue f={f} />

      <div className="res-actions">
        <button className="btn primary" onClick={() => setShareOpen(true)}>
          📤 결과 공유
        </button>
        <button className="btn ghost" onClick={() => go("/")}>
          🔁 한 판 더
        </button>
      </div>
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} card={card} text={shareText} file={`timeslip-ant-${f.grade}.png`} />

      {!demo && <LuckyBox id={id} onOpen={(n) => setStarsNow((s) => s + n)} />}

      <section className="card stars" aria-labelledby="ms">
        <h2 id="ms" className="sec-title">
          ⭐ 이번 시즌 별 +{f.stars}
        </h2>
        <ul className="missions">
          {f.missions.map((m) => (
            <li key={m.id} className={m.state}>
              <span className="ms-ic" aria-hidden>
                {m.icon}
              </span>
              <span>{m.label}</span>
              <b>{m.state === "done" ? "★ 달성" : "✕"}</b>
            </li>
          ))}
          {f.goal && (
            <li className={f.goal.hit ? "done" : "fail"}>
              <span className="ms-ic">🎯</span>
              <span>
                목표: {f.goal.name}보다 많이 벌기 ({f.goal.name} {pct(f.goal.ret)})
              </span>
              <b>{f.goal.hit ? `★${f.goal.stars}` : "✕"}</b>
            </li>
          )}
          {!!f.mileStars && (
            <li className="done">
              <span className="ms-ic">🎁</span>
              <span>시즌 중 받은 가구 상자(이미 받음)</span>
              <b>★{f.mileStars}</b>
            </li>
          )}
          {["S", "A", "B"].includes(f.grade) && (
            <li className="done">
              <span className="ms-ic">🏅</span>
              <span>{f.grade} 등급 보너스</span>
              <b>★{f.grade === "B" ? 1 : 2}</b>
            </li>
          )}
        </ul>
        {!demo && (
          <p className="muted small">
            모은 별 {starsNow}개 · {nextFurniture(starsNow) ? `${nextFurniture(starsNow)!.stars - starsNow}개 더 모으면 ${nextFurniture(starsNow)!.icon} ${nextFurniture(starsNow)!.name}` : "가구를 다 모았어요!"}
          </p>
        )}
        {!demo && <RoomView char={f.char as CharId} items={unlockedFurniture(starsNow)} mood={f.ret > 0 ? "happy" : "calm"} height={220} />}
      </section>

      {f.mode === "practice" && (
        <div className="practice-done card">
          <Orca size={48} />
          <p>
            <b>연습 끝! 이제 진짜 시즌이에요.</b>
            <br />
            <span className="muted small">오늘의 시드 12주 · 국내·미국 주식 · 유튜버 라이벌 3명 · 내 개미를 골라서 시작해요.</span>
          </p>
          <button className="btn primary" onClick={() => go("/")}>
            진짜 시즌 시작 ▶
          </button>
        </div>
      )}

      {!demo && (
        <section className={`card rank-cta ${f.place ? "on" : ""}`} aria-labelledby="rk-h" data-ux="Inline Edit · Autosave">
          {f.mode === "daily" && f.place ? (
            <>
              <h2 id="rk-h" className="sec-title">
                🏆 오늘의 시드 {f.place.total.toLocaleString()}명 중 <b className="rk-big">{f.place.rank}등</b>
              </h2>
              <form
                className="nick-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveNick();
                }}
              >
                <label className="sr-only" htmlFor="nick-in">
                  순위에 보일 이름
                </label>
                <input id="nick-in" value={nick} maxLength={12} placeholder="순위에 보일 이름(지금은 익명 개미)" onChange={(e) => setNick(e.target.value)} onBlur={() => void saveNick()} enterKeyHint="done" />
                <button className="btn primary" disabled={!nick.trim() || nick.trim() === savedNick}>
                  {savedNick && nick.trim() === savedNick ? "저장됨 ✓" : "저장"}
                </button>
              </form>
              <a href="#/rank" className="link">
                오늘의 순위 보기 →
              </a>
            </>
          ) : f.mode === "daily" ? (
            <p>
              <b>이 기기로 오늘 이미 순위에 오른 판이 있어요.</b>
              <br />
              <span className="muted small">오늘의 시드는 기기당 첫 완주만 순위에 올라가요. 이번 판은 기록·별만 남아요.</span>
            </p>
          ) : (
            <p>
              <b>{f.mode === "practice" ? "연습 시즌" : "자유 플레이"}은 순위에 올라가지 않아요.</b>
              <br />
              <span className="muted small">모두 같은 시장으로 겨루는 &lsquo;오늘의 시드&rsquo;만 순위에 올라가요.</span>
              <br />
              <button className="btn primary" style={{ marginTop: 10 }} onClick={() => go("/")}>
                🗓️ 오늘의 시드 도전하러 가기
              </button>
            </p>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="reveal">
        <h2 id="reveal" className="sec-title">
          🎭 코드네임의 정체
        </h2>
        <p className="muted small">
          실제 기간: <b>{dateDot(f.period.from)} ~ {dateDot(f.period.to)}</b> 주간
        </p>
        {!revealed ? (
          <button
            className="btn primary block reveal-btn"
            onClick={() => {
              setRevealed(true);
              sfx("flip");
            }}
          >
            정체 공개하기
          </button>
        ) : (
          <ul className="reveal">
            {f.reveal.map((r, i) => (
              <motion.li key={r.k} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
                <span className="muted small">{r.code}</span>
                <b>{r.name}</b>
                <Delta x={r.ret} />
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="curve">
        <h2 id="curve" className="sec-title">
          📈 {f.len}주 동안
        </h2>
        <LineChart
          h={220}
          series={[
            { data: f.curves.me, label: "나", cls: "line-me", bold: true },
            ...f.curves.rivals.map((d, i) => ({ data: d, label: f.rivalNames[i], cls: `line-yt${i + 1}` })),
            { data: f.curves.index, label: "코스피", cls: "line-ix", dash: true },
          ]}
          xLabel={(i) => (i === 0 ? "시작" : `${f.len}주`)}
        />
        <h3 className="sub-h">주별 수익</h3>
        <WeekBars data={f.weeks} />
        <p className="muted small">멘탈 최저 {Math.min(...f.mental)} · 거래 {f.title.stats.trades}번 · 추격 매수 {f.title.stats.fomo}번</p>
      </section>

      <section className="card coach" aria-labelledby="coach">
        <h2 id="coach" className="sec-title">
          <Orca size={30} /> 범고래 박사의 한마디(AI 코치)
        </h2>
        {!coach ? (
          <>
            <p className="muted small">내 거래 기록만 보고 습관을 세 줄로 돌아봐 줘요. 종목 추천이나 시장 전망은 하지 않아요.</p>
            <button className="btn ghost block" onClick={askCoach} disabled={coachBusy}>
              {coachBusy ? "기록을 읽는 중…" : "코치 부르기"}
            </button>
          </>
        ) : (
          <>
            <p className="coach-head">{coach.headline}</p>
            <ul className="coach-pts">
              {coach.points.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <p className="coach-tip">💡 {coach.tip}</p>
            <p className="muted small">{coach.source === "ai" ? `AI(${coach.model}) · 숫자·권유 검증을 통과한 답이에요` : "AI 연결이 안 돼서 규칙으로 만든 답이에요"}</p>
          </>
        )}
      </section>

      <p className="disclaimer">유튜버 성적은 영상 제목 속 &lsquo;오른다&rsquo; 언급을 기계적으로 따라 산 가상 계산이에요. 채널의 실제 운용 성과가 아니에요.</p>
    </>
  );
}


// ---------------------------------------------------------------- 공유 시트
// 결산 카드를 PNG로 만들어 미리 보여 주고 → 휴대폰 공유창(이미지+문구) / 이미지 저장 / 문구 복사.
// 공유창은 '누른 순간'에 불러야 해서(사파리) 이미지는 시트가 열릴 때 미리 만들어 둔다.
// 카카오톡·인스타 안 브라우저는 내려받기가 막혀 있어 미리보기를 길게 눌러 저장하도록 안내한다.
const HAS_SHARE = typeof navigator.share === "function";
const IN_APP = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//i.test(navigator.userAgent);

function ShareSheet({ open, onClose, card, text, file }: { open: boolean; onClose: () => void; card: RefObject<HTMLDivElement>; text: string; file: string }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    if (!open || img || !card.current) return;
    let alive = true;
    (async () => {
      try {
        const { toBlob } = await import("html-to-image");
        const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
        const blob = await toBlob(card.current!, { pixelRatio: 2, backgroundColor: bg, filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-cap")) });
        if (!blob) throw new Error("empty");
        if (alive) setImg({ blob, url: URL.createObjectURL(blob) });
      } catch {
        if (alive) setFail(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, img, card]);
  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  const pngFile = img ? new File([img.blob], file, { type: "image/png" }) : null;
  const canShareFile = !!pngFile && !!navigator.canShare?.({ files: [pngFile] });
  const shareNative = async () => {
    try {
      if (canShareFile) await navigator.share({ files: [pngFile!], text });
      else if (HAS_SHARE) await navigator.share({ text });
      else return copy();
      onClose();
    } catch {
      /* 공유 취소 */
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("결과 문구를 복사했어요. 단톡방에 붙여 넣어 보세요!", { tone: "ok" });
    } catch {
      toast("복사하지 못했어요. 아래 문구를 길게 눌러 복사해 주세요.", { tone: "warn" });
    }
  };
  const save = () => {
    if (!img) return;
    if (IN_APP) {
      toast("이 앱 안에서는 바로 저장이 안 돼요. 위 이미지를 길게 눌러 저장해 주세요.", { tone: "warn", ms: 5000 });
      return;
    }
    const a = document.createElement("a");
    a.href = img.url;
    a.download = file;
    a.click();
  };

  return (
    <Sheet open={open} onClose={onClose} title="📤 결과 공유하기">
      <div className="share-preview" data-ux="Share Sheet · Preview">
        {img ? <img src={img.url} alt="결산 카드 이미지" /> : fail ? <p className="muted small">이미지를 만들지 못했어요. 화면 캡처로 저장해 주세요.</p> : <p className="muted small">카드 이미지를 만드는 중…</p>}
      </div>
      {img && <p className="muted small share-hint">{IN_APP ? "👆 이미지를 길게 눌러 저장하거나 보낼 수 있어요" : "이미지를 길게 누르거나 아래 버튼으로 저장할 수 있어요"}</p>}
      <div className="share-btns">
        <button className="btn primary block" onClick={shareNative} disabled={!img && !fail} data-autofocus>
          {canShareFile ? "📲 이미지로 공유하기 (카톡·인스타)" : HAS_SHARE ? "📲 공유하기" : "📋 결과 문구 복사"}
        </button>
        <div className="share-row">
          <button className="btn ghost" onClick={save} disabled={!img}>
            🖼️ 이미지 저장
          </button>
          <button className="btn ghost" onClick={copy}>
            📋 문구 복사
          </button>
        </div>
      </div>
      <pre className="share-text">{text}</pre>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 행운 상자(운 요소 + 천장)
function LuckyBox({ id, onOpen }: { id: string; onOpen: (stars: number) => void }) {
  const [state, setState] = useState<"closed" | "shaking" | "open">(boxOpened(id) ? "open" : "closed");
  const [prize, setPrize] = useState<{ stars: number; label: string; rare: boolean } | null>(null);
  const open = () => {
    if (state !== "closed") return;
    setState("shaking");
    sfx("tick");
    window.setTimeout(() => {
      const p = openBox(id);
      setPrize(p);
      if (p) onOpen(p.stars);
      setState("open");
      sfx(p?.rare ? "level" : "coin");
    }, 1100);
  };
  if (state === "open" && !prize) return null;
  return (
    <section className={`card lucky ${prize?.rare ? "rare" : ""}`} aria-live="polite" data-ux="Reward Reveal · Variable Reward">
      {state !== "open" ? (
        <button className="box-btn" onClick={open} disabled={state === "shaking"} aria-label="행운 상자 열기">
          <motion.span className="box" animate={state === "shaking" ? { rotate: [0, -12, 12, -12, 12, 0], scale: [1, 1.1, 1.1, 1.15, 1.2, 1.25] } : { y: [0, -6, 0] }} transition={state === "shaking" ? { duration: 1.1 } : { duration: 1.4, repeat: Infinity }}>
            🎁
          </motion.span>
          <b>{state === "shaking" ? "두근두근…" : "행운 상자 열기"}</b>
          <span className="muted small">판을 끝낼 때마다 하나! 무엇이 나올지는 운</span>
        </button>
      ) : (
        <motion.div className="box-prize" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12 }}>
          <span className="box">{prize!.rare ? "✨🌟✨" : "⭐"}</span>
          <b>
            {prize!.label} 별 +{prize!.stars}
          </b>
          <span className="muted small">{prize!.rare ? "축하해요! 내 방이 더 화려해져요" : "작은 상자 3번이면 다음엔 반짝이는 상자 확정!"}</span>
        </motion.div>
      )}
    </section>
  );
}
