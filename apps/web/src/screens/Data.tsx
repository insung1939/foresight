// 데이터 출처와 분석 페이지(수업 필수). 숫자는 전부 서버 /v1/meta 에서 온다.
import { motion } from "motion/react";
import { ErrorState, LoadingPage, TopBar } from "../components/ui";
import { api, useAsync } from "../lib/api";
import { pct } from "../lib/format";
import { cardDef } from "../lib/game";
import type { CardKey, Meta } from "../lib/types";
import { SOURCES } from "../lib/sources";

const nf = (n: number) => n.toLocaleString("ko-KR");



function Bars({ rows, max }: { rows: { label: string; v: number | null; sub?: string }[]; max?: number }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.v ?? 0)), 0.0001);
  return (
    <ul className="hbars">
      {rows.map((r, i) => (
        <li key={r.label}>
          <span className="lbl">
            {r.label}
            {r.sub && <small>{r.sub}</small>}
          </span>
          <span className="track">
            <span className="zero" />
            <motion.i
              className={(r.v ?? 0) >= 0 ? "pos" : "neg"}
              initial={{ width: 0 }}
              whileInView={{ width: `${(Math.abs(r.v ?? 0) / m) * 50}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
            />
          </span>
          <b className={(r.v ?? 0) > 0 ? "up" : (r.v ?? 0) < 0 ? "down" : ""}>{r.v === null ? "—" : pct(r.v)}</b>
        </li>
      ))}
    </ul>
  );
}

function Histogram({ counts }: { counts: number[] }) {
  const labels = ["−20%↓", "−20~−10", "−10~−5", "−5~0", "0~5", "5~10", "10~20", "20%↑"];
  const max = Math.max(...counts, 1);
  return (
    <div className="histo" role="img" aria-label="20거래일 수익률 분포">
      {counts.map((n, i) => (
        <div key={i} className="col">
          <span className="n">{n}</span>
          <motion.i className={i < 4 ? "neg" : "pos"} initial={{ height: 0 }} whileInView={{ height: `${(n / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.05 }} />
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

export default function Data() {
  const st = useAsync(api.meta, []); // 플레이 통계가 바뀌므로 매번 새로
  if (st.status === "loading") return <LoadingPage route="/data" slow={st.slow} />;
  if (st.status === "error")
    return (
      <>
        <TopBar route="/data" />
        <main className="page">
          <ErrorState title={st.error.message} onRetry={st.retry} />
        </main>
      </>
    );
  return <Body m={st.data} />;
}

function Body({ m }: { m: Meta }) {
  const s = m.summary;
  const hottest = m.chase[m.chase.length - 1];
  const pipeline = [
    { n: s.source.mentions, k: "유튜브 종목 언급", d: "영상 제목에서 종목 이름을 찾은 건" },
    { n: s.krxMentions, k: "국내 주식 언급", d: "20거래일 결과가 나온 것만" },
    { n: s.candidates, k: "문제 후보", d: "같은 날 의견이 한쪽으로 기운 종목·날짜, 이름 가리기 통과" },
    { n: s.cases, k: "게임 문제", d: `오른 ${s.buckets?.up ?? "…"} · 내린 ${s.buckets?.down ?? "…"} · 보합 ${s.buckets?.flat ?? "…"}, 같은 종목은 60일 넘게 떨어진 날만` },
  ];
  const ops = m.aiOps;
  const called = ops.asks - ops.unavailable;

  return (
    <>
      <TopBar route="/data" />
      <main className="page data">
        <header className="data-head">
          <p className="eyebrow">데이터 · 분석</p>
          <h1>이 게임의 문제는 어디서 왔나</h1>
          <p className="sub">
            지난 학기 「클라우드컴퓨팅실습」 프로젝트(hindsight)가 매일 모으는 데이터에 DART 원문·재무, Google 뉴스를 더했어요. {s.source.through} 까지 수집분 기준이에요.
          </p>
        </header>

        <section className="panel">
          <h2 className="panel-title">데이터 출처</h2>
          <div className="sources">
            {SOURCES.map((x) => (
              <article key={x.name} className="source">
                <h3>{x.name}</h3>
                <p className="org">{x.org}</p>
                <dl>
                  <dt>가져온 것</dt>
                  <dd>{x.what}</dd>
                  <dt>게임에서</dt>
                  <dd>{x.use}</dd>
                </dl>
                <a href={x.url} target="_blank" rel="noreferrer">
                  {x.url.replace(/^https?:\/\//, "")} ↗
                </a>
              </article>
            ))}
          </div>
          <div className="scale">
            {(
              [
                ["영상", s.source.videos],
                ["종목 언급", s.source.mentions],
                ["일별 시세", s.source.prices],
                ["공시", s.source.disclosures],
                ["재무(문제)", m.enrich.finance],
                ["공시 원문", m.enrich.docs],
                ["핵심 항목", m.enrich.facts],
                ["뉴스", m.enrich.news],
              ] as [string, number][]
            ).map(([k, v]) => (
              <div key={k}>
                <b>{nf(v)}</b>
                <small>{k}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">문제를 고르는 과정</h2>
          <ol className="funnel">
            {pipeline.map((p, i) => (
              <motion.li key={p.k} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <span className="fbar" style={{ width: `${30 + 70 * Math.pow(p.n / pipeline[0].n, 0.35)}%` }}>
                  <b>{nf(p.n)}</b> {p.k}
                </span>
                <small>{p.d}</small>
              </motion.li>
            ))}
          </ol>
        </section>

        {s.hindsight && <HindsightPanel h={s.hindsight} withRecord={s.withRecord ?? 0} cases={s.cases} />}

        <section className="panel">
          <h2 className="panel-title">분석 1 · 유튜버 vs AI, 누가 더 맞혔나</h2>
          <div className="vs-cards">
            <div>
              <small>📺 유튜버 말대로</small>
              <b>{Math.round(s.youtubeHitRate * 100)}%</b>
              <span>문제 {s.cases}개</span>
            </div>
            <div>
              <small>🤖 AI (Gemini)</small>
              <b>{m.ai.hitRate === null ? "—" : `${Math.round(m.ai.hitRate * 100)}%`}</b>
              <span>{m.ai.n ? `판단 ${m.ai.n}개` : "판단 준비 중"}</span>
            </div>
            <div>
              <small>👥 플레이어</small>
              <b>{m.plays.hitRate === null ? "—" : `${Math.round(m.plays.hitRate * 100)}%`}</b>
              <span>판단 {nf(m.plays.plays)}번</span>
            </div>
          </div>
          <table className="confusion">
            <thead>
              <tr>
                <th>유튜버 의견</th>
                <th>실제로 올랐다</th>
                <th>실제로 내렸다</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>
                  '오른다' <small>{m.confusion.bull_up + m.confusion.bull_down}건</small>
                </th>
                <td className="good">{m.confusion.bull_up}</td>
                <td className="bad">{m.confusion.bull_down}</td>
              </tr>
              <tr>
                <th>
                  '내린다' <small>{m.confusion.bear_up + m.confusion.bear_down}건</small>
                </th>
                <td className="bad">{m.confusion.bear_up}</td>
                <td className="good">{m.confusion.bear_down}</td>
              </tr>
            </tbody>
          </table>
          <p className="fineprint">적중 = 실제로 올랐을 때 70% 이상, 내렸을 때 30% 이하(공매도 포함). 문제는 오른·내린 사례를 반씩 섞어 골랐어요.</p>
        </section>

        <section className="panel">
          <h2 className="panel-title">분석 2 · 이미 많이 오른 종목, 그 뒤 20일은?</h2>
          <p className="finding">
            60거래일 동안 <b>50% 넘게 오른 종목</b>은 그 뒤 20거래일 평균 <b className={(hottest.avg ?? 0) < 0 ? "down" : "up"}>{pct(hottest.avg ?? 0)}</b>.
          </p>
          <Bars rows={m.chase.map((c) => ({ label: c.label, v: c.avg, sub: `${c.n}건 · 상승 ${Math.round((c.upShare ?? 0) * 100)}%` }))} />
        </section>

        <section className="panel">
          <h2 className="panel-title">분석 3 · 속보가 터진 뒤</h2>
          <p className="finding">사건일 종가부터 20거래일째까지 평균 수익률이에요.</p>
          <Bars rows={m.events.map((e) => ({ label: e.label, v: e.avg, sub: `${e.n}건` }))} />
        </section>

        <section className="panel">
          <h2 className="panel-title">분석 4 · 어떤 카드를 본 사람이 더 맞혔나</h2>
          {m.plays.plays === 0 ? (
            <p className="muted small">아직 플레이 기록이 없어요. 게임을 하면 여기에 쌓여요.</p>
          ) : (
            <>
              <ul className="hbars">
                {(Object.entries(m.plays.cards) as [CardKey, { opened: number; hitRate: number }][])
                  .sort((a, b) => b[1].hitRate - a[1].hitRate)
                  .map(([k, v]) => (
                    <li key={k}>
                      <span className="lbl">
                        {cardDef(k).icon} {cardDef(k).label}
                        <small>{v.opened}번 열람</small>
                      </span>
                      <span className="track one">
                        <motion.i className="acc" initial={{ width: 0 }} whileInView={{ width: `${v.hitRate * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
                      </span>
                      <b>{Math.round(v.hitRate * 100)}%</b>
                    </li>
                  ))}
              </ul>
              <p className="fineprint">
                끝낸 게임 {m.plays.games}판 · 공매도 비율 {Math.round((m.plays.shortShare ?? 0) * 100)}% · 한 판단 평균 {Math.round((m.plays.avgMs ?? 0) / 1000)}초
              </p>
            </>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">20거래일 수익률 분포</h2>
          <Histogram counts={m.histogram} />
        </section>

        <section className="panel">
          <h2 className="panel-title">AI 답변 검증</h2>
          <p className="finding">AI 애널리스트의 답은 보여 주기 전에 6가지를 검사해요. 하나라도 걸리면 한 번 다시 묻고, 그래도 안 되면 답을 숨겨요.</p>
          <ol className="checks-list">
            <li>JSON 형식으로만 답했는가</li>
            <li>인용한 자료 id(F1, D2…)가 실제로 있는가</li>
            <li>회사 이름·종목 코드를 말하지 않았는가</li>
            <li>답 속 숫자가 모두 자료에 있는가(지어낸 숫자 차단)</li>
            <li>사라·팔아라 같은 직접 권유가 없는가</li>
            <li>근거 없이 단정하지 않았는가(근거 id 필수, 없으면 '확인된 근거 없음')</li>
          </ol>
          <div className="scale ops">
            {(
              [
                ["질문", ops.asks],
                ["바로 통과", ops.passed - ops.retried],
                ["다시 물어 통과", ops.retried],
                ["숨김(검증 실패)", ops.fallback],
                ["호출 실패", ops.unavailable],
              ] as [string, number][]
            ).map(([k, v]) => (
              <div key={k}>
                <b>{nf(Math.max(v, 0))}</b>
                <small>{k}</small>
              </div>
            ))}
          </div>
          <p className="fineprint">
            {called > 0 && ops.avgLatencyMs ? `평균 응답 ${(ops.avgLatencyMs / 1000).toFixed(1)}초 · ` : ""}
            {ops.avgTokensIn ? `평균 토큰 ${nf(ops.avgTokensIn)}/${nf(ops.avgTokensOut ?? 0)} · ` : ""}
            사용자 평가 👍 {ops.thumbsUp ?? 0} · 👎 {ops.thumbsDown ?? 0} · AI의 판단(문제별 비중)도 같은 검사를 통과한 것만 써요.
          </p>
          {ops.unavailableKinds && Object.keys(ops.unavailableKinds).length > 0 && (
            <p className="fineprint">
              호출 실패 종류:{" "}
              {Object.entries(ops.unavailableKinds)
                .map(([k, v]) => `${KIND[k] ?? k} ${v}`)
                .join(" · ")}{" "}
              — 실패하면 질문 횟수를 깎지 않고 종류별 안내와 다시 묻기 버튼을 보여요.
            </p>
          )}
          <p className="fineprint">짓궂은 질문(이름 캐기·미래 주가·매수 권유·지시 무시) 평가 기록은 GitHub 의 docs/ai-eval.md 에 있어요.</p>
        </section>

        {m.funnel && m.funnel.started > 0 && <FunnelPanel f={m.funnel} />}
        {m.quality && <QualityPanel q={m.quality} />}
        {m.text && <TextPanel t={m.text} />}
        {m.survey && m.survey.n > 0 && <SurveyPanel s={m.survey} />}
        {m.perf && <PerfPanel p={m.perf} />}

        <section className="panel">
          <h2 className="panel-title">공정한 문제를 위해 지킨 규칙</h2>
          <ul className="rules-list">
            <li>
              <b>미래 정보 차단</b> 차트·공시·영상은 산 날 종가 시점까지, 재무는 산 날 전날까지 접수된 보고서, 뉴스는 산 날 15:30 전 기사만 써요. 정답과 중간 사건은 서버가 쥐고 있다가 판단을 낸 뒤에만 보내요.
            </li>
            <li>
              <b>이름 가리기</b> 회사 이름·별칭·종목코드, 다른 종목 이름, 회장·대표 같은 사람 이름, 가격·날짜·해시태그를 가려요. 가린 뒤에도 이름이 남으면 그 항목은 버려요.
            </li>
            <li>
              <b>검색 방지</b> 차트는 산 날 = 100, 재무 금액은 '수천억 원' 같은 구간, 공시는 '매출액 대비 %' 위주로 보여요.
            </li>
            <li>
              <b>카드 3장 제한</b> 카드는 열 때마다 서버에서 한 장씩 받아요. 화면 코드를 열어 봐도 안 연 카드는 없어요.
            </li>
            <li>
              <b>유튜버 과거 성적도 그 시점까지</b> 유튜버 카드의 과거 적중률은, 산 날 전에 20거래일 결과가 이미 나온 언급만으로 셌어요. 나중에 맞힌 예측은 들어가지 않아요.
            </li>
            <li>
              <b>숫자는 DB 값만</b> 수익률·해설 숫자는 시세에서 계산하고, AI 답 속 숫자도 자료에 있는 것만 통과시켜요.
            </li>
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel-title">한계</h2>
          <ul className="rules-list muted">
            <li>국내 주식만 다뤄요. 미국 주식·코인은 공시 데이터가 없어 중간 사건을 만들기 어려워요.</li>
            <li>유튜버 판단은 그날 영상 제목의 논조를 단어 사전으로 분류한 다수결이에요.</li>
            <li>공시에 나온 계약명·사업장 이름처럼 가리기 어려운 단서가 남을 수 있어요. 회사를 알아봐도 미래 주가는 알 수 없어요.</li>
            <li>공매도는 대차 수수료만 반영했어요. 실제로는 담보·상환 기한·강제 상환이 있어요.</li>
            <li>문제 {s.cases}개는 큰 표본이 아니에요. 분석은 경향을 보는 용도예요.</li>
          </ul>
        </section>
      </main>
    </>
  );
}

/** hindsight 전체 기록: 유튜버 말 뒤 20거래일 */
function HindsightPanel({ h, withRecord, cases }: { h: NonNullable<Meta["summary"]["hindsight"]>; withRecord: number; cases: number }) {
  const good = h.channels.filter((c) => c.hit > 0.5).length;
  const sides = [
    { k: "‘오른다’ 영상", st: h.bull, cls: "up" },
    { k: "‘내린다’ 영상", st: h.bear, cls: "down" },
  ];
  return (
    <section className="panel">
      <h2 className="panel-title">분석 0 · hindsight 기록: 유튜버 말 뒤 20거래일</h2>
      <p className="finding">
        유튜버가 <b>‘오른다’</b>고 한 국내 종목은 20거래일 뒤 평균 <b className={h.bull.avg >= 0 ? "up" : "down"}>{pct(h.bull.avg)}</b>, 실제로 오른 건{" "}
        <b>{Math.round(h.bull.hit * 100)}%</b>였어요.
      </p>
      <div className="vs-cards">
        {sides.map((x) => (
          <div key={x.k}>
            <small>{x.k}</small>
            <b>{nf(x.st.n)}번</b>
            <span>
              맞은 비율 {Math.round(x.st.hit * 100)}% · 평균 {pct(x.st.avg)} · 중앙값 {pct(x.st.median)}
            </span>
          </div>
        ))}
      </div>
      <h3 className="sub-title">유튜버별 적중률 (방향 예측 30번 이상, {h.channels.length}명)</h3>
      <div className="strip" role="img" aria-label={`${h.channels.length}명 중 ${good}명이 50%를 넘었어요`}>
        <span className="strip-axis" />
        {h.channels.map((c, i) => (
          <motion.i
            key={i}
            className={`strip-dot ${c.hit > 0.5 ? "good" : ""}`}
            style={{ left: `${c.hit * 100}%`, width: 6 + Math.min(c.n / 120, 10), height: 6 + Math.min(c.n / 120, 10) }}
            initial={{ opacity: 0, y: -12 }}
            whileInView={{ opacity: 0.7, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.02 * i }}
          />
        ))}
        <span className="strip-tick l" style={{ left: "0%" }}>0%</span>
        <span className="strip-tick" style={{ left: "50%" }}>50%</span>
        <span className="strip-tick r" style={{ left: "100%" }}>100%</span>
      </div>
      <p className="muted small">
        50%를 넘는 유튜버는 {h.channels.length}명 중 {good}명. 게임 문제 {cases}개 중 {withRecord}개는 유튜버 카드에 그 유튜버의 산 날 전 성적이 함께 나와요.
      </p>
      <p className="fineprint">hindsight 언급 뒤 수익률 기록 {nf(h.eventReturns)}건 중 국내 주식만. 논조는 영상 제목 기준이고, 점 크기는 예측 횟수예요.</p>
    </section>
  );
}

const KIND: Record<string, string> = { unconfigured: "키 없음", quota: "한도 초과", timeout: "시간 초과", busy: "서버 바쁨", network: "연결 실패", model: "모델 오류" };

/** 문제 은행 품질 점검 결과(scripts/quality.py, 테스트에서도 같은 검사) */
function QualityPanel({ q }: { q: NonNullable<Meta["quality"]> }) {
  const cov: [string, keyof typeof q.coverage][] = [
    ["재무 요약", "finance"],
    ["뉴스(산 날 전)", "news"],
    ["유튜버 과거 성적", "record"],
    ["공시 원문 핵심", "facts"],
    ["중간 사건", "event"],
  ];
  return (
    <section className="panel">
      <h2 className="panel-title">데이터 품질 점검</h2>
      <div className="qa-grid">
        <div className={q.futureViolations === 0 ? "ok" : "bad"}>
          <b>{q.futureViolations}</b>
          <small>미래 정보 섞임</small>
        </div>
        <div className={q.leaks === 0 ? "ok" : "bad"}>
          <b>{q.leaks}</b>
          <small>회사 이름 노출 / {nf(q.textsChecked)}개 글</small>
        </div>
        <div className={q.answerMismatch === 0 ? "ok" : "bad"}>
          <b>{q.answerMismatch}</b>
          <small>정답·차트 불일치</small>
        </div>
        <div className={(q.absoluteAmounts ?? 0) === 0 ? "ok" : "bad"}>
          <b>{q.absoluteAmounts ?? "—"}</b>
          <small>검색 단서(절대 금액)</small>
        </div>
      </div>
      <h3 className="sub-title">문제 {q.cases}개 중 정보가 채워진 비율</h3>
      <ul className="hbars-mini">
        {cov.map(([label, k]) => (
          <li key={k}>
            <span>{label}</span>
            <span className="t">
              <motion.i initial={{ width: 0 }} whileInView={{ width: `${q.coverage[k].share * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
            </span>
            <small>
              {q.coverage[k].n}개 ({Math.round(q.coverage[k].share * 100)}%)
            </small>
          </li>
        ))}
      </ul>
      <p className="fineprint">
        뉴스는 산 날 15:30 전, 재무는 산 날 전날까지 접수, 영상·공시는 산 날까지만 썼는지 문제마다 다시 검사해요. 공시 핵심 항목은 보여도 되는 것(비율·금액 구간·일반 항목)만 남기고 계약 상대·계약명·품목명은 빼요. 비어 있는 카드는 '없음'으로 보여 줘요(빈 결과 처리). 점검{" "}
        {q.checkedAt.slice(0, 10)}
      </p>
    </section>
  );
}

/** 유튜브 제목 텍스트 분석(c-TF-IDF·자극어) */
function TextPanel({ t }: { t: NonNullable<Meta["text"]> }) {
  const worst = t.hype.byWord.slice(0, 6);
  const scale = Math.max(...worst.map((w) => Math.abs(w.avg)), 0.01);
  return (
    <section className="panel">
      <h2 className="panel-title">분석 5 · 유튜브 제목 텍스트 분석</h2>
      <p className="finding">
        ‘오른다’ 영상 중 <b>자극적인 표현</b>(폭등·무조건·놓치면…)이 들어간 {nf(t.hype.with.n)}개는 20거래일 뒤 평균 <b className={t.hype.with.avg >= 0 ? "up" : "down"}>{pct(t.hype.with.avg)}</b>, 아닌{" "}
        {nf(t.hype.without.n)}개는 <b className={t.hype.without.avg >= 0 ? "up" : "down"}>{pct(t.hype.without.avg)}</b>였어요.
      </p>
      <h3 className="sub-title">자극어별 20거래일 뒤 평균 (‘오른다’ 영상, 30개 이상)</h3>
      <ul className="hbars">
        {worst.map((w) => (
          <li key={w.word}>
            <span className="lbl">
              ‘{w.word}’<small>{nf(w.n)}개 · 오른 비율 {Math.round(w.upShare * 100)}%</small>
            </span>
            <span className="track">
              <span className="zero" />
              <motion.i className={w.avg >= 0 ? "pos" : "neg"} initial={{ width: 0 }} whileInView={{ width: `${(Math.abs(w.avg) / scale) * 50}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
            </span>
            <b className={w.avg >= 0 ? "up" : "down"}>{pct(w.avg)}</b>
          </li>
        ))}
      </ul>
      <div className="kw-cols">
        {(["bull", "bear"] as const).map((g) => (
          <div key={g}>
            <h3 className="sub-title">{g === "bull" ? "‘오른다’ 제목을 대표하는 말" : "‘내린다’ 제목을 대표하는 말"}</h3>
            <p className="kw">
              {t.keywords[g].slice(0, 12).map((k, i) => (
                <span key={k.word} className={g} style={{ fontSize: `${15 - i * 0.4}px` }}>
                  {k.word}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
      <p className="fineprint">
        영상 제목 {nf(t.titles)}개(오른다 {nf(t.bull)} · 내린다 {nf(t.bear)}). {t.method} 이 결과로 게임의 유튜버 카드에서 자극적인 표현에 🔥 표시를 해요. 한계: 규칙 토큰화라 형태소 분석보다 거칠어요.
      </p>
    </section>
  );
}

function SurveyPanel({ s }: { s: NonNullable<Meta["survey"]> }) {
  const yt = (s.youtube.often ?? 0) + (s.youtube.sometimes ?? 0);
  const L: Record<string, string> = { yt: "📺 유튜버 말을 그대로 믿으면 안 되겠다", info: "🃏 어떤 정보를 볼지가 중요하다", hard: "🎢 시장은 예측이 어렵다", fun: "🎮 그냥 재밌었다" };
  return (
    <section className="panel">
      <h2 className="panel-title">플레이어 설문 ({s.n}명)</h2>
      <div className="scale">
        <div>
          <b>{Math.round((yt / s.n) * 100)}%</b>
          <small>유튜브 보고 종목 고른 적 있음</small>
        </div>
        <div>
          <b>{s.helpful?.toFixed(1)}</b>
          <small>도움 정도(5점)</small>
        </div>
      </div>
      <ul className="hbars-mini">
        {Object.entries(L).map(([k, label]) => (
          <li key={k}>
            <span>{label}</span>
            <span className="t">
              <i style={{ width: `${((s.lesson[k] ?? 0) / s.n) * 100}%` }} />
            </span>
            <small>{s.lesson[k] ?? 0}명</small>
          </li>
        ))}
      </ul>
      <p className="fineprint">게임을 마친 사람에게 묻는 선택 설문(객관식 3개, 익명).</p>
    </section>
  );
}

const ROUTE_LABEL: Record<string, string> = {
  "POST /v1/games": "새 게임",
  "GET /v1/games/{gid}": "진행 상태",
  "POST /v1/games/{gid}/cards": "카드 열기",
  "POST /v1/games/{gid}/decide": "판단",
  "POST /v1/games/{gid}/adjust": "비중 조정",
  "POST /v1/games/{gid}/next": "다음 라운드",
  "GET /v1/games/{gid}/report": "리포트",
  "POST /v1/games/{gid}/ask": "AI 질문",
  "GET /v1/live": "실시간 랭킹",
  "GET /v1/meta": "데이터 페이지",
};

/** 서버 응답 시간(서버 안에서 잰 처리 시간, 네트워크 제외) */
function PerfPanel({ p }: { p: NonNullable<Meta["perf"]> }) {
  const rows = p.routes.filter((r) => ROUTE_LABEL[r.path]);
  if (!rows.length) return null;
  return (
    <section className="panel">
      <h2 className="panel-title">응답 속도 (서버 측정)</h2>
      <table className="perf">
        <thead>
          <tr>
            <th>요청</th>
            <th>횟수</th>
            <th>보통(p50)</th>
            <th>느릴 때(p95)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path}>
              <td>{ROUTE_LABEL[r.path]}</td>
              <td>{nf(r.n)}</td>
              <td>{r.p50 < 1 ? "<1" : Math.round(r.p50)}ms</td>
              <td className={r.p95 > 500 ? "slow" : ""}>{Math.round(r.p95)}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fineprint">서버가 켜진 뒤 최근 500건 기준({Math.round(p.uptimeSec / 60)}분째). AI 질문은 모델 응답을 기다리는 시간이 대부분이에요.</p>
    </section>
  );
}

/** 이용 흐름(퍼널)과 학습 효과 — 사용성·가치를 숫자로 */
function FunnelPanel({ f }: { f: NonNullable<Meta["funnel"]> }) {
  const steps = [{ k: "시작", v: f.started }, ...f.reached.map((v, i) => ({ k: `${i + 1}R`, v })), { k: "리포트", v: f.finished }];
  return (
    <section className="panel">
      <h2 className="panel-title">분석 6 · 이용 흐름과 학습 효과</h2>
      <p className="finding">
        시작한 게임 {nf(f.started)}개 중 <b>{f.started ? Math.round((f.finished / f.started) * 100) : 0}%</b>가 끝까지 했어요
        {f.medianMin !== null && f.medianMin > 0 ? <> · 한 판 보통 <b>{f.medianMin}분</b></> : null}
        {f.exitShare !== null ? <> · 라운드의 {Math.round(f.exitShare * 100)}%에서 ‘지금 팔기’</> : null}
      </p>
      <div className="funnel-bars" role="img" aria-label="라운드별 남은 게임 수">
        {steps.map((x) => (
          <div key={x.k} className="col">
            <span className="n">{x.v}</span>
            <motion.i initial={{ height: 0 }} whileInView={{ height: `${(x.v / Math.max(f.started, 1)) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.5 }} />
            <small>{x.k}</small>
          </div>
        ))}
      </div>
      {f.learning.length > 1 && (
        <>
          <h3 className="sub-title">같은 사람이 판을 거듭하면 (평균 적중 수 / 10)</h3>
          <div className="scale">
            {f.learning.map((l) => (
              <div key={l.nth}>
                <b>{l.avgHits.toFixed(1)}</b>
                <small>
                  {l.nth >= 4 ? "4번째 이상" : `${l.nth}번째 판`} · {l.games}판
                </small>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="fineprint">어느 라운드에서 많이 그만두는지 보고 리플레이 속도·안내를 고쳐요. ‘같은 사람’은 계정 또는 기기 표식 기준.</p>
    </section>
  );
}
