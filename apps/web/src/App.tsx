import { MotionConfig } from "motion/react";
import { Suspense, lazy } from "react";
import { BuddyDock } from "./components/Buddy";
import { Cheers } from "./components/Cheers";
import { Aurora, ErrorBoundary, ErrorState, LoadingPage, TopBar } from "./components/ui";
import { useRoute } from "./lib/router";
import { startAuth } from "./lib/auth";
import { startSync } from "./lib/sync";
import Home from "./screens/Home";
import Play from "./screens/Play";

// 첫 화면(홈·게임)에 필요 없는 페이지는 따로 받는다(코드 분할): 리포트(이미지 저장), 랭킹(QR), 데이터, 팀 페이지
const Report = lazy(() => import("./screens/Report"));
const Live = lazy(() => import("./screens/Live"));
const Data = lazy(() => import("./screens/Data"));
const Team = lazy(() => import("./screens/Team"));
const Me = lazy(() => import("./screens/Me"));

startAuth(); // 로그인 설정이 있을 때만 동작
startSync();

export default function App() {
  const route = useRoute();
  let screen;
  if (route === "/") screen = <Home />;
  else if (route === "/play") screen = <Play />;
  else if (route === "/report") screen = <Report />;
  else if (route === "/data") screen = <Data />;
  else if (route === "/live") screen = <Live />;
  else if (route === "/team") screen = <Team />;
  else if (route === "/me") screen = <Me />;
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
      <Aurora />
      <ErrorBoundary>
        <Suspense fallback={<LoadingPage route={route} slow={false} />}>{screen}</Suspense>
      </ErrorBoundary>
      {route === "/play" && <BuddyDock />}
      <Cheers />
    </MotionConfig>
  );
}
