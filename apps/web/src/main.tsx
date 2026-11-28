import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { reportError } from "./lib/api";

// 신뢰성: 잡히지 않은 오류도 서버에 남긴다(데이터 페이지 '지난 7일 화면 오류')
window.addEventListener("error", (e) => {
  if (e.message) reportError("error", `${e.message} @${(e.filename || "").split("/").pop()}:${e.lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { name?: string; message?: string; kind?: string } | undefined;
  if (r?.kind) return; // ApiError(서버·네트워크 응답)는 화면이 이미 안내한다
  reportError("rejection", r?.message ? `${r.name ?? "Error"}: ${r.message}` : String(e.reason).slice(0, 200));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
