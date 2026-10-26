import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
import { weeklyBrowserFixture } from "../weekly-muscle-fixture";
for (const width of [360, 390, 1440])
  test(`glass screens and visible charts stay readable and durable at ${width}px`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = weeklyBrowserFixture(Date.now());
    state.coaching = {
      enabled: true,
      minutes: 60,
      diet: "unknown",
      earlyTrials: false,
      priorities: [],
      bodyweight: { kg: 60, at: Date.now() },
    };
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const shot = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${process.env.NEOFORM_QA_OUTPUT}/glass-${name}-${width}.png`,
        animations: "disabled",
      });
    };
    await shot("workout");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Training consistency", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Bodyweight", exact: true }),
    ).toContainText("60 kg");
    await expect(page.locator(".dashboard-pages")).toHaveCount(0);
    for (const button of await page
      .getByRole("group", { name: "Chart time range", exact: true })
      .getByRole("button")
      .all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "4W", exact: true }).click();
    await page.getByText("Training consistency data", { exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Training consistency", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(4);
    const graph = page.getByRole("group", {
      name: /Training consistency graph/,
    });
    await graph.focus();
    await page.keyboard.press("Home");
    await expect(
      page
        .getByRole("region", { name: "Training consistency", exact: true })
        .locator(".chart-inspect")
        .locator("[aria-live], output"),
    ).toContainText("0 days / week");
    await shot("dashboard");
    await page
      .getByRole("button", { name: "Weekly review", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Chest work", exact: true }),
    ).toContainText("3 sets");
    await shot("weekly");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Chest weekly work", exact: true }),
    ).toBeVisible();
    await shot("levels");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "App & data", exact: true }),
    ).toBeVisible();
    await shot("more");
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await shot("dark");
    await page.emulateMedia({ contrast: "more" });
    expect(
      await page
        .locator(".activity-card")
        .evaluate((e) => getComputedStyle(e).backdropFilter),
    ).toBe("none");
    await shot("opaque");
    await page.emulateMedia({ contrast: "no-preference" });
    if (width === 390) {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Training consistency", exact: true }),
      ).toBeVisible();
      await context.setOffline(false);
      await expect(page.locator(".sync-status")).toHaveText("Synced");
    }
    const after = (await (await readData(page)).json()).data;
    expect(after.sessions).toEqual(state.sessions);
    expect(after.programs).toEqual(state.programs);
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Weekly QA", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Assigned primary work", exact: true }),
    ).toBeVisible();
    await shot("preview");
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const load = page.getByLabel("Barbell row set 1 weight", { exact: true });
    await load.fill("50");
    await page.getByLabel("Barbell row set 1 reps", { exact: true }).fill("8");
    await expect(
      page.getByLabel("Barbell row set 1 RIR", { exact: true }),
    ).toHaveValue("");
    await page.getByLabel("Barbell row set 1 RIR", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Complete Barbell row set 1", exact: true })
      .click();
    await expect(page.locator(".slim-rest .countdown-arc")).toBeVisible();
    await shot("logger");
    expect(errors).toEqual([]);
  });
