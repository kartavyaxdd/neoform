import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { weeklyBrowserFixture } from "../weekly-muscle-fixture";
import {
  importHistoryBackup,
  exportHistoryBackup,
} from "../../src/historyBackup";
for (const width of [360, 390, 1440])
  test(`muscle weekly review is honest, offline and explicitly scoped at ${width}px`, async ({
    page,
    context,
  }) => {
    const now = Date.parse("2026-10-26T12:00:00+05:30");
    await page.clock.install({ time: now });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = weeklyBrowserFixture(now);
    if (width === 390) state.settings.theme = "dark";
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: /Weekly review/ }).click();
    const chest = page.getByRole("article", {
        name: "Chest weekly review",
        exact: true,
      }),
      back = page.getByRole("article", {
        name: "Back weekly review",
        exact: true,
      });
    await expect(chest.locator(".muscle-week-totals")).toContainText(
      "Assigned3",
    );
    await expect(chest.locator(".muscle-week-totals")).toContainText(
      "Completed2",
    );
    await expect(chest).toContainText("Record missing context");
    await chest
      .getByText("Performance, recovery and evidence", { exact: true })
      .click();
    await expect(chest).toContainText(/Unreported primary effort\s*1/);
    await expect(chest).toContainText(
      "A past report does not confirm readiness now",
    );
    await back
      .getByText("Performance, recovery and evidence", { exact: true })
      .click();
    await expect(back).toContainText("+3 reps");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/weekly-muscles-${width}.png`,
      animations: "disabled",
    });
    const before = (await (await readData(page)).json()).data;
    expect(before.programs).toEqual(state.programs);
    expect(before.sessions).toEqual(state.sessions);
    await page
      .getByRole("button", { name: "Review previous week", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Weekly muscle coaching", exact: true }),
    ).toContainText("Historical summary");
    await expect(
      page.getByRole("button", { name: "Review Back targets", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Review next week", exact: true })
      .click();
    if (width === 390) {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      await page.reload();
      await page
        .getByRole("button", { name: "Dashboard", exact: true })
        .click();
      await page.getByRole("button", { name: /Weekly review/ }).click();
      await expect(chest).toContainText(/Completed\s*2/);
      await context.setOffline(false);
      await expect(page.locator(".sync-status")).toHaveText("Synced");
    }
    await page
      .getByRole("button", { name: "Review Back targets", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Program targets");
    expect((await (await readData(page)).json()).data).toEqual(before);
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
      .getByLabel("Back readiness", { exact: true })
      .selectOption("yes");
    await page.getByLabel("Back pain now", { exact: true }).selectOption("no");
    await page
      .getByLabel("Back soreness now", { exact: true })
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
    await expect(
      page
        .getByRole("button", { name: "Apply to program", exact: true })
        .first(),
    ).toBeEnabled();
    expect((await (await readData(page)).json()).data).toEqual(before);
    await page
      .getByRole("button", { name: "Apply to program", exact: true })
      .first()
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.sessions).toEqual(before.sessions);
    expect(saved.draft).toBeNull();
    expect(saved.programs[0].workouts[0].exercises[0].nextRows).toBeTruthy();
    expect(await importHistoryBackup(await exportHistoryBackup(saved))).toEqual(
      saved,
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: /Weekly review/ }).click();
    const after = page.getByRole("article", {
      name: "Back weekly review",
      exact: true,
    });
    await expect(after).toContainText("Observe accepted targets");
    await after
      .getByText("Performance, recovery and evidence", { exact: true })
      .click();
    await expect(after).toContainText("0 eligible follow-ups");
  });
