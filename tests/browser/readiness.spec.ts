import { readData, writeData } from "./storage-client";
import { test, expect } from "@playwright/test";
import { fixture, currentReadiness } from "./v2-fixture";
import * as D from "../../src/domain";
import { mkdir } from "node:fs/promises";

for (const width of [360, 390])
  test(`readiness stays separate, optional and connected to advice at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    const remote = await (await readData(page)).json();
    const squat = D.catalog.find((x) => x.id === "squat")!;
    remote.data.sessions = [3, 1].map((days) => {
      const e = D.createEntry(
        squat,
        remote.data.programs[0].workouts[0].exercises[0],
      );
      e.sets.forEach((t) =>
        Object.assign(t, {
          weight: 60,
          reps: 10,
          rir: 3,
          done: true,
          effortReported: true,
        }),
      );
      const s = D.startSession(
        "Synthetic comparable",
        [e],
        remote.data.programs[0],
        remote.data.programs[0].workouts[0],
      );
      s.startedAt -= days * 86400000;
      const date = new Date(s.startedAt);
      s.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      s.phase = "accumulation";
      s.feedback = { reported: true, pain: false, fatigue: 1, soreness: 1 };
      s.exercises[0].coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt,
      };
      s.exercises[0].sets.forEach((t) => {
        t.prescription = { ...t.prescription!, weight: t.weight };
      });
      return s;
    });
    expect(
      (
        await writeData(page, {
          headers: { Origin: new URL(page.url()).origin },
          data: remote,
        })
      ).status(),
    ).toBe(200);
    const preserved = structuredClone(remote.data.sessions);
    await page.reload();
    await page.getByText("Program options", { exact: true }).click();
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    const advice = async () => {
      await page
        .getByRole("button", { name: "Exercise options", exact: true })
        .click();
      await page.getByText("Progression note", { exact: true }).click();
    };
    await advice();
    await expect(
      page.getByRole("button", {
        name: "Accept for unlogged sets",
        exact: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await currentReadiness(page, "Quads");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    let state = (await (await readData(page)).json()).data;
    expect(state.draft.feedback.reported).not.toBe(true);
    expect(state.draft.muscleFeedback).toBeUndefined();
    expect(state.draft.readiness.muscles[0].recovered).toBe("yes");
    expect(state.sessions).toEqual(preserved);
    await advice();
    await expect(
      page.getByRole("button", {
        name: "Accept for unlogged sets",
        exact: true,
      }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Exercise options", exact: true })
      .click();
    await page.getByRole("button", { name: "Readiness", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Save current readiness", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Broader context today", { exact: true })
      .selectOption("changed");
    await page.getByText("Other workout muscles", { exact: true }).click();
    await page
      .getByLabel("Chest readiness", { exact: true })
      .selectOption("yes");
    await page.getByLabel("Chest pain now", { exact: true }).selectOption("no");
    await page
      .getByLabel("Chest soreness now", { exact: true })
      .selectOption("1");
    await page.getByText("Other workout muscles", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Travel", exact: true }).check();
    await page
      .getByRole("checkbox", {
        name: "These answers describe how I feel now.",
        exact: true,
      })
      .check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const output =
      process.env.NEOFORM_QA_OUTPUT || ".qa-state/readiness-browser";
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/readiness-${width}.png` });
    await page
      .getByRole("button", { name: "Save current readiness", exact: true })
      .click();
    await advice();
    await expect(
      page.getByRole("button", {
        name: "Accept for unlogged sets",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByText("Current context changed:", { exact: false }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await currentReadiness(page, "Quads");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    state = (await (await readData(page)).json()).data;
    const report = state.draft.readiness;
    await page.reload();
    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Exercise options", exact: true })
      .click();
    await page.getByRole("button", { name: "Readiness", exact: true }).click();
    await expect(
      page.getByText("Pre-session observations stay as recorded", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save current readiness", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save completed workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    state = (await (await readData(page)).json()).data;
    expect(state.sessions.at(-1).readiness).toEqual(report);
    expect(
      report.muscles.find(
        (r: D.Readiness["muscles"][number]) => r.muscle === "Chest",
      ).recovered,
    ).toBe("yes");
    expect(state.sessions.at(-1).feedback.reported).not.toBe(true);
    expect(state.sessions.slice(0, 2)).toEqual(preserved);
  });
test("read-only readiness labels each muscle's own age", async ({ page }) => {
  await fixture(page);
  const remote = await (await readData(page)).json();
  remote.data.draft = D.startSession("Synthetic mixed-age readiness", [
    D.createEntry(D.catalog.find((x) => x.id === "squat")!),
  ]);
  remote.data.draft.exercises[0].sets[0].done = true;
  remote.data.draft.readiness = {
    recordedAt: Date.now(),
    fatigue: 1,
    pain: false,
    context: "usual",
    factors: [],
    muscles: [
      {
        muscle: "Quads",
        recovered: "yes",
        pain: false,
        soreness: 1,
        recordedAt: Date.now() - 13 * 3600000,
      },
    ],
  };
  expect(
    (
      await writeData(page, {
        headers: { Origin: new URL(page.url()).origin },
        data: remote,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByRole("button", { name: "Resume session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page.getByRole("button", { name: "Readiness", exact: true }).click();
  await expect(
    page.getByText("General context reported", { exact: false }),
  ).toContainText("within the app's 12-hour");
  await expect(
    page.getByText("Quads: recovery", { exact: false }),
  ).toContainText("outside the app's check-in window");
});
