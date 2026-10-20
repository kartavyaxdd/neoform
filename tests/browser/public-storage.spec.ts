import { test, expect } from "@playwright/test";
import { readData, writeData } from "./storage-client";
test("actual public mode logs and reloads without exposing private account or AI controls", async ({
  page,
}) => {
  await page.goto("/");
  // Each public onboarding scenario owns its isolated QA workspace baseline.
  const D = await import("../../src/domain");
  const baseline = await (await readData(page)).json();
  expect(
    (
      await writeData(page, { data: { ...baseline, data: D.emptyState() } })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Synthetic public QA");
  await page
    .getByRole("button", { name: "Build my workspace", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("60");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("60");
  const remote = (await (await readData(page)).json()).data;
  expect(remote.draft.exercises[0].sets[0].weight).toBe(60);
  expect((await page.request.get("/api/me")).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
});

test("custom muscle categories and first-session references survive actual public D1 and mobile logging", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const D = await import("../../src/domain");
  const remote = await (await readData(page)).json();
  const forearm = D.exerciseSchema.parse({
    ...D.catalog[0],
    id: "qa-forearm",
    name: "Synthetic wrist curl",
    muscle: "Forearms",
    pattern: "Isolation",
    e1rm: false,
  });
  const neck = D.exerciseSchema.parse({
    ...forearm,
    id: "qa-neck",
    name: "Synthetic neck reference",
    muscle: "Neck",
  });
  const program = D.starterProgram("balanced");
  program.name = "Synthetic reference plan";
  program.workouts = [
    {
      id: "qa-reference-day",
      name: "Reference day",
      day: "Day 1",
      exercises: [{ ...D.target(forearm.id), startingLoad: 10 }],
    },
  ];
  const data = {
    ...remote.data,
    customExercises: [forearm, neck],
    programs: [program],
    draft: null,
  };
  expect((await writeData(page, { data: { ...remote, data } })).status()).toBe(
    200,
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Start Reference day", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByLabel("Synthetic wrist curl set 1 weight", { exact: true }),
    ).toHaveValue("10");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const saved = (await (await readData(page)).json()).data;
  expect(saved.customExercises.map((e: any) => e.muscle)).toEqual([
    "Forearms",
    "Neck",
  ]);
  expect(saved.draft.exercises[0].sets[0]).toMatchObject({
    weight: 10,
    done: false,
    effortReported: false,
  });
});
