import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import {
  productionConfig,
  assertAiDeployment,
} from "./cloud-launch-policy.mjs";
import path from "node:path";
import { readFile } from "node:fs/promises";
const ignored = spawnSync(
  "git",
  ["check-ignore", "--quiet", "worker/ai-local.ts"],
  { shell: false, windowsHide: true },
);
if (ignored.status !== 0)
  throw new Error("Ephemeral AI module must be ignored.");
const tracked = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "worker/ai-local.ts"],
  { shell: false, windowsHide: true, stdio: "ignore" },
);
if (tracked.status === 0)
  throw new Error("Ephemeral AI module must not be tracked.");
const config = productionConfig(
  { compatibility_date: "2026-10-01" },
  "a".repeat(32),
  "abcdef1234",
);
assertAiDeployment(config);
const result = await build({
  entryPoints: [config.main],
  bundle: true,
  write: false,
  metafile: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "local-ai-boundary",
      setup(b) {
        b.onResolve({ filter: /ai-local/ }, (args) => {
          const replacement = config.alias[args.path];
          if (!replacement)
            throw new Error("Runtime key may not enter a deployment bundle");
          return { path: path.resolve(replacement) };
        });
      },
    },
  ],
});
if (Object.keys(result.metafile.inputs).some((p) => p.endsWith("ai-local.ts")))
  throw new Error("Runtime key entered deployment.");
const html = await readFile("dist/index.html", "utf8");
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) {
  const asset = await readFile(path.join("dist", match[1]), "utf8");
  if (/localAiKey|AI_INTERNAL_KEY|Bearer\s+[a-f0-9]{64}/.test(asset))
    throw new Error("Internal authorization entered client assets.");
}
console.log(
  "Ignored and untracked runtime module; deployment graph and client assets exclude internal authorization. No runtime module read.",
);
