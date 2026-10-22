import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
for (const width of [360, 390, 1440])
  test(`program schedule and prescribed preview preserve data at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState(),
      p = D.starterProgram("balanced");
    state.profile = {
      name: "Synthetic program",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell", "Dumbbell"],
      days: 3,
    };
    p.workouts[0].exercises[0].id = "settings";
    p.weeks = 3;
    p.deloadWeek = 3;
    p.workouts = p.workouts.slice(0, 2);
    p.workouts[0].exercises = p.workouts[0].exercises.slice(0, 2);
    p.workouts[0].exercises[0].nextRows = [10, 11, 12].map((reps, ordinal) => ({
      ordinal,
      weight: 50,
      reps,
      rir: 2,
    }));
    p.workouts[0].exercises[1].setup = {
      label: "QA rack",
      execution: "Usual setup",
      availableLoads: [50, 51.25],
    };
    state.programs = [p];
    const prior = D.startSession("Preserved reference", [
      D.createEntry(D.catalog[0]),
    ]);
    prior.exercises[0].sets[0].done = true;
    state.sessions = [prior];
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await page
      .getByRole("button", { name: `View program ${p.name}`, exact: true })
      .click();
    await expect(page.locator(".program-editor")).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Full body A", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    const firstCard = page.locator(".program-exercise").first();
    await expect(firstCard.locator(".program-week-card")).toHaveCount(3);
    await expect(firstCard.locator(".program-week-card").first()).toContainText(
      "10 reps",
    );
    await expect(
      firstCard.locator(".program-week-card").last().locator(".planned-row"),
    ).toHaveCount(2);
    await expect(firstCard.locator(".program-week-card").last()).toContainText(
      "4–6 reps",
    );
    await expect(page.locator(".target-muscle-card")).toHaveCount(2);
    await page.getByRole("tab", { name: "Full body A", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Tuesday — Rest", exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText(
      "No workout is assigned",
    );
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Full body B", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect((await (await readData(page)).json()).data.programs).toEqual(
      state.programs,
    );
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/program-schedule-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Edit Barbell back squat targets",
        exact: true,
      })
      .click();
    const edit = page.getByRole("dialog", {
      name: "Edit base targets",
      exact: true,
    });
    await edit.getByLabel("Full body A 1 max", { exact: true }).fill("15");
    await edit.getByRole("button", { name: "Done", exact: true }).click();
    expect((await (await readData(page)).json()).data.programs).toEqual(
      state.programs,
    );
    await page
      .getByRole("button", { name: "Save program", exact: true })
      .click();
    await expect(page.locator(".program-editor")).toHaveCount(0);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.programs[0].workouts[0].exercises[0].id).toBe(
      p.workouts[0].exercises[0].id,
    );
    expect(saved.programs[0].workouts[0].exercises[0].max).toBe(15);
    expect(saved.programs[0].workouts[0].exercises[0].nextRows).toBeUndefined();
    expect(saved.programs[0].workouts[0].exercises[1]).toEqual(
      p.workouts[0].exercises[1],
    );
    expect(saved.sessions).toEqual(state.sessions);
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await expect(page.locator(".workout-preview .planned-row")).toHaveCount(6);
    await expect(page.locator(".workout-preview")).toContainText("8–15 reps");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/prescribed-preview-${width}.png`,
      animations: "disabled",
    });
    const chipRail = await page
      .locator(".workout-preview .program-muscle-chips")
      .first()
      .boundingBox();
    await page.mouse.move(
      chipRail!.x + chipRail!.width - 5,
      chipRail!.y + chipRail!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(chipRail!.x + 5, chipRail!.y + chipRail!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.locator(".workout-preview .queue-row")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Add Exercises", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Add Exercises",
      exact: true,
    });
    await picker
      .getByLabel("Search exercises", { exact: true })
      .fill("Dumbbell curl");
    await picker.getByRole("button", { name: /Dumbbell curl/ }).click();
    await picker.getByRole("button", { name: "Done", exact: true }).click();
    const remove = page.getByRole("button", {
      name: "Remove Dumbbell curl",
      exact: true,
    });
    await remove.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".workout-preview .queue-row")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const logged = (await (await readData(page)).json()).data;
    expect(logged.draft.exercises).toHaveLength(3);
    expect(logged.draft.exercises[0].sets[0].prescription.max).toBe(15);
    expect(logged.draft.exercises[0].sets[0].effortReported).toBe(false);
    expect(logged.programs).toEqual(saved.programs);
    expect(logged.sessions).toEqual(saved.sessions);
    await page
      .getByRole("button", { name: "Session options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Minimize workout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await page
      .getByRole("button", { name: `View program ${p.name}`, exact: true })
      .click();
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/program-schedule-dark-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
