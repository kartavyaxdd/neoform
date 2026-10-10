import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: "dist", sourcemap: false },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
