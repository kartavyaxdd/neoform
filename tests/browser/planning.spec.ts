import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import {
  exportHistoryBackup,
  importHistoryBackup,
} from "../../src/historyBackup";
for (const width of [360, 390, 1440])
  test(`explicit calendar and shorter workout survive save and offline resume at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState();
    state.profile = {
      name: "Planning QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    const p = D.starterProgram("balanced"),
      w = p.workouts[0];
    w.name = "Planning QA";
    w.exercises = ["bench", "row", "squat", "curl"].map((id) => ({
      ...D.target(id),
      sets: 4,
      rest: 180,
      startingLoad: 40,
    }));
    p.workouts = [w];
    state.programs = [p];
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Plan workouts", exact: true })
      .click();
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const planned = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    await page.getByLabel("Planned date", { exact: true }).fill(planned);
    await page
      .getByRole("button", { name: "Add planned workout", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".calendar-occurrence")).toHaveCount(1);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const initial = (await (await readData(page)).json()).data as D.State;
    await page
      .getByRole("button", { name: "Preview planned workout", exact: true })
      .click();
    await expect(page.locator(".workout-preview")).toContainText(
      `Planned for ${planned}`,
    );
    await page
      .getByRole("button", { name: "Review shorter workout", exact: true })
      .click();
    await page.getByRole("button", { name: "30 min", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Shorter workout review" }),
    ).toContainText("Omit today");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/planning-short-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Use reviewed plan", exact: true })
      .click();
    await expect(page.locator(".queue-row")).toHaveCount(1);
    if (width === 390) {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
    }
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Barbell bench press", exact: true }),
    ).toBeVisible();
    if (width === 390) {
      await page.reload();
      await expect(
        page.getByRole("tab", { name: "Barbell bench press", exact: true }),
      ).toBeVisible();
      await context.setOffline(false);
    }
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const active = (await (await readData(page)).json()).data as D.State;
    expect(active.draft!.exercises[0].sets.map((t) => t.prescription)).toEqual(
      active.draft!.shortPlan!.originalEntries[0].sets.map(
        (t) => t.prescription,
      ),
    );
    await page
      .getByLabel("Barbell bench press set 1 RIR", { exact: true })
      .fill("2");
    await page
      .getByRole("button", {
        name: "Complete Barbell bench press set 1",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Plan workouts", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data as D.State,
      logged = saved.sessions[0];
    expect(saved.programs).toEqual(state.programs);
    expect(saved.schedule).toEqual(initial.schedule);
    expect(logged.scheduleOccurrenceId).toBe(initial.schedule![0].id);
    expect(logged.scheduledDate).toBe(planned);
    expect(logged.date).toBe(D.today());
    expect(logged.shortPlan?.originalEntries).toHaveLength(4);
    expect(logged.exercises).toHaveLength(1);
    expect(logged.exercises[0].sets.map((t) => t.prescription)).toEqual(
      logged
        .shortPlan!.originalEntries[0].sets.filter((t) =>
          logged.exercises[0].sets.some((actual) => actual.id === t.id),
        )
        .map((t) => t.prescription),
    );
    expect(await importHistoryBackup(await exportHistoryBackup(saved))).toEqual(
      saved,
    );
    await page
      .getByRole("button", { name: "Plan workouts", exact: true })
      .click();
    await expect(page.locator(".calendar-occurrence")).toContainText("Logged");
    await page
      .getByRole("button", { name: `Plan options for ${planned}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Move to selected date", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Skip occurrence", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/planning-calendar-${width}.png`,
      animations: "disabled",
    });
  });

test("moving, skipping, repeating and queue changes stay deliberate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
  else await fixture(page);
  const remote = await (await readData(page)).json(),
    s = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  s.minimumClientVersion = 2;
  s.settings.theme = "dark";
  s.schedule = [];
  s.profile = {
    name: "Calendar actions QA",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 4,
  };
  w.name = "Calendar actions QA";
  w.exercises = ["bench", "row", "squat", "curl"].map((id) => ({
    ...D.target(id),
    sets: 4,
    rest: 180,
    startingLoad: 40,
  }));
  p.workouts = [w];
  s.programs = [p];
  expect(
    (await writeData(page, { data: { ...remote, data: s } })).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page
    .getByRole("button", { name: "Plan workouts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add planned workout", exact: true })
    .click();
  await expect(page.locator(".calendar-occurrence")).toHaveCount(1);
  const future = new Date();
  future.setDate(future.getDate() + 2);
  const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  await page
    .getByRole("button", { name: `Plan options for ${D.today()}`, exact: true })
    .click();
  await page.getByLabel("Planned date", { exact: true }).fill(date);
  await page
    .getByRole("button", { name: "Move to selected date", exact: true })
    .click();
  await expect(page.locator(".calendar-occurrence")).toContainText(
    `Originally ${D.today()}`,
  );
  await page
    .getByRole("button", { name: `Plan options for ${date}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip occurrence", exact: true })
    .click();
  await expect(page.locator(".calendar-occurrence")).toContainText("skipped");
  await page
    .getByRole("button", { name: `Plan options for ${date}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Repeat on selected date", exact: true })
    .click();
  await expect(page.locator(".calendar-occurrence")).toHaveCount(2);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const planned = (await (await readData(page)).json()).data as D.State;
  expect(planned.schedule![1].repeatOf).toBe(planned.schedule![0].id);
  expect(planned.sessions).toEqual([]);
  expect(planned.programs).toEqual(s.programs);
  await page
    .getByRole("button", { name: "Preview planned workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review shorter workout", exact: true })
    .click();
  await page.getByRole("button", { name: "30 min", exact: true }).click();
  await page
    .getByRole("button", { name: "Use reviewed plan", exact: true })
    .click();
  await expect(page.locator(".queue-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Review shorter workout", exact: true })
    .click();
  await page.getByRole("button", { name: "60 min", exact: true }).click();
  await page
    .getByRole("button", { name: "Use reviewed plan", exact: true })
    .click();
  expect(await page.locator(".queue-row").count()).toBeGreaterThan(1);
  await page
    .getByRole("button", { name: "Restore full workout", exact: true })
    .click();
  await expect(page.locator(".queue-row")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Review shorter workout", exact: true })
    .click();
  await page.getByRole("button", { name: "45 min", exact: true }).click();
  await page
    .getByRole("button", { name: "Use reviewed plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Barbell row up", exact: true })
    .click();
  await expect(page.locator(".workout-preview")).toContainText(
    "reviewed time budget was cleared",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.NEOFORM_QA_OUTPUT}/planning-actions-dark-390.png`,
    animations: "disabled",
  });
  await expect(
    page.getByRole("button", { name: "Restore full workout", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Barbell row", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const active = (await (await readData(page)).json()).data as D.State;
  expect(active.draft!.shortPlan).toBeUndefined();
  expect(active.draft!.scheduleOccurrenceId).toBe(planned.schedule![1].id);
  expect(active.programs).toEqual(s.programs);
});
