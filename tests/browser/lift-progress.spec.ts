import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { liftProgressFixture } from "../lift-progress-fixture";

for (const width of [360, 390, 1440])
  test(`matched lift progress keeps context boundaries and unknown effort at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const state = liftProgressFixture(Date.now(), true);
    state.profile = {
      name: "Progress QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    state.sessions[1].exercises[0].sets[1].effortReported = false;
    const remote = await (await readData(page)).json();
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const open = async () => {
      await page.getByRole("button", { name: "Levels", exact: true }).click();
      await page
        .getByText("Detailed training insights", { exact: true })
        .click();
      await page
        .getByRole("button", { name: "Compare this lift", exact: true })
        .click();
    };
    await open();
    await expect(page.getByRole("dialog")).toContainText(
      "One matching observation",
    );
    const contexts = page.getByLabel("Lift comparison context", {
      exact: true,
    });
    await expect(contexts.locator("option")).toHaveCount(3);
    await contexts.selectOption({ index: 2 });
    await expect(
      page.getByRole("region", { name: "Matching lift observations" }),
    ).toContainText("8 → 10 reps across 3 matching observations");
    await page.getByRole("button", { name: /· 8 reps$/, exact: false }).click();
    await expect(page.getByRole("status")).toContainText(
      "50 kg × 8 · Reported 2 RIR",
    );
    await page
      .getByText("Compare set, load and effort", { exact: true })
      .click();
    await page.getByLabel("Compared set", { exact: true }).selectOption("1");
    await expect(
      page.getByRole("region", { name: "Matching lift observations" }),
    ).toContainText("2 matching observations");
    await page
      .getByLabel("Reported RIR", { exact: true })
      .selectOption("unknown");
    await expect(page.getByRole("dialog")).toContainText(
      "Effort is unreported. It stays —",
    );
    await page
      .getByText("All saved observations · 3 workouts", { exact: true })
      .click();
    await expect(page.locator(".lift-raw")).toContainText("—");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/lift-progress-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Compare this lift", exact: true }),
    ).toBeFocused();
    if (width === 390) {
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Compare this lift", exact: true })
        .click();
      await page.screenshot({
        path: `${process.env.NEOFORM_QA_OUTPUT}/lift-progress-dark.png`,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      await page.reload();
      await open();
      await expect(
        page
          .getByLabel("Lift comparison context", { exact: true })
          .locator("option"),
      ).toHaveCount(3);
      await context.setOffline(false);
    }
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.programs).toEqual(state.programs);
  });
