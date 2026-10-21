import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { syntheticReadiness } from "../readiness-fixture";
import { DEFAULT_COACH_SETTINGS } from "../../src/coachingTypes";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { importHistoryBackup } from "../../src/historyBackup";
import { readFile } from "node:fs/promises";

for (const width of [360, 390])
  test(`coaching review, immutable outcome and offline backup at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    if (process.env.NEOFORM_QA_MODE !== "public") await fixture(page);
    else await page.goto("/");
    const remote = await (await readData(page)).json();
    const state = D.emptyState();
    state.profile = {
      name: "Synthetic coach QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    state.coaching = { ...DEFAULT_COACH_SETTINGS, diet: "cut" };
    const program = D.starterProgram("balanced"),
      workout = program.workouts[0];
    workout.name = "Coaching QA";
    workout.exercises = [
      {
        ...D.target("bench"),
        startingLoad: 50,
        setup: {
          label: "QA bench",
          execution: "Usual ROM",
          availableLoads: [50, 51, 55],
        },
      },
    ];
    program.workouts = [workout];
    state.programs = [program];
    const e = D.createEntry(
      D.catalog.find((x) => x.id === "bench")!,
      workout.exercises[0],
    );
    e.sets.forEach((t, i) =>
      Object.assign(t, {
        weight: 50,
        reps: [10, 9, 8][i],
        rir: 2,
        done: true,
        effortReported: true,
        prescription: { ...t.prescription!, weight: 50 },
      }),
    );
    const previous = D.startSession(
      "Synthetic confirmed",
      [e],
      program,
      workout,
    );
    previous.startedAt = Date.now() - 3 * 86400000;
    previous.date = new Date(previous.startedAt).toISOString().slice(0, 10);
    previous.duration = 3600;
    e.coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: previous.startedAt + 3600000,
    };
    state.sessions = [previous];
    state.draft = D.startSession(
      workout.name,
      D.prepareWorkout(workout, program, D.catalog, state.sessions),
      program,
      workout,
    );
    state.draft.readiness = syntheticReadiness();
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
      page.getByRole("table", {
        name: "Barbell bench press proposed working sets",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/coaching-${width}.png`,
    });
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    let saved = (await (await readData(page)).json()).data;
    expect(saved.coachingEvents).toHaveLength(1);
    expect(saved.draft.exercises[0].sets.map((t: any) => t.reps)).toEqual([
      10, 9, 9,
    ]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (let i = 1; i <= 3; i++) {
      await page
        .getByLabel(`Barbell bench press set ${i} RIR`, { exact: true })
        .fill("2");
      await page
        .getByRole("button", {
          name: `Complete Barbell bench press set ${i}`,
          exact: true,
        })
        .click();
    }
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await page.getByText("Coaching details", { exact: true }).click();
    await page
      .getByText("Execution, rest and changed sets", { exact: true })
      .click();
    await page
      .getByLabel("Barbell bench press execution this session", { exact: true })
      .selectOption("consistent");
    await page
      .getByLabel("Barbell bench press rest this session", { exact: true })
      .selectOption("usual");
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    saved = (await (await readData(page)).json()).data;
    expect(saved.coachingEvents.map((e: any) => e.kind)).toEqual([
      "decision",
      "outcome",
    ]);
    expect(saved.coachingEvents[1].outcome).toBe("met");
    expect(saved.sessions).toHaveLength(2);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page
      .getByRole("button", { name: "Weekly review", exact: false })
      .click();
    await expect(page.locator(".weekly-review")).toContainText(/\+1 rep/);
    await expect(page.locator(".weekly-review")).toContainText("Targets met");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/weekly-coaching-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("Your data, portable.", { exact: true }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export JSON backup", exact: true })
      .click();
    const file = await download;
    const restored = await importHistoryBackup(
      new Blob([await readFile((await file.path())!)]),
    );
    expect(restored.coachingEvents).toEqual(saved.coachingEvents);
    expect(restored.sessions).toEqual(saved.sessions);
    await context.setOffline(false);
  });
