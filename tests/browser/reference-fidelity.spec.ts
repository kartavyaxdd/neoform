import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";

for (const width of [360, 390, 1440])
  test(`reference dashboard and exercise information remain functional at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState();
    state.profile = {
      name: "Synthetic reference",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    const p = D.starterProgram("balanced"),
      w = p.workouts[0];
    p.workouts = [w];
    w.exercises = [D.target("bench")];
    state.programs = [p];
    const make = (days: number, reps: number, program = false) => {
      const e = D.createEntry(
        D.catalog.find((x) => x.id === "bench")!,
        w.exercises[0],
      );
      e.sets.forEach((t) =>
        Object.assign(t, {
          done: true,
          weight: 50,
          reps,
          effortReported: false,
        }),
      );
      const s = D.startSession(
        "Reference " + reps,
        [e],
        program ? p : undefined,
        program ? w : undefined,
      );
      const at = new Date();
      at.setDate(at.getDate() - days);
      at.setHours(12, 0, 0, 0);
      // Today's completed observation must not be dated at a future noon.
      if (days === 0) at.setTime(Date.now() - 1000);
      s.startedAt = at.getTime();
      s.date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
      s.phase = "accumulation";
      s.bodyweight = { kg: 60 + days / 10, at: s.startedAt };
      return s;
    };
    state.sessions = [make(1, 10), make(0, 11, true)];
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(
      page.getByRole("progressbar", {
        name: "Weekly training-day goal",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".week-stat-row")).toContainText("6");
    await expect(
      page.getByRole("button", { name: "All Workouts", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Active Program", exact: true })
      .click();
    await expect(page.locator(".week-stat-row")).toContainText("3");
    await expect(
      page.getByRole("region", { name: "Bodyweight", exact: true }),
    ).toContainText("60 kg");
    await page
      .getByRole("button", { name: "Log bodyweight", exact: false })
      .click();
    await expect(
      page.getByLabel("Optional reported bodyweight (kg)", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".dashboard-record")).toHaveCount(1);
    await expect(page.locator(".dashboard-record")).toContainText("10 → 11");
    await page
      .getByRole("button", { name: "All Workouts", exact: true })
      .click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".simple-dashboard h1")).toHaveCSS(
      "font-family",
      '"DM Sans", sans-serif',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/reference-dashboard-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: `Start ${w.name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await page.getByRole("button", { name: "Info", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("tab", { name: "Instructions", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await dialog.getByRole("tab", { name: "Details", exact: true }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText("Primary muscle");
    await page.keyboard.press("ArrowRight");
    await expect(
      dialog.getByRole("tab", { name: "History", exact: true }),
    ).toBeFocused();
    await expect(dialog.getByRole("tabpanel")).toContainText("Reference 11");
    await expect(
      dialog
        .getByRole("tabpanel")
        .locator("tbody tr")
        .first()
        .locator("td")
        .last(),
    ).toHaveText("—");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/reference-exercise-history-${width}.png`,
      animations: "disabled",
    });
    const header = await dialog.locator(".modal-head").boundingBox(),
      close = await dialog
        .getByRole("button", { name: "Close dialog", exact: true })
        .boundingBox();
    expect(close!.x).toBeLessThan(header!.x + header!.width / 2);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Session options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Minimize workout", exact: true })
      .click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".week-stat-row")).toBeVisible();
    expect(
      await page.evaluate(() => document.fonts.check('16px "DM Sans"')),
    ).toBe(true);
    await context.setOffline(false);
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/reference-dashboard-dark-${width}.png`,
      animations: "disabled",
    });
  });
