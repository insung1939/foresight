// 플레이 화면의 네 판: 피드 · 시장 · 내 계좌 · 라이벌
import { useMemo, useState } from "react";
import { Tuber, rivalLine } from "../../components/Characters";
import { PlazaView } from "../../components/Scene";
import { Delta, Spark } from "../../components/ui";
import { pct, views, won } from "../../lib/format";
import type { Asset, Market, View } from "../../lib/types";
import { MARKET_KO, flames, lockHint, preview, weekEmoji, type Order } from "./logic";

const Fire = ({ n }: { n: number }) =>
  n ? (
    <span className="fire" aria-label={`화제성 ${n}단계`}>
      {"🔥".repeat(n)}
    </span>
  ) : null;

export function CodeChip({ a, onOpen }: { a: Asset; onOpen: (k: string) => void }) {
  return (
    <button className={`code-chip m-${a.market}`} onClick={() => onOpen(a.k)}>
      {a.code}
    </button>
  );
}

// ---------------------------------------------------------------- 피드
export function Feed({ v, onOpen }: { v: View; onOpen: (k: string) => void }) {
  const byK = useMemo(() => Object.fromEntries(v.assets.map((a) => [a.k, a])), [v.assets]);
  const movers = [...v.assets].sort((a, b) => b.chg - a.chg);
  const discs = v.assets.filter((a) => a.disc.length);
  const ixChg = v.index.length > 1 ? v.index[v.index.length - 1] / v.index[v.index.length - 2] - 1 : 0;
  return (
    <div className="feed">
      <section aria-labelledby="plz">
        <h3 id="plz" className="sec-title">
          🏟️ 화제 광장 <span className="muted small">— 지난주 개미들이 어디로 몰렸나</span>
        </h3>
        <PlazaView stalls={v.assets.filter((a) => !a.locked).map((a) => ({ k: a.k, code: a.code, hype: a.hype, chg: a.chg }))} onOpen={onOpen} />
      </section>
      <section className="card market-line" aria-label="시장 한 줄">
        <div>
          <p className="eyebrow">지난주 시장</p>
          <p className="big">
            개미지수 <b>{v.index[v.index.length - 1].toLocaleString("ko-KR")}</b> <Delta x={ixChg} />
          </p>
          <p className="muted small">실제 코스피를 1,000에서 시작하게 바꾼 값이에요</p>
        </div>
        <Spark data={v.index} w={96} h={40} />
      </section>

      <section aria-labelledby="hl">
        <h3 id="hl" className="sec-title">
          📺 지난주 가장 많이 본 영상
        </h3>
        {v.headlines.length === 0 && <p className="empty">지난주엔 우리 종목을 다룬 영상이 없었어요. 조용한 주예요.</p>}
        <ul className="yt-list">
          {v.headlines.map((h, i) => (
            <li key={i} className="yt">
              <div className="yt-thumb" aria-hidden>
                ▶
              </div>
              <div className="yt-body">
                <p className="yt-title">{h.t}</p>
                <p className="yt-meta">
                  {h.ch} · 조회 {views(h.v)} {h.st === "b" && <span className="tag bull">오른다</span>}
                </p>
                {byK[h.k] && <CodeChip a={byK[h.k]} onOpen={onOpen} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mv" className="movers">
        <h3 id="mv" className="sec-title">
          ⚡ 지난주 급등·급락
        </h3>
        <div className="mover-row">
          {[...movers.slice(0, 2), ...movers.slice(-2).reverse()].map((a) => (
            <button key={a.k} className="mover" onClick={() => onOpen(a.k)}>
              <span className="m-code">{a.code}</span>
              <Delta x={a.chg} />
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="dc">
        <h3 id="dc" className="sec-title">
          📑 지난주 공시
        </h3>
        {discs.length === 0 ? (
          <p className="empty">지난주 우리 종목 공시는 없었어요.</p>
        ) : (
          <ul className="disc-list">
            {discs.slice(0, 6).map((a) => (
              <li key={a.k}>
                <CodeChip a={a} onOpen={onOpen} />
                <span>{a.disc[0]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- 시장
type Sort = "hype" | "chg" | "name";
export function MarketList({ v, orders, onOpen }: { v: View; orders: Order[]; onOpen: (k: string) => void }) {
  const [tab, setTab] = useState<Market | "ALL">("ALL");
  const [sort, setSort] = useState<Sort>("hype");
  const p = preview(v, orders);
  const markets = (["KRX", "US", "CRYPTO"] as Market[]).filter((m) => v.assets.some((a) => a.market === m));
  let list = v.assets.filter((a) => tab === "ALL" || a.market === tab);
  list = [...list].sort((a, b) => (sort === "hype" ? b.hype - a.hype || b.chg - a.chg : sort === "chg" ? b.chg - a.chg : a.code.localeCompare(b.code, "ko")));
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
      <div className="sort-row">
        <label>
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="hype">화제순</option>
            <option value="chg">지난주 등락순</option>
            <option value="name">이름순</option>
          </select>
        </label>
        <span className="muted small">
          가격은 지난주 금요일 종가예요 · 보유 {p.holdCount}/{v.maxHold}
        </span>
      </div>
      <ul className="asset-list" data-tour="market" data-ux="List · Sparkline">
        {list.map((a) => {
          const held = v.pos.find((x) => x.k === a.k)?.qty;
          const pend = orders.find((o) => o.k === a.k);
          return (
            <li key={a.k}>
              <button className={`asset-row ${a.locked ? "locked" : ""}`} onClick={() => onOpen(a.k)}>
                <span className="ar-name">
                  <b>{a.code}</b>
                  <span className="ar-sub">
                    {MARKET_KO[a.market]}
                    {held ? <span className="tag held">{held.toLocaleString()}주</span> : null}
                    {pend && <span className={`tag ${pend.q > 0 ? "buy" : "sell"}`}>{pend.q > 0 ? "매수 대기" : "매도 대기"}</span>}
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
  const byK = Object.fromEntries(v.assets.map((a) => [a.k, a]));
  const p = preview(v, orders);
  const invested = v.value - v.cash;
  return (
    <div className="account">
      <section className="card acct-sum">
        <p className="eyebrow">총자산</p>
        <p className="acct-total">{won(v.value)}</p>
        <p>
          누적 수익률 <Delta x={v.twr - 1} /> <span className="muted small">· 넣은 돈 {won(v.deposits)}</span>
        </p>
        <div className="alloc" aria-label={`주식·코인 ${pct(invested / v.value, 0)}, 현금 ${pct(v.cash / v.value, 0)}`}>
          <i style={{ width: `${(invested / v.value) * 100}%` }} />
        </div>
        <p className="muted small">
          투자 {won(invested)} · 현금 {won(v.cash)}
        </p>
      </section>

      {orders.length > 0 && (
        <section aria-labelledby="po">
          <h3 id="po" className="sec-title">
            🧾 이번 주 주문 ({orders.length}) <span className="muted small">— 다음 주로 넘길 때 체결돼요</span>
          </h3>
          <ul className="order-list">
            {orders.map((o) => {
              const a = byK[o.k];
              return (
                <li key={o.k}>
                  <span className={`tag ${o.q > 0 ? "buy" : "sell"}`}>{o.q > 0 ? "사기" : "팔기"}</span>
                  <b>{a.code}</b> {Math.abs(o.q).toLocaleString()}주
                  <span className="muted small"> ≈ {won(Math.abs(o.q) * a.price)}</span>
                  <button className="icon-btn" onClick={() => onCancel(o.k)} aria-label={`${a.code} 주문 취소`}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="muted small">주문 뒤 현금 {won(p.cash)}</p>
        </section>
      )}

      <section aria-labelledby="hd">
        <h3 id="hd" className="sec-title">
          💼 보유 종목 {v.pos.length}/{v.maxHold}
        </h3>
        {v.pos.length === 0 ? (
          <p className="empty">아직 아무것도 안 샀어요. 시장 탭에서 종목을 눌러 보세요.</p>
        ) : (
          <ul className="pos-list">
            {v.pos.map((x) => (
              <li key={x.k} className="pos-row">
                <button className="pos" onClick={() => onOpen(x.k)}>
                  <span>
                    <b>{byK[x.k].code}</b>
                    <span className="muted small"> {x.qty.toLocaleString()}주 · 평단 {Math.round(x.cost).toLocaleString()}</span>
                  </span>
                  <span className="pos-r">
                    <b>{won(x.value)}</b>
                    <Delta x={x.gain} />
                  </span>
                </button>
                <button className="sell-all" disabled={v.skip || orders.some((o) => o.k === x.k)} onClick={() => onOrder({ k: x.k, q: -x.qty })} aria-label={`${byK[x.k].code} 전부 팔기 주문`} data-ux="Quick Action">
                  전부
                  <br />
                  팔기
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
      <p className="muted small">
        라이벌 유튜버는 실제 채널이에요. 매주 <b>지난주 영상 제목에서 &lsquo;오른다&rsquo;고 한 종목</b>을 똑같이 나눠 샀다고 계산한 가상 성적이에요(hindsight 수집 데이터).
      </p>
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
