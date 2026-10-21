import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { cloudLaunchEnvironment } from "./cloud-launch-policy.mjs";
import { ciProductionConfig } from "./ci-production-config.mjs";
import {
  hasMasterSecret,
  withMemorySecretInput,
} from "./cloud-secret-policy.mjs";

// This provisions only NEW notification signing keys. Existing secrets are
// inspected by name only and are never read, rotated, printed or written to disk.
const target = {
  NEOFORM_ACCOUNT_ID: "c2d9d6ac2167ca45cb832a894abce8c7",
  NEOFORM_WORKER: "neoform-bca721354a",
  NEOFORM_D1_ID: "b8a5a783-5f9f-4f32-9264-db83591c6e37",
  PUBLIC_WORKSPACE: "enabled",
};
const config = ".ci-production.json";
if (
  JSON.stringify(JSON.parse(readFileSync(config, "utf8"))) !==
  JSON.stringify(ciProductionConfig(target))
)
  throw Error("Unexpected deployment target.");
const env = cloudLaunchEnvironment(process.env);
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        ...args,
        "--config",
        config,
        "--env-file",
        process.platform === "win32" ? "NUL" : "/dev/null",
      ],
      { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (part) => {
      output += part;
    });
    child.stderr.on("data", () => {});
    child.on("error", () =>
      reject(
        Error("Notification provisioning command failed; output withheld."),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            Error("Notification provisioning command failed; output withheld."),
          ),
    );
  });
}
const metadata = async () =>
  JSON.parse(await run(["secret", "list", "--format", "json"]));
const before = await metadata();
if (!hasMasterSecret(before))
  throw Error("Existing encryption master is required.");
const names = ["REST_PUSH_VAPID_PUBLIC_KEY", "REST_PUSH_VAPID_PRIVATE_KEY"];
const present = names.filter((name) => before.some((row) => row.name === name));
if (present.length === 1)
  throw Error("Incomplete notification key pair; refusing rotation.");
if (present.length === 2)
  console.log(
    "Notification key names already present; no values read or changed.",
  );
else {
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const payload = Buffer.from(
    JSON.stringify({
      REST_PUSH_VAPID_PUBLIC_KEY: Buffer.from(
        await webcrypto.subtle.exportKey("raw", keys.publicKey),
      ).toString("base64url"),
      REST_PUSH_VAPID_PRIVATE_KEY: (
        await webcrypto.subtle.exportKey("jwk", keys.privateKey)
      ).d,
    }),
  );
  await withMemorySecretInput(payload, (input) =>
    run(["secret", "bulk", input]),
  );
  console.log(
    "Provisioned separate notification signing keys through memory-only input.",
  );
}
const after = await metadata();
if (
  !hasMasterSecret(after) ||
  !names.every((name) => after.some((row) => row.name === name))
)
  throw Error("Secret-name verification failed.");
console.log(
  "Verified notification key names and retained encryption-master name.",
);
