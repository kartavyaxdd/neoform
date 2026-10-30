import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { closeSheets } from "./premium-controls";

for (const width of [360, 390, 1440])
  test(`reviewed Y-raise swap preserves recovery and history at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const before = await (await readData(page)).json();
    const state = D.emptyState();
    state.profile = {
      name: "Synthetic shoulders",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Cable", "Dumbbell"],
      days: 4,
    };
    const y = {
      ...D.catalog.find((e) => e.id === "lateral")!,
      id: "qa-y-raise",
      name: "Standing Y Raise (Cable)",
      equipment: "Cable" as const,
      convention: "machine-label" as const,
    };
    state.customExercises = [y];
    const p = D.starterProgram("balanced"),
      w = p.workouts[0];
    w.name = "Arms and shoulders QA";
    w.exercises = [
      { ...D.target(y.id), sets: 2, min: 10, max: 15 },
      D.target("curl"),
    ];
    p.workouts = [w];
    state.programs = [p];
    const recovery = D.startSession("Synthetic recovery report", []);
    recovery.startedAt = Date.now() - 3600000;
    recovery.muscleFeedback = [
      { muscle: "Shoulders", recovered: "no", pain: null },
    ];
    state.sessions = [recovery];
    await writeData(page, { data: { ...before, data: state } });
    await page.reload();
    await page
      .getByRole("button", { name: "Start Arms and shoulders QA", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Swap Standing Y Raise (Cable)",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "Substitute exercise", exact: true })
      .selectOption("lateral");
    const apply = page.getByRole("button", {
      name: "Use substitute for this workout",
      exact: true,
    });
    const acknowledge = page.getByRole("checkbox", {
      name: "I reviewed the warning and am choosing this exercise manually.",
      exact: true,
    });
    await expect(
      page.getByRole("region", { name: "Recovery warning", exact: true }),
    ).toBeVisible();
    await expect(apply).toBeDisabled();
    await acknowledge.check();
    await apply.click();
    await expect(
      page.getByRole("button", {
        name: "Swap Dumbbell lateral raise",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByLabel("Dumbbell lateral raise set 1 weight", { exact: true })
      .fill("8");
    await page
      .getByLabel("Dumbbell lateral raise set 1 RIR", { exact: true })
      .fill("2");
    await page
      .getByRole("button", {
        name: "Complete Dumbbell lateral raise set 1",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Live next-set guidance", exact: true }),
    ).toContainText("Pause and review recovery");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const logged = (await (await readData(page)).json()).data.draft.exercises[0]
      .sets[0];
    // Exercise another acknowledged manual swap through actual durable store saving.
    await page
      .getByRole("button", { name: "Swap exercise", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Substitute exercise", exact: true })
      .selectOption(y.id);
    await expect(apply).toBeDisabled();
    await acknowledge.check();
    await apply.click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const result = (await (await readData(page)).json()).data as D.State;
    expect(result.programs).toEqual(state.programs);
    expect(result.sessions).toEqual(state.sessions);
    expect(result.draft!.exercises[0].sets).toEqual([logged]);
    expect(
      result.draft!.exercises[1].sets.every(
        (t) => t.weight === 0 && !t.done && !t.effortReported,
      ),
    ).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: y.name, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("button", { name: "Progression", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(/Recovery|recovery/);
    await closeSheets(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/manual-recovery-swap-${width}.png`,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
    await context.setOffline(false);
  });
