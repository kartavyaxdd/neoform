import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";

for (const width of [360, 390, 1440])
  test(`premium preview, single overlay, logger and resume at ${width}px`, async ({
    browser,
    baseURL,
  }) => {
    // Keep the CPU benchmark free of Playwright DOM-trace instrumentation.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
      else await fixture(page);
      const remote = await (await readData(page)).json();
      const state = D.emptyState();
      state.profile = {
        name: "Synthetic premium",
        experience: "Intermediate",
        goal: "Build muscle",
        equipment: ["Barbell", "Dumbbell"],
        days: 4,
      };
      state.settings.celebrations = false;
      const program = D.starterProgram("balanced");
      program.workouts = [program.workouts[0]];
      program.workouts[0].name = "Premium QA";
      program.workouts[0].exercises = [D.target("bench"), D.target("db-row")];
      state.programs = [program];
      await writeData(page, { data: { ...remote, data: state } });
      await page.reload();
      await expect(page.locator(".sync-status")).toHaveText("Synced");
      await expect(page.locator(".topbar")).not.toContainText("Workspace");
      await expect(page.locator(".topbar .icon-button")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Start Premium QA", exact: true }),
      ).toHaveCount(1);
      await expect(page.locator(".featured-workout")).toContainText(
        "Preview workout",
      );
      await page
        .getByRole("button", { name: "Start Premium QA", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      const queue = page.locator(".queue-name").first();
      const firstName = await queue.textContent();
      await page
        .getByRole("button", { name: "Review shorter workout", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveAccessibleName(
        "Shorter workout",
      );
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await expect(page.locator(".modal-view:not([hidden])")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", {
          name: "Review shorter workout",
          exact: true,
        }),
      ).toBeFocused();
      await expect(queue).toHaveText(firstName!);
      expect((await (await readData(page)).json()).data.draft).toBeNull();
      await page
        .getByRole("button", { name: "Start workout", exact: true })
        .click();
      await expect(page.locator(".compact-logger")).toBeVisible();
      await expect(page.locator(".logger-actions > button")).toHaveCount(3);
      await expect(
        page.getByLabel("Barbell bench press set 1 RIR", { exact: true }),
      ).toHaveValue("");
      const reps = page.getByLabel("Barbell bench press set 1 reps", {
        exact: true,
      });
      await reps.fill("9");
      await page
        .getByRole("button", {
          name: "Watch tutorial for Barbell bench press",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Renaissance Periodization",
      );
      await page.getByText("Add a personal video", { exact: true }).click();
      await page
        .getByLabel("YouTube video URL", { exact: true })
        .fill("https://example.test/unsaved");
      await page
        .getByRole("button", { name: "Lift progress", exact: true })
        .click();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await expect(page.locator(".modal-view:not([hidden])")).toHaveCount(1);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByLabel("YouTube video URL", { exact: true }),
      ).toHaveValue("https://example.test/unsaved");
      await expect(
        page.getByRole("button", { name: "Lift progress", exact: true }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Watch tutorial for Barbell bench press",
          exact: true,
        }),
      ).toBeFocused();
      await expect(reps).toHaveValue("9");
      await page.getByRole("button", { name: "Targets", exact: true }).click();
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Targets", exact: true }),
      ).toBeFocused();
      // Measure click -> next painted state, with a real Chromium 4x CPU throttle.
      const cdp = await context.newCDPSession(page);
      // The 390px phone is the representative 4x CPU benchmark; every size
      // independently checks real-time acknowledgement and stable geometry.
      const cpuRate = width === 390 ? 4 : 1;
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
      const completion = page.getByRole("button", {
        name: "Complete Barbell bench press set 1",
        exact: true,
      });
      const before = await reps.boundingBox();
      const samples: { ms: number; label: string }[] = [];
      await page.bringToFront();
      for (let sample = 0; sample < 3; sample++) {
        await completion.evaluate((el) => {
          delete (window as unknown as { premiumAck?: unknown }).premiumAck;
          el.addEventListener(
            "click",
            () => {
              const at = performance.now();
              requestAnimationFrame(() => {
                (window as unknown as { premiumAck: unknown }).premiumAck = {
                  ms: performance.now() - at,
                  label: el.getAttribute("aria-label"),
                };
              });
            },
            { once: true },
          );
        });
        await completion.click();
        await expect(
          page.getByRole("button", {
            name: "Undo Barbell bench press set 1",
            exact: true,
          }),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as { premiumAck?: unknown }).premiumAck,
            ),
          )
          .toBeDefined();
        const ack = await page.evaluate(
          () =>
            (window as unknown as { premiumAck: { ms: number; label: string } })
              .premiumAck,
        );
        expect(ack.label).toContain("Undo");
        samples.push(ack);
        expect((await reps.boundingBox())?.y).toBe(before?.y);
        if (sample < 2)
          await page
            .getByRole("button", {
              name: "Undo Barbell bench press set 1",
              exact: true,
            })
            .click();
      }
      const medianMs = samples.map((s) => s.ms).sort((a, b) => a - b)[1];
      await test.info().attach("set-completion-ack", {
        body: JSON.stringify({ width, cpuRate, medianMs, samples }),
        contentType: "application/json",
      });
      expect(medianMs).toBeLessThanOrEqual(100);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      expect((await reps.boundingBox())?.y).toBe(before?.y);
      await page
        .getByRole("button", {
          name: "Undo Barbell bench press set 1",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: "Complete Barbell bench press set 1",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Session options", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Minimize workout", exact: true })
        .click();
      await expect(page.locator(".featured-workout")).toContainText(
        "Resume workout",
      );
      await expect(page.locator(".sync-status")).toHaveText("Synced");
      await page.evaluate(() =>
        navigator.serviceWorker.ready.then(() => undefined),
      );
      await context.setOffline(true);
      await page.reload();
      await page
        .getByRole("button", {
          name: `View program ${program.name}`,
          exact: true,
        })
        .click();
      await expect(page.locator(".program-editor")).toBeVisible();
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Resume session", exact: true })
        .click();
      await expect(reps).toHaveValue("9");
      await page
        .getByRole("button", { name: "Finish session", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveAccessibleName(
        "Review workout",
      );
      await expect(page.locator(".finish-feedback details[open]")).toHaveCount(
        0,
      );
      await page
        .getByRole("button", { name: "Save workout", exact: true })
        .click();
      await expect(page.locator(".workout-home")).toBeVisible();
      await expect(page.locator(".sync-status")).toHaveText("Saved on device");
      await context.setOffline(false);
      await page.locator(".sync-status").click();
      await expect(page.locator(".sync-status")).toHaveText("Synced");
      const saved = (await (await readData(page)).json()).data;
      expect(saved.programs).toEqual(state.programs);
      expect(saved.sessions).toHaveLength(1);
      expect(saved.sessions[0].exercises[0].sets[0].effortReported).toBe(false);
      for (const destination of ["Dashboard", "Levels", "More", "Workout"]) {
        await page
          .getByRole("button", { name: destination, exact: true })
          .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${process.env.NEOFORM_QA_OUTPUT}/premium-${destination}-${width}.png`,
          animations: "disabled",
        });
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

test("a deferred view failure keeps the workout available and can retry", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    baseURL,
  });
  const page = await context.newPage();
  try {
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json();
    const state = D.emptyState();
    state.profile = {
      name: "Synthetic deferred QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    state.programs = [D.starterProgram("balanced")];
    await writeData(page, { data: { ...remote, data: state } });
    await page.reload();
    await page.route("**/assets/ProgramEditor-*.js", (route) => route.abort());
    await page
      .getByRole("button", {
        name: `View program ${state.programs[0].name}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "This view couldn’t load",
    );
    await expect(page.locator(".app-shell")).toBeVisible();
    await page.unroute("**/assets/ProgramEditor-*.js");
    await page
      .getByRole("button", { name: "Retry opening view", exact: true })
      .click();
    await expect(page.locator(".program-editor")).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(page.locator(".featured-workout")).toContainText(
      "Preview workout",
    );
    expect((await (await readData(page)).json()).data.programs).toEqual(
      state.programs,
    );
  } finally {
    await context.close();
  }
});
