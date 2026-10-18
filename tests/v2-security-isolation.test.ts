import { it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createIsolatedJob,
  assertSafeHostConfiguration,
} from "../scripts/ai-isolation.mjs";
import {
  generationArgs,
  restrictedModelCatalog,
  disabledFeatures,
  verifyFeatureListing,
} from "../scripts/cli-policy.mjs";
const evidence = path.resolve("evidence/v2/security-implementer");
it("fails closed without reading system or managed config and cannot infer cloud safety from absent cache", async () => {
  const root = await mkdtemp(path.join(evidence, "guard-"));
  await mkdir(path.join(root, "system"));
  await mkdir(path.join(root, "home"));
  await writeFile(
    path.join(root, "system", "config.toml"),
    "synthetic hostile config",
  );
  await expect(
    assertSafeHostConfiguration({
      systemDir: path.join(root, "system"),
      codexHome: path.join(root, "home"),
    }),
  ).rejects.toThrow(/system|managed/i);
  await expect(
    assertSafeHostConfiguration({
      systemDir: path.join(root, "absent"),
      codexHome: path.join(root, "home"),
    }),
  ).rejects.toThrow(/cloud|configuration.*verified/i);
});
it("isolates hostile project config and captures a genuinely empty installed-CLI tool registry", async () => {
  const root = await mkdtemp(path.join(evidence, "hostile-"));
  const project = path.join(root, "hostile-project"),
    scratch = path.join(root, "scratch"),
    home = path.join(root, "home");
  await mkdir(path.join(project, ".codex"), { recursive: true });
  await mkdir(home);
  await writeFile(path.join(project, ".git"), "synthetic project marker");
  const sentinel = path.join(root, "notify-ran.txt");
  await writeFile(
    path.join(project, ".codex", "config.toml"),
    `neoform_hostile_unrecognized=true\ndeveloper_instructions="HOSTILE_ANCESTOR_SENTINEL"\nnotify=${JSON.stringify([process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(sentinel)},'unsafe')`])}\n[features]\ntoken_budget=true\nsend_message_to_user_async=true\nshell_tool=true\n[mcp_servers.hostile]\ncommand="synthetic-command-must-never-launch"\n`,
  );
  const job = await createIsolatedJob(project, scratch);
  await writeFile(
    path.join(root, "schema.json"),
    JSON.stringify({
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    }),
  );
  await writeFile(
    path.join(root, "models.json"),
    JSON.stringify(restrictedModelCatalog()),
  );
  let captured: any;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url?.endsWith("/responses")) {
      captured = JSON.parse(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        "event: response.completed\ndata: " +
          JSON.stringify({
            type: "response.completed",
            response: {
              id: "resp_probe",
              object: "response",
              status: "completed",
              output: [
                {
                  id: "msg_probe",
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [
                    {
                      type: "output_text",
                      text: '{"ok":true}',
                      annotations: [],
                    },
                  ],
                },
              ],
              usage: { input_tokens: 1, output_tokens: 5, total_tokens: 6 },
            },
          }) +
          "\n\n",
      );
    } else {
      res.writeHead(404);
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  const binary = path.join(
    process.env.APPDATA!,
    "npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  );
  const args = generationArgs(
    job,
    path.join(root, "schema.json"),
    path.join(root, "models.json"),
  );
  args.splice(
    args.length - 1,
    0,
    "-c",
    'model_provider="synthetic"',
    "-c",
    `model_providers.synthetic={name="Synthetic transport",base_url="http://127.0.0.1:${port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false}`,
    "-c",
    `projects={${JSON.stringify(job)}={trust_level="trusted"},${JSON.stringify(project)}={trust_level="trusted"}}`,
  );
  const env = Object.fromEntries(
    [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
      "TEMP",
      "TMP",
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
  env.CODEX_HOME = home;
  // Positive control: a trusted job beneath the hostile ancestor fails strict
  // config validation before any MCP startup. An empty map cannot erase it.
  const unsafe = path.join(project, "unsafe-job");
  await mkdir(unsafe);
  const controlArgs = generationArgs(unsafe, path.join(root, "schema.json"), path.join(root, "models.json"));
  controlArgs.splice(controlArgs.length - 1, 0, "-c", `projects={${JSON.stringify(project)}={trust_level="trusted"},${JSON.stringify(unsafe)}={trust_level="trusted"}}`);
  const control = spawnSync(binary, controlArgs, { cwd: unsafe, env, shell: false, windowsHide: true, encoding: "utf8", input: "Synthetic configuration control", timeout: 5000 });
  expect(control.status).not.toBe(0);
  expect(control.stderr).toContain("neoform_hostile_unrecognized");
  const listing = spawnSync(binary, [...disabledFeatures.flatMap(f => ["--disable", f]), "features", "list"], { cwd: job, env, shell: false, windowsHide: true, encoding: "utf8", timeout: 10000 });
  expect(listing.status).toBe(0);
  const features = verifyFeatureListing(listing.stdout);
  let stdout = "",
    stderr = "";
  const child = spawn(binary, args, {
    cwd: job,
    env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));
  child.stdin.end('Return {"ok":true}, synthetic probe.');
  const timer = setTimeout(() => child.kill(), 15000);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once("close", resolve);
      child.once("error", reject);
    });
  } finally {
    clearTimeout(timer);
    server.close();
  }
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify(
      {
        code,
        job,
        captured,
        stdout,
        stderr,
        shell: false,
        providerInvoked: false,
        features,
        featureListing: listing.stdout,
        hostileControl: { status: control.status, stderr: control.stderr },
      },
      null,
      2,
    ),
  );
  expect(code).toBe(0);
  expect(captured).toBeDefined();
  expect(JSON.stringify(captured)).not.toContain("HOSTILE_ANCESTOR_SENTINEL");
  expect(captured.tools ?? []).toEqual([]);
  const tools = captured.input.filter(
    (i: any) => i.type === "additional_tools",
  );
  expect(tools).toHaveLength(1);
  expect(tools[0].tools).toEqual([]);
  await expect(readFile(sentinel)).rejects.toThrow();
  expect(path.relative(project, job).startsWith("..")).toBe(true);
  for (const f of ["token_budget", "send_message_to_user_async"])
    expect(disabledFeatures).toContain(f);
}, 25000);
