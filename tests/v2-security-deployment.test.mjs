import { it, expect } from "vitest";
import { productionConfig, assertAiDeployment } from "../scripts/cloud-launch-policy.mjs";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import path from "node:path";
it("production bundle never resolves the ephemeral authorization source", async () => {
  const config = productionConfig(
    { compatibility_date: "2026-10-01" },
    "a".repeat(32),
    "abcdef1234",
  );
  const result = await build({
    entryPoints: [config.main],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    metafile: true,
    plugins: [
      {
        name: "secret-boundary",
        setup(b) {
          b.onResolve({ filter: /ai-local/ }, (args) => {
            const replacement = config.alias?.[args.path];
            if (!replacement)
              throw new Error("Runtime authorization source is deployable");
            return { path: path.resolve(replacement) };
          });
        },
      },
    ],
  });
  expect(
    Object.keys(result.metafile.inputs).some((p) => p.endsWith("ai-local.ts")),
  ).toBe(false);
  expect(result.outputFiles[0].text).not.toContain(
    "ephemeral internal authorization",
  );
});
it("default production bundling eliminates the local authorization import before resolution", async () => {
  const result = await build({ entryPoints: ["worker/index.ts"], bundle: true, write: false, metafile: true, format: "esm", platform: "browser", target: "es2022", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "no-runtime-source", setup(b) { b.onResolve({ filter: /ai-local/ }, () => { throw new Error("Production must never resolve runtime authorization"); }); } }] });
  expect(Object.keys(result.metafile.inputs).some(p => p.endsWith("ai-local.ts"))).toBe(false);
});
it("ignores the ephemeral runtime source and refuses unsafe deployment config exports", () => {
  expect(spawnSync("git", ["check-ignore", "--quiet", "worker/ai-local.ts"], { shell: false }).status).toBe(0);
  const safe = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
  expect(() => assertAiDeployment(safe)).not.toThrow();
  expect(() => assertAiDeployment({ ...safe, alias: {} })).toThrow();
  expect(() => assertAiDeployment({ ...safe, vars: { AI_INTERNAL_KEY: "synthetic-never-export" } })).toThrow();
});
