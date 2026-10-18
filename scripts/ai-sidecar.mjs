import { equalAuthorization as equal } from "./sidecar-auth.mjs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";
import {
  createIsolatedJob,
  assertSafeHostConfiguration,
  systemConfigDirectory,
} from "./ai-isolation.mjs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { z } from "zod";
import {
  generationArgs,
  acceptEvents,
  reservation,
  restrictedModelCatalog,
} from "./cli-policy.mjs";
const root = path.resolve(".ai-runtime"),
  keyModule = path.resolve("worker/ai-local.ts"),
  scratch = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "hermes",
    "neoform-ai-jobs",
  );
await assertSafeHostConfiguration({
  systemDir: systemConfigDirectory(),
  codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
});
await mkdir(root, { recursive: true });
const allowedOrigin = process.argv[2] || "http://localhost:8787",
  allowed = new URL(allowedOrigin);
if (
  allowed.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "192.168.1.2"].includes(allowed.hostname) ||
  !["8787", "8789"].includes(allowed.port) ||
  allowed.pathname !== "/"
)
  throw new Error("Only approved QA or LAN Worker origins are supported.");
const binary =
  process.env.NEOFORM_CODEX_BINARY ||
  path.join(
    process.env.APPDATA || "",
    "npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  );
if (!existsSync(binary))
  throw new Error(
    "Installed Codex binary unavailable. Set NEOFORM_CODEX_BINARY to the installed executable.",
  );
const cliEnv = Object.fromEntries(
  [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "CODEX_HOME",
  ]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
function preflight(args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      cwd: root,
      env: cliEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("CLI preflight timeout."));
    }, 10000);
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(stdout) : reject(new Error("CLI preflight failed."));
    });
  });
}
const version = String(await preflight(["--version"])).trim();
if (version !== "codex-cli 0.160.0")
  throw new Error(
    "This restricted policy is verified only for Codex CLI 0.160.0.",
  );
const help = String(await preflight(["exec", "--help"]));
for (const flag of [
  "--ignore-user-config",
  "--ignore-rules",
  "--output-schema",
  "--json",
  "--ephemeral",
  "--sandbox",
])
  if (!help.includes(flag))
    throw new Error("Required CLI restriction unavailable: " + flag);
await writeFile(path.join(root, "cli-help.txt"), help);
await build({
  entryPoints: ["src/generation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(root, "generation.mjs"),
  logLevel: "silent",
});
const {
  generationInput,
  generatedSchema,
  validateGenerated,
  catalogExercises,
} = await import(pathToFileURL(path.join(root, "generation.mjs")).href);
const schemaPath = path.join(root, "schema.json"),
  catalogPath = path.join(root, "models.json");
await writeFile(schemaPath, JSON.stringify(z.toJSONSchema(generatedSchema)));
// Official ModelInfo schema: a null apply_patch_tool_type prevents edit-tool registration;
// direct mode prevents code-mode exec synthesis. No tool descriptions are supplied.
await writeFile(catalogPath, JSON.stringify(restrictedModelCatalog()));
const key = randomBytes(32).toString("hex"),
  jobs = new Map(),
  rates = new Map();
let stopping = false;
const internal = z
  .object({
    account: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: z.string().uuid(),
    input: z.unknown(),
  })
  .strict();
const send = (res, status, data) => {
  if (!res.writableEnded) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  }
};
async function generate(input, account, requestId) {
  const dir = await createIsolatedJob(process.cwd(), scratch),
    args = generationArgs(dir, schemaPath, catalogPath);
  if (jobs.get(requestId)?.cancelled) {
    jobs.delete(requestId);
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(scratch) + path.sep))
      throw new Error("Cleanup escaped job directory.");
    await rm(resolved, { recursive: true, force: true });
    throw new Error("Generation cancelled.");
  }
  const exerciseCatalog = catalogExercises.map(
    ({ id, name, equipment, pattern, muscle }) => ({
      id,
      name,
      equipment,
      pattern,
      muscle,
    }),
  );
  const prompt =
    "Create an editable training program from this fixed JSON input. Exactly one workout per training day. Known exercise IDs and available equipment only. 1–4 sets each, 5–20 reps, 2–4 RIR, 45–180s rest, at most floor(minutes/3) sets per day and 90 per week. Match limitations by omitting affected movements. Use a lighter final week. No diagnosis, no load prescriptions, no tools, no external lookups. Return JSON only. Preferences: " +
    JSON.stringify(input) +
    " Catalog: " +
    JSON.stringify(exerciseCatalog);
  const started = Date.now(),
    events = [];
  let text = "",
    buffer = "",
    size = 0,
    settled = false;
  const child = spawn(binary, args, {
    shell: false,
    windowsHide: true,
    cwd: dir,
    env: cliEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
    child.once("error", resolve);
  });
  const processLog = appendFile(
    path.join(root, "processes.jsonl"),
    JSON.stringify({
      pid: child.pid,
      kind: "generation",
      binary,
      args,
      started: new Date().toISOString(),
    }) + "\n",
  );
  const job = { account, child, requestId, cancel: null };
  jobs.set(requestId, job);
  let timeout;
  try {
    return await new Promise((resolve, reject) => {
      const fail = (e) => {
        if (settled) return;
        settled = true;
        void appendFile(
          path.join(root, "provider-errors.jsonl"),
          JSON.stringify({ requestId, error: e.message }) + "\n",
        );
        child.kill();
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        reject(e);
      };
      job.cancel = () => fail(new Error("Generation cancelled."));
      processLog.catch(() => fail(new Error("Process audit unavailable.")));
      timeout = setTimeout(
        () => fail(new Error("Generation timed out.")),
        110000,
      );
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 262144) {
          fail(new Error("Provider output exceeds budget."));
          return;
        }
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            events.push(event);
            if (
              event.item &&
              !["reasoning", "agent_message"].includes(event.item.type)
            ) {
              const kind = /^[a-z_]{1,50}$/.test(event.item.type)
                ? event.item.type
                : "unknown";
              const diagnostic =
                kind === "error"
                  ? String(event.item.message || "")
                      .slice(0, 1000)
                      .replace(
                        /(?:Bearer\s+|sk-|eyJ)[A-Za-z0-9_.-]+/g,
                        "[redacted]",
                      )
                      .replace(/https?:\/\/\S+/g, "[provider URL]")
                  : "";
              fail(
                new Error(
                  "Provider rejected item kind: " + kind + " " + diagnostic,
                ),
              );
            }
            if (
              event.type === "item.completed" &&
              event.item?.type === "agent_message"
            )
              text = event.item.text;
          } catch {
            fail(new Error("Malformed provider event."));
          }
        }
      });
      let stderrSize = 0;
      child.stderr.on("data", (chunk) => {
        stderrSize += chunk.length;
        if (stderrSize > 65536)
          fail(new Error("Provider diagnostics exceed budget."));
      });
      child.on("error", () => fail(new Error("CLI unavailable.")));
      child.on("close", async (code) => {
        clearTimeout(timeout);
        if (settled) return;
        try {
          if (code !== 0) throw new Error("CLI generation failed.");
          if (buffer.trim()) events.push(JSON.parse(buffer));
          acceptEvents(events);
          const program = validateGenerated(JSON.parse(text), input),
            usage = events.find((e) => e.type === "turn.completed").usage;
          const proof = {
            model: "gpt-6.1-sol",
            cli: "0.160.0",
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            toolCalls: 0,
          };
          await appendFile(
            path.join(root, "provider-proof.jsonl"),
            JSON.stringify({
              ...proof,
              elapsedMs: Date.now() - started,
              requestId,
              eventTypes: events.map((e) => e.type),
              itemTypes: events.filter((e) => e.item).map((e) => e.item.type),
              usage,
              restrictedCatalog: true,
              shell: false,
            }) + "\n",
          );
          settled = true;
          resolve({ program, proof });
        } catch (e) {
          fail(e);
        }
      });
      child.stdin.end(prompt);
    });
  } finally {
    clearTimeout(timeout);
    await exited;
    jobs.delete(requestId);
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(scratch) + path.sep))
      throw new Error("Cleanup escaped job directory.");
    await rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
