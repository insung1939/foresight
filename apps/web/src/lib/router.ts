// 해시 라우터(#/play). 정적 호스팅(Vercel)에서 새로고침해도 404 가 나지 않는다.
import { useEffect, useState } from "react";

export type Route = "/" | "/play" | "/result" | "/rank" | "/data" | "/team" | "/demo" | "404";
const ROUTES: Route[] = ["/", "/play", "/result", "/rank", "/data", "/team", "/demo"];

function parse(): Route {
  const h = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  return (ROUTES as string[]).includes(h) ? (h as Route) : "404";
}

/** #/result?id=abc → { id: "abc" } */
export function query(): Record<string, string> {
  const q = window.location.hash.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(q));
}

export function go(to: Route, q?: Record<string, string>) {
  const target = `#${to}${q ? `?${new URLSearchParams(q)}` : ""}`;
  if (window.location.hash !== target) window.location.hash = target;
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
