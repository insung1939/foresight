import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { dday, pct, views } from "../lib/format";
import { CARDS, cardDef, type CardDef } from "../lib/game";
import { read, write } from "../lib/storage";
import { api } from "../lib/api";
import { splitHype } from "../lib/hype";
import type { AskResult, CardKey, Cards, Finance, Stance } from "../lib/types";
import Chart from "./Chart";
import { Delta, Skeleton } from "./ui";

// ------------------------------------------------------------ 카드 덱
interface DeckProps {
  opened: CardKey[];
  limit: number;
  busyKey: string | null;
  onOpen: (k: CardKey) => void;
}

export function Deck({ opened, limit, busyKey, onOpen }: DeckProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const left = limit - opened.length;
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(id);
  }, [msg]);

  const tap = (d: CardDef) => {
    if (opened.includes(d.key)) {
      document.getElementById(`panel-${d.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (left <= 0) return setMsg(`카드는 ${limit}장까지만 열 수 있어요. 무엇을 볼지 고르는 것도 실력이에요.`);
    setMsg(null);
    onOpen(d.key);
  };

  return (
    <div className="deck-wrap">
      <div className="deck-head">
        <span>정보 카드</span>
        <span className="deck-left" aria-live="polite">
          {left > 0 ? (
            <>
              6장 중 <b>{left}장</b> 더 열 수 있어요
            </>
          ) : (
            "다 열었어요"
          )}
        </span>
      </div>
      <div className="deck" role="list">
        {CARDS.map((d, i) => {
          const isOpen = opened.includes(d.key);
          const loading = busyKey === `card:${d.key}`;
          const dim = !isOpen && left <= 0;
          return (
            <motion.button
              key={d.key}
              role="listitem"
              className={`flip ${isOpen ? "open" : ""} ${dim ? "dim" : ""} ${loading ? "loading" : ""}`}
              onClick={() => tap(d)}
              aria-pressed={isOpen}
              aria-busy={loading}
              aria-label={`${d.label}${isOpen ? ", 열림" : ""}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              whileTap={dim ? undefined : { scale: 0.96 }}
            >
              <motion.span className="flip-inner" animate={{ rotateY: isOpen ? 180 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
                <span className="face front">
                  <span className="icon">{loading ? <span className="spinner" /> : d.icon}</span>
                  <span className="label">{d.label}</span>
                  <span className="desc">{d.desc}</span>
                </span>
                <span className="face back">
                  <span className="icon">{d.icon}</span>
                  <span className="label">{d.label}</span>
                  <span className="desc">✓ 열림 · 아래에서 보기</span>
                </span>
              </motion.span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {msg && (
          <motion.p className="deck-msg" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {msg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------ 열린 카드 내용
interface PanelsProps {
  opened: CardKey[];
  cards: Cards;
  ret60: number;
  ai: { gameKey: string; asked: number; limit: number; ask: (q: string) => Promise<AskResult | null> };
}

export function Panels({ opened, cards, ret60, ai }: PanelsProps) {
  return (
    <AnimatePresence initial={false}>
      {opened.map((k) => {
        const d = cardDef(k);
        return (
          <motion.section
            key={k}
            id={`panel-${k}`}
            className={`panel card-${k}`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <h3 className="panel-title">
              <span aria-hidden>{d.icon}</span> {d.label}
            </h3>
            {k === "ai" ? <AiChat {...ai} intro={cards.ai?.intro} suggestions={cards.ai?.suggestions ?? []} /> : <CardBody k={k} cards={cards} ret60={ret60} />}
          </motion.section>
        );
      })}
    </AnimatePresence>
  );
}

const STANCE: Record<Stance, { label: string; cls: string }> = {
  bull: { label: "오른다", cls: "chip up" },
  bear: { label: "내린다", cls: "chip down" },
  neutral: { label: "중립", cls: "chip" },
};

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty">
      <span aria-hidden>{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function CardBody({ k, cards, ret60 }: { k: CardKey; cards: Cards; ret60: number }) {
  if (k === "chart" && cards.chart) {
    const pre = cards.chart.points;
    const kospi = pre[pre.length - 1].b / pre[0].b - 1;
    const hot = pre.filter((p) => p.t > -5 && p.v >= 2).length;
    const fromHigh = 100 / Math.max(...pre.map((p) => p.p)) - 1;
    return (
      <>
        <div className="stats">
          <div>
            <small>60일 주가</small>
            <Delta x={ret60} digits={0} />
          </div>
          <div>
            <small>같은 기간 코스피</small>
            <Delta x={kospi} digits={0} />
          </div>
          <div>
            <small>60일 고점 대비</small>
            <Delta x={fromHigh} digits={0} />
          </div>
        </div>
        <Chart points={pre} upTo={0} />
        <p className="legend">
          <span className="key price" /> A사 <span className="key bench" /> 코스피 <span className="key vol" /> 거래량(평소 2배↑ 주황)
          <span className="legend-hint">차트를 누르거나 올려 보면 날짜별 값이 보여요</span>
        </p>
        {hot > 0 && <p className="callout">최근 5거래일 중 {hot}일, 거래량이 평소의 2배를 넘었어요.</p>}
      </>
    );
  }
  if (k === "disclosure" && cards.disclosure) {
    const { items, stakeReports } = cards.disclosure;
    if (items.length === 0 && stakeReports === 0) return <Empty icon="🗂️" text="최근 30일 동안 낸 공시가 없어요. 조용한 것도 정보예요." />;
    return (
      <ul className="timeline">
        {items.map((d, i) => (
          <li key={i}>
            <span className="when">{dday(d.daysBefore)}</span>
            <span className={d.kind === "기타" ? "chip" : "chip strong"}>{d.kind}</span>
            <span className="tl-title">
              {d.title}
              {d.facts.length > 0 && (
                <dl className="facts-dl">
                  {d.facts.slice(0, 4).map((f, j) => (
                    <div key={j}>
                      <dt>{f.label}</dt>
                      <dd>{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </span>
          </li>
        ))}
        {stakeReports > 0 && (
          <li className="muted-row">
            <span className="when">30일</span>
            <span className="chip">지분</span>
            <span className="tl-title">임원·대주주 지분 변동 보고 {stakeReports}건</span>
          </li>
        )}
        <li className="fineprint-row">핵심 내용은 DART 공시 원문에서 뽑았어요. 회사를 알아볼 수 있는 금액·이름은 가렸어요.</li>
      </ul>
    );
  }
  if (k === "youtube" && cards.youtube) {
    const y = cards.youtube;
    const total = y.bull + y.bear || 1;
    const seen = new Set<string>();
    const recs = y.videos.filter((v) => v.record && !seen.has(v.channel) && seen.add(v.channel)).map((v) => v.record!);
    return (
      <>
        <div className="tally" aria-label={`오른다 ${y.bull}, 내린다 ${y.bear}, 중립 ${y.neutral}`}>
          <div className="tally-bar">
            <motion.i className="bull" initial={{ width: 0 }} animate={{ width: `${(y.bull / total) * 100}%` }} transition={{ duration: 0.6 }} />
            <motion.i className="bear" initial={{ width: 0 }} animate={{ width: `${(y.bear / total) * 100}%` }} transition={{ duration: 0.6 }} />
          </div>
          <div className="tally-legend">
            <span className="up">오른다 {y.bull}</span>
            <span className="muted">중립 {y.neutral}</span>
            <span className="down">내린다 {y.bear}</span>
          </div>
        </div>
        <ul className="videos">
          {y.videos.map((v, i) => (
            <li key={i}>
              <span className="thumb" aria-hidden>
                ▶
              </span>
              <div>
                <span className={STANCE[v.stance].cls}>{STANCE[v.stance].label}</span>
                <p className="yt-title">
                  {splitHype(v.title).map((part, j) =>
                    part.hype ? (
                      <mark key={j} className="hype" title="자극적인 표현">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={j}>{part.text}</span>
                    ),
                  )}
                </p>
                <span className="meta">
                  {v.channel} · 조회 {views(v.views)} · {dday(v.daysBefore)}
                </span>
                <Record r={v.record} />
              </div>
            </li>
          ))}
        </ul>
        {recs.length > 0 && (
          <p className="callout soft">
            이 영상들을 올린 유튜버의 산 날 전 성적: 방향 예측 {recs.reduce((a, r) => a + r.n, 0).toLocaleString("ko-KR")}번, 평균 적중{" "}
            <b>{Math.round((recs.reduce((a, r) => a + r.hit * r.n, 0) / recs.reduce((a, r) => a + r.n, 0)) * 100)}%</b>
          </p>
        )}
        {y.videos.some((v) => splitHype(v.title).some((x) => x.hype)) && (
          <p className="callout hype-note">🔥 표시는 '폭등·무조건·놓치면' 같은 자극적인 표현이에요. 텍스트 분석 결과는 데이터 페이지에 있어요.</p>
        )}
        <p className="fineprint">채널·사람 이름과 종목명은 가렸어요. ○○ 는 다른 종목이에요. 과거 성적은 hindsight 기록 중 산 날 전에 20거래일 결과가 나온 언급만 셌어요.</p>
      </>
    );
  }
  if (k === "finance" && cards.finance) return <FinanceBody f={cards.finance.finance} />;
  if (k === "news" && cards.news) {
    if (!cards.news.items.length) return <Empty icon="📭" text="산 날 전 1주일 동안 이 회사 이름이 들어간 기사를 찾지 못했어요." />;
    return (
      <>
        <ul className="news">
          {cards.news.items.map((n, i) => (
            <li key={i}>
              <span className="when">{dday(n.daysBefore)}</span>
              <div>
                <p className="news-title">{n.title}</p>
                <span className="meta">{n.source}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="fineprint">Google 뉴스에서 산 날 15:30 전에 나온 기사만 골랐어요.</p>
      </>
    );
  }
  return (
    <div className="card-loading">
      <Skeleton h={18} w="60%" />
      <Skeleton h={120} />
    </div>
  );
}

/** 유튜버 과거 적중률 미니 막대. 50% 선을 같이 그려 동전 던지기와 비교한다 */
function Record({ r }: { r?: { n: number; hit: number } | null }) {
  if (r === undefined) return null;
  if (r === null) return <span className="rec none">과거 기록 부족(5번 미만)</span>;
  const p = Math.round(r.hit * 100);
  const cls = r.hit >= 0.55 ? "good" : r.hit <= 0.45 ? "bad" : "mid";
  return (
    <span className={`rec ${cls}`} aria-label={`이 유튜버 과거 적중률 ${p}%, ${r.n}번 중`}>
      <span className="rec-bar" aria-hidden>
        <motion.i initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.7, delay: 0.2 }} />
        <span className="rec-half" />
      </span>
      과거 적중 <b>{p}%</b> <small>· {r.n.toLocaleString("ko-KR")}번</small>
    </span>
  );
}

function FinanceBody({ f }: { f: Finance | null }) {
  if (!f) return <Empty icon="🧾" text="산 날 전에 나온 정기보고서 재무 자료를 찾지 못했어요." />;
  const rows: { k: string; v: React.ReactNode; note?: string }[] = [
    { k: "매출 규모", v: <b>{f.revenueBand ?? "—"}</b>, note: "회사를 알아보지 못하게 구간으로만" },
    { k: "매출 성장", v: f.revenueGrowth === null ? "—" : <Delta x={f.revenueGrowth} />, note: f.compare },
    {
      k: "영업이익",
      v: f.opTurn ? <b className={f.opTurn === "흑자 전환" ? "up" : "down"}>{f.opTurn}</b> : f.opGrowth === null ? "—" : <Delta x={f.opGrowth} />,
      note: f.compare,
    },
    { k: "영업이익률", v: f.opMargin === null ? "—" : <b>{pct(f.opMargin)}</b> },
    { k: "순이익", v: f.netTurn ? <b className={f.netTurn === "흑자 전환" ? "up" : "down"}>{f.netTurn}</b> : <b>{f.netLoss ? "적자" : "흑자"}</b> },
    {
      k: "부채비율",
      v: f.debtRatio === null ? "—" : <b className={f.debtRatio > 2 ? "warn-text" : ""}>{Math.round(f.debtRatio * 100)}%</b>,
      note: f.debtRatio !== null && f.debtRatio > 2 ? "200%를 넘으면 빚이 많은 편" : undefined,
    },
  ];
  return (
    <>
      <p className="fin-head">
        <span className="chip">{f.basis}</span> {f.report} · 산 날 {f.daysBefore}일 전 공시
      </p>
      <dl className="fin">
        {rows.map((r) => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>
              {r.v}
              {r.note && <small>{r.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="fineprint">DART 정기보고서(주요 계정) 기준. 산 날 전에 접수된 가장 최근 보고서만 써요.</p>
    </>
  );
}

// ------------------------------------------------------------ AI 애널리스트
interface QA {
  q: string;
  r: AskResult | null; // null = 답 기다리는 중
}

function AiChat({
  gameKey,
  asked,
  limit,
  ask,
  intro,
  suggestions,
}: {
  gameKey: string;
  asked: number;
  limit: number;
  ask: (q: string) => Promise<AskResult | null>;
  intro?: string;
  suggestions: string[];
}) {
  const storeKey = `fs:ask:${gameKey}`;
  const [log, setLog] = useState<QA[]>(() => read<QA[]>(storeKey) ?? []);
  const [text, setText] = useState("");
  const pending = log.some((x) => x.r === null);
  const left = limit - asked;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    write(storeKey, log.filter((x) => x.r));
  }, [log, storeKey]);
  useEffect(() => {
    if (log.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [log.length]);

  const send = async (q: string) => {
    q = q.trim();
    if (!q || pending || left <= 0) return;
    setText("");
    setLog((l) => [...l, { q, r: null }]);
    const r = await ask(q);
    setLog((l) => l.map((x) => (x.q === q && x.r === null ? { q, r: r ?? { error: "응답이 없어요.", remaining: left } } : x)));
  };

  return (
    <div className="ai">
      <p className="ai-intro">{intro}</p>
      <div className="ai-log" aria-live="polite">
        {log.map((x, i) => (
          <div key={i} className="ai-turn">
            <p className="ai-q">{x.q}</p>
            {x.r === null ? (
              <div className="ai-a thinking">
                <span className="dots3" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                자료를 확인하는 중…
              </div>
            ) : x.r.error ? (
              <AiError r={x.r} onRetry={() => send(x.q)} disabled={pending} />
            ) : (
              <AiAnswer r={x.r} />
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {left > 0 ? (
        <>
          {log.length === 0 && (
            <div className="ai-suggest">
              {suggestions.map((s) => (
                <button key={s} className="chip-btn" onClick={() => send(s)} disabled={pending}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="ai-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder="A사에 대해 물어보세요"
              aria-label="AI에게 질문"
              disabled={pending}
            />
            <button className="btn primary" disabled={pending || text.trim().length < 2}>
              묻기
            </button>
          </form>
          <p className="fineprint">이번 라운드 질문 {left}번 남음 · 자료에 없으면 없다고 답해요</p>
        </>
      ) : (
        <p className="fineprint">이번 라운드 질문을 다 썼어요.</p>
      )}
      <p className="ai-disclose">🤖 AI가 만든 답이에요. 틀릴 수 있으니 근거 칩을 눌러 원문을 확인하세요. 사라·팔아라는 말하지 않아요.</p>
    </div>
  );
}

const ERR: Record<string, { icon: string; title: string; tip: string }> = {
  unconfigured: { icon: "🔌", title: "AI 연결이 아직 설정되지 않았어요", tip: "다른 카드로 판단해 주세요. 질문 횟수는 그대로예요." },
  quota: { icon: "⏳", title: "요청이 많아 잠시 쉬는 중이에요", tip: "무료 사용량 한도예요. 잠깐 뒤에 다시 물어봐 주세요." },
  timeout: { icon: "🐢", title: "답이 너무 오래 걸려요", tip: "질문을 짧게 바꾸면 빨라질 수 있어요." },
  busy: { icon: "🔥", title: "AI 서버가 바빠요", tip: "몇 초 뒤 다시 물어봐 주세요." },
  network: { icon: "📡", title: "AI 서버에 연결하지 못했어요", tip: "인터넷 연결을 확인해 주세요." },
  model: { icon: "⚠️", title: "AI가 답을 만들지 못했어요", tip: "질문을 바꿔 다시 물어봐 주세요." },
  gone: { icon: "⚠️", title: "지금 AI 모델을 쓸 수 없어요", tip: "잠시 뒤 다시 물어봐 주세요." },
};

/** 호출 실패: 종류별 문구 + 다시 시도까지 남은 시간 */
function AiError({ r, onRetry, disabled }: { r: AskResult; onRetry: () => void; disabled: boolean }) {
  const e = ERR[r.errorKind ?? "network"] ?? ERR.network;
  const [left, setLeft] = useState(r.retryAfter ?? 0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return (
    <div className="ai-a error" role="alert">
      <p>
        <span aria-hidden>{e.icon}</span> <b>{e.title}</b>
      </p>
      <p className="muted small">{e.tip} 질문 횟수는 차감되지 않았어요.</p>
      {r.errorKind !== "unconfigured" && (
        <button className="link" onClick={onRetry} disabled={disabled || left > 0}>
          {left > 0 ? `${left}초 뒤 다시 묻기` : "다시 묻기"}
        </button>
      )}
    </div>
  );
}

function AiAnswer({ r }: { r: AskResult }) {
  const [open, setOpen] = useState(false);
  const voteKey = r.logId ? `fs:vote:${r.logId}` : null;
  const [vote, setVote] = useState<number | null>(() => (voteKey ? read<number>(voteKey) : null));
  const [copied, setCopied] = useState(false);
  const rate = async (v: 1 | -1) => {
    if (!r.logId || vote !== null) return;
    setVote(v);
    if (voteKey) write(voteKey, v);
    try {
      await api.feedback(r.logId, v);
    } catch {
      /* 평가 저장 실패는 조용히 넘긴다 */
    }
  };
  return (
    <div className={`ai-a ${r.fallback ? "fallback" : ""} ${r.grounded === false ? "ungrounded" : ""}`}>
      <p>{r.answer}</p>
      {!!r.sources?.length && (
        <div className="ai-sources">
          {r.sources.map((s) => (
            <span key={s.id} className="src" title={s.text}>
              {s.id} · {s.label}
            </span>
          ))}
        </div>
      )}
      <button className="ai-check" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {r.fallback ? "⚠️ 검증 실패 — 답을 숨겼어요" : r.grounded === false ? "ℹ️ 자료에 근거 없음" : `✓ 검증 통과${r.attempts && r.attempts > 1 ? " (다시 물어서)" : ""}`}
        {r.latencyMs ? ` · ${(r.latencyMs / 1000).toFixed(1)}초` : ""}
      </button>
      {!r.fallback && (
        <div className="ai-actions">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(r.answer ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* 복사 불가 */
              }
            }}
            aria-label="답 복사"
          >
            {copied ? "✓ 복사됨" : "📋 복사"}
          </button>
          {r.logId && (
            <>
              <button className={vote === 1 ? "on" : ""} onClick={() => rate(1)} disabled={vote !== null} aria-label="도움이 됐어요">
                👍
              </button>
              <button className={vote === -1 ? "on" : ""} onClick={() => rate(-1)} disabled={vote !== null} aria-label="별로예요">
                👎
              </button>
              {vote !== null && <span className="muted small">고마워요! 품질 개선에 써요</span>}
            </>
          )}
        </div>
      )}
      {open && r.checks && (
        <ul className="ai-checks">
          {Object.entries(r.checks).map(([k, v]) => (
            <li key={k} className={v === "ok" ? "ok" : "bad"}>
              {CHECK_LABEL[k] ?? k}: {v === "ok" ? "통과" : v}
            </li>
          ))}
          {r.sources?.map((s) => (
            <li key={s.id} className="src-text">
              [{s.id}] {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHECK_LABEL: Record<string, string> = {
  citations: "인용한 자료가 실제로 있음",
  others: "자료에 없는 다른 종목 언급 없음",
  leak: "회사 이름 안 드러냄",
  numbers: "숫자가 모두 자료에 있음",
  advice: "직접 매수·매도 권유 없음",
  grounding: "근거 자료를 밝힘",
  format: "답 형식",
};
