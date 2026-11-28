// 플레이(#/play): 한 턴 = 실제 1주. 피드(화제 광장) → (사건) → 매매(개미 비서) → [다음 주 ▶] / [▶▶ 4주] → 리캡
import { Manual } from "../components/Manual";
import { isPro, usePro } from "../lib/mode";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ant, moodOf, type CharId } from "../components/Characters";
import { Delta, ErrorState, Loading, Mental, SoundToggle, toast } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { pct, won } from "../lib/format";
import { claimMiles, progress } from "../lib/progress";
import { go, query } from "../lib/router";
import { buzz, sfx } from "../lib/sfx";
import { KEYS, read, write } from "../lib/storage";
import type { RunOut, View, Week } from "../lib/types";
import { canBuy, merge, orderVerb, preview, tradeVerb, type Order } from "./play/logic";
import { RunContext } from "./play/ctx";
import { AssetSheet, EventModal, GoalIntro, LuckPick, MileBox, MissionsSheet, Recap, ShakyConfirm, Temptation, Tour, WeekModal } from "./play/Overlays";
import { Account, Feed, MarketList, Rivals } from "./play/Panels";

type Tab = "feed" | "market" | "account" | "rivals";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "feed", icon: "📱", label: "피드" },
  { id: "market", icon: "📈", label: "시장" },
  { id: "account", icon: "💼", label: "내 계좌" },
  { id: "rivals", icon: "🏁", label: "라이벌" },
];

/** 시연(#/demo)은 이 탭에서만 쓰는 판이라 sessionStorage 에 둔다(내 진행 중인 판을 건드리지 않게) */
export const isDemo = () => query().demo === "1";
const runKey = () => (isDemo() ? sessionStorage.getItem("ant:demo") : read<string>(KEYS.run));
const clearRun = () => (isDemo() ? sessionStorage.removeItem("ant:demo") : write(KEYS.run, null));

/** 이번 주가 '큰 주'인가(큰 창으로 보여줄 만한가) */
function bigWeek(w: Week, before: View, after: View): boolean {
  const rank = (v: View, me: number) => [me, ...v.rivals.map((r) => r.twr), v.kospi].sort((a, b) => b - a).indexOf(me) + 1;
  const firstNow = rank(after, after.twr) === 1 && rank(before, before.twr) !== 1;
  return Math.abs(w.r) >= 0.05 || w.panic || firstNow || after.done || w.dm <= -10;
}

