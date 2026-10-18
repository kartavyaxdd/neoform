import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  selectAccount,
  productionConfig,
  assertDatabaseBinding,
  assertAiDeployment,
} from "../scripts/cloud-launch-policy.mjs";
import * as launchPolicy from "../scripts/cloud-launch-policy.mjs";
describe("cloud launch scope guards", () => {
  it("blocks missing-master real CLI path before database or deployment commands (all cloud mocked)", () => {
    const config = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    const preload = `import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const exists=fs.existsSync,read=fs.readFileSync;fs.existsSync=(p)=>String(p).endsWith('wrangler.production.jsonc')||exists(p);fs.readFileSync=(p,...a)=>String(p).endsWith('wrangler.production.jsonc')?${JSON.stringify(JSON.stringify(config))}:read(p,...a);fs.writeFileSync=()=>{throw Error('WRITE_FORBIDDEN')};cp.spawnSync=(_,args,opts)=>{if(!args.includes('--env-file')||!args.includes('NUL')||opts.env.WRANGLER_WRITE_LOGS!=='false')throw Error('UNSAFE_CHILD_ENV');if(args[1]==='whoami')return {status:0,stdout:JSON.stringify({loggedIn:true,accounts:[{id:'${"a".repeat(32)}'}]})};if(args[1]==='secret'&&args[2]==='list')return {status:0,stdout:'[]'};throw Error('REMOTE_WRITE_FORBIDDEN')};cp.spawn=()=>{throw Error('REMOTE_WRITE_FORBIDDEN')};syncBuiltinESMExports();`;
    const r = spawnSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(preload), "scripts/cloud-launch.mjs"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--provision-master/);
    expect(r.stderr).not.toMatch(/FORBIDDEN|UNSAFE/);
  });
  it("isolates Wrangler from inherited local flags, debug capture, environment selection and local secrets", () => {
    expect(typeof launchPolicy.cloudLaunchEnvironment).toBe("function");
    const env = launchPolicy.cloudLaunchEnvironment({ PATH: "synthetic-path", SINGLE_USER_MODE: "local", GEMINI_KEY_MASTER: "synthetic", AI_INTERNAL_KEY: "synthetic", NODE_OPTIONS: "--inspect", NODE_DEBUG: "http", SSLKEYLOGFILE: "capture", WRANGLER_LOG: "debug", WRANGLER_LOG_SANITIZE: "false", WRANGLER_WRITE_LOGS: "true", CLOUDFLARE_ENV: "local", CLOUDFLARE_ACCOUNT_ID: "other", WRANGLER_SEND_METRICS: "true" });
    expect(env).toEqual({ PATH: "synthetic-path", CI: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_SANITIZE: "true", WRANGLER_LOG: "log", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" });
  });
  it("matches remote D1 ID and name metadata before migrations can target a reused binding", () => {
    expect(typeof launchPolicy.assertRemoteDatabase).toBe("function");
    const c = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    c.d1_databases = [{ binding: "DB", database_id: "12345678-1234-1234-1234-123456789abc", database_name: c.name + "-data" }];
    const remote = { uuid: c.d1_databases[0].database_id, name: c.name + "-data" };
    expect(() => launchPolicy.assertRemoteDatabase(c, [remote])).not.toThrow();
    for (const rows of [[], [{ ...remote, name: "unrelated" }], [{ ...remote, uuid: "87654321-1234-1234-1234-123456789abc" }], [remote, remote], {}]) {
      expect(() => launchPolicy.assertRemoteDatabase(c, rows)).toThrow(/database/i);
    }
  });
  it("validates reused namespaces, security-header routing, and all database bindings before creation", () => {
    const c = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    for (const patch of [{ name: "unrelated" }, { account_id: "bad" }, { assets: { ...c.assets, run_worker_first: false } }, { assets: { ...c.assets, directory: "../personal" } }, { assets: { ...c.assets, experimental_serve_directly: true } }, { observability: { enabled: true } }, { workers_dev: false }, { d1_databases: [{ binding: "OTHER" }] }]) {
      expect(() => assertAiDeployment({ ...c, ...patch })).toThrow(/production|database/i);
    }
  });
  it("runs offline CLI dry-run without invoking Wrangler or writing any file", () => {
    const preload = `import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';cp.spawnSync=cp.spawn=()=>{throw Error('WRANGLER_FORBIDDEN')};fs.writeFileSync=()=>{throw Error('WRITE_FORBIDDEN')};syncBuiltinESMExports();`;
    const r = spawnSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(preload), "scripts/cloud-launch.mjs", "--dry-run", "--provision-master"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Offline policy dry-run/);
    expect(r.stdout).toMatch(/no authentication|no auth/i);
  });
  it("parses only explicit launch flags and refuses local/proxy/deployment overrides", () => {
    expect(typeof launchPolicy.parseLaunchArguments).toBe("function");
    expect(launchPolicy.parseLaunchArguments(["--dry-run", "--provision-master", "--account-id", "a".repeat(32)])).toEqual({ dryRun: true, provision: true, accountId: "a".repeat(32), check: false, login: false });
    for (const args of [["--local"], ["--var", "SINGLE_USER_MODE:local"], ["--env", "local"], ["--secrets-file", "local"], ["--account-id"], ["--account-id", "bad"], ["--check", "--provision-master"], ["--login", "--login"]]) {
      expect(() => launchPolicy.parseLaunchArguments(args)).toThrow(/argument|flag|account|mode/i);
    }
  });
  it("requires exactly the installation database name and canonical migration directory", () => {
    const c = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    const db = { binding: "DB", database_id: "12345678-1234-1234-1234-123456789abc", database_name: c.name + "-data", migrations_dir: "migrations" };
    expect(assertDatabaseBinding({ ...c, d1_databases: [db] })).toEqual(db);
    for (const patch of [{ database_name: "unrelated-data" }, { migrations_dir: "../elsewhere" }, { preview_database_id: db.database_id }]) {
      expect(() => assertDatabaseBinding({ ...c, d1_databases: [{ ...db, ...patch }] })).toThrow(/database/i);
    }
    expect(() => assertDatabaseBinding({ ...c, d1_databases: [db, db] })).toThrow(/database/i);
  });
  it("rejects local-mode, proxy/sidecar flags, secret vars, and hidden environment overrides by presence", () => {
    const safe = () => productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    expect(() => assertAiDeployment(safe())).not.toThrow();
    for (const key of ["SINGLE_USER_MODE", "SINGLE_USER_ID", "SINGLE_USER_GATEWAY_TOKEN", "AI_INTERNAL_KEY", "GEMINI_KEY_MASTER", "GEMINI_API_KEY", "AI_PROXY_URL", "SIDECAR_URL"]) {
      for (const value of ["", false, "synthetic"]) {
        expect(() => assertAiDeployment({ ...safe(), vars: { [key]: value } }), key).toThrow(/production/i);
      }
    }
    for (const extra of [{ env: { local: { vars: { SINGLE_USER_MODE: "local" } } } }, { routes: ["other.example/*"] }, { alias: { "./ai-local": "./worker/ai-disabled.ts", other: "./ai-local.ts" } }, { build: { command: "unsafe" } }, { secrets: { required: [] } }]) {
      expect(() => assertAiDeployment({ ...safe(), ...extra })).toThrow(/production/i);
    }
  });
  it("declares the encryption master required and keeps Worker security headers", () => {
    const c = productionConfig({ compatibility_date: "2026-10-01" }, "a".repeat(32), "abcdef1234");
    expect(c.secrets).toEqual({ required: ["GEMINI_KEY_MASTER"] });
    expect(c.assets.run_worker_first).toBe(true);
  });
  it("loads the checked-in configuration using the launcher's JSON parser", () => {
    const base = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    const config = productionConfig(base, "a".repeat(32), "abcdef1234");
    expect(config.compatibility_date).toBe(base.compatibility_date);
    expect(config.assets.directory).toBe("./dist");
  });
  it("refuses unauthenticated launch", () =>
    expect(() => selectAccount({ loggedIn: false })).toThrow(/login/i));
  it("refuses ambiguous account selection", () =>
    expect(() =>
      selectAccount({
        loggedIn: true,
        accounts: [{ id: "a".repeat(32) }, { id: "b".repeat(32) }],
      }),
    ).toThrow(/account-id/i));
  it("permits only an authenticated explicitly selected account", () =>
    expect(
      selectAccount(
        {
          loggedIn: true,
          accounts: [{ id: "a".repeat(32) }, { id: "b".repeat(32) }],
        },
        "b".repeat(32),
      ),
    ).toBe("b".repeat(32)));
  it("does not carry unrelated routes or resource bindings into a fresh deployment", () => {
    const c = productionConfig(
      {
        compatibility_date: "2026-10-01",
        routes: ["unrelated.example/*"],
        d1_databases: [{ binding: "OLD" }],
      },
      "a".repeat(32),
      "abcdef1234",
    );
    expect(c.name).toBe("neoform-abcdef1234");
    expect(c.routes).toBeUndefined();
    expect(c.d1_databases).toBeUndefined();
    expect(c.workers_dev).toBe(true);
    expect(c.observability.enabled).toBe(false);
  });
  it("rejects placeholder database IDs", () =>
    expect(() =>
      assertDatabaseBinding({
        d1_databases: [
          {
            binding: "DB",
            database_id: "00000000-0000-0000-0000-000000000001",
          },
        ],
      }),
    ).toThrow(/database/i));
});
