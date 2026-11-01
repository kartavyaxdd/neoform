import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  privateBrowserSuites,
  browserBatches,
} from "../scripts/qa-browser-batches.mjs";

it("gives private suites separate synthetic authentication budgets without dropping a gate", () => {
  const groups = browserBatches("private");
  expect(groups.flat()).toEqual(privateBrowserSuites);
  expect(groups.every((g) => g.length === 1)).toBe(true);
  expect(new Set(privateBrowserSuites).size).toBe(26);
  for (const name of privateBrowserSuites)
    expect(existsSync(new URL(`./browser/${name}`, import.meta.url))).toBe(
      true,
    );
});
it("preserves explicitly focused suites and the public/profile gate boundaries", () => {
  expect(
    browserBatches("private", [
      "reliability.spec.ts",
      "storage-release.spec.ts",
    ]),
  ).toEqual([["reliability.spec.ts"], ["storage-release.spec.ts"]]);
  expect(browserBatches("public")).toEqual([[]]);
  expect(browserBatches("public", ["glass-ui.spec.ts"])).toEqual([
    ["glass-ui.spec.ts"],
  ]);
  expect(browserBatches("profiles").flat()).toEqual([
    "workspace-profiles.spec.ts",
    "profile-gemini.spec.ts",
    "android-health.spec.ts",
    "app-updates.spec.ts",
  ]);
});
