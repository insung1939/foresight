// 게임을 마친 뒤 30초 설문(선택). 객관식 3개만 — 자유 서술은 받지 않는다(개인정보가 섞이지 않게).
// 모인 답은 팀 페이지 'Needs 근거'와 데이터 페이지에 집계된다.
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { api } from "../lib/api";
import { sfx } from "../lib/sfx";
import { read, write } from "../lib/storage";
import { Owl } from "./Buddy";

const Q1 = [
  { v: "often", t: "자주 그래요" },
  { v: "sometimes", t: "가끔" },
  { v: "never", t: "없어요" },
];
const Q3 = [
  { v: "yt", t: "📺 유튜버 말을 그대로 믿으면 안 되겠다" },
  { v: "info", t: "🃏 어떤 정보를 볼지가 중요하다" },
  { v: "hard", t: "🎢 시장은 정말 예측이 어렵다" },
  { v: "fun", t: "🎮 그냥 재밌었다" },
];

export function SurveyCard({ gameId }: { gameId: string }) {
  const key = `fs:survey:${gameId}`;
  const [done, setDone] = useState(() => !!read<boolean>(key));
  const [yt, setYt] = useState<string | null>(null);
  const [help, setHelp] = useState<number | null>(null);
  const [lesson, setLesson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = yt && help && lesson;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      await api.survey(gameId, { youtube: yt, helpful: help, lesson });
      write(key, true);
      sfx("badge");
      setDone(true);
    } catch (e) {
      const m = (e as Error).message;
      if (m.includes("이미")) {
        write(key, true);
        setDone(true);
      } else setErr(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel survey">
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.div key="thanks" className="survey-thanks" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Owl mood="happy" size={64} />
            <p>
              <b>고마워요!</b> 답은 익명으로 모여서 이 서비스를 고치는 데 써요.
            </p>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0 }}>
            <h2 className="panel-title">📝 30초 설문 (선택)</h2>
            <p className="muted small">익명이에요. 이름이나 연락처는 받지 않아요.</p>
            <fieldset>
              <legend>1. 평소 유튜브를 보고 종목을 고른 적이 있나요?</legend>
              <div className="opts">
                {Q1.map((o) => (
                  <button key={o.v} className={yt === o.v ? "on" : ""} aria-pressed={yt === o.v} onClick={() => setYt(o.v)}>
                    {o.t}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>2. 투자 판단 연습에 도움이 됐나요?</legend>
              <div className="opts stars" role="radiogroup" aria-label="도움 정도 1~5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} role="radio" aria-checked={help === n} className={help !== null && n <= help ? "on" : ""} onClick={() => setHelp(n)} aria-label={`${n}점`}>
                    ★
                  </button>
                ))}
                <span className="muted small">{help ? ["", "전혀", "별로", "보통", "도움 됨", "많이 도움 됨"][help] : ""}</span>
              </div>
            </fieldset>
            <fieldset>
              <legend>3. 가장 크게 느낀 점은?</legend>
              <div className="opts col">
                {Q3.map((o) => (
                  <button key={o.v} className={lesson === o.v ? "on" : ""} aria-pressed={lesson === o.v} onClick={() => setLesson(o.v)}>
                    {o.t}
                  </button>
                ))}
              </div>
            </fieldset>
            {err && <p className="nick-hint bad">{err}</p>}
            <button className="btn primary block" disabled={!ready || busy} onClick={send}>
              {busy ? "보내는 중…" : ready ? "보내기" : "세 가지를 골라 주세요"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
