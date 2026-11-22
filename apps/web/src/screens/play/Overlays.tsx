// 플레이 화면 위에 뜨는 것들: 종목 바텀시트(매매·개미 비서) · 인생 사건 · 리캡 카드 · 큰 주 결과 · 미션 · 첫 판 안내
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Ant, Orca, Tuber, rivalLine, type CharId } from "../../components/Characters";
import { CountUp, Delta, LineChart, Mental, Modal, Sheet, toast } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { sfx } from "../../lib/sfx";
import { pct, views, won } from "../../lib/format";
import type { AskOut, Asset, EventCard, View, Week } from "../../lib/types";
import { sectorOf } from "../../lib/sectors";
import { nextFurniture, unlockedFurniture, FURNITURE } from "../../lib/room";
import { MARKET_KO, canBuy, flames, maxBuy, preview, type Order } from "./logic";

// ---------------------------------------------------------------- 종목 시트
export function AssetSheet({ v, a, orders, runId, onClose, onOrder, onAsked }: { v: View; a: Asset | null; orders: Order[]; runId: string; onClose: () => void; onOrder: (o: Order) => void; onAsked: (left: number) => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(0);
  const p = preview(v, orders);
  const held = a ? (p.qty[a.k] ?? 0) : 0;
  useEffect(() => {
    setSide(held && a && canBuy(v, p, a) ? "buy" : held ? "sell" : "buy");
    setQty(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.k]);
  if (!a) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const block = side === "buy" ? canBuy(v, p, a) : v.skip ? "이번 주는 거래할 수 없어요" : held ? null : "가진 수량이 없어요";
  const limit = side === "buy" ? maxBuy(v, p, a) : held;
  const fee = side === "buy" ? v.fees[a.market].buy : v.fees[a.market].sell;
  const amount = qty * a.price;
  const pos = v.pos.find((x) => x.k === a.k);
  const chips = side === "buy" ? [0.1, 0.25, 0.5, 1] : [0.25, 0.5, 1];
  const hypeUp = a.hype - a.hypePrev;
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span className="as-title">
          {a.code} <span className={`mk m-${a.market}`}>{MARKET_KO[a.market]}</span>
        </span>
      }
      footer={
        block ? (
          <p className="inline-alert">{block}</p>
        ) : (
          <button
            className={`btn block ${side === "buy" ? "buy" : "sell"}`}
            disabled={qty < 1}
            onClick={() => {
              onOrder({ k: a.k, q: side === "buy" ? qty : -qty });
              onClose();
            }}
          >
            {qty < 1 ? "수량을 골라 주세요" : `${qty.toLocaleString()}주 ${side === "buy" ? "사기" : "팔기"} 주문 담기 · ${won(amount)}`}
          </button>
        )
      }
    >
      <p className="sec-info">
        <span aria-hidden>{sectorOf(a.sector).icon}</span>
        <span>
          <b>{sectorOf(a.sector).short}</b> {sectorOf(a.sector).desc}
        </span>
      </p>
      <div className="as-price">
        <b>{Math.round(a.price).toLocaleString("ko-KR")}</b>
        <span>
          지난주 <Delta x={a.chg} />
        </span>
      </div>
      <LineChart series={[{ data: a.hist.map((x) => x / a.hist[0]), label: "12주 전 대비", cls: "line-me", bold: true }]} h={260} xLabel={(i) => (i === 0 ? "12주 전" : "지난주")} />

      <div className="as-facts">
        <div>
          <span className="muted small">지난주 유튜브 언급</span>
          <b>
            {a.hype}건 {"🔥".repeat(flames(a.hype))}
          </b>
          <span className="muted small">{hypeUp > 0 ? `전주보다 ${hypeUp}건 늘었어요` : hypeUp < 0 ? `전주보다 ${-hypeUp}건 줄었어요` : "전주와 같아요"}</span>
        </div>
        <div>
          <span className="muted small">오른다 vs 내린다</span>
          <b>
            {a.bull} : {a.bear}
          </b>
          <span className="stance" aria-hidden>
            <i style={{ flex: a.bull || 0.001 }} className="up" />
            <i style={{ flex: a.bear || 0.001 }} className="down" />
          </span>
        </div>
      </div>

      {a.titles.length > 0 && (
        <ul className="yt-list compact">
          {a.titles.map((t, i) => (
            <li key={i} className="yt static">
              <Tuber name={t.ch} size={36} />
              <div className="yt-body">
                <p className="yt-title">{t.t}</p>
                <p className="yt-meta">
                  {t.ch} · 조회 {views(t.v)} {t.st === "b" && <span className="tag bull">오른다</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!a.titles.length && <p className="empty">지난주엔 이 종목을 다룬 영상이 없었어요. 조용한 종목은 차트와 화제성(🔥)으로 판단해요.</p>}

      {pos && (
        <p className="as-held">
          보유 {pos.qty.toLocaleString()}주 · 평단 {Math.round(pos.cost).toLocaleString()} · <Delta x={pos.gain} />
        </p>
      )}

      <Assistant v={v} a={a} runId={runId} onAsked={onAsked} />

      <div className="trade">
        <div className="seg two" role="tablist" aria-label="사기 또는 팔기">
          <button role="tab" aria-selected={side === "buy"} className={side === "buy" ? "on buy" : ""} onClick={() => (setSide("buy"), setQty(0))}>
            사기
          </button>
          <button role="tab" aria-selected={side === "sell"} className={side === "sell" ? "on sell" : ""} onClick={() => (setSide("sell"), setQty(0))} disabled={!held}>
            팔기
          </button>
        </div>
        {!block && (
          <>
            <div className="chips">
              {chips.map((c) => (
                <button key={c} className={`chip ${qty === Math.floor(limit * c) && qty > 0 ? "on" : ""}`} onClick={() => setQty(Math.max(1, Math.floor(limit * c)))}>
                  {c === 1 ? (side === "buy" ? "최대" : "전부") : `${c * 100}%`}
                </button>
              ))}
            </div>
            <div className="stepper">
              <button className="icon-btn" onClick={() => setQty((q) => Math.max(0, q - 1))} aria-label="1주 줄이기" disabled={qty <= 0}>
                −
              </button>
              <label>
                <span className="sr-only">수량</span>
                <input
                  inputMode="numeric"
                  value={qty ? qty.toLocaleString() : ""}
                  placeholder="0"
                  onChange={(e) => setQty(Math.min(limit, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
                />
                <span>주</span>
              </label>
              <button className="icon-btn" onClick={() => setQty((q) => Math.min(limit, q + 1))} aria-label="1주 늘리기" disabled={qty >= limit}>
                +
              </button>
            </div>
            <p className="muted small center">
              {side === "buy" ? `현금 ${won(p.cash)} · 최대 ${limit.toLocaleString()}주` : `보유 ${held.toLocaleString()}주`} · 수수료{side === "sell" && a.market === "KRX" ? "·세금" : ""} {pct(fee, 2)}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

const RULE_KO: Record<string, string> = { stop: "자동 손절", take: "자동 익절", dca: "적립식", cap: "몰빵 방지" };

// ---------------------------------------------------------------- 인생 사건
export function EventModal({ ev, busy, onChoose }: { ev: EventCard | null; busy: boolean; onChoose: (i: number) => void }) {
  return (
    <Modal open={!!ev} label={ev?.title ?? "사건"}>
      {ev && (
        <div className="event">
          <p className="eyebrow">이번 달의 사건</p>
          <motion.div className="ev-icon" initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12 }} aria-hidden>
            {ev.icon}
          </motion.div>
          <h2>{ev.title}</h2>
          <p className="ev-body">{ev.body}</p>
          <div className="ev-choices">
            {ev.choices.map((c, i) => (
              <button key={i} className="choice" onClick={() => onChoose(i)} disabled={busy} data-autofocus={i === 0 ? "" : undefined}>
                <b>{c.label}</b>
                <span>{c.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- 주간 결과
export function WeekModal({ week, before, after, onNext }: { week: Week | null; before: View | null; after: View | null; onNext: () => void }) {
  if (!week || !before || !after) return <Modal open={false} label="">{null}</Modal>;
  const byK = Object.fromEntries(before.assets.map((a) => [a.k, a]));
  const prevValue = before.value + (after.deposits - before.deposits);
  const rows = [
    { name: "🐜 나", twr: after.twr, prev: before.twr, me: true, yt: "" },
    ...after.rivals.map((r, i) => ({ name: r.name, twr: r.twr, prev: before.rivals[i].twr, me: false, yt: r.name })),
    { name: "📊 코스피", twr: after.kospi, prev: before.kospi, me: false, yt: "" },
  ];
  const rankNow = [...rows].sort((a, b) => b.twr - a.twr);
  const rankPrev = [...rows].sort((a, b) => b.prev - a.prev);
  const myNow = rankNow.findIndex((r) => r.me) + 1;
  const myPrev = rankPrev.findIndex((r) => r.me) + 1;
  const mine = Object.entries(week.mine).sort((a, b) => b[1] - a[1]);
  const auto = week.trades.filter((t) => t.auto);
  const last = after.done;
  return (
    <Modal open label={`${week.t + 1}주차 결과`}>
      <div className={`week ${week.r > 0.0005 ? "good" : week.r < -0.0005 ? "bad" : ""}`}>
        <p className="eyebrow">
          {week.t + 1}주차 마감 · {after.season - after.t > 0 ? `${after.season - after.t}주 남음` : "마지막 주"}
        </p>
        <p className="wk-ret">
          <span className={week.r > 0.0005 ? "up" : week.r < -0.0005 ? "down" : ""}>
            <CountUp to={week.r * 100} format={(n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`} duration={0.9} />
          </span>
        </p>
        <p className="wk-val">
          {won(prevValue)} → <b>{won(week.value)}</b>
        </p>

        {week.panic && <p className="inline-alert danger">😱 멘탈이 바닥나서 가진 걸 모두 팔아 버렸어요(패닉셀). 멘탈 35로 다시 시작해요.</p>}

        <div className="wk-row">
          <span>멘탈</span>
          <Mental value={week.mental} />
          <span className={week.dm >= 0 ? "up" : "down"}>
            {week.dm >= 0 ? "+" : ""}
            {week.dm}
          </span>
        </div>
        {week.why.length > 0 && (
          <p className="wk-why">
            {week.why.map(([w, d]) => (
              <span key={w} className={d >= 0 ? "up" : "down"}>
                {w} {d > 0 ? `+${d}` : d}
              </span>
            ))}
          </p>
        )}

        {mine.length > 0 && (
          <ul className="wk-mine">
            {mine.map(([k, r]) => (
              <li key={k}>
                <span>{byK[k]?.code}</span>
                <Delta x={r} />
              </li>
            ))}
          </ul>
        )}
        {week.luck && (
          <motion.p className="rc-luck big" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: "spring" }}>
            {week.luck.icon} {week.luck.text}
          </motion.p>
        )}
        {auto.length > 0 && (
          <p className="muted small">
            자동 매매: {auto.map((t) => `${byK[t.k]?.code} ${t.q > 0 ? "매수" : "매도"} ${Math.abs(t.q)}주${(t as { rule?: string }).rule ? `(${RULE_KO[(t as { rule?: string }).rule!]})` : ""}`).join(", ")}
          </p>
        )}

        <div className="wk-rank">
          <p className="sec-title">
            순위 {myNow}/{rows.length} {myNow < myPrev ? <span className="up">▲{myPrev - myNow}</span> : myNow > myPrev ? <span className="down">▼{myNow - myPrev}</span> : null}
          </p>
          <ol>
            {rankNow.map((r) => (
              <motion.li key={r.name} layout className={r.me ? "me" : ""}>
                <span className="wk-who">
                  {r.yt && <Tuber name={r.yt} size={22} />}
                  {r.name}
                </span>
                <Delta x={r.twr - 1} />
              </motion.li>
            ))}
          </ol>
        </div>

        {(() => {
          const top = rows.filter((x) => x.yt).sort((a, b) => Math.abs(b.twr / b.prev - 1) - Math.abs(a.twr / a.prev - 1))[0];
          return top ? (
            <p className="rc-line">
              <Tuber name={top.yt} size={26} /> {rivalLine(top.yt, top.twr / top.prev - 1, after.t)}
            </p>
          ) : null;
        })()}
        <p className="muted small wk-top">
          이번 주 1등 종목: <b>{byK[week.top[0][0]]?.code}</b> <Delta x={week.top[0][1]} /> · 꼴찌: <b>{byK[week.bottom[1][0]]?.code}</b> <Delta x={week.bottom[1][1]} />
        </p>

        <button className="btn primary block" onClick={onNext} data-autofocus>
          {last ? "결산 보기 🏁" : `${week.t + 2}주차로 ▶`}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- 첫 판 안내(코치마크 3개)
const STEPS = [
  { sel: "[data-tour=hud]", title: "진짜 있었던 시장을 버티는 게임이에요", body: "한 턴 = 실제 1주. 총자산과 😎 멘탈을 지키세요. 멘탈이 0이 되면 다 팔아 버려요. 🎯 미션을 깨면 별을 받아요." },
  { sel: "[data-tour=market]", title: "종목 이름은 코드네임이에요", body: "기억으로 맞히지 못하게 이름을 가렸어요. 하나를 눌러 차트와 유튜브 영상을 보고, 마음에 들면 사 보세요. 고민되면 맨 위 📊 코스피 ETF!" },
  { sel: "[data-tour=next]", title: "준비되면 다음 주로", body: "주문은 모아 뒀다가 한 번에 체결돼요. 그 주의 실제 가격으로 결과가 나와요. ▶▶는 4주를 그대로 빨리 감아요. 유튜버 라이벌을 이겨 보세요!" },
];

/** 첫 판 안내(제어형). 2단계는 '직접 해 보기': 종목을 눌러야 넘어간다(Learning by doing) */
export function Tour({ i, onNext, onDone, waiting }: { i: number; onNext: () => void; onDone: () => void; waiting: boolean }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector(STEPS[i].sel);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.5;
      if (STEPS[i].sel !== "[data-tour=hud]" && STEPS[i].sel !== "[data-tour=next]") window.scrollTo({ top: tall ? top - 80 : top - window.innerHeight / 3 });
    }
    const t = window.setTimeout(() => setBox(el?.getBoundingClientRect() ?? null), 30);
    return () => window.clearTimeout(t);
  }, [i]);
  if (waiting) return null; // 시트를 보는 동안은 숨긴다
  const s = STEPS[i];
  const doIt = i === 1;
  const below = box ? box.top < window.innerHeight / 2 : true;
  return (
    <div className={`tour ${doIt ? "do" : ""}`} role="dialog" aria-modal={!doIt} aria-label="처음 하는 분을 위한 안내" data-ux="Coach Marks · Spotlight · Learning by Doing">
      {box && <div className="spot" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: Math.min(box.height + 12, window.innerHeight * 0.5) }} />}
      <div className="tour-tip" style={below && box ? { top: Math.min(box.top + Math.min(box.height, window.innerHeight * 0.5) + 18, window.innerHeight - 220) } : { bottom: box ? window.innerHeight - box.top + 18 : 120 }}>
        <p className="eyebrow">
          {i + 1} / {STEPS.length}
        </p>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tour-act">
          <button className="link" onClick={onDone}>
            건너뛰기
          </button>
          {doIt ? (
            <span className="tour-do">👆 종목 하나를 눌러 보세요</span>
          ) : (
            <button className="btn primary" onClick={() => (i < STEPS.length - 1 ? onNext() : onDone())} autoFocus>
              {i < STEPS.length - 1 ? "다음" : "시작!"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 개미 비서(범고래 박사, 시점 제한 RAG)
const SUGGEST = ["왜 요즘 화제야?", "유튜버들은 뭐라고 해?", "좋다는 말이 많아, 나쁘다는 말이 많아?"];

function Assistant({ v, a, runId, onAsked }: { v: View; a: Asset; runId: string; onAsked: (left: number) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<0 | 1 | 2>(0);
  const [res, setRes] = useState<AskOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [voted, setVoted] = useState<1 | -1 | null>(null);
  useEffect(() => {
    setRes(null);
    setErr(null);
    setQ("");
    setVoted(null);
  }, [a.k]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(1);
    setErr(null);
    setRes(null);
    setVoted(null);
    const t = window.setTimeout(() => setBusy((b) => (b ? 2 : 0)), 1200);
    try {
      const r = await api.ask(runId, question.trim(), a.k);
      setRes(r);
      onAsked(r.left);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      window.clearTimeout(t);
      setBusy(0);
    }
  };
  const left = v.asksLeft;
  return (
    <section className="assistant" aria-labelledby="ast-h" data-ux="AI Chat · Citations (RAG)">
      <header>
        <Orca size={54} talking={!!busy} />
        <div>
          <h3 id="ast-h">범고래 박사에게 묻기</h3>
          <p className="muted small">지금까지 나온 유튜브 영상만 찾아서 답해요 · 이번 시즌 {left}번 남음</p>
        </div>
      </header>
      {left > 0 && !res && (
        <>
          <div className="chips left">
            {SUGGEST.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)} disabled={!!busy}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="ask-row"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(q);
            }}
          >
            <label className="sr-only" htmlFor="ask-in">
              질문
            </label>
            <input id="ask-in" value={q} maxLength={120} placeholder={`${a.code}에 대해 궁금한 것`} onChange={(e) => setQ(e.target.value)} disabled={!!busy} />
            <button className="btn primary" disabled={!q.trim() || !!busy}>
              묻기
            </button>
          </form>
        </>
      )}
      {busy > 0 && (
        <p className="ast-busy" role="status">
          <span className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {busy === 1 ? "지난 자료를 찾는 중…(pgvector)" : "찾은 자료로 답을 쓰는 중…(Gemini)"}
        </p>
      )}
      {err && <p className="inline-alert">{err}</p>}
      {res && (
        <div className="ast-ans">
          <p className="bubble">{res.answer}</p>
          {res.cites.length > 0 && (
            <ol className="cites" aria-label="근거 자료">
              {res.cites.map((c) => (
                <li key={c.id}>
                  <span className="cite-id">{c.id}</span>
                  <span>
                    <b>
                      {c.kind} · {c.ago}
                    </b>{" "}
                    {c.text}
                    {c.ch && <span className="muted small"> · {c.ch}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="ast-foot">
            <span className="muted small">{res.source === "ai" ? `AI(${res.model}) · 검증 통과 · 자료 ${res.searched}건 중 인용` : "질문 횟수는 줄지 않았어요"}</span>
            {res.logId && (
              <span className="vote">
                <button className={voted === 1 ? "on" : ""} aria-label="도움 됐어요" onClick={() => (setVoted(1), api.vote(res.logId!, 1).catch(() => {}), toast("고마워요! 🐳"))}>
                  👍
                </button>
                <button className={voted === -1 ? "on" : ""} aria-label="별로예요" onClick={() => (setVoted(-1), api.vote(res.logId!, -1).catch(() => {}))}>
                  👎
                </button>
              </span>
            )}
          </div>
          {left > 0 && (
            <button className="link" onClick={() => setRes(null)}>
              다른 질문하기
            </button>
          )}
        </div>
      )}
      {left <= 0 && !res && <p className="empty">이번 시즌 질문을 다 썼어요. 다음 시즌에 또 만나요 🐳</p>}
      <p className="muted small">투자 권유가 아니에요. 사람들이 무엇을 말했는지만 정리해요.</p>
    </section>
  );
}

// ---------------------------------------------------------------- 리캡 카드(평범한 주는 3초만)
export function Recap({ weeks, before, after, onClose }: { weeks: Week[]; before: View; after: View; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, weeks.length > 1 ? 5200 : 3600);
    return () => window.clearTimeout(t);
  }, [onClose, weeks.length]);
  const total = weeks.reduce((a, w) => a * (1 + w.r), 1) - 1;
  const byRival = after.rivals.map((r, i) => ({ name: r.name, r: r.twr / before.rivals[i].twr - 1 }));
  const loud = [...byRival].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  const dm = after.mental - before.mental;
  const salary = weeks.reduce((a, w) => a + (w.salary ?? 0), 0);
  const lucks = weeks.map((w) => w.luck).filter(Boolean);
  const ruled = weeks.flatMap((w) => w.trades.filter((t) => t.rule)).length;
  return (
    <motion.aside className="recap" role="status" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} onClick={onClose} data-ux="Snackbar · Auto-dismiss">
      <div className="rc-top">
        <span className="rc-week">{weeks.length > 1 ? `${before.t + 1}~${after.t}주` : `${before.t + 1}주차`} 마감</span>
        <b className={total > 0.0005 ? "up" : total < -0.0005 ? "down" : ""}>{pct(total)}</b>
        <span className="muted small">
          멘탈 {dm >= 0 ? "+" : ""}
          {dm}
        </span>
        {salary > 0 && <span className="tag buy">월급 +{won(salary)}</span>}
        {ruled > 0 && <span className="tag">자동 규칙 {ruled}건</span>}
      </div>
      {lucks.map((l, i) => (
        <p key={i} className="rc-luck">
          {l!.icon} {l!.text}
        </p>
      ))}
      {loud && (
        <p className="rc-line">
          <Tuber name={loud.name} size={24} /> <b>{loud.name}</b> {rivalLine(loud.name, loud.r, after.t)}
        </p>
      )}
      <span className="rc-bar" aria-hidden>
        <i style={{ animationDuration: weeks.length > 1 ? "5.2s" : "3.6s" }} />
      </span>
    </motion.aside>
  );
}

// ---------------------------------------------------------------- 시즌 미션
export function MissionsSheet({ open, onClose, v }: { open: boolean; onClose: () => void; v: View }) {
  return (
    <Sheet open={open} onClose={onClose} title="🎯 이번 시즌 미션">
      <p className="muted small">미션 하나에 ★1, 등급 S·A는 ★2 · B는 ★1을 더 받아요. 별을 모으면 내 방 가구와 개미 옷이 열려요.</p>
      <ul className="missions">
        {v.missions.map((m) => (
          <li key={m.id} className={m.state}>
            <span className="ms-ic" aria-hidden>
              {m.icon}
            </span>
            <span>{m.label}</span>
            <b>{m.state === "done" ? "✓ 달성" : m.state === "fail" ? "✕ 실패" : "진행 중"}</b>
          </li>
        ))}
      </ul>
      <p className="muted small">내 개미 특성: {v.perk}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- 행운 카드(시즌 시작, 운 요소 — 발라트로의 조커처럼 한 줄 효과)
export function LuckPick({ open, onPick, onClose }: { open: boolean; onClose: () => void; onPick: (i: number) => Promise<{ id: string; icon: string; name: string; desc: string; others: { id: string; icon: string; name: string; desc: string }[] } | null> }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [card, setCard] = useState<Awaited<ReturnType<typeof onPick>>>(null);
  const [done, setDone] = useState(false);
  if (!open || done) return <Modal open={false} label="">{null}</Modal>;
  const flip = async (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const c = await onPick(i);
    if (!c) return setPicked(null);
    setCard(c);
  };
  const faces = card ? [card, ...card.others] : [];
  // 고른 자리에 내 카드, 나머지 자리에 다른 두 장
  const at = (i: number) => (card ? (i === picked ? faces[0] : faces[i < (picked ?? 0) ? 1 + i : i]) : null);
  return (
    <Modal open label="행운 카드 뽑기">
      <div className="luck" data-ux="Card Flip · Reveal">
        <p className="eyebrow">시즌 시작 · 행운 카드</p>
        <h2>{card ? `${card.icon} ${card.name}!` : "카드 한 장을 뒤집어 보세요"}</h2>
        <p className="muted small">{card ? card.desc : "무엇이 나올지는 운이에요. 이번 시즌 내내 효과가 있어요."}</p>
        <div className="luck-row">
          {[0, 1, 2].map((i) => {
            const f = at(i);
            const mine = i === picked;
            return (
              <button key={i} className={`luck-card ${f ? "flipped" : ""} ${card && !mine ? "other" : ""} ${mine ? "mine" : ""}`} onClick={() => flip(i)} disabled={picked !== null} aria-label={f ? `${f.name}: ${f.desc}` : `${i + 1}번 카드 뒤집기`}>
                <span className="lc-inner">
                  <span className="lc-back" aria-hidden>
                    🍀
                    <small>?</small>
                  </span>
                  <span className="lc-front">
                    {f && (
                      <>
                        <span className="lc-ic">{f.icon}</span>
                        <b>{f.name}</b>
                        <small>{f.desc}</small>
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {card && (
          <>
            <p className="muted small">흐린 카드는 나올 수도 있었던 카드예요.</p>
            <button className="btn primary block" onClick={() => (setDone(true), onClose())} data-autofocus>
              시즌 시작 ▶
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- 멘탈이 낮을 때: 유혹(불안) · 한 번 더 확인(흔들림)
export function Temptation({ code, onLook, onResist }: { code: string; onLook: () => void; onResist: () => void }) {
  return (
    <motion.aside className="tempt" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} role="alert" data-ux="Nudge · Dark Pattern 체험">
      <p>
        <span aria-hidden>😐</span> <b>멘탈 불안</b> · 단톡방: &ldquo;<b>{code}</b> 지금 안 사면 늦는다!!&rdquo;
      </p>
      <div className="tempt-act">
        <button className="btn ghost" onClick={onResist}>
          참는다 🧘
        </button>
        <button className="btn primary" onClick={onLook}>
          보러 가기
        </button>
      </div>
    </motion.aside>
  );
}

export function ShakyConfirm({ text, onYes, onNo }: { text: string | null; onYes: () => void; onNo: () => void }) {
  return (
    <Modal open={!!text} label="정말요?">
      {text && (
        <div className="event">
          <div className="ev-icon" aria-hidden>
            😰
          </div>
          <h2>손이 떨려요… 정말요?</h2>
          <p className="ev-body">{text}</p>
          <p className="muted small">멘탈이 30 아래면 판단이 흐려져요(수수료 1.5배). 한 주 쉬면 회복돼요.</p>
          <div className="ev-choices">
            <button className="choice" onClick={onNo} data-autofocus>
              <b>잠깐, 다시 생각할래</b>
              <span>주문을 담지 않아요</span>
            </button>
            <button className="choice" onClick={onYes}>
              <b>그래도 할래</b>
              <span>주문을 담아요</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** 시즌 목표 카드: 시작할 때 '누구를 이기면 무엇을 받는지'를 먼저 보여 준다(돈을 모으는 이유) */
export function GoalIntro({ open, v, stars, onClose }: { open: boolean; v: View; stars: number; onClose: () => void }) {
  if (!open || !v.goal || !v.rivals[v.goal.i]) return <Modal open={false} label="">{null}</Modal>;
  const rival = v.rivals[v.goal.i];
  const miles = v.miles ?? [];
  const nf = nextFurniture(stars);
  return (
    <Modal open label="이번 시즌 목표">
      <div className="goal-intro" data-ux="Goal Setting · Reward Preview">
        <p className="eyebrow">이번 시즌 목표</p>
        <div className="gi-vs">
          <span className="gi-me">
            <Ant char={v.char as CharId} size={44} mood="happy" />나
          </span>
          <b>VS</b>
          <span className="gi-rival">
            <Tuber name={rival.name} size={44} />
            {rival.name}
          </span>
        </div>
        <h2>{rival.name}보다 많이 벌기</h2>
        <p className="muted small">시즌이 끝났을 때 이 유튜버의 &lsquo;오른다&rsquo; 따라 사기보다 수익률이 높으면 성공!</p>
        <ul className="gi-rewards">
          <li>
            <span>🎯</span>
            <span>목표 성공</span>
            <b>⭐+{v.goal.stars}</b>
          </li>
          {miles.map((m) => (
            <li key={m.at}>
              <span>🎁</span>
              <span>수익률 +{Math.round(m.at * 100)}% 넘는 순간 상자</span>
              <b>⭐+{m.stars}</b>
            </li>
          ))}
        </ul>
        {nf && (
          <p className="gi-next">
            별 {nf.stars - stars}개만 더 모으면 내 방에 <b>{nf.icon} {nf.name}</b> 등장!
          </p>
        )}
        <button className="btn primary block" onClick={onClose}>
          좋아, 해 보자 ▶
        </button>
      </div>
    </Modal>
  );
}

/** 중간 상자: 수익률 선을 넘는 순간 바로 별(=가구)로 */
export function MileBox({ got, onClose }: { got: { at: number[]; stars: number; before: number; after: number } | null; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [got]);
  if (!got) return <Modal open={false} label="">{null}</Modal>;
  const fresh = unlockedFurniture(got.after).filter((x) => !unlockedFurniture(got.before).includes(x));
  const newF = FURNITURE.filter((f) => fresh.includes(f.id));
  const nf = nextFurniture(got.after);
  return (
    <Modal open label="상자 획득">
      <div className="mile-box" data-ux="Variable Reward · Celebration">
        <p className="eyebrow">수익률 +{Math.round(Math.max(...got.at) * 100)}% 돌파!</p>
        {!open ? (
          <>
            <motion.button className="mb-box" onClick={() => (setOpen(true), sfx("level"))} animate={{ rotate: [0, -6, 6, -4, 4, 0] }} transition={{ repeat: Infinity, duration: 1.4, repeatDelay: 0.6 }} aria-label="상자 열기">
              🎁
            </motion.button>
            <h2>가구 상자가 왔어요</h2>
            <p className="muted small">눌러서 열어 보세요</p>
          </>
        ) : (
          <>
            <motion.div className="mb-prize" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              ⭐ +{got.stars}
            </motion.div>
            {newF.length ? (
              <h2>
                새 가구: {newF.map((f) => `${f.icon} ${f.name}`).join(", ")}!
              </h2>
            ) : (
              <h2>별 {got.after}개</h2>
            )}
            <p className="muted small">{nf ? `${nf.stars - got.after}개 더 모으면 ${nf.icon} ${nf.name}` : "가구를 다 모았어요!"} · 내 방에 바로 들어가요</p>
            <button className="btn primary block" onClick={onClose}>
              계속하기
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
