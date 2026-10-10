import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  selectAccount,
  productionConfig,
  assertDatabaseBinding,
} from "./cloud-launch-policy.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const args = process.argv.slice(2),
  requested = args.includes("--account-id")
    ? args[args.indexOf("--account-id") + 1]
    : undefined;
function run(argv, inherit = false) {
  return spawnSync(process.execPath, [cli, ...argv], {
    cwd: root,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      ...(argv[0] === "d1" && argv[1] === "migrations" ? { CI: "1" } : {}),
    },
  });
}
function requireSuccess(r, label) {
  if (r.error || r.status !== 0)
    throw new Error(label + " failed. " + (r.stderr || r.error?.message || ""));
  return r.stdout || "";
}
async function main() {
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
  if (!config.d1_databases?.some((d) => d.binding === "DB")) {
    console.log("Creating an isolated database for this NEOFORM installation.");
    requireSuccess(
      run(
        [
          "d1",
          "create",
          config.name + "-data",
          "--config",
          configPath,
          "--binding",
          "DB",
          "--update-config=true",
        ],
        true,
      ),
      "Database creation",
    );
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  const db = assertDatabaseBinding(config);
  console.log("Applying schema only to this installation.");
  requireSuccess(
    run(
      [
        "d1",
        "migrations",
        "apply",
        db.database_name,
        "--remote",
        "--config",
        configPath,
      ],
      true,
    ),
    "Database migrations",
  );
  console.log("Deploying the locked, built application.");
  const deployed = requireSuccess(
    run(["deploy", "--config", configPath, "--strict", "--autoconfig=false"]),
    "Deployment",
  );
  console.log(deployed);
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
