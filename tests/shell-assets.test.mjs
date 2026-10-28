import { expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

it("build includes deferred public code and fonts in the versioned offline shell", async () => {
  const root = path.resolve(".qa-state");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "shell-assets-"));
  await fs.mkdir(path.join(dir, "dist/assets"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "dist/index.html"),
    '<script src="/assets/main.js"></script>',
  );
  await fs.copyFile("public/sw.js", path.join(dir, "dist/sw.js"));
  for (const name of [
    "main.js",
    "editor-lazy.js",
    "poster-lazy.js",
    "font.ttf",
    "ignored.map",
  ])
    await fs.writeFile(path.join(dir, "dist/assets", name), "synthetic");
  execFileSync(process.execPath, [path.resolve("scripts/shell-version.mjs")], {
    cwd: dir,
    windowsHide: true,
  });
  const worker = await fs.readFile(path.join(dir, "dist/sw.js"), "utf8");
  const chunks = JSON.parse(worker.match(/const CHUNKS = (\[[^;]*\]);/)[1]);
  expect(chunks).toEqual([
    "/assets/editor-lazy.js",
    "/assets/font.ttf",
    "/assets/main.js",
    "/assets/poster-lazy.js",
  ]);
  expect(worker).toMatch(/neoform-shell-[a-f0-9]{12}/);
  expect(worker).toContain("...CHUNKS");
});
