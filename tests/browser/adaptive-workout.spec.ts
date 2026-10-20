import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
for (const width of [360, 390, 1440])
  test(`equipment swap and approved program review at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState(),
      program = D.starterProgram("balanced"),
      workout = program.workouts[0];
    state.profile = {
      name: "Synthetic review",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell", "Dumbbell"],
      days: 4,
    };
    workout.name = "Substitution QA";
    workout.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
    program.workouts = [workout];
    state.programs = [program];
    const now = Date.now();
    state.sessions = [17, 10, 3].map((days) => {
      const entry = D.createEntry(D.catalog[0], workout.exercises[0]);
      entry.sets.forEach((t) =>
        Object.assign(t, {
          weight: 50,
          reps: 10,
          rir: 2,
          done: true,
          effortReported: true,
          prescription: { ...t.prescription!, weight: 50 },
        }),
      );
      const s = D.startSession(
        "Confirmed synthetic",
        [entry],
        program,
        workout,
      );
      s.startedAt = now - days * 86400000;
      s.date = new Date(s.startedAt).toISOString().slice(0, 10);
      s.duration = 3600;
      entry.coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt + 3600000,
      };
      return s;
    });
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await page
      .getByRole("button", { name: "Review program", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("flat");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/program-review-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Review next targets", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("readiness");
    await page
      .getByText("Readiness and coaching settings", { exact: true })
      .click();
    await page
      .getByText("Current readiness and recovery", { exact: true })
      .click();
    await page
      .getByLabel("Systemic fatigue now", { exact: true })
      .selectOption("1");
    await page
      .getByLabel("Unscoped pain now", { exact: true })
      .selectOption("no");
    await page
      .getByLabel("Broader context today", { exact: true })
      .selectOption("usual");
    await page
      .getByLabel("Chest readiness", { exact: true })
      .selectOption("yes");
    await page.getByLabel("Chest pain now", { exact: true }).selectOption("no");
    await page
      .getByLabel("Chest soreness now", { exact: true })
      .selectOption("1");
    await page
      .getByRole("checkbox", {
        name: "These answers describe how I feel now.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save current readiness", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Apply to program", exact: true })
      .first()
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    let saved = (await (await readData(page)).json()).data as D.State;
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.draft).toBeNull();
    expect(saved.programs[0].workouts[0].exercises[0].nextRows).toBeTruthy();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review program", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Targets approved");
    await expect(
      page.getByRole("button", { name: "Review next targets", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const approved = structuredClone(saved.programs);
    await page
      .getByRole("button", { name: "Start Substitution QA", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
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
      .getByRole("button", { name: "Exercise options", exact: true })
      .click();
    await page.getByRole("button", { name: "Swap", exact: true }).click();
    await page.getByText("Available equipment", { exact: true }).click();
    expect(
      (await page
        .getByRole("checkbox", { name: "Dumbbell", exact: true })
        .locator("..")
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("combobox", { name: "Substitute exercise", exact: true })
      .selectOption("incline-db");
    await expect(page.getByRole("dialog")).toContainText("2 remaining sets");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/substitution-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Use substitute for this workout",
        exact: true,
      })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    saved = (await (await readData(page)).json()).data;
    expect(saved.draft!.exercises[0].sets).toHaveLength(1);
    expect(saved.draft!.exercises[0].plannedWorkingSets).toBe(3);
    expect(
      saved.draft!.exercises[1].sets.every(
        (t) => t.weight === 0 && !t.effortReported,
      ),
    ).toBe(true);
    expect(saved.programs).toEqual(approved);
    expect(saved.sessions).toEqual(state.sessions);
    const alt = D.catalog.find((x) => x.id === "incline-db")!;
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: alt.name, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    for (let i = 1; i <= 2; i++) {
      await page
        .getByLabel(`${alt.name} set ${i} weight`, { exact: true })
        .fill("20");
      await page
        .getByLabel(`${alt.name} set ${i} RIR`, { exact: true })
        .fill("2");
      await page
        .getByRole("button", {
          name: `Complete ${alt.name} set ${i}`,
          exact: true,
        })
        .click();
    }
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    saved = (await (await readData(page)).json()).data;
    expect(saved.sessions).toHaveLength(4);
    const completed = saved.sessions.find(
      (s) => !state.sessions.some((old) => old.id === s.id),
    )!;
    expect(
      completed.exercises.map((e) => [e.exerciseId, e.sets.length]),
    ).toEqual([
      ["bench", 1],
      ["incline-db", 2],
    ]);
    expect(saved.programs).toEqual(approved);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
