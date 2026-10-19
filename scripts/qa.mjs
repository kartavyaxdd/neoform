import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  appendFile,
  access,
  lstat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
if (
  args.some((a) => !["--api-only", "--browser-only"].includes(a)) ||
  args.length > 1
)
  throw Error("Expected no arguments, --api-only or --browser-only.");
const root = process.cwd(),
  runId = randomUUID(),
  qaRoot = path.resolve(root, ".qa-state");
await mkdir(qaRoot, { recursive: true });
if ((await lstat(qaRoot)).isSymbolicLink())
  throw Error("QA directory must not be a symlink.");
const runDir = path.join(qaRoot, "integration-" + runId);
await mkdir(runDir);
// Deliberate allowlist: no provider keys, deployment tokens, NODE_OPTIONS,
// sidecar settings, access-mode flags, or dotenv settings reach test processes.
const env = {};
for (const key of Object.keys(process.env))
  if (
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|TERM)$/i.test(
      key,
    )
  )
    env[key] = process.env[key];
Object.assign(env, {
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_SANITIZE: "true",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
});
env.XDG_CONFIG_HOME = path.join(runDir, "tool-config");
const node = process.execPath,
  wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const emptyEnv = process.platform === "win32" ? "NUL" : "/dev/null";
let worker, ownedPort;
const activeChildren = new Set();
const launch = (argv, extra = {}) => {
  const child = spawn(node, argv, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: "inherit",
    detached: process.platform !== "win32",
    ...extra,
  });
  activeChildren.add(child);
  child.once("exit", () => activeChildren.delete(child));
  child.once("error", () => activeChildren.delete(child));
  return child;
};
const finish = (child) =>
  new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(Error(`QA subprocess failed (${signal ?? code}).`)),
    );
  });
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  if (value === 8787) return port();
  return value;
}
async function stopTree(owned) {
  if (!owned || owned.exitCode !== null || owned.signalCode !== null) return;
  if (process.platform === "win32") {
    // PID comes only from this live child handle; terminate its workerd tree too.
    await new Promise((resolve) => {
      const kill = spawn("taskkill", ["/PID", String(owned.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      kill.once("exit", resolve);
      kill.once("error", resolve);
    });
  } else {
    try {
      process.kill(-owned.pid, "SIGTERM");
    } catch {}
    await Promise.race([
      new Promise((resolve) => owned.once("exit", resolve)),
      delay(3000),
    ]);
    if (owned.exitCode === null && owned.signalCode === null)
      try {
        process.kill(-owned.pid, "SIGKILL");
      } catch {}
  }
}
const stopChildren = () => Promise.all([...activeChildren].map(stopTree));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(
    signal,
    () => void stopChildren().finally(() => process.exit(1)),
  );
const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
try {
  console.log(`Isolated QA: ${path.relative(root, runDir)}`);
  await finish(
    launch([path.join(root, "node_modules/vite/bin/vite.js"), "build"]),
  );
  await finish(launch([path.join(root, "scripts/shell-version.mjs")]));
  const db = "neoform-qa-" + runId.slice(0, 8),
    config = path.join(runDir, "wrangler.json");
  const configuration = {
    name: db,
    compatibility_date: "2026-10-01",
    main: path.join(root, "worker/index.ts"),
    alias: { "./ai-local": path.join(root, "worker/ai-disabled.ts") },
    assets: {
      binding: "ASSETS",
      directory: path.join(root, "dist"),
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: db,
        database_id: randomUUID(),
        migrations_dir: path.join(root, "migrations"),
      },
    ],
  };
  await writeFile(config, JSON.stringify(configuration, null, 2));
  const common = ["--config", config, "--env-file", emptyEnv];
  const state = path.join(runDir, "d1");
  await finish(
    launch([
      wrangler,
      "d1",
      "migrations",
      "apply",
      db,
      "--local",
      "--persist-to",
      state,
      ...common,
    ]),
  );
  const listenPort = await port();
  let inspectorPort = await port();
  while (inspectorPort === listenPort) inspectorPort = await port();
  ownedPort = listenPort;
  const url = `http://127.0.0.1:${listenPort}`;
  worker = launch(
    [
      wrangler,
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(listenPort),
      "--inspector-port",
      String(inspectorPort),
      "--persist-to",
      state,
      ...common,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  let output = "",
    exited = false;
  const log = (chunk) => {
    output = (output + chunk.toString()).slice(-64000);
    void appendFile(path.join(runDir, "worker.log"), chunk).catch(() => {});
  };
  worker.stdout.on("data", log);
  worker.stderr.on("data", log);
  worker.once("exit", () => {
    exited = true;
  });
  worker.once("error", () => {
    exited = true;
  });
  const deadline = Date.now() + 60000;
  while (!output.includes(`Ready on ${url}`)) {
    if (exited || Date.now() > deadline)
      throw Error(
        `Owned QA Worker failed to start; inspect ${path.relative(root, runDir)}/worker.log.`,
      );
    await delay(100);
  }
  const health = await fetch(url + "/api/health", {
    signal: AbortSignal.timeout(10000),
  });
  if (exited || !health.ok || !(await health.json()).ok)
    throw Error("Owned QA Worker health check failed.");
  await writeFile(
    path.join(runDir, "run.json"),
    JSON.stringify({ url, runId, pid: worker.pid }),
  );
  Object.assign(env, {
    NEOFORM_QA_URL: url,
    NEOFORM_QA_RUN_DIR: runDir,
    NEOFORM_QA_RUN_ID: runId,
    NEOFORM_QA_OUTPUT: path.join(runDir, "evidence"),
  });
  if (process.env.NEOFORM_QA_BROWSER) {
    if (!path.isAbsolute(process.env.NEOFORM_QA_BROWSER))
      throw Error("Browser executable must be an absolute local path.");
    await access(process.env.NEOFORM_QA_BROWSER);
    env.NEOFORM_QA_BROWSER = process.env.NEOFORM_QA_BROWSER;
  }
  if (!args.includes("--browser-only"))
    await finish(
      launch([
        path.join(root, "node_modules/vitest/vitest.mjs"),
        "run",
        "--maxWorkers=1",
        "tests/api.test.ts",
        "tests/training-api.test.ts",
        "tests/release-api-identity.test.ts",
        "tests/v2-api.test.ts",
      ]),
    );
  if (!args.includes("--api-only"))
    await finish(
      launch([path.join(root, "node_modules/@playwright/test/cli.js"), "test"]),
    );
} finally {
  await stopChildren();
  await unlink(path.join(runDir, "run.json")).catch(() => {});
  if (ownedPort && (await listening(ownedPort)))
    throw Error(
      "Owned QA listener still responds after cleanup; release gate failed.",
    );
}
console.log(
  "Owned Worker/D1 QA passed and listener shutdown verified. No existing listener or provider credentials used.",
);
