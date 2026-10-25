import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { liftProgressFixture } from "../lift-progress-fixture";

for (const width of [360, 390, 1440])
  test(`next-set review stays optional and never changes prescriptions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const state = liftProgressFixture();
    state.profile = {
      name: "Next set QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    const program = state.programs[0],
      workout = program.workouts[0];
    workout.exercises[0].setup = {
      label: "QA rack",
      execution: "Same ROM",
      availableLoads: [45, 50, 55],
    };
    const session = D.startSession(
      workout.name,
      D.prepareWorkout(workout, program, D.catalog, state.sessions),
      program,
      workout,
    );
    const entry = session.exercises[0];
    entry.sets.forEach((t) => {
      t.weight = 50;
      t.prescription!.weight = 50;
    });
    Object.assign(entry.sets[0], {
      done: true,
      reps: 6,
      rir: 0,
      effortReported: false,
    });
    state.draft = session;
    const remote = await (await readData(page)).json();
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await page
      .getByRole("button", { name: "Resume session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Progression", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Next-set advice", exact: true }),
    ).toContainText("Effort is unknown");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByLabel("Barbell bench press set 1 RIR", { exact: true })
      .fill("0");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Progression", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Next-set advice", exact: true }),
    ).toContainText("Check rest and execution first");
    await page
      .getByRole("checkbox", {
        name: "The last completed set used usual rest and the same execution.",
        exact: true,
      })
      .check();
    await expect(
      page.getByRole("region", { name: "Next-set advice", exact: true }),
    ).toContainText("Review 45 kg for the next set");
    await page
      .getByRole("checkbox", {
        name: "The last completed set used usual rest and the same execution.",
        exact: true,
      })
      .uncheck();
    await expect(
      page.getByRole("region", { name: "Next-set advice", exact: true }),
    ).toContainText("Check rest and execution first");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/next-set-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Review Targets", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Targets");
    const saved = (await (await readData(page)).json()).data as D.State;
    expect(saved.programs).toEqual(state.programs);
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.draft!.exercises[0].sets.map((t) => t.prescription)).toEqual(
      entry.sets.map((t) => t.prescription),
    );
    expect(saved.draft!.exercises[0].coachingContext).toBeUndefined();
    expect(saved.coachingEvents ?? []).toEqual([]);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await page
      .getByRole("button", { name: "Lift progress", exact: true })
      .click();
    await expect(page.locator(".lift-progress")).toBeVisible();
  });
