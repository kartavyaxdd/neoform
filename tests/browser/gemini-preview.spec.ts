import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { GEMINI_MODEL } from "../../src/aiProof";
import { mkdir } from "node:fs/promises";
test.use({ viewport: { width: 390, height: 844 } });
const fixtureProgram = {
  name: "FIXTURE ONLY - Not live Gemini",
  description: "Synthetic upstream fixture, not a live provider result.",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: "Fixture day " + i,
    exercises: [
      { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
};
const fixtureProof = {
  provider: "gemini",
  model: GEMINI_MODEL,
  inputTokens: 50,
  outputTokens: 80,
  toolCalls: 0,
  toolsProvided: 0,
  agentLoop: false,
};
async function openWizard(page: any) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "AI program", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Training days", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Next", exact: true }).click();
}
const snapshot = (page: any) =>
  page.evaluate(async () => await (await fetch("/api/data")).json());
test("FIXTURE ONLY Gemini preview is editable and never saved before explicit acceptance; real QA save survives reload", async ({
  page,
}) => {
  await fixture(page);
  const before = await snapshot(page);
  await page.route("**/api/ai/generate", (r) =>
    r.fulfill({ json: { program: fixtureProgram, proof: fixtureProof } }),
  );
  await openWizard(page);
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your program" }),
  ).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page
    .getByLabel("Generated program name", { exact: true })
    .fill("Reviewed FIXTURE ONLY Gemini program");
  await mkdir("evidence/gemini", { recursive: true });
  await page.screenshot({ path: "evidence/gemini/fixture-preview-390.png" });
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  const saved = await snapshot(page);
  const added = saved.data.programs.find(
    (p: any) => p.name === "Reviewed FIXTURE ONLY Gemini program",
  );
  expect(added).toBeDefined();
  expect(added.workouts).toHaveLength(2);
  expect(added.deloadWeek).toBe(6);
  expect(saved.data.sessions).toEqual(before.data.sessions);
});
test("missing account key is actionable and does not change real QA program state", async ({
  page,
}) => {
  await fixture(page);
  const before = await snapshot(page);
  await openWizard(page);
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("More settings");
  expect(await snapshot(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Save program", exact: true }),
  ).toHaveCount(0);
});
