import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const root = process.cwd();
if (
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).name !==
  "neoform"
)
  throw Error("Run inside NEOFORM");
const directory = path.join(
  root,
  ".qa-state",
  "coaching-blocks-" + randomUUID(),
);
fs.mkdirSync(directory, { recursive: true });
const env = { NEOFORM_BLOCK_OUTPUT: directory, NO_COLOR: "1" };
for (const key of [
  "PATH",
  "Path",
  "SYSTEMROOT",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
])
  if (process.env[key]) env[key] = process.env[key];
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/training-blocks.test.ts",
    "--maxWorkers=2",
    "--reporter=default",
    "--reporter=json",
    "--outputFile=" + path.join(directory, "vitest-results.json"),
  ],
  { cwd: root, env, stdio: "inherit", windowsHide: true },
);
const scenarios = fs
  .readdirSync(directory)
  .filter((f) => f.endsWith(".json") && f !== "vitest-results.json")
  .map((f) => JSON.parse(fs.readFileSync(path.join(directory, f), "utf8")));
const resultsFile = path.join(directory, "vitest-results.json");
const results = fs.existsSync(resultsFile)
  ? JSON.parse(fs.readFileSync(resultsFile, "utf8"))
  : null;
const passed =
  result.status === 0 &&
  scenarios.length > 0 &&
  scenarios.length === results?.numPassedTests;
const summary = {
  kind: "Scripted observation sequences; no physiological outcome simulation",
  passed,
  executedTests: results?.numTotalTests ?? 0,
  failedTests: results?.numFailedTests ?? null,
  scenarios: scenarios.map(({ trace, reviews, ...metrics }) => metrics),
};
fs.writeFileSync(
  path.join(directory, "summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log("Synthetic evaluation evidence: " + path.relative(root, directory));
if (!passed) process.exitCode = result.status || 1;
