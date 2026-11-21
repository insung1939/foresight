// 시연(#/demo): 발표 자료 속 휴대폰 화면에서 바로 플레이 화면이 뜨도록 연습 시즌을 만든다.
// 이 탭의 sessionStorage 에만 두므로 내 진행 중인 판은 그대로다.
import { useEffect, useState } from "react";
import { ErrorState, Loading } from "../components/ui";
import { api } from "../lib/api";
import { go } from "../lib/router";

let started = false; // StrictMode 에서 두 번 만들지 않게

export default function Demo() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (started) return;
    started = true;
    api
      .newRun("practice", undefined, null, "office")
      .then((r) => {
        sessionStorage.setItem("ant:demo", r.id);
        go("/play", { demo: "1" });
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => (started = false));
  }, []);
  return err ? <ErrorState title="시연 판을 만들지 못했어요" detail={err} /> : <Loading label="시연용 연습 시즌을 여는 중…" />;
}
