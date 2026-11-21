import { MotionConfig } from "motion/react";
import { Suspense, lazy, useEffect } from "react";
import { ErrorBoundary, ErrorState, Loading, Toasts, TopBar, lensIsOn, setLens } from "./components/ui";
import { useRoute } from "./lib/router";
import Home from "./screens/Home";
import Play from "./screens/Play";

// 첫 화면(홈·플레이)에 필요 없는 페이지는 열 때 따로 받는다(코드 분할)
const Result = lazy(() => import("./screens/Result"));
const Rank = lazy(() => import("./screens/Rank"));
const Data = lazy(() => import("./screens/Data"));
const Team = lazy(() => import("./screens/Team"));
const Demo = lazy(() => import("./screens/Demo"));

export default function App() {
  const route = useRoute();
  // 단축키 U: UX 렌즈(발표 때 화면 위에 용어집 용어 표시)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === "u" && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) setLens(!lensIsOn());
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  let screen;
  if (route === "/") screen = <Home />;
  else if (route === "/play") screen = <Play />;
  else if (route === "/result") screen = <Result />;
  else if (route === "/rank") screen = <Rank />;
  else if (route === "/data") screen = <Data />;
  else if (route === "/team") screen = <Team />;
  else if (route === "/demo") screen = <Demo />;
  else
    screen = (
      <>
        <TopBar route={route} />
        <main className="page">
          <ErrorState title="없는 페이지예요" detail="주소를 다시 확인하거나 홈에서 시작해 주세요." />
        </main>
      </>
    );
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>{screen}</Suspense>
      </ErrorBoundary>
      <Toasts />
    </MotionConfig>
  );
}
