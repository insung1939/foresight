import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { migrateOldKeys } from "./lib/storage";
import "./styles.css";

migrateOldKeys(); // 예전 이름(geuttae:)으로 저장된 진행 상황을 새 이름으로 — 화면을 그리기 전에

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
