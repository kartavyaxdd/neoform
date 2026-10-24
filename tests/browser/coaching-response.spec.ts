import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { acceptedChangeFixture } from "../accepted-change-fixture";
import { importHistoryBackup } from "../../src/historyBackup";
import { readFile } from "node:fs/promises";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";

for (const width of [360, 390, 1440])
  test(`accepted-change reversal review, durable scope and offline backup at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const { state, proposal } = acceptedChangeFixture(Date.now(), [
      "miss",
      "miss",
    ]);
    state.profile = {
      name: "Response QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    const remote = await (await readData(page)).json();
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Start Response QA", exact: true })
      .click();
    await page.getByText("Accepted changes · 1", { exact: true }).click();
    await expect(page.locator(".change-reviews")).toContainText(
      "Review reversal",
    );
    await expect(page.locator(".change-reviews")).toContainText(
      "2 confirmed follow-ups",
    );
    expect((await (await readData(page)).json()).data).toEqual(state);
    await page.getByRole("button", { name: "Readiness", exact: true }).click();
    for (const [label, value] of [
      ["Systemic fatigue now", "1"],
      ["Unscoped pain now", "no"],
      ["Broader context today", "usual"],
      ["Chest readiness", "yes"],
      ["Chest pain now", "no"],
      ["Chest soreness now", "1"],
    ])
      await page.getByLabel(label, { exact: true }).selectOption(value);
    await page
      .getByRole("checkbox", {
        name: "These answers describe how I feel now.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save current readiness", exact: true })
      .click();
    await expect(page.locator(".preview-guidance-row")).toContainText(
      "Review reps",
    );
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/change-review-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Review targets", exact: true })
      .click();
    await expect(
      page.getByRole("table", { name: "Current and proposed targets" }),
    ).toContainText("8");
    await page
      .getByLabel("Guidance scope", { exact: true })
      .selectOption("program");
    await page
      .getByRole("button", { name: "Queue targets", exact: true })
      .click();
    expect((await (await readData(page)).json()).data.programs).toEqual(
      state.programs,
    );
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data as D.State;
    expect(saved.programs[0].workouts[0].exercises[0].nextRows).toEqual(
      proposal.beforeRows,
    );
    expect(saved.draft!.exercises[0].sets.map((t) => t.reps)).toEqual(
      proposal.rows.map((r) => r.reps),
    );
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.coachingEvents).toHaveLength(4);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Barbell bench press", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Progression", exact: true })
      .click();
    await page.getByText("Accepted changes · 2", { exact: true }).click();
    await expect(page.locator(".change-reviews")).toContainText(
      "Reassess context",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    // Exit the logger without changing its durable draft, then rehearse old-format backup compatibility.
    await page
      .getByRole("button", { name: "Session options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Minimize workout", exact: true })
      .click();
    await page.getByRole("button", { name: "More", exact: true }).click();
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
    expect(restored.programs).toEqual(saved.programs);
    expect(restored.draft).toEqual(saved.draft);
    await context.setOffline(false);
  });