const server = createServer(async (req, res) => {
  try {
    if (
      !equal(req.headers.authorization || "", "Bearer " + key) ||
      req.headers["x-neoform-origin"] !== allowedOrigin
    )
      return send(res, 401, { error: "Internal authorization required." });
    if (req.method !== "POST" || !["/generate", "/cancel"].includes(req.url))
      return send(res, 404, { error: "Route not found." });
    let bytes = 0,
      chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) return send(res, 413, { error: "Request too large." });
      chunks.push(chunk);
    }
    const value = internal.parse(JSON.parse(Buffer.concat(chunks).toString()));
    if (req.url === "/cancel") {
      const job = jobs.get(value.requestId);
      if (job?.account === value.account) job.cancel?.();
      return send(res, 200, { ok: true });
    }
    const input = generationInput.parse(value.input);
    if (stopping) return send(res, 503, { error: "Sidecar shutting down." });
    if (jobs.size >= 1 || jobs.has(value.requestId))
      return send(res, 429, { error: "Generator busy." });
    const current = rates.get(value.account) || { at: Date.now(), count: 0 };
    if (Date.now() - current.at > 900000) {
      current.at = Date.now();
      current.count = 0;
    }
    if (current.count >= 3) return send(res, 429, { error: "Rate limit." });
    current.count++;
    rates.set(value.account, current);
    if (rates.size > 10000)
      for (const [id, rate] of rates)
        if (Date.now() - rate.at > 900000) rates.delete(id);
    jobs.set(value.requestId, reservation(value.account));
    res.on("close", () => {
      if (!res.writableEnded) jobs.get(value.requestId)?.cancel?.();
    });
    try {
      send(res, 200, await generate(input, value.account, value.requestId));
    } catch (e) {
      await appendFile(
        path.join(root, "errors.jsonl"),
        JSON.stringify({ requestId: value.requestId, error: e.message }) + "\n",
      );
      send(res, e.message === "Generation timed out." ? 504 : 503, {
        error: "Generation unavailable.",
      });
    }
  } catch {
    send(res, 400, { error: "Malformed bounded request." });
  }
});
server.headersTimeout = 10000;
server.requestTimeout = 120000;
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(8790, "127.0.0.1", resolve);
});
await writeFile(
  keyModule,
  "// Host-only ephemeral internal authorization. Cleared when sidecar stops.\nexport const localAiKey = '" +
    key +
    "';\n",
);
await appendFile(
  path.join(root, "processes.jsonl"),
  JSON.stringify({
    pid: process.pid,
    kind: "sidecar",
    command: ["node", "scripts/ai-sidecar.mjs", allowedOrigin],
    log: ".ai-runtime/provider-proof.jsonl",
    started: new Date().toISOString(),
  }) + "\n",
);
console.log(
  "NEOFORM AI sidecar PID " +
    process.pid +
    " listening on 127.0.0.1:8790 for " +
    allowedOrigin +
    ". Logs: .ai-runtime. Codex authenticates itself.",
);
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const job of jobs.values()) job.cancel?.();
  await writeFile(
    keyModule,
    "// Host-only internal authorization; sidecar is stopped.\nexport const localAiKey = '';\n",
  );
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (!process.argv.includes("--persistent")) setTimeout(stop, 900000).unref();
