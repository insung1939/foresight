// 게임 설명서: '시작 화면에 매뉴얼이 있으면 좋겠다', '게임을 이해하기 조금 어렵다'(현장 후기)
// 처음 온 사람에게는 한 번 저절로 뜨고, 홈·플레이 어디서든 다시 열 수 있다. 한 장에 한 가지만.
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Ant } from "./Characters";
import { Sheet } from "./ui";

interface Page {
  icon: string;
  title: string;
  lines: [string, string][]; // [아이콘, 한 줄]
  tip?: string;
}

const PAGES: Page[] = [
  {
    icon: "🎯",
    title: "이 게임은요",
    lines: [
      ["⏪", "실제로 있었던 과거 주식·코인 시장으로 돌아가요."],
      ["💵", "1,000만 원으로 시작해서 12주 동안 투자해요(자유 플레이는 24주도 골라요). 한 턴이 실제 1주예요."],
      ["🏁", "유튜버 라이벌과 코스피보다 더 벌면 이겨요."],
    ],
    tip: "정답을 맞히는 게임이 아니라, 흔들리는 시장에서 버티는 게임이에요.",
  },
  {
    icon: "🔁",
    title: "한 주는 이렇게 흘러가요",
    lines: [
      ["📱", "① 월요일 피드에서 지난주 유튜브에 뭐가 떴는지 봐요."],
      ["🛒", "② 종목을 누르고 금액 버튼(50만 원어치·전부 등)을 한 번 누르면 끝! 최대 5종목까지 담아요."],
      ["▶", "③ '다음 주'를 누르면 그 주의 진짜 가격으로 결과가 나와요."],
      ["🔂", "이걸 12번 하면 한 판 끝! 약 5분 걸려요."],
    ],
    tip: "모르겠으면 아무것도 안 사고 '다음 주'만 눌러도 괜찮아요. 쉬면 멘탈이 회복돼요.",
  },
  {
    icon: "🏷️",
    title: "종목 이름이 왜 '반도체 A'예요?",
    lines: [
      ["🙈", "그때 일을 기억해서 이기면 재미없으니까 진짜 이름을 가려 뒀어요."],
      ["💾", "이름 옆 업종 표시(예: 💾 메모리·칩)를 누르면 무슨 회사인지 알려 줘요."],
      ["🐳", "범고래 박사에게 '왜 화제야?'를 물어보면 그 주까지의 뉴스·영상으로 답해 줘요."],
      ["🎉", "판이 끝나면 진짜 회사 이름을 공개해요."],
    ],
  },
  {
    icon: "😎",
    title: "멘탈을 지켜요",
    lines: [
      ["📉", "돈을 잃거나, 너무 자주 사고팔면 멘탈이 깎여요."],
      ["☕", "한 주 쉬거나, 돈을 벌거나, 3종목 이상 나눠 담으면 회복돼요."],
      ["😱", "멘탈이 0이 되면 '패닉셀': 갖고 있던 걸 전부 팔아 버려요."],
      ["✨", "멘탈 80 이상이면 그 주 수수료가 0원이에요."],
    ],
  },
  {
    icon: "🎁",
    title: "모으는 재미",
    lines: [
      ["🎯", "시작할 때 이길 유튜버 한 명이 정해져요. 이기면 별 +2!"],
      ["📦", "수익률이 +3%, +7%… 선을 넘을 때마다 가구 상자가 열려요."],
      ["⭐", "결산 등급과 미션으로 별을 받아요."],
      ["🏠", "별로 내 방 가구를 열어요. 수족관, 펜트하우스까지!"],
    ],
  },
  {
    icon: "🃏",
    title: "알아 두면 좋은 것 (🎓 고수 모드)",
    lines: [
      ["🍀", "행운 카드: 시즌 시작에 3장 중 1장을 뒤집어요(수수료 면제, 비상금 등)."],
      ["📨", "인생 사건: 중간중간 월급·성과급 같은 일이 생겨서 선택을 해야 해요."],
      ["📊", "코스피 ETF: 고르기 어려우면 시장 전체를 사는 버튼이에요."],
      ["🎓", "홈에서 고수 모드를 켜면: 수량 직접 입력 · 전략 카드(자동 손절·적립식) · 공매도(떨어지면 버는 방법)까지 쓸 수 있어요."],
    ],
    tip: "처음이면 쉬운 모드 + '연습 시즌(8주)'으로 감부터 잡아 보세요.",
  },
];

export function Manual({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart?: () => void }) {
  const [i, setI] = useState(0);
  const pg = PAGES[i];
  const last = i === PAGES.length - 1;
  const close = () => {
    onClose();
    setTimeout(() => setI(0), 300);
  };
  return (
    <Sheet open={open} onClose={close} title="📖 게임 방법" wide>
      <div className="manual" data-ux="Onboarding · Carousel">
        <div className="mn-dots" role="tablist" aria-label="설명서 쪽">
          {PAGES.map((p, k) => (
            <button key={k} role="tab" aria-selected={k === i} aria-label={`${k + 1}쪽: ${p.title}`} className={k === i ? "on" : ""} onClick={() => setI(k)}>
              {p.icon}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={i} className="mn-page" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
            <h3>
              <span className="mn-ic">{pg.icon}</span> {pg.title}
            </h3>
            <ul>
              {pg.lines.map(([ic, t]) => (
                <li key={t}>
                  <span className="mn-li">{ic}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            {pg.tip && (
              <p className="mn-tip">
                <Ant char="office" mood="happy" size={34} />
                <span>{pg.tip}</span>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mn-nav">
          <button className="btn ghost" onClick={() => setI(i - 1)} disabled={i === 0}>
            ← 이전
          </button>
          <span className="muted small">
            {i + 1} / {PAGES.length}
          </span>
          {last ? (
            <button
              className="btn primary"
              onClick={() => {
                close();
                onStart?.();
              }}
            >
              {onStart ? "시작하기 ▶" : "알겠어요"}
            </button>
          ) : (
            <button className="btn primary" onClick={() => setI(i + 1)} data-autofocus>
              다음 →
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
