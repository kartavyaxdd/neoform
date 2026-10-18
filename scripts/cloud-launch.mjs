import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  selectAccount,
  productionConfig,
  assertDatabaseBinding,
  assertAiDeployment,
  parseLaunchArguments,
  cloudLaunchEnvironment,
  assertRemoteDatabase,
} from "./cloud-launch-policy.mjs";
import { deployWithMaster } from "./cloud-secret-policy.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const args = process.argv.slice(2),
  requested = args.includes("--account-id")
    ? args[args.indexOf("--account-id") + 1]
    : undefined;
function run(argv, inherit = false) {
  return spawnSync(process.execPath, [cli, ...argv, "--env-file", process.platform === "win32" ? "NUL" : "/dev/null"], {
    cwd: root,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    env: cloudLaunchEnvironment(process.env),
  });
}
function requireSuccess(r, label) {
  if (r.error || r.status !== 0)
    throw new Error(label + " failed; raw child output withheld to protect credentials.");
  return r.stdout || "";
}
// Async spawning is essential: the memory-pipe server must keep servicing I/O.
function runDeployment(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...argv, "--env-file", process.platform === "win32" ? "NUL" : "/dev/null"], {
      cwd: root, env: cloudLaunchEnvironment(process.env), stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Deployment timed out; remote state is unverified. Rerun checks before retrying.")); }, 300000);
    child.stdout.on("data", (part) => { stdout += part.toString(); });
    child.stderr.on("data", () => {}); // Never forward secret-bearing subprocess output.
    child.once("error", () => { clearTimeout(timeout); reject(new Error("Deployment process failed; raw output withheld.")); });
    child.once("close", (status) => {
      clearTimeout(timeout);
      if (status !== 0) reject(new Error("Deployment failed; raw output withheld. No success claimed."));
      else resolve(stdout);
    });
  });
}
async function main() {
  const options = parseLaunchArguments(args);
  if (options.dryRun) {
    const configPath = path.join(root, "wrangler.production.jsonc");
    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, "utf8"))
      : productionConfig({ compatibility_date: "2026-10-01" }, options.accountId || "a".repeat(32), "abcdef1234");
    assertAiDeployment(config);
    if (config.d1_databases !== undefined) assertDatabaseBinding(config);
    if (options.accountId && config.account_id !== options.accountId)
      throw new Error("Existing production configuration has a different account.");
    console.log("Offline policy dry-run passed: no authentication, remote calls, entropy generation, file writes, database creation, secret provisioning or deployment. Real launch requires authenticated account/namespace, matching remote D1, schema before release, and GEMINI_KEY_MASTER name verification.");
    return;
  }
  if (!fs.existsSync(cli))
    throw new Error("Install locked dependencies first: npm ci");
  let auth = run(["whoami", "--json"]),
    info;
  try {
    info = JSON.parse(auth.stdout || "{}");
  } catch {
    throw new Error("Could not read Cloudflare authentication status.");
  }
  if (!info.loggedIn && args.includes("--login") && !args.includes("--check")) {
    console.log(
      "Finish Cloudflare sign-in/authorization in YOUR browser. No password is collected by this script. Choose your free Workers account; this script never upgrades a plan or purchases anything.",
    );
    requireSuccess(run(["login"], true), "Cloudflare login");
    auth = run(["whoami", "--json"]);
    info = JSON.parse(auth.stdout || "{}");
  }
  const accountId = selectAccount(info, requested);
  if (args.includes("--check")) {
    console.log(
      "Cloud authentication ready. Check-only mode: no database or deployment was created.",
    );
    return;
  }
  const configPath = path.join(root, "wrangler.production.jsonc");
  let config;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (
      config.account_id !== accountId ||
      !/^neoform-[a-f0-9]{10}$/.test(config.name)
    )
      throw new Error(
        "Existing production configuration has a different account or unsafe namespace. No deployment was attempted.",
      );
  } else {
    const base = JSON.parse(
      fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"),
    );
    config = productionConfig(
      base,
      accountId,
      crypto.randomBytes(5).toString("hex"),
    );
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
  assertAiDeployment(config);
  const listSecrets = async () => {
    const result = run(["secret", "list", "--format", "json", "--config", configPath]);
    // Only this explicit, Wrangler-produced absence is treated as a fresh
    // Worker. Auth/network/parse failures are never evidence of no master.
    if (result.status !== 0 && !result.error &&
        (result.stderr || "").includes(`Worker "${config.name}" not found.`)) return [];
    try {
      return JSON.parse(requireSuccess(result, "Secret-name metadata lookup"));
    } catch {
      throw new Error("Cannot verify production secret-name metadata; no release permitted.");
    }
  };
  const prepareSchema = async () => {
    // No secret upload command creates a draft Worker or changes live code.
    // Check deploy-time secret support before any database writes.
    const help = requireSuccess(run(["deploy", "--help"]), "Wrangler capability check");
    if (!["--secrets-file", "--strict", "--autoconfig"].every((flag) => help.includes(flag)))
      throw new Error("Installed Wrangler lacks required safe deploy flags; install locked dependencies.");
    assertAiDeployment(config);
    if (config.d1_databases === undefined) {
      const before = JSON.parse(requireSuccess(run(["d1", "list", "--json", "--config", configPath]), "Database-name collision check"));
      if (!Array.isArray(before) || before.some((row) => row.name === config.name + "-data"))
        throw new Error("Database namespace already exists or metadata is invalid. Bind the exact authorized DB explicitly before rerunning; refusing automatic adoption.");
      console.log("Creating an isolated database for this NEOFORM installation.");
      requireSuccess(run(["d1", "create", config.name + "-data", "--config", configPath, "--binding", "DB", "--update-config=true"], true), "Database creation");
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    assertAiDeployment(config);
    const db = assertDatabaseBinding(config);
    const remote = JSON.parse(requireSuccess(run(["d1", "list", "--json", "--config", configPath]), "Database metadata verification"));
    assertRemoteDatabase(config, remote);
    console.log("Applying schema only to the verified installation database.");
    requireSuccess(run(["d1", "migrations", "apply", db.database_name, "--remote", "--config", configPath], true), "Database migrations");
  };
  const deployed = await deployWithMaster({
    provision: options.provision,
    listSecrets,
    prepareSchema,
    deploy: async (secretInput) => {
      assertAiDeployment(config);
      console.log("Deploying the built application after schema verification; existing encryption masters are retained.");
      return runDeployment(["deploy", "--config", configPath, "--strict", "--autoconfig=false", ...(secretInput ? ["--secrets-file", secretInput] : [])]);
    },
  });
  console.log("Verified production secret name: GEMINI_KEY_MASTER (value never read back).");
  const matches = deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/gi) || [];
  const url = matches.find((u) =>
    new URL(u).hostname.startsWith(config.name + "."),
  );
  if (!url)
    throw new Error(
      "Deployment returned no verifiable workers.dev URL. Check Wrangler output; not claiming success.",
    );
  const health = await fetch(url + "/api/health", {
    signal: AbortSignal.timeout(20000),
  });
  if (!health.ok || !(await health.json()).ok)
    throw new Error("Public health check failed. Deployment is not verified.");
  const home = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!home.ok || !(await home.text()).includes("NEOFORM"))
    throw new Error("Public application shell verification failed.");
  fs.writeFileSync(path.join(root, "CLOUD-URL.txt"), url + "\n");
  console.log(
    "\nVerified HTTPS application shell and health: " +
      url +
      "\nCreate your own private app account there. This launch does not upload any local QA database or invented workouts. Production cross-device/auth acceptance still needs a real post-deploy run.",
  );
}
main().catch((e) => {
  console.error("CLOUD LAUNCH BLOCKED: " + e.message);
  process.exitCode = 2;
});
