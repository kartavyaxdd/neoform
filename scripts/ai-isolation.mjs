import { mkdir, mkdtemp, realpath, writeFile, lstat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
export async function createIsolatedJob(projectRoot, scratchRoot) {
  const project = await realpath(projectRoot);
  const inside = (candidate) => {
    const relative = path.relative(project, candidate);
    return (
      !relative ||
      (!relative.startsWith(".." + path.sep) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  };
  if (inside(path.resolve(scratchRoot)))
    throw new Error("AI scratch must be outside the project.");
  await mkdir(scratchRoot, { recursive: true });
  const scratch = await realpath(scratchRoot);
  if (inside(scratch))
    throw new Error("AI scratch resolved inside the project.");
  const job = await mkdtemp(path.join(scratch, "job-"));
  // The supported project_root_markers override stops ancestor discovery here.
  // This is a boundary marker, not a repository or an executable config.
  await writeFile(
    path.join(job, ".git"),
    "NEOFORM isolated generation boundary\n",
  );
  await writeFile(
    path.join(job, "instructions.txt"),
    "Produce only bounded exercise program JSON using the supplied known catalog and schema. No tools, external lookups, diagnosis or painful progression.\n",
  );
  return job;
}
async function present(file) {
  try {
    await lstat(file);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw new Error("Configuration presence could not be verified.");
  }
}
export function systemConfigDirectory() {
  if (process.platform === "win32") {
    const result = spawnSync(
      path.join(
        process.env.SystemRoot || "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)",
      ],
      { shell: false, windowsHide: true, encoding: "utf8", timeout: 5000 },
    );
    if (
      result.error ||
      result.status !== 0 ||
      !path.isAbsolute(result.stdout.trim())
    )
      throw new Error("System configuration namespace could not be verified.");
    return path.join(result.stdout.trim(), "OpenAI", "Codex");
  }
  if (process.platform === "darwin")
    throw new Error(
      "Managed system configuration cannot be excluded on this host.",
    );
  return "/etc/codex";
}
export async function assertSafeHostConfiguration({ systemDir, codexHome }) {
  // Presence checks only: never inspect configuration or authentication content.
  for (const file of [
    "config.toml",
    "requirements.toml",
    "managed_config.toml",
  ])
    if (await present(path.join(systemDir, file)))
      throw new Error(
        "Inherited system/managed configuration cannot safely be excluded. AI is unavailable.",
      );
  if (await present(path.join(codexHome, "managed_config.toml")))
    throw new Error("Managed configuration present. AI is unavailable.");
  if (await present(path.join(codexHome, "cloud-config-bundle-cache.json")))
    throw new Error("Cloud configuration present. AI is unavailable.");
  // Pinned exec fetches managed cloud layers for eligible CLI-authenticated
  // accounts. It exposes no supported CLI bypass or safe plan-only auth query.
  // Cache absence is insufficient; do not start a customer CLI on that basis.
  throw new Error(
    "Cloud configuration isolation cannot be verified with CLI 0.160.0 under the no-credential/no-user-config-read boundary. AI is unavailable.",
  );
}
