import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
export function browserGateFailures(report) {
  const failures = [];
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          if (test.status !== "unexpected") continue;
          const result = test.results?.find((r) =>
            ["failed", "timedOut", "interrupted"].includes(r.status),
          );
          const error =
            (
              result?.errors?.[0]?.message ??
              result?.error?.message ??
              "No error message"
            )
              .replace(/\u001b\[[0-9;]*m/g, "")
              .split(/\r?\n/)
              .find(Boolean) ?? "No error message";
          failures.push(
            `${spec.file ?? "browser"}:${spec.line ?? 1} ${spec.title} — ${error}`,
          );
        }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  return failures;
}
export function workflowDiagnostic(message) {
  const escaped = message
    .slice(0, 3800)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  return `::error title=Release gate diagnostic::${escaped}`;
}
function main() {
  const root = path.resolve(".qa-state");
  if (!fs.existsSync(root)) return;
  const runs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^integration-[a-f0-9-]+$/.test(e.name))
    .map((e) => path.join(root, e.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const failures = [];
  const walk = (dir, depth = 0) => {
    if (depth > 7) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file, depth + 1);
      else if (e.isFile() && e.name === "browser-results.json")
        try {
          failures.push(
            ...browserGateFailures(JSON.parse(fs.readFileSync(file, "utf8"))),
          );
        } catch {}
    }
  };
  if (runs[0]) walk(runs[0]);
  if (!failures.length) {
    const log = path.join(root, "ci-integration.log");
    if (fs.existsSync(log))
      failures.push(
        ...fs
          .readFileSync(log, "utf8")
          .replace(/\u001b\[[0-9;]*m/g, "")
          .split(/\r?\n/)
          .filter((l) => /FAIL |failed|timed out|Error:/.test(l))
          .slice(-12)
          .map((l) => l.slice(0, 250)),
      );
  }
  for (const failure of failures.slice(0, 12))
    console.error(workflowDiagnostic(failure));
  if (!failures.length)
    console.error(
      workflowDiagnostic(
        "Release gate failed before structured evidence was available. Inspect the preceding step.",
      ),
    );
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main();
