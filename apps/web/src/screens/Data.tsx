// 데이터·분석(#/data): 출처 → 가공 → 게임에 쓰인 곳 → 분석 3가지 → 플레이 통계 → 응답 속도
import { ReqCheck } from "../components/ReqCheck";
import { Delta, ErrorState, Loading, TopBar } from "../components/ui";
import { loadMeta, useAsync } from "../lib/api";
import { dateDot, pct } from "../lib/format";
import type { Meta } from "../lib/types";

export default function Data() {
  const res = useAsync(loadMeta, []);
  return (
    <>
      <TopBar route="/data" />
      <main className="page data">
        <header className="page-head">
          <p className="eyebrow">데이터 · 분석</p>
          <h1>게임 속 시장은 전부 실제 데이터예요</h1>
          <p className="lead">지난 학기 hindsight 가 매일 모은 유튜브 언급·주가를 주 단위 &lsquo;시즌 팩&rsquo;으로 바꿔 쓴다.</p>
        </header>
        {res.status === "loading" && <Loading slow={res.slow} />}
        {res.status === "error" && <ErrorState title="데이터를 불러오지 못했어요" detail={res.error.message} onRetry={res.retry} />}
        {res.status === "ready" && (
          <>
            <ReqCheck p95={res.data.perf.find((x) => x.path.endsWith("/turn"))?.p95} />
            <Body m={res.data} />
          </>
        )}
      </main>
    </>
  );
}

const n = (x: number | string | undefined) => (typeof x === "number" ? x.toLocaleString("ko-KR") : (x ?? "-"));

