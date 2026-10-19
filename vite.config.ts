import { defineConfig } from "vite";
export default defineConfig({
  // This app has no client dotenv configuration. Never turn project .env
  // values into QA/build-time client settings; Worker bindings stay server-only.
  envDir: false,
  build: { outDir: "dist", sourcemap: false },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
