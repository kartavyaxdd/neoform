import { expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { qaTarget } from "./qa-target";
import { build } from "vite";

it("requires a harness-owned isolated target and refuses ordinary or remote app listeners", () => {
  const root = path.resolve(".qa-state");
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, "target-test-"));
  const url = "http://127.0.0.1:49123";
  writeFileSync(
    path.join(run, "run.json"),
    JSON.stringify({ url, runId: "synthetic-qa-target", pid: process.pid }),
  );
  const env = {
    NEOFORM_QA_URL: url,
    NEOFORM_QA_RUN_DIR: run,
    NEOFORM_QA_RUN_ID: "synthetic-qa-target",
  };
  try {
    expect(qaTarget(env)).toBe(url);
    for (const bad of [
      "",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "https://example.test",
      "http://127.0.0.1.evil.test:49123",
      "http://127.0.0.1:49123/private",
      "http://user:pass@127.0.0.1:49123",
    ])
      expect(() => qaTarget({ ...env, NEOFORM_QA_URL: bad })).toThrow();
    expect(() =>
      qaTarget({ ...env, NEOFORM_QA_RUN_ID: "another-run" }),
    ).toThrow();
    expect(() =>
      qaTarget({ ...env, NEOFORM_QA_RUN_DIR: path.resolve(".local-state") }),
    ).toThrow();
    expect(() => qaTarget({})).toThrow();
    writeFileSync(
      path.join(run, "run.json"),
      JSON.stringify({ url, runId: "synthetic-qa-target", pid: 2147483647 }),
    );
    expect(() => qaTarget(env)).toThrow();
  } finally {
    if (path.relative(root, run).startsWith(".."))
      throw Error("Unsafe QA cleanup");
    rmSync(run, { recursive: true, force: true });
  }
});
it("builds a synthetic app without loading even its adjacent dotenv file", async () => {
  const root = path.resolve(".qa-state");
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, "dotenv-test-"));
  try {
    writeFileSync(
      path.join(run, ".env"),
      "VITE_QA_ONLY_VALUE=synthetic-should-never-enter-assets",
    );
    writeFileSync(
      path.join(run, "index.html"),
      '<script type="module" src="/main.js"></script>',
    );
    writeFileSync(
      path.join(run, "main.js"),
      "window.qaFixture = import.meta.env.VITE_QA_ONLY_VALUE;",
    );
    await build({
      configFile: path.resolve("vite.config.ts"),
      root: run,
      logLevel: "silent",
      build: { outDir: path.join(run, "dist"), emptyOutDir: true },
    });
    const assets = path.join(run, "dist/assets");
    const js = readFileSync(
      path.join(
        assets,
        readdirSync(assets).find((n) => n.endsWith(".js"))!,
      ),
      "utf8",
    );
    expect(js).toContain("qaFixture");
    expect(js).not.toContain("synthetic-should-never-enter-assets");
  } finally {
    if (path.relative(root, run).startsWith(".."))
      throw Error("Unsafe QA cleanup");
    rmSync(run, { recursive: true, force: true });
  }
});
