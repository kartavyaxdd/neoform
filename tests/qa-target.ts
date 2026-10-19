import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

export function qaTarget(
  env: Record<string, string | undefined> = process.env,
): string {
  const fail = () => {
    throw new Error(
      "Use npm run test:integration (or test:api / test:browser). Tests require its isolated .qa-state Worker; existing app listeners are forbidden.",
    );
  };
  const value = env.NEOFORM_QA_URL,
    directory = env.NEOFORM_QA_RUN_DIR,
    runId = env.NEOFORM_QA_RUN_ID;
  if (!value || !directory || !runId) return fail();
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.origin !== value ||
    !url.port ||
    Number(url.port) < 1024 ||
    url.port === "8787" ||
    url.username ||
    url.password
  )
    return fail();
  const root = path.resolve(".qa-state"),
    run = path.resolve(directory);
  const relative = path.relative(root, run);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    return fail();
  if (lstatSync(root).isSymbolicLink() || lstatSync(run).isSymbolicLink())
    return fail();
  const actualRelative = path.relative(realpathSync(root), realpathSync(run));
  if (
    !actualRelative ||
    actualRelative.startsWith("..") ||
    path.isAbsolute(actualRelative)
  )
    return fail();
  const marker = JSON.parse(readFileSync(path.join(run, "run.json"), "utf8"));
  if (
    marker.url !== value ||
    marker.runId !== runId ||
    !Number.isInteger(marker.pid) ||
    marker.pid <= 0
  )
    return fail();
  try {
    process.kill(marker.pid, 0);
  } catch {
    return fail();
  }
  return value;
}
