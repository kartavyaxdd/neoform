import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import * as D from "../../src/domain";
for (const width of [360, 390, 1440])
  test(`workout-first UI and explicit effort survive the full flow at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    if (process.env.NEOFORM_QA_MODE === "public") {
      await page.goto("/");
      const remote = await (await readData(page)).json(),
        state = D.emptyState();
      state.profile = {
        name: "Synthetic UI",
        experience: "Intermediate",
        goal: "Build muscle",
        equipment: ["Barbell", "Dumbbell", "Machine"],
        days: 3,
      };
      state.programs = [D.starterProgram("balanced")];
      expect(
        (await writeData(page, { data: { ...remote, data: state } })).status(),
      ).toBe(200);
      await page.reload();
    } else await fixture(page);
    const before = (await (await readData(page)).json()).data;
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${process.env.NEOFORM_QA_OUTPUT}/redesign-${name}-${width}.png`,
        animations: "disabled",
      });
    };
    await capture("workout");
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Workout preview");
    await expect(page.getByRole("dialog")).toHaveCSS(
      "animation-name",
      "neo-sheet-in",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("dialog")).toHaveCSS("animation-name", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(
      page.getByRole("button", { name: "Start workout", exact: true }),
    ).toHaveCount(1);
    await capture("preview");
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(
      page.getByLabel("Barbell back squat set 1 RIR", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByText("Previous", { exact: true })).toBeVisible();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const draftSnapshot = await (await readData(page)).json();
    draftSnapshot.data.draft.exercises[0].sets[0].prescription.rest = 75;
    expect((await writeData(page, { data: draftSnapshot })).status()).toBe(200);
    await page.reload();
    const firstLoad = page.getByLabel("Barbell back squat set 1 weight", {
      exact: true,
    });
    await firstLoad.click();
    await page.keyboard.type("60");
    await expect(firstLoad).toHaveValue("60");
    await expect(firstLoad).toHaveCSS("font-size", "16px");
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Barbell back squat set 1 reps", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Barbell back squat set 1 RIR", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTitle("Assigned rest", { exact: true })).toHaveText(
      "75s rest",
    );
    for (let i = 1; i <= 3; i++) {
      await page
        .getByLabel(`Barbell back squat set ${i} weight`, { exact: true })
        .fill("60");
      await page
        .getByLabel(`Barbell back squat set ${i} reps`, { exact: true })
        .fill("10");
      await page
        .getByLabel(`Barbell back squat set ${i} RIR`, { exact: true })
        .fill("2");
      await page
        .getByRole("button", {
          name: `Complete Barbell back squat set ${i}`,
          exact: true,
        })
        .click();
      if (i === 1) {
        await expect(page.locator(".sync-status")).toHaveText("Synced");
        expect((await (await readData(page)).json()).data.timer.remaining).toBe(
          75,
        );
      }
    }
    await expect(
      page.getByRole("tab", { name: "Barbell bench press", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("tab", { name: "Barbell back squat", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Undo Barbell back squat set 3",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Barbell back squat set 1 RIR", { exact: true })
      .fill("");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    expect((await (await readData(page)).json()).data.timer).toBeNull();
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Barbell back squat", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByLabel("Barbell back squat set 1 RIR", { exact: true }),
    ).toHaveValue("");
    await capture("logger");
    await context.setOffline(false);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    // Undo cancels the alarm for that set. Re-completing another working set
    // starts a fresh rest timer without completing the unfinished third set.
    await page
      .getByRole("button", {
        name: "Undo Barbell back squat set 2",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 2",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Rest timer controls", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pause timer", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const restBefore = (await (await readData(page)).json()).data.timer
      .remaining;
    await page
      .getByRole("button", { name: "+30 seconds", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    expect((await (await readData(page)).json()).data.timer.remaining).toBe(
      restBefore + 30,
    );
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Rest timer controls", exact: true }),
    ).toHaveAttribute("data-paused", "true");
    await capture("timer-paused");
    await page
      .getByRole("button", { name: "Rest timer controls", exact: true })
      .click();
    for (let i = 0; i < Math.ceil((restBefore + 30) / 30); i++)
      await page
        .getByRole("button", { name: "−30 seconds", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Resume timer", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Rest timer controls", exact: true }),
    ).toHaveAttribute(
      "aria-description",
      "Rest timer finished. Start when ready.",
    );
    await capture("timer-finished");

    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 3",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Barbell bench press set 1 weight", { exact: true })
      .fill("50");
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
    await expect(page.getByRole("dialog")).toContainText("Review workout");
    await page.getByText("Review sets", { exact: true }).click();
    await page
      .locator(".review-exercise")
      .filter({ hasText: "Barbell bench press" })
      .locator("summary")
      .click();
    await page
      .getByLabel("Barbell bench press review set 1 reps", { exact: true })
      .fill("9");
    await capture("review");
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Workout", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.programs).toEqual(before.programs);
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].exercises[0].sets[0].effortReported).toBe(false);
    expect(saved.sessions[0].exercises[1].sets[0].reps).toBe(9);
    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Front Quads: 3 working sets",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Front Quads: 3 working sets", exact: true })
      .locator("path")
      .first()
      .click();
    await expect(page.locator(".muscle-detail")).toContainText(
      "3 working sets this week",
    );
    await capture("levels");
    await page.getByText("Detailed training insights", { exact: true }).click();
    await expect(page.locator(".chart .trendline").first()).toHaveCSS(
      "animation-name",
      "neo-chart-draw",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".chart .trendline").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(page.locator(".chart .trendline").first()).toHaveCSS(
      "stroke-dasharray",
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByText("Detailed training insights", { exact: true }).click();
    await page
      .getByRole("button", { name: "Front Chest: 1 working sets", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".muscle-detail h2")).toHaveText("Chest");
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Front Quads: 0 working sets",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Previous week", exact: true })
      .click();

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Recent workouts", exact: true }),
    ).toBeVisible();
    await capture("dashboard");
    await page
      .getByRole("button", { name: "Weekly review", exact: false })
      .click();
    await expect(page.getByRole("dialog")).toContainText(/1 completed workout/);
    await expect(page.locator(".weekly-review")).toContainText(
      "No matching confirmed exposures",
    );
    await capture("weekly-review");
    await page
      .getByRole("button", { name: "Review next week", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "0 completed workouts",
    );
    await page
      .getByRole("button", { name: "Review previous week", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(/1 completed workout/);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await capture("more");
    await page.getByText("Training preferences", { exact: true }).click();
    await page
      .getByRole("checkbox", {
        name: "Automatically move to the next exercise",
        exact: true,
      })
      .uncheck();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    expect(
      (await (await readData(page)).json()).data.settings.autoAdvance,
    ).toBe(false);
    await page.getByText("Training preferences", { exact: true }).click();
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await capture("more-dark");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await capture("dashboard-dark");
    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await capture("levels-dark");
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.locator(".previous-set").first()).toContainText("60");
    const repeatLoad = page.getByLabel("Barbell back squat set 1 weight", {
      exact: true,
    });
    await repeatLoad.click();
    await page.keyboard.type("65");
    await expect(repeatLoad).toHaveValue("65");
    await repeatLoad.fill("60");
    await capture("logger-dark");
    for (let i = 1; i <= 3; i++)
      await page
        .getByRole("button", {
          name: `Complete Barbell back squat set ${i}`,
          exact: true,
        })
        .click();
    await expect(
      page.getByRole("tab", { name: "Barbell back squat", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });
