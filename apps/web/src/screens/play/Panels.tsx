// 플레이 화면의 네 판: 피드 · 시장 · 내 계좌 · 라이벌
import { usePro } from "../../lib/mode";
import { useMemo, useState } from "react";
import { Tuber, rivalLine } from "../../components/Characters";
import { useRunCtx } from "./ctx";
import { PlazaView } from "../../components/Scene";
import { Delta, Spark } from "../../components/ui";
import { pct, views, won } from "../../lib/format";
import type { Asset, Market, View } from "../../lib/types";
import { sectorOf } from "../../lib/sectors";
import { MARKET_KO, flames, lockHint, orderVerb, preview, weekEmoji, type Order } from "./logic";

const Fire = ({ n }: { n: number }) =>
  n ? (
    <span className="fire" aria-label={`화제성 ${n}단계`}>
      {"🔥".repeat(n)}
    </span>
  ) : null;

export function CodeChip({ a, onOpen }: { a: Asset; onOpen: (k: string) => void }) {
  return (
    <button className={`code-chip m-${a.market}`} onClick={() => onOpen(a.k)} title={`${a.code}: ${sectorOf(a.sector).desc}`}>
      {a.code}
    </button>
  );
}

// ---------------------------------------------------------------- 피드
export function Feed({ v, onOpen }: { v: View; onOpen: (k: string) => void }) {
  const byK = useMemo(() => Object.fromEntries(v.assets.map((a) => [a.k, a])), [v.assets]);
  const ixChg = v.index.length > 1 ? v.index[v.index.length - 1] / v.index[v.index.length - 2] - 1 : 0;
  return (
    <div className="feed">
      <section aria-labelledby="plz">
        <h3 id="plz" className="sec-title">
          🏟️ 화제 광장 <span className="muted small">지난주 개미가 몰린 종목</span>
        </h3>
        <PlazaView stalls={v.assets.filter((a) => !a.locked).map((a) => ({ k: a.k, code: a.code, hype: a.hype, chg: a.chg }))} onOpen={onOpen} />
      </section>
      <section className="market-line" aria-label="지난주 시장" title="개미지수 = 실제 코스피를 시즌 시작 때 1,000으로 맞춘 값">
        <span className="muted small">지난주 시장</span>
        <b>개미지수 {v.index[v.index.length - 1].toLocaleString("ko-KR")}</b>
        <Delta x={ixChg} />
        <Spark data={v.index} w={64} h={24} />
      </section>

      <section aria-labelledby="hl">
        <h3 id="hl" className="sec-title">
          📺 지난주 인기 영상 <span className="muted small">누르면 그 종목으로 가요</span>
        </h3>
        <p className="mask-note">🕶️ 회사 이름·주가 수준·날짜는 가렸어요. 회사를 짐작해도 &lsquo;언제&rsquo;인지는 끝날 때까지 비밀이라 다음 주 가격은 아무도 몰라요.</p>
        {v.headlines.length === 0 && <p className="empty">지난주엔 우리 종목을 다룬 영상이 없었어요. 조용한 주예요.</p>}
        <ul className="yt-list">
          {v.headlines.map((h, i) => (
            <li key={i}>
              <button className="yt" onClick={() => byK[h.k] && onOpen(h.k)} aria-label={`${byK[h.k]?.code ?? ""} 자세히: ${h.t}`}>
                <Tuber name={h.ch} size={40} />
                <span className="yt-body">
                  <span className="yt-title">{h.t}</span>
                  <span className="yt-meta">
                    {h.ch} · 조회 {views(h.v)} {h.st === "b" && <span className="tag bull">오른다</span>}
                  </span>
                  {byK[h.k] && <span className={`code-chip m-${byK[h.k].market}`}>{byK[h.k].code} 보기 ›</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}

// ---------------------------------------------------------------- 시장
type Sort = "hype" | "up" | "down" | "mine";
const SORTS: { id: Sort; label: string }[] = [
  { id: "hype", label: "🔥 화제" },
  { id: "up", label: "▲ 오른" },
  { id: "down", label: "▼ 내린" },
  { id: "mine", label: "💼 보유" },
];
export function MarketList({ v, orders, onOpen }: { v: View; orders: Order[]; onOpen: (k: string) => void }) {
  const [tab, setTab] = useState<Market | "ALL">("ALL");
  const [sort, setSort] = useState<Sort>("hype");
  const p = preview(v, orders);
  const markets = (["KRX", "US", "CRYPTO"] as Market[]).filter((m) => v.assets.some((a) => a.market === m));
  const etf = v.assets.find((a) => a.k === v.etf);
  let list = v.assets.filter((a) => a.k !== v.etf && (tab === "ALL" || a.market === tab));
  if (sort === "mine") list = list.filter((a) => p.qty[a.k] || orders.some((o) => o.k === a.k));
  list = [...list].sort((a, b) => (sort === "hype" || sort === "mine" ? b.hype - a.hype || b.chg - a.chg : sort === "up" ? b.chg - a.chg : a.chg - b.chg));
  return (
    <div className="market">
      {markets.length > 1 && (
      <div className="seg" role="tablist" aria-label="시장" data-ux="Segmented Control · Filter">
        {(["ALL", ...markets] as const).map((m) => {
          const locked = m !== "ALL" && !v.markets.includes(m);
          return (
            <button key={m} role="tab" aria-selected={tab === m} className={tab === m ? "on" : ""} onClick={() => setTab(m)}>
              {m === "ALL" ? "전체" : MARKET_KO[m]}
              {locked && <span aria-label="잠김"> 🔒</span>}
            </button>
          );
        })}
      </div>
      )}
      {tab !== "ALL" && !v.markets.includes(tab) && <p className="inline-alert">🔒 {lockHint(tab)}. 지금은 구경만 할 수 있어요.</p>}
      <div className="sort-chips" role="radiogroup" aria-label="정렬·보기" data-ux="Chip Group · Sorting">
        {SORTS.map((x) => (
          <button key={x.id} role="radio" aria-checked={sort === x.id} className={`schip ${sort === x.id ? "on" : ""}`} onClick={() => setSort(x.id)}>
            {x.label}
            {x.id === "mine" && p.holdCount > 0 && <i>{p.holdCount}</i>}
          </button>
        ))}
      </div>
      <p className="muted small mk-note">
        가격은 지난주 금요일 종가 · 보유 {p.holdCount}/{v.maxHold}종목
      </p>
      {etf && (tab === "ALL" || tab === "KRX") && sort !== "mine" && (
        <button className="etf-row" onClick={() => onOpen(etf.k)} data-ux="Featured Item">
          <span className="etf-ic" aria-hidden>
            📊
          </span>
          <span className="ar-name">
            <b>
              {etf.code} {p.qty[etf.k] ? <span className="tag held">{p.qty[etf.k].toLocaleString()}주</span> : null}
            </b>
            <span className="ar-sub">고민될 땐 시장 전체를 사요 · 유튜버 말 대신 지수</span>
          </span>
          <span className="ar-px">
            <b>{Math.round(etf.price).toLocaleString("ko-KR")}</b>
            <Delta x={etf.chg} />
          </span>
        </button>
      )}
      {list.length === 0 && <p className="empty">{sort === "mine" ? "아직 담은 종목이 없어요. 🔥 화제에서 골라 보세요." : "이 시장엔 종목이 없어요."}</p>}
      <ul className="asset-list" data-tour="market" data-ux="List · Sparkline">
        {list.map((a) => {
          const held = v.pos.find((x) => x.k === a.k)?.qty;
          const pend = orders.find((o) => o.k === a.k);
          return (
            <li key={a.k}>
              <button className={`asset-row ${a.locked ? "locked" : ""}`} onClick={() => onOpen(a.k)} title={sectorOf(a.sector).desc}>
                <span className="ar-name">
                  <b>{a.code}</b>
                  <span className="ar-sub">
                    <span className="sec-tag">
                      {sectorOf(a.sector).icon} {sectorOf(a.sector).short}
                    </span>
                    {MARKET_KO[a.market]}
                    {held ? <span className={`tag ${held < 0 ? "short" : "held"}`}>{held < 0 ? `🐻 공매도 ${(-held).toLocaleString()}주` : `${held.toLocaleString()}주`}</span> : null}
                    {pend && <span className={`tag ${pend.s ? "short" : pend.q > 0 ? "buy" : "sell"}`}>{orderVerb(v, pend)} 대기</span>}
                  </span>
                </span>
                <Spark data={a.hist} />
                <span className="ar-px">
                  <b>{Math.round(a.price).toLocaleString("ko-KR")}</b>
                  <Delta x={a.chg} />
                </span>
                <span className="ar-hype">
                  <Fire n={flames(a.hype)} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- 내 계좌
export function Account({ v, orders, onOpen, onCancel, onOrder }: { v: View; orders: Order[]; onOpen: (k: string) => void; onCancel: (k: string) => void; onOrder: (o: Order) => void }) {
  const [pro] = usePro();
  const byK = Object.fromEntries(v.assets.map((a) => [a.k, a]));
  const p = preview(v, orders);
  const longV = v.pos.reduce((s, x) => s + (x.qty > 0 ? x.value : 0), 0);
  const debt = v.pos.reduce((s, x) => s + (x.qty < 0 ? -x.value : 0), 0);
  const gross = longV + Math.max(0, v.cash);
  return (
    <div className="account">
      <section className="card acct-sum">
        <p className="eyebrow">총자산</p>
        <p className="acct-total">{won(v.value)}</p>
        <p>
          누적 수익률 <Delta x={v.twr - 1} /> <span className="muted small">· 넣은 돈 {won(v.deposits)}</span>
        </p>
        <div className="alloc" aria-label={`주식·코인 ${pct(longV / (gross || 1), 0)}, 현금 ${pct(Math.max(0, v.cash) / (gross || 1), 0)}`}>
          <i style={{ width: `${(longV / (gross || 1)) * 100}%` }} />
        </div>
        <dl className="acct-grid">
          <div>
            <dt>💵 현금</dt>
            <dd>{won(v.cash)}</dd>
          </div>
          <div>
            <dt>📦 주식·코인</dt>
            <dd>{longV ? won(longV) : "없음"}</dd>
          </div>
          {debt > 0 && (
            <div className="short">
              <dt>🐻 공매도 갚을 돈</dt>
              <dd>−{won(debt)}</dd>
            </div>
          )}
          {orders.length > 0 && (
            <div className="after">
              <dt>🧾 주문 체결 뒤 현금</dt>
              <dd>{won(p.cash)}</dd>
            </div>
          )}
        </dl>
      </section>

      {pro && <RulesPanel v={v} />}

      {orders.length > 0 && (
        <section aria-labelledby="po">
          <h3 id="po" className="sec-title">
            🧾 이번 주 주문 ({orders.length}) <span className="muted small">다음 주로 넘기면 한꺼번에 체결돼요</span>
          </h3>
          <ul className="order-list">
            {orders.map((o) => {
              const a = byK[o.k];
              return (
                <li key={o.k + (o.s ? ":s" : "")}>
                  <span className={`tag ${o.s ? "short" : o.q > 0 ? "buy" : "sell"}`}>{orderVerb(v, o)}</span>
                  <b>{a.code}</b> {Math.abs(o.q).toLocaleString()}주
                  <span className="muted small"> ≈ {won(Math.abs(o.q) * a.price)}</span>
                  <button className="icon-btn" onClick={() => onCancel(o.k + (o.s ? ":s" : ""))} aria-label={`${a.code} 주문 취소`}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="muted small">주문 뒤 현금 {won(p.cash)}{p.shortUsed > 0 ? ` · 공매도 ${won(p.shortUsed)}` : ""}</p>
        </section>
      )}

      <section aria-labelledby="hd">
        <h3 id="hd" className="sec-title">
          💼 보유 종목 {v.pos.length}/{v.maxHold} {v.pos.some((x) => x.short) && <span className="muted small">공매도 포함</span>}
        </h3>
        {v.pos.length === 0 ? (
          <p className="empty">아직 아무것도 안 샀어요. 시장 탭에서 종목을 눌러 보세요.</p>
        ) : (
          <ul className="pos-list">
            {v.pos.map((x) => (
              <li key={x.k} className={`pos-row ${x.short ? "short" : ""}`}>
                <button className="pos" onClick={() => onOpen(x.k)}>
                  <span>
                    <b>{byK[x.k].code}</b>
                    <span className="muted small">
                      {" "}
                      {x.short ? `🐻 공매도 ${(-x.qty).toLocaleString()}주 · 판 값` : `${x.qty.toLocaleString()}주 · 평단`} {Math.round(x.cost).toLocaleString()}
                    </span>
                  </span>
                  <span className="pos-r">
                    <b>{x.short ? `갚을 돈 ${won(-x.value)}` : won(x.value)}</b>
                    <Delta x={x.gain} />
                  </span>
                </button>
                <button
                  className="sell-all"
                  disabled={v.skip || orders.some((o) => o.k === x.k)}
                  onClick={() => onOrder({ k: x.k, q: -x.qty })}
                  aria-label={`${byK[x.k].code} ${x.short ? "전부 갚기" : "전부 팔기"} 주문`}
                  data-ux="Quick Action"
                >
                  전부
                  <br />
                  {x.short ? "갚기" : "팔기"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {v.hist.length > 0 && (
        <section aria-labelledby="wk">
          <h3 id="wk" className="sec-title">
            📅 지난 주들
          </h3>
          <p className="week-grid" aria-label={v.hist.map((h, i) => `${i + 1}주 ${pct(h.r)}`).join(", ")}>
            {v.hist.map((h, i) => (
              <span key={i} title={`${i + 1}주차 ${pct(h.r)}`}>
                {weekEmoji(h.r)}
              </span>
            ))}
          </p>
          <p className="muted small">🟥 +3% 이상 · 🔴 상승 · ⬜ 보합 · 🔵 하락 · 🟦 −3% 이하</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 라이벌
export function Rivals({ v }: { v: View }) {
  const rows = [
    { name: "나", twr: v.twr, me: true, note: "" },
    ...v.rivals.map((r) => ({ name: r.name, twr: r.twr, me: false, yt: true, note: r.picks ? `지난주 '오른다' ${r.picks}종목` : "지난주 '오른다' 영상 없음 → 현금" })),
    { name: "코스피 그냥 들고 있기", twr: v.kospi, me: false, note: "아무것도 안 고르고 시장 전체" },
  ].sort((a, b) => b.twr - a.twr);
  const max = Math.max(...rows.map((r) => Math.abs(r.twr - 1)), 0.01);
  return (
    <div className="rivals">
      <p className="muted small">라이벌은 실제 유튜브 채널이에요. 지난주 영상에서 &lsquo;오른다&rsquo;고 한 종목을 그대로 따라 샀다면 어땠을지 계산했어요.</p>
      <ol className="rival-list" data-ux="Leaderboard">
        {rows.map((r, i) => (
          <li key={r.name} className={r.me ? "me" : ""}>
            <span className="rk">{i + 1}</span>
            {"yt" in r ? <Tuber name={r.name} size={32} /> : <span className="rv-ic">{r.me ? "🐜" : "📊"}</span>}
            <span className="rv-name">
              <b>{r.me ? "나" : r.name}</b>
              {r.note && <span className="muted small">{r.note}</span>}
              {"yt" in r && v.t > 0 && <span className="rv-line">“{rivalLine(r.name, (r.twr - 1) / 3, v.t)}”</span>}
            </span>
            <span className="rv-bar" aria-hidden>
              <i className={r.twr >= 1 ? "up" : "down"} style={{ width: `${(Math.abs(r.twr - 1) / max) * 100}%` }} />
            </span>
            <Delta x={r.twr - 1} />
          </li>
        ))}
      </ol>
    </div>
  );
}


// ---------------------------------------------------------------- 전략 카드(자동 규칙)
const RULE_CARDS = [
  { id: "stop", icon: "✂️", name: "자동 손절", desc: "손실이 10%를 넘으면 전부 정리해요(공매도는 갚아요)" },
  { id: "take", icon: "💎", name: "자동 익절", desc: "수익이 20%를 넘으면 절반 정리해요" },
  { id: "dca", icon: "🐷", name: "적립식", desc: "매주 50만 원어치 코스피 ETF 를 사요" },
  { id: "cap", icon: "🧺", name: "몰빵 방지", desc: "한 종목이 40%를 넘으면 넘는 만큼 팔아요" },
];

export function RulesPanel({ v }: { v: View }) {
  const ctx = useRunCtx();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (id: string) => {
    if (!ctx) return;
    setBusy(id);
    try {
      await ctx.setRules({ ...v.rules, [id]: !v.rules[id] });
    } finally {
      setBusy(null);
    }
  };
  const on = Object.values(v.rules).filter(Boolean).length;
  return (
    <section aria-labelledby="rules-h" className="rules" data-ux="Toggle Switch · Automation">
      <h3 id="rules-h" className="sec-title">
        🃏 전략 카드 {on > 0 && <span className="tag held">{on}장 켜짐</span>}
        <span className="muted small">켜 두면 매주 알아서 해 줘요. ▶▶ 빨리 감기랑 찰떡!</span>
      </h3>
      <ul className="rule-list">
        {RULE_CARDS.map((r) => (
          <li key={r.id}>
            <button className={`rule ${v.rules[r.id] ? "on" : ""}`} role="switch" aria-checked={!!v.rules[r.id]} onClick={() => toggle(r.id)} disabled={busy === r.id || v.done}>
              <span className="rule-ic" aria-hidden>
                {r.icon}
              </span>
              <span className="rule-tx">
                <b>{r.name}</b>
                <small>{r.desc}</small>
              </span>
              <span className="switch" aria-hidden>
                <i />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