export default function Play() {
  // 판 id 는 화면을 열 때 한 번만 읽는다. 끝나고 저장소에서 지운 뒤 다시 읽으면 '판 없음 → 홈'으로 튕긴다(결산을 못 봄)
  const [id] = useState(runKey);
  const [run, setRun] = useState<RunOut | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [slow, setSlow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<Tab>("feed");
  const [sheet, setSheet] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | "next" | "skip" | "event">(false);
  const [big, setBig] = useState<{ week: Week; before: View; after: RunOut } | null>(null);
  const [recap, setRecap] = useState<{ weeks: Week[]; before: View; after: View } | null>(null);
  const [missions, setMissions] = useState(false);
  const [tour, setTour] = useState(false);
  const [manual, setManual] = useState(false);
  const [pro] = usePro();
  const [tourStep, setTourStep] = useState(0);
  const [shaky, setShaky] = useState<Order | null>(null);
  const [temptSeen, setTemptSeen] = useState(-1);
  const [luckRun, setLuckRun] = useState<RunOut | null>(null);
  const [goalSeen, setGoalSeen] = useState(() => !!(id && read(`ant:goal:${id}`)));
  const [mile, setMile] = useState<ReturnType<typeof claimMiles>>(null);

  useEffect(() => {
    if (!id) {
      go("/");
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => alive && setSlow(true), 3000);
    api
      .run(id)
      .then((r) => {
        if (!alive) return;
        if (r.view.done) {
          if (!isDemo()) write(KEYS.last, r.id);
          clearRun();
          go("/result", { id: r.id });
          return;
        }
        setRun(r);
        const saved = read<{ id: string; t: number; orders: Order[] }>(KEYS.orders);
        setOrders(saved && saved.id === r.id && saved.t === r.view.t ? saved.orders : []);
        if (!read(KEYS.tour) && !isDemo()) {
          setTour(true);
          setTab("market");
        }
      })
      .catch((e: ApiError) => alive && setErr(e))
      .finally(() => window.clearTimeout(t));
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [id, nonce]);

  useEffect(() => {
    if (run) write(KEYS.orders, { id: run.id, t: run.view.t, orders });
  }, [orders, run]);

  // 중간 상자: 서버가 넘었다고 한 수익률 선을 받는 즉시 별로(새로고침해도 한 번만)
  useEffect(() => {
    if (!run || isDemo()) return;
    const got = claimMiles(run.id, run.view.miles);
    if (got) setMile(got);
  }, [run]);

  const v = run?.view;
  const openSheet = (k: string | null) => {
    setSheet(k);
    if (k === null && tour && tourStep === 1) setTourStep(2);
  };
  const setRules = async (rules: Record<string, boolean>) => {
    if (!run) return;
    try {
      const r = await api.rules(run.id, rules);
      setRun(r);
      sfx("tick");
      toast(Object.values(rules).some(Boolean) ? "전략 카드를 바꿨어요. 매주 알아서 지켜요" : "전략 카드를 모두 껐어요");
    } catch (e) {
      toast((e as ApiError).message, { tone: "warn" });
    }
  };
  const asset = useMemo(() => (v && sheet ? (v.assets.find((a) => a.k === sheet) ?? null) : null), [v, sheet]);
  const p = v ? preview(v, orders) : null;

  const addOrder = useCallback(
    (o: Order, sure = false) => {
      if (!v) return;
      if (v.tier.id === "shaky" && !sure && isPro()) {
        setShaky(o);
        return;
      }
      const prev = orders;
      setOrders(merge(orders, o));
      const a = v.assets.find((x) => x.k === o.k)!;
      sfx("coin");
      buzz(12);
      toast(`${a.code} ${Math.abs(o.q).toLocaleString()}주 ${orderVerb(v, o)} 주문을 담았어요`, { action: { label: "되돌리기", run: () => setOrders(prev) } });
    },
    [orders, v],
  );

  const choose = async (i: number) => {
    if (!run) return;
    setBusy("event");
    try {
      const r = await api.event(run.id, i);
      setRun(r);
      sfx("confirm");
      const auto = r.event.trades;
      if (auto.length) {
        const byK = Object.fromEntries(r.view.assets.map((a) => [a.k, a]));
        toast(`자동 매매: ${auto.map((t) => `${byK[t.k].code} ${tradeVerb(t)} ${Math.abs(t.q)}주`).join(", ")}`, { tone: "warn", ms: 5000 });
      }
    } catch (e) {
      toast((e as ApiError).message, { tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const land = (r: RunOut, weeks: Week[], before: View) => {
    setOrders([]);
    write(KEYS.orders, null);
    const last = weeks[weeks.length - 1];
    const total = weeks.reduce((a, w) => a * (1 + w.r), 1) - 1;
    sfx(weeks.some((w) => w.panic) ? "alarm" : total > 0.0005 ? "hit" : total < -0.0005 ? "miss" : "tick");
    buzz(total > 0.0005 ? [10, 40, 10] : 30);
    if (weeks.length === 1 && bigWeek(last, before, r.view)) {
      setBig({ week: last, before, after: r });
    } else {
      setRun(r);
      setRecap({ weeks, before, after: r.view });
      if (r.view.done) window.setTimeout(() => finish(r), 1800);
      window.scrollTo({ top: 0 });
    }
  };

  const next = async () => {
    if (!run || !v || busy) return;
    setBusy("next");
    setRecap(null);
    sfx("whoosh");
    try {
      const r = await api.turn(run.id, orders, null);
      land(r, [r.week!], v);
    } catch (e) {
      const ae = e as ApiError;
      toast(ae.kind === "conflict" ? `주문을 처리하지 못했어요: ${ae.message}` : ae.message, { tone: "warn", ms: 5000 });
      if (ae.kind === "conflict") setTab("account");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!run || !v || busy) return;
    if (orders.length) return toast("담아 둔 주문이 있으면 빨리 감을 수 없어요. 먼저 [다음 주 ▶]로 체결하세요");
    if (v.pending) return toast("이번 주 사건에 먼저 답해 주세요");
    if (v.season - v.t <= 1) return toast("마지막 주예요. [다음 주 ▶]로 마감하세요");
    setBusy("skip");
    setRecap(null);
    sfx("whoosh");
    try {
      const r = await api.skip(run.id, 4);
      land(r, r.weeks ?? [], v);
    } catch (e) {
      toast((e as ApiError).message, { tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const finish = (r: RunOut) => {
    if (!isDemo()) write(KEYS.last, r.id);
    clearRun();
    go("/result", { id: r.id, ...(isDemo() ? { demo: "1" } : {}) });
  };

  const afterBig = () => {
    if (!big) return;
    const r = big.after;
    setBig(null);
    if (r.view.done) return finish(r);
    setRun(r);
    window.scrollTo({ top: 0 });
  };

  if (err)
    return (
      <main className="page">
        <ErrorState
          title={err.kind === "notfound" ? "진행 중인 판을 찾지 못했어요" : "불러오지 못했어요"}
          detail={err.message}
          onRetry={err.kind === "notfound" ? undefined : () => (setErr(null), setNonce((n) => n + 1))}
        />
      </main>
    );
  // 사용성: 키보드 N = 다음 주(창·시트가 열려 있거나 글을 쓰는 중이면 무시)
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, [contenteditable]")) return;
      if (sheet || recap || big || tour || manual || document.querySelector('[aria-modal="true"]')) return;
      if (v?.pending || v?.luckPick) return;
      e.preventDefault();
      void nextRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, recap, big, tour, manual, v?.pending, v?.luckPick]);

  if (!run || !v || !p) return <Loading slow={slow} label="시장을 여는 중…" />;

  const left = v.season - v.t;
  const nOrders = orders.length;
  const noCash = v.assets.every((a) => a.locked || canBuy(v, p, a) !== null);
  const char = (v.char ?? progress().char) as CharId;
  const mDone = v.missions.filter((m) => m.state === "done").length;
  const canSkip = !nOrders && !v.pending && left > 1;
  const hot = [...v.assets].filter((a) => !a.locked && a.k !== v.etf).sort((a, b) => b.hype - a.hype)[0];
  const showTempt = pro && v.tier.id === "anxious" && temptSeen !== v.t && !v.pending && !big && !tour && !v.luckPick && !!hot;

  return (
    <RunContext.Provider value={{ setRules }}>
    <div className="play">
      <header className="hud" data-tour="hud">
        <div className="hud-in">
          <button className="icon-btn" onClick={() => go("/")} aria-label="홈으로(진행은 저장돼요)">
            ←
          </button>
          <button className="icon-btn" onClick={() => setManual(true)} aria-label="게임 방법 보기" title="게임 방법">
            ❓
          </button>
          <span className="hud-ant" aria-hidden>
            <Ant char={char} mood={moodOf(v.mental)} size={34} />
          </span>
          <div className="hud-week">
            <b>
              {v.t + 1}
              <small>/{v.season}주</small>
            </b>
            <span className="hud-prog" aria-hidden>
              <motion.i initial={false} animate={{ width: `${(v.t / v.season) * 100}%` }} />
            </span>
          </div>
          <div className="hud-val">
            <b>{won(v.value)}</b>
            <Delta x={v.twr - 1} />
          </div>
          <Mental value={v.mental} compact />
          {pro && v.tier.id !== "ok" && (
            <button className={`tier-chip t-${v.tier.id}`} onClick={() => toast(`${v.tier.icon} 멘탈 ${v.tier.name}: ${v.tier.desc}`)} aria-label={`멘탈 ${v.tier.name}: ${v.tier.desc}`}>
              {v.tier.name}
            </button>
          )}
          <button className="hud-mission" onClick={() => setMissions(true)} aria-label={`시즌 미션 ${mDone}/${v.missions.length} 달성`} data-ux="Badge · Popover">
            🎯<small>
              {mDone}/{v.missions.length}
            </small>
          </button>
          <SoundToggle />
        </div>
        <div className="hud-strip" data-ux="Status Bar · Glanceable">
          <button className="hs-item" onClick={() => (setTab("account"), window.scrollTo({ top: 0 }))} aria-label={`현금 ${won(p.cash)}${nOrders ? "(주문 체결 뒤)" : ""}. 내 계좌 보기`}>
            <small>{nOrders ? "주문 뒤 현금" : "현금"}</small>
            <b>{won(p.cash)}</b>
          </button>
          <button className="hs-item" onClick={() => (setTab("account"), window.scrollTo({ top: 0 }))} aria-label={`보유 ${p.holdCount}종목 / 최대 ${v.maxHold}종목. 내 계좌 보기`}>
            <small>보유</small>
            <b>
              {p.holdCount}/{v.maxHold}종목
            </b>
          </button>
          {v.goal && v.rivals[v.goal.i] && <GoalBar v={v} />}
        </div>
        {pro && v.mode === "practice" && v.t === 0 && <p className="hud-note info">🐜 연습 시즌: 8주 · 국내 6종목. 마음 편히 사고팔아 보세요!</p>}
        {!pro && !v.skip && (
          <p className="hud-note todo" aria-live="polite" data-ux="Coach Mark · Next Step">
            {nOrders > 0
              ? `👉 주문 ${nOrders}건 담았어요. 이제 아래 ▶ 다음 주를 누르면 결과가 나와요`
              : v.pos.length
                ? "👉 그대로 들고 가려면 ▶ 다음 주. 팔고 싶으면 💼 계좌에서 종목을 눌러요"
                : v.t === 0
                  ? `⏪ 1년 전 월요일로 왔어요. ${v.mode === "practice" ? "연습 8주! " : ""}① 종목을 눌러 ② 금액 버튼으로 사고 ③ ▶ 다음 주`
                  : "👉 ① 종목을 눌러 보고 ② 금액 버튼으로 사고 ③ ▶ 다음 주 (쉬어도 괜찮아요)"}
          </p>
        )}
        {v.skip && <p className="hud-note">✈️ 이번 주는 거래할 수 없어요. 그대로 다음 주로 넘어가요.</p>}
        {pro && v.tier.id === "calm" && !v.skip && <p className="hud-note info">😎 침착 보너스: 이번 주 수수료 0원</p>}
        {pro && v.tier.id === "shaky" && <p className="hud-note">😰 멘탈 흔들림: 수수료 1.5배 · 한 주 쉬면 회복돼요</p>}
      </header>

      <main className={`panels tab-${tab}`}>
        <section className="panel p-feed" aria-label="피드">
          <h2 className="panel-h">📱 월요일 아침 피드</h2>
          <Feed v={v} onOpen={openSheet} />
        </section>
        <section className="panel p-market" aria-label="시장">
          <h2 className="panel-h">📈 시장</h2>
          <MarketList v={v} orders={orders} onOpen={openSheet} />
        </section>
        <section className="panel p-account" aria-label="내 계좌">
          <h2 className="panel-h">💼 내 계좌</h2>
          <Account v={v} orders={orders} onOpen={openSheet} onCancel={(id) => setOrders(orders.filter((o) => o.k + (o.s ? ":s" : "") !== id))} onOrder={addOrder} />
        </section>
        <section className="panel p-rivals" aria-label="라이벌">
          <h2 className="panel-h">🏁 라이벌</h2>
          <Rivals v={v} />
        </section>
      </main>

      <AnimatePresence>{recap && <Recap key={recap.after.t} {...recap} onClose={() => setRecap(null)} />}</AnimatePresence>
      <AnimatePresence>
        {showTempt && !recap && (
          <Temptation
            code={hot!.code}
            onLook={() => (setTemptSeen(v.t), openSheet(hot!.k))}
            onResist={() => (setTemptSeen(v.t), toast("잘 참았어요 🧘 흔들릴 땐 한 주 쉬는 것도 전략이에요", { tone: "ok" }))}
          />
        )}
      </AnimatePresence>

      <div className="dock">
        <div className="dock-row">
          <button className="next-btn" onClick={next} disabled={!!busy || !!v.pending} title="다음 주 (키보드 N)" data-tour="next" data-ux="Primary Action · Thumb Zone">
            <span className="nb-main">{busy === "next" ? "시장이 움직이는 중…" : left === 1 ? "마지막 주 마감 🏁" : "다음 주 ▶"}</span>
            <span className="nb-sub">{nOrders ? `주문 ${nOrders}건 체결` : v.pos.length ? "그대로 들고 가기" : noCash ? "현금으로 버티기" : "아무것도 안 사고 넘기기"}</span>
          </button>
          <button className={`ff-btn ${canSkip ? "" : "soft"}`} onClick={skip} disabled={!!busy} aria-label="주문 없이 4주 빨리 감기" title={nOrders ? "담아 둔 주문이 있으면 빨리 감을 수 없어요" : "4주 그대로 들고 가기"} data-ux="Shortcut · Fast-forward">
            {busy === "skip" ? "⏩…" : "▶▶"}
            <small>4주</small>
          </button>
        </div>
        <nav className="tabbar" aria-label="플레이 화면" data-ux="Tab Bar">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => (setTab(t.id), window.scrollTo({ top: 0 }))}>
              <span aria-hidden>{t.icon}</span>
              {t.label}
              {t.id === "account" && nOrders > 0 && <i className="badge">{nOrders}</i>}
            </button>
          ))}
        </nav>
      </div>

      <AssetSheet v={v} a={asset} orders={orders} runId={run.id} onClose={() => openSheet(null)} onOrder={addOrder} onAsked={(left) => setRun({ ...run, view: { ...v, asksLeft: left } })} />
      <Manual open={manual} onClose={() => setManual(false)} />
      <EventModal ev={!big && !tour && !v.luckPick ? v.pending : null} busy={busy === "event"} onChoose={choose} />
      <LuckPick
        open={(v.luckPick || !!luckRun) && !tour}
        onClose={() => {
          if (luckRun) setRun(luckRun);
          setLuckRun(null);
        }}
        onPick={async (i) => {
          try {
            const r = await api.luck(run.id, i);
            sfx("level");
            buzz([20, 40, 20]);
            setLuckRun(r);
            return r.card ?? null;
          } catch (e) {
            toast((e as ApiError).message, { tone: "warn" });
            return null;
          }
        }}
      />
      <ShakyConfirm
        text={shaky ? `${v.assets.find((a) => a.k === shaky.k)?.code} ${Math.abs(shaky.q).toLocaleString()}주 ${orderVerb(v, shaky)}` : null}
        onNo={() => setShaky(null)}
        onYes={() => {
          const o = shaky!;
          setShaky(null);
          addOrder(o, true);
        }}
      />
      <WeekModal week={big?.week ?? null} before={big?.before ?? null} after={big?.after.view ?? null} onNext={afterBig} />
      <GoalIntro
        open={!goalSeen && v.t === 0 && v.mode !== "practice" && !v.luckPick && !luckRun && !tour && !isDemo()}
        v={v}
        stars={progress().stars}
        onClose={() => {
          write(`ant:goal:${run.id}`, true);
          setGoalSeen(true);
        }}
      />
      <MileBox got={!big && !recap?.after.done ? mile : null} onClose={() => setMile(null)} />
      <MissionsSheet open={missions} onClose={() => setMissions(false)} v={v} />
      {tour && (
        <Tour
          i={tourStep}
          waiting={!!sheet}
          onNext={() => setTourStep((x) => x + 1)}
          onDone={() => {
            setTour(false);
            write(KEYS.tour, true);
          }}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {recap ? `${recap.weeks.length}주 지나감, 이번 수익 ${pct(recap.weeks.reduce((a, w) => a * (1 + w.r), 1) - 1)}` : ""}
      </span>
    </div>
    </RunContext.Provider>
  );
}

/** 목표 칩: 목표 라이벌과의 차이(누르면 상자까지 자세히) */
function GoalBar({ v }: { v: View }) {
  const rival = v.rivals[v.goal!.i];
  const gap = v.twr - rival.twr;
  const next = (v.miles ?? []).find((m) => !m.hit);
  return (
    <button
      className={`hs-item hs-goal ${gap >= 0 ? "ahead" : "behind"}`}
      onClick={() =>
        toast(`🎯 목표: 시즌이 끝날 때 ${rival.name}보다 많이 벌면 ⭐+${v.goal!.stars}. ${next ? `수익률 +${Math.round(next.at * 100)}%를 넘으면 🎁 상자(⭐+${next.stars})` : "상자는 다 받았어요!"}`, { ms: 5000 })
      }
      aria-label={`목표 ${rival.name} 이기기. 지금 ${(Math.abs(gap) * 100).toFixed(1)}%p ${gap >= 0 ? "앞서는" : "뒤지는"} 중`}
      data-ux="Goal Gradient"
    >
      <small>🎯 vs {rival.name}</small>
      <b>{gap >= 0 ? `▲ ${(gap * 100).toFixed(1)}%p 앞섬` : `▼ ${(-gap * 100).toFixed(1)}%p 뒤짐`}</b>
    </button>
  );
}
