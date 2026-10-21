import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
const policy = await import("../scripts/cloud-secret-policy.mjs").catch(
  () => ({}),
);
describe("production encryption master policy", () => {
  it.each(["linux", "darwin"])(
    "fails closed on %s without a disk fallback or consumer call and clears input",
    (platform) => {
      // Exercise the real unsupported-platform branch on every host. Block any
      // attempted filesystem write or socket creation, rather than trusting text.
      const code = `import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';const {withMemorySecretInput}=await import(${JSON.stringify(new URL("../scripts/cloud-secret-policy.mjs", import.meta.url).href)});Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});for(const key of ['writeFileSync','writeFile','createWriteStream','open','openSync'])fs[key]=()=>{throw Error('DISK_FALLBACK_FORBIDDEN')};for(const key of ['writeFile','open'])fs.promises[key]=async()=>{throw Error('DISK_FALLBACK_FORBIDDEN')};net.createServer=()=>{throw Error('SOCKET_FALLBACK_FORBIDDEN')};const payload=Buffer.from('synthetic-only');let consumed=false;await assert.rejects(withMemorySecretInput(payload,async()=>{consumed=true}),/Windows named pipes; no disk fallback/);assert.equal(consumed,false);assert.ok(payload.every(v=>v===0),'unsupported-platform payload was not cleared');`;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", code],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
    },
  );
  it.skipIf(process.platform !== "win32")(
    "fails closed if the deployment command never consumes its memory-only secret input",
    async () => {
      const payload = Buffer.from("synthetic");
      await expect(
        policy.withMemorySecretInput(payload, async () => "unconsumed"),
      ).rejects.toThrow(/not consumed/);
      expect(payload.every((v) => v === 0)).toBe(true);
    },
  );
  it.skipIf(process.platform !== "win32")(
    "the installed Wrangler consumes the Windows memory pipe during an offline synthetic deploy dry-run",
    async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { spawn } = await import("node:child_process");
      const { cloudLaunchEnvironment } =
        await import("../scripts/cloud-launch-policy.mjs");
      const { tmpdir } = await import("node:os");
      const dir = fs.mkdtempSync(
        path.join(
          process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir(),
          "neoform-cloud-secret-test-",
        ),
      );
      try {
        const main = path.join(dir, "worker.mjs");
        const config = path.join(dir, "wrangler.json");
        fs.writeFileSync(
          main,
          "export default { fetch() { return new Response('offline synthetic fixture'); } };",
        );
        fs.writeFileSync(
          config,
          JSON.stringify({
            name: "neoform-offline-fixture",
            main,
            compatibility_date: "2026-10-01",
            secrets: { required: ["GEMINI_KEY_MASTER"] },
          }),
        );
        // Stop the test before any accidental network/auth/local-secret read.
        const guard = `import fs from 'node:fs';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';const r=fs.readFileSync;fs.readFileSync=(p,...a)=>{const s=String(p).replaceAll('\\\\','/');if(s.endsWith('/config/default.toml')||/\\/\\.dev\\.vars(?:\\.|$)|\\/\\.env(?:\\.|$)/.test(s))throw Error('AUTH_OR_LOCAL_SECRET_READ_FORBIDDEN');return r(p,...a)};http.request=https.request=()=>{throw Error('NETWORK_FORBIDDEN')};globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};syncBuiltinESMExports();`;
        const result = await policy.withMemorySecretInput(
          Buffer.from(JSON.stringify({ GEMINI_KEY_MASTER: "ab".repeat(32) })),
          (inputPath) =>
            new Promise((resolve, reject) => {
              const child = spawn(
                process.execPath,
                [
                  "--import",
                  "data:text/javascript," + encodeURIComponent(guard),
                  "node_modules/wrangler/bin/wrangler.js",
                  "deploy",
                  "--dry-run",
                  "--config",
                  config,
                  "--outfile",
                  path.join(dir, "output.mjs"),
                  "--secrets-file",
                  inputPath,
                  "--autoconfig=false",
                  "--env-file",
                  "NUL",
                ],
                {
                  cwd: new URL("..", import.meta.url),
                  env: cloudLaunchEnvironment(process.env),
                  stdio: ["ignore", "pipe", "pipe"],
                },
              );
              let output = "";
              child.stdout.on("data", (part) => {
                output += part;
              });
              child.stderr.on("data", (part) => {
                output += part;
              });
              child.on("error", reject);
              child.on("close", (status) => resolve({ status, output }));
            }),
        );
        expect(result.status, result.output).toBe(0);
        expect(result.output).toMatch(/dry-run|Dry run/i);
        expect(result.output).not.toContain("ab".repeat(32));
        expect(fs.existsSync(path.join(dir, "output.mjs"))).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    30000,
  );
  it("redacts failures and clears generated buffers even if the secret-input consumer fails", async () => {
    let payload, entropy;
    await expect(
      policy.deployWithMaster({
        provision: true,
        listSecrets: async () => [],
        prepareSchema: async () => {},
        randomBytes: (size) => {
          entropy = Buffer.alloc(size, 0xcd);
          return entropy;
        },
        withInput: async (bytes) => {
          payload = bytes;
          throw new Error(bytes.toString());
        },
        deploy: async () => {},
      }),
    ).rejects.toThrow(
      /^Production secret provisioning\/deployment failed; raw error withheld/,
    );
    expect(payload.every((v) => v === 0)).toBe(true);
    expect(entropy.every((v) => v === 0)).toBe(true);
  });
  it("never replaces a master that disappears after preflight", async () => {
    let lists = 0,
      generated = 0;
    await expect(
      policy.deployWithMaster({
        provision: true,
        listSecrets: async () =>
          ++lists === 1
            ? [{ name: "GEMINI_KEY_MASTER", type: "secret_text" }]
            : [],
        prepareSchema: async () => {},
        randomBytes: () => {
          generated++;
          return Buffer.alloc(32);
        },
        withInput: async () => {},
        deploy: async () => {},
      }),
    ).rejects.toThrow(/disappeared/);
    expect(generated).toBe(0);
  });
  it("creates fresh random 64-lowercase-hex only after schema, deploys atomically, and clears buffers", async () => {
    const seen = [];
    let lists = 0,
      payload,
      entropy;
    const result = await policy.deployWithMaster({
      provision: true,
      listSecrets: async () => {
        seen.push("list");
        return ++lists < 3
          ? []
          : [{ name: "GEMINI_KEY_MASTER", type: "secret_text" }];
      },
      prepareSchema: async () => {
        seen.push("schema");
      },
      randomBytes: (size) => {
        expect(size).toBe(32);
        seen.push("random");
        entropy = Buffer.alloc(size, 0xab);
        return entropy;
      },
      withInput: async (bytes, consume) => {
        payload = bytes;
        expect(JSON.parse(bytes.toString())).toEqual({
          GEMINI_KEY_MASTER: "ab".repeat(32),
        });
        seen.push("input");
        return consume("memory-only-input");
      },
      deploy: async (inputPath) => {
        expect(inputPath).toBe("memory-only-input");
        seen.push("deploy");
        return "done";
      },
    });
    expect(result).toBe("done");
    expect(seen).toEqual([
      "list",
      "schema",
      "list",
      "random",
      "input",
      "deploy",
      "list",
    ]);
    expect(payload.every((v) => v === 0)).toBe(true);
    expect(entropy.every((v) => v === 0)).toBe(true);
  });
  it("blocks missing masters before all remote writes unless explicitly provisioning", async () => {
    let writes = 0;
    await expect(
      policy.deployWithMaster({
        listSecrets: async () => [],
        prepareSchema: async () => {
          writes++;
        },
        deploy: async () => {
          writes++;
        },
      }),
    ).rejects.toThrow(/--provision-master/);
    expect(writes).toBe(0);
  });
  it("retains an existing remote master without generating or supplying any value", async () => {
    expect(typeof policy.deployWithMaster).toBe("function");
    const seen = [];
    const result = await policy.deployWithMaster({
      listSecrets: async () => {
        seen.push("list");
        return [{ name: "GEMINI_KEY_MASTER", type: "secret_text" }];
      },
      prepareSchema: async () => {
        seen.push("schema");
      },
      deploy: async (inputPath) => {
        expect(inputPath).toBeUndefined();
        seen.push("deploy");
        return "deployed";
      },
      randomBytes: () => {
        throw new Error("must not rotate");
      },
      withInput: () => {
        throw new Error("must not supply existing value");
      },
    });
    expect(result).toBe("deployed");
    expect(seen).toEqual(["list", "schema", "list", "deploy", "list"]);
  });
  it.skipIf(process.platform !== "win32")(
    "streams JSON through an owner-scoped memory pipe without a plaintext file",
    async () => {
      expect(typeof policy.withMemorySecretInput).toBe("function");
      const { spawn } = await import("node:child_process");
      const value = "synthetic-not-a-real-secret";
      const result = await policy.withMemorySecretInput(
        Buffer.from(JSON.stringify({ example: value })),
        async (inputPath) => {
          expect(inputPath).toMatch(/^\\\\\.\\pipe\\neoform-secret-/);
          return await new Promise((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [
                "-e",
                "const f=require('node:fs');const s=JSON.parse(f.readFileSync(process.argv[1],'utf8'));process.stdout.write(s.example === 'synthetic-not-a-real-secret' ? 'MATCH' : 'FAIL')",
                inputPath,
              ],
              { stdio: ["ignore", "pipe", "pipe"] },
            );
            let output = "";
            child.stdout.on("data", (part) => {
              output += part;
            });
            child.on("error", reject);
            child.on("close", (code) =>
              code === 0
                ? resolve(output)
                : reject(new Error("offline pipe reader failed")),
            );
          });
        },
      );
      expect(result).toBe("MATCH");
    },
  );
  it("accepts only name/type metadata and rejects prohibited production secret bindings", () => {
    expect(typeof policy.hasMasterSecret).toBe("function");
    expect(policy.hasMasterSecret([])).toBe(false);
    expect(
      policy.hasMasterSecret([
        { name: "GEMINI_KEY_MASTER", type: "secret_text" },
      ]),
    ).toBe(true);
    for (const metadata of [
      null,
      {},
      [{ name: "GEMINI_KEY_MASTER", type: "plain_text" }],
      [{ name: "GEMINI_KEY_MASTER", type: "secret_text", text: "synthetic" }],
      [{ name: "SINGLE_USER_MODE", type: "secret_text" }],
      [{ name: "AI_INTERNAL_KEY", type: "secret_text" }],
      [{ name: "SIDECAR_TOKEN", type: "secret_text" }],
    ]) {
      expect(() => policy.hasMasterSecret(metadata)).toThrow(
        /metadata|production/i,
      );
    }
  });
});

it("allows only notification-signing names alongside the unchanged master", () => {
  const names = [
    "GEMINI_KEY_MASTER",
    "REST_PUSH_VAPID_PUBLIC_KEY",
    "REST_PUSH_VAPID_PRIVATE_KEY",
  ].map((name) => ({ name, type: "secret_text" }));
  expect(policy.hasMasterSecret(names)).toBe(true);
  expect(() =>
    policy.hasMasterSecret([
      ...names,
      { name: "SINGLE_USER_TOKEN", type: "secret_text" },
    ]),
  ).toThrow();
});
