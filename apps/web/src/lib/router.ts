// 해시 라우터(#/play). 정적 호스팅(Vercel)에서 새로고침해도 404 가 나지 않는다.
import { useEffect, useState } from "react";

export type Route = "/" | "/play" | "/report" | "/data" | "/live" | "/team" | "/me" | "404";
const ROUTES: Route[] = ["/", "/play", "/report", "/data", "/live", "/team", "/me"];

function parse(): Route {
  // 구글 로그인에서 돌아오면 주소 뒤에 토큰(#access_token=…)이 붙는다 → 내 전적으로
  if (/access_token=|error_description=/.test(window.location.hash)) return "/me";
  const h = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  return (ROUTES as string[]).includes(h) ? (h as Route) : "404";
}

export function go(to: Route) {
  if (window.location.hash !== `#${to}`) window.location.hash = to;
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