function Bar({ v, max, cls = "" }: { v: number; max: number; cls?: string }) {
  return (
    <span className={`hbar ${cls}`} aria-hidden>
      <i style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%` }} />
    </span>
  );
}

function Body({ m }: { m: Meta }) {
  const s = m.source;
  const hype = Object.entries(m.hype);
  const maxMean = Math.max(...hype.map(([, x]) => Math.abs(x.mean ?? 0)), 0.001);
  const gh = m.ghosts;
  const histMax = Math.max(...gh.hist.map(([, c]) => c), 1);
  const f = m.plays.funnel;
  return (
    <>
      <section className="card">
        <h2 className="sec-title">① 어디서 왔나 — 원천 데이터 (hindsight DB, 읽기만)</h2>
        <div className="stat-grid">
          <div>
            <b>{n(s.channels)}</b>
            <span>유튜브 채널</span>
          </div>
          <div>
            <b>{n(s.videos)}</b>
            <span>영상 제목</span>
          </div>
          <div>
            <b>{n(s.mentions)}</b>
            <span>종목 언급</span>
          </div>
          <div>
            <b>{n(s.prices)}</b>
            <span>일별 시세</span>
          </div>
          <div>
            <b>{n(s.disclosures)}</b>
            <span>DART 공시</span>
          </div>
          <div>
            <b>{dateDot(String(s.through))}</b>
            <span>마지막 시세</span>
          </div>
        </div>
        <p className="muted small">출처: YouTube Data API(제목·조회수), 공공데이터포털 KRX 시세, Yahoo Finance(미국), 업비트(코인), DART 공시 API — 모두 hindsight 가 매일 07:10 배치로 수집(공시는 수집만 하고 게임에선 쓰지 않음).</p>
      </section>

      <section className="card">
        <h2 className="sec-title">② 어떻게 바꿨나 — 시즌 팩 만들기 (scripts/build_season.py)</h2>
        <ol className="pipe">
          <li>
            <b>주봉</b> 일별 종가 → 주(월~일) 마지막 종가. {m.pack.weeks}주({dateDot(m.pack.from)}~{dateDot(m.pack.to)})
          </li>
          <li>
            <b>종목 풀</b> 언급이 많은 순으로 국내 {m.pack.assets.KRX} · 미국 {m.pack.assets.US} · 코인 {m.pack.assets.CRYPTO}. 한 판엔 그중 20개가 시드로 뽑힌다
          </li>
          <li>
            <b>코드네임</b> DART 업종코드(KSIC) → &lsquo;반도체 A&rsquo;. 가격은 판마다 다른 배율로 바꿔 실제 주가로 종목을 알아낼 수 없게
          </li>
          <li>
            <b>이름 가리기</b> 유튜브 제목 속 종목명·그룹명·사람 이름·가격·날짜를 지운다(api/app/masking.py)
          </li>
          <li>
            <b>유튜버 고스트</b> 채널별로 &lsquo;지난주 오른다고 한 종목을 이번 주 똑같이 나눠 샀다면&rsquo;의 주간 수익률 → {gh.n}명
          </li>
          <li>
            <b>미래 차단</b> 팩은 서버만 갖고(암호화), 화면엔 지난주까지 값만 보낸다. 진짜 이름·날짜는 결산에서만
          </li>
        </ol>
      </section>

      <section className="card">
        <h2 className="sec-title">③ 품질 — 무엇을 빼고, 무엇을 지웠나</h2>
        <div className="stat-grid">
          <div>
            <b>
              {m.quality.ghosts} / {m.quality.channelsAll}
            </b>
            <span>고스트로 쓴 채널 / 전체 채널</span>
          </div>
          <div>
            <b>{pct(m.quality.weeksWithTitles / Math.max(1, m.quality.assetWeeks), 0).replace("+", "")}</b>
            <span>영상 제목이 있는 종목-주</span>
          </div>
          <div>
            <b>
              {m.quality.ragIndexed.toLocaleString()} / {m.quality.ragTotal.toLocaleString()}
            </b>
            <span>범고래 박사 색인 / 전체 영상 제목</span>
          </div>
        </div>
        <ul className="dots small">
          <li>
            <b>종목 풀</b> {m.quality.poolRule}
          </li>
          <li>
            <b>고스트</b> {m.quality.ghostRule}
          </li>
          <li>
            <b>이름·시점 가리기</b> {m.quality.masking}
          </li>
          <li>
            <b>색인</b> 임베딩 무료 한도(모델당 하루 약 1,000문장) 때문에 종목별 인기 영상 제목부터 하루씩 늘린다. 공시는 화면에서 원문을 열어 볼 수 없어 게임·색인에서 뺐다. 색인에 없는 종목은 비서가 &lsquo;자료가 없다&rsquo;고 답한다
          </li>
        </ul>
      </section>

      <section className="card">
        <h2 className="sec-title">분석 1 · 유튜브에서 많이 떠든 종목, 다음 주에 올랐을까?</h2>
        <p className="muted small">종목-주 {n(m.all.n)}개. 지난주 언급 수별로 다음 주 수익률을 나눴다.</p>
        <table className="tbl">
          <thead>
            <tr>
              <th>지난주 언급</th>
              <th>표본</th>
              <th>다음 주 평균</th>
              <th>오른 비율</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {hype.map(([k, x]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{n(x.n)}</td>
                <td>{x.mean !== null ? <Delta x={x.mean} digits={2} /> : "-"}</td>
                <td>{x.win !== null ? pct(x.win, 0).replace("+", "") : "-"}</td>
                <td>
                  <Bar v={x.mean ?? 0} max={maxMean} cls={(x.mean ?? 0) >= 0 ? "up" : "down"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="callout">게임 속 🔥 화제성은 이 값이에요. 화제가 됐다고 다음 주에 더 오르는 건 아니라는 걸 플레이하며 직접 겪게 했다.</p>
      </section>

      <section className="card">
        <h2 className="sec-title">분석 2 · 한 주에 15% 넘게 오른(내린) 종목, 그다음 주는?</h2>
        <div className="stat-grid two">
          <div>
            <b>
              <Delta x={m.momentum.afterJump.mean ?? 0} digits={2} />
            </b>
            <span>급등 다음 주 평균 · {n(m.momentum.afterJump.n)}건 · 오른 비율 {pct(m.momentum.afterJump.win ?? 0, 0).replace("+", "")}</span>
          </div>
          <div>
            <b>
              <Delta x={m.momentum.afterDrop.mean ?? 0} digits={2} />
            </b>
            <span>급락 다음 주 평균 · {n(m.momentum.afterDrop.n)}건 · 오른 비율 {pct(m.momentum.afterDrop.win ?? 0, 0).replace("+", "")}</span>
          </div>
        </div>
        <p className="callout">
          급등 다음 주는 평균만 보면 플러스지만 <b>오른 비율은 절반이 안 된다</b> — 몇몇 대박이 평균을 끌어올린다. 추격 매수는 &lsquo;가끔 크게 맞고 자주 지는&rsquo; 베팅이라, 게임에선 수익과 별개로 멘탈 비용(−3)을 매겼다.
        </p>
      </section>

      <section className="card">
        <h2 className="sec-title">분석 3 · 유튜버 말대로 샀다면 — 고스트 {gh.n}명 전체 기간 성적</h2>
        <p className="muted small">
          같은 기간 코스피 <Delta x={gh.kospi} /> · 코스피를 이긴 채널 <b>{gh.beat}명 / {gh.n}명</b>
        </p>
        <div className="histo" role="img" aria-label="채널별 누적 수익률 분포">
          {gh.hist.map(([b, c]) => (
            <div key={b} className={b >= 0 ? "up" : "down"}>
              <i style={{ height: `${(c / histMax) * 100}%` }} />
              <span>{b}%</span>
            </div>
          ))}
        </div>
        <div className="two-col">
          <div>
            <h3 className="sub">상위 5</h3>
            <ol className="plain">
              {gh.top.map((g) => (
                <li key={g.name}>
                  {g.name} <Delta x={g.ret} />
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="sub">하위 5</h3>
            <ol className="plain">
              {gh.bottom.map((g) => (
                <li key={g.name}>
                  {g.name} <Delta x={g.ret} />
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="muted small">영상 제목 속 &lsquo;오른다&rsquo; 언급을 기계적으로 따라 산 가상 계산이다. 채널의 실제 운용 성과나 추천 품질 평가가 아니므로 공개 분석에서는 채널 이름을 가렸다(게임 속 라이벌은 캐릭터로 등장).</p>
      </section>

      <section className="card">
        <h2 className="sec-title">분석 4 · 사람들은 어떻게 플레이했나</h2>
        {m.plays.done < 30 && <p className="inline-alert">표본이 작아요(완주 {m.plays.done}판). 30판이 넘기 전까지는 경향으로만 보세요.</p>}
        <div className="stat-grid">
          <div>
            <b>{n(m.plays.runs)}</b>
            <span>시작한 판</span>
          </div>
          <div>
            <b>{n(m.plays.done)}</b>
            <span>완주한 판</span>
          </div>
          <div>
            <b>{m.plays.median !== null ? pct(m.plays.median) : "-"}</b>
            <span>완주 수익률 중간값</span>
          </div>
        </div>
        {f.length > 0 && f[0].n > 0 && (
          <>
            <h3 className="sub">어디서 그만두나 (이용 흐름)</h3>
            <ul className="funnel">
              {f.map((x) => (
                <li key={x.turn}>
                  <span>{x.turn}주차까지</span>
                  <Bar v={x.n} max={f[0].n || 1} />
                  <b>{n(x.n)}</b>
                </li>
              ))}
            </ul>
          </>
        )}
        {Object.keys(m.plays.titles).length > 0 && (
          <>
            <h3 className="sub">많이 나온 칭호(투자 습관)</h3>
            <ul className="tags">
              {Object.entries(m.plays.titles).map(([t, c]) => (
                <li key={t}>
                  {t} <b>{c}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="sec-title">분석 5 · 플레이어 vs 유튜버 (Supabase 에 쌓인 판)</h2>
        {m.players.n > 0 && m.players.n < 30 && <p className="inline-alert">표본이 작아요(정규 시즌 {m.players.n}판). 결론이 아니라 쌓이는 중인 기록이에요.</p>}
        {m.players.n === 0 ? (
          <p className="empty">아직 정규 시즌을 끝낸 판이 없어요. 한 판 끝내면 여기에 쌓여요.</p>
        ) : (
          <>
            <div className="stat-grid">
              <div>
                <b>{n(m.players.n)}</b>
                <span>끝낸 정규 시즌</span>
              </div>
              <div>
                <b>{m.players.beatIndex !== null ? pct(m.players.beatIndex, 0).replace("+", "") : "-"}</b>
                <span>코스피를 이긴 판</span>
              </div>
              <div>
                <b>{pct((Object.entries(m.players.beatYt).reduce((a, [k, c]) => a + (Number(k) >= 2 ? c : 0), 0) / m.players.n) || 0, 0).replace("+", "")}</b>
                <span>유튜버 3명 중 2명 이상 이긴 판</span>
              </div>
            </div>
            <h3 className="sub">추격 매수를 많이 한 사람일수록?</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>추격 매수</th>
                  <th>판</th>
                  <th>수익률 중간값</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.players.fomo).map(([k, x]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{n(x.n)}</td>
                    <td>{x.median !== null ? <Delta x={x.median} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p className="muted small">판이 끝나면 결과(수익률·이긴 유튜버 수·추격 매수·내 개미)가 Supabase(PostgreSQL) runs 표에 쌓이고, 이 표가 바로 집계한다.</p>
      </section>

      <section className="card">
        <h2 className="sec-title">AI · 범고래 박사(시점 제한 RAG)</h2>
        <ol className="pipe">
          <li>
            <b>문서</b> 종목-주별 가려진 유튜브 영상 제목 {n(m.rag.docs)}건
          </li>
          <li>
            <b>임베딩</b> {m.rag.model} · {m.rag.dim}차원 → {m.rag.backend === "pgvector" ? "Supabase pgvector(rag_docs 표)" : "메모리 검색(개발용)"}
          </li>
          <li>
            <b>검색</b> 이번 판 종목 AND 지금 보이는 주 이하 AND 최근 {m.rag.window}주 → 코사인 유사도 + 최근성 가산, 상위 8건. 미래 문서는 SQL 에서 걸러져 모델에 가지 않는다
          </li>
          <li>
            <b>생성·검증</b> Gemini JSON(answer·cites) → 인용 id 실재 · 자료에 없는 숫자 · 권유 표현 · 진짜 종목명 노출 검사 → 실패하면 이유를 알려 1번 재시도 → 그래도 실패하면 검색 결과만
          </li>
        </ol>
        <p className="muted small">
          범고래 박사 질문 {m.ask.n}번 · 검증 통과 {m.ask.ok}번 · 재시도로 통과 {m.ask.retried}번 · 중간 지연 {m.ask.p50 ? `${(m.ask.p50 / 1000).toFixed(1)}초` : "-"}
        </p>
      </section>

      <section className="card">
        <h2 className="sec-title">AI 코치 · 응답 속도</h2>
        <p className="muted small">
          AI 코치 호출 {m.coach.n}번 · 검증 통과 {m.coach.ok}번 · 중간 지연 {m.coach.p50 ? `${(m.coach.p50 / 1000).toFixed(1)}초` : "-"} · 연결: {m.coach.provider}
        </p>
        {m.perf.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>API</th>
                <th>호출</th>
                <th>p50</th>
                <th>p95</th>
              </tr>
            </thead>
            <tbody>
              {m.perf.slice(0, 8).map((p) => (
                <tr key={p.path}>
                  <td>
                    <code>{p.path}</code>
                  </td>
                  <td>{n(p.n)}</td>
                  <td>{p.p50}ms</td>
                  <td>{p.p95}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">서버 시작 뒤 측정값(메모리, 경로별 최근 500건). 시즌 팩 생성: {m.pack.builtAt.slice(0, 16).replace("T", " ")}</p>
      </section>
    </>
  );
}
