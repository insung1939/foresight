// 내 방(#/room): 3D 방에서 개미를 직접 움직이고(바닥·가구·개미 누르기, 방향키), 별로 연 가구·옷·캐릭터를 고른다
import { motion } from "motion/react";
import { useState } from "react";
import { Ant, CHAR_META, type CharId } from "../components/Characters";
import { RoomView } from "../components/Scene";
import { TopBar } from "../components/ui";
import { ALL_TITLES, charUnlocked, progress, save } from "../lib/progress";
import { FURNITURE, OUTFITS, nextFurniture, unlockedFurniture } from "../lib/room";
import { go } from "../lib/router";
import { sfx } from "../lib/sfx";

const CHARS = Object.keys(CHAR_META) as CharId[];

export default function RoomPage() {
  const [p, setP] = useState(progress);
  const char = (charUnlocked(p.char, p) ? p.char : "office") as CharId;
  const items = unlockedFurniture(p.stars);
  const nf = nextFurniture(p.stars);
  const prev = [...FURNITURE].reverse().find((f) => f.stars <= p.stars)?.stars ?? 0;
  const pct = nf ? ((p.stars - prev) / Math.max(1, nf.stars - prev)) * 100 : 100;
  const pick = (patch: Parameters<typeof save>[0]) => {
    save(patch);
    setP(progress());
    sfx("tick");
  };
  return (
    <>
      <TopBar route="/room" />
      <main className="page room-page">
        <header className="page-head room-head">
          <div>
            <p className="eyebrow">⭐ {p.stars} · 가구 {items.length}/{FURNITURE.length}</p>
            <h1>🏠 내 방</h1>
          </div>
          <button className="btn primary" onClick={() => go("/")}>
            한 판 하러 가기 ▶
          </button>
        </header>

        <RoomView char={char} items={items} mood="happy" height={420} outfit={p.outfit} keys />

        <section className="card next-furn" aria-label="다음 가구까지">
          {nf ? (
            <>
              <p>
                다음 가구 <b>{nf.icon} {nf.name}</b>까지 별 <b>{nf.stars - p.stars}개</b>
              </p>
              <span className="hbar" aria-hidden>
                <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} />
              </span>
              <p className="muted small">별은 시즌 미션(⭐1씩), 좋은 등급(S·A ⭐2, B ⭐1), 결산 행운 상자에서 모여요.</p>
            </>
          ) : (
            <p>
              <b>가구를 모두 모았어요! 🏙️</b>
            </p>
          )}
        </section>

        <div className="room-grid">
          <section className="card" aria-labelledby="fur">
            <h2 id="fur" className="sec-title">
              🛋️ 가구
            </h2>
            <ul className="furn">
              {FURNITURE.map((f) => (
                <li key={f.id} className={p.stars >= f.stars ? "on" : ""}>
                  <span aria-hidden>{p.stars >= f.stars ? f.icon : "🔒"}</span>
                  <b>{f.name}</b>
                  <span className="furn-desc">{f.desc}</span>
                  <span className="muted small">{p.stars >= f.stars ? "✅ 방에 있어요" : `🔒 ⭐${f.stars}`}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="who">
            <h2 id="who" className="sec-title">
              🐜 방 주인
            </h2>
            <ul className="who-row">
              {CHARS.map((c) => {
                const ok = charUnlocked(c, p);
                return (
                  <li key={c}>
                    <button className={`who ${char === c ? "on" : ""}`} disabled={!ok} aria-pressed={char === c} onClick={() => pick({ char: c })} title={ok ? CHAR_META[c].name : `잠김: ${CHAR_META[c].unlock}`}>
                      <Ant char={c} size={40} mood={char === c ? "happy" : "calm"} />
                      <span>{ok ? CHAR_META[c].name.replace(" 개미", "") : "🔒"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <h3 className="sub">옷</h3>
            <div className="chips left">
              <button className={`chip ${!p.outfit ? "on" : ""}`} onClick={() => pick({ outfit: null })}>
                없음
              </button>
              {OUTFITS.map((o) => (
                <button key={o.id} className={`chip ${p.outfit === o.id ? "on" : ""}`} disabled={p.stars < o.stars} onClick={() => pick({ outfit: o.id })}>
                  {o.icon} {o.name} {p.stars < o.stars && `· ⭐${o.stars}`}
                </button>
              ))}
            </div>
            <h3 className="sub">벽에 건 칭호 {Object.keys(p.titles).length}/{ALL_TITLES.length}</h3>
            <p className="wall-titles">
              {ALL_TITLES.filter((t) => p.titles[t.name]).map((t) => (
                <span key={t.name} className="tag held">
                  {t.icon} {t.name}
                </span>
              ))}
              {Object.keys(p.titles).length === 0 && <span className="muted small">판을 끝내면 투자 습관에 맞는 칭호가 걸려요.</span>}
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
