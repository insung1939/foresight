import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 중에는 /api 를 로컬 FastAPI(8000)로 넘긴다. 배포는 VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
