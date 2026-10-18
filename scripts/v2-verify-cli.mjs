// Read-only local tooling verification. Does not authenticate, invoke a model,
// start a sidecar, or read any Codex credential/configuration file.
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  disabledFeatures,
  generationArgs,
  restrictedModelCatalog,
  verifyFeatureListing,
} from "./cli-policy.mjs";

const binary =
  process.env.NEOFORM_CODEX_BINARY ||
  path.join(
    process.env.APPDATA || "",
    "npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe",
  );
const output = "evidence/v2/implementer";
await mkdir(output, { recursive: true });
function run(args) {
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 262144,
  });
  if (result.error || result.status !== 0)
    throw new Error("Installed CLI policy check failed.");
  return result.stdout;
}
const version = run(["--version"]).trim();
if (version !== "codex-cli 0.160.0") throw new Error("Unverified CLI version.");
const help = run(["exec", "--help"]);
for (const flag of [
  "--strict-config",
  "--ignore-user-config",
  "--ignore-rules",
  "--ephemeral",
  "--output-schema",
  "--sandbox",
  "--json",
])
  if (!help.includes(flag)) throw new Error("Missing restriction: " + flag);
// Feature listing returns only names/stages/booleans; the overrides exercise the
// installed flag parser. It never enters exec or customer generation.
const features = run([
  ...disabledFeatures.flatMap((feature) => ["--disable", feature]),
  "features",
  "list",
]);
await writeFile(`${output}/installed-cli-features-disabled.txt`, features);
const checked = verifyFeatureListing(features);
await writeFile(`${output}/installed-cli-help.txt`, help);
await writeFile(
  `${output}/cli-policy-check.json`,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      version,
      providerInvoked: false,
      shell: false,
      disabledFeatures,
      effectiveFeatureStates: checked,
      args: generationArgs(
        "ISOLATED_JOB_DIRECTORY",
        "FIXED_SCHEMA_PATH",
        "RESTRICTED_CATALOG_PATH",
      ),
      catalog: restrictedModelCatalog(),
      source: "https://github.com/openai/codex/tree/rust-v0.160.0",
    },
    null,
    2,
  ),
);
console.log(
  `${version}: ${checked.disabledFeatures.length} installed feature overrides verified false. unified_exec is CLI-normalized true but excluded by shell_tool=false and catalog shell_type=disabled. Required isolation flags available. No provider invoked.`,
);
