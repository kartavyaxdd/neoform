import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
for (const width of [360, 390, 1440])
  test(`preview and partial same-equipment swap with RP tutorials at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const before = await (await readData(page)).json(),
      state = D.emptyState();
    state.profile = {
      name: "Synthetic swaps",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Dumbbell"],
      days: 4,
    };
    const flat = {
      ...D.catalog.find((e) => e.id === "incline-db")!,
      id: "qa-flat-db",
      name: "Bench Press (Dumbbell)",
    };
    state.customExercises = [flat];
    const p = D.starterProgram("balanced"),
      w = p.workouts[0];
    w.name = "Swap QA";
    w.exercises = [D.target("incline-db"), D.target("curl")];
    p.workouts = [w];
    state.programs = [p];
    expect(
      (await writeData(page, { data: { ...before, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Start Swap QA", exact: true })
      .click();
    await expect(page.locator('img[src*="5CECBjd7HLQ"]').first()).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Swap Incline dumbbell press", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Substitute exercise", exact: true })
      .selectOption(flat.id);
    await expect(page.getByRole("dialog").last()).toContainText(
      "Load starts unset",
    );
    await page
      .getByRole("button", {
        name: "Use substitute for this workout",
        exact: true,
      })
      .click();
    let remote = (await (await readData(page)).json()).data;
    expect(remote.draft).toBeNull();
    expect(remote.programs).toEqual(state.programs);
    await expect(page.locator('img[src*="YQ2s_Y7g5Qk"]').first()).toBeVisible();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByLabel(`${flat.name} set 1 weight`, { exact: true })
      .fill("30");
    await page.getByLabel(`${flat.name} set 1 reps`, { exact: true }).fill("9");
    await page.getByLabel(`${flat.name} set 1 RIR`, { exact: true }).fill("2");
    await page
      .getByRole("button", { name: `Complete ${flat.name} set 1`, exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const logged = (await (await readData(page)).json()).data.draft.exercises[0]
      .sets[0];
    await page
      .getByRole("button", { name: "Swap exercise", exact: true })
      .click();
    await page.getByLabel("Reason", { exact: true }).selectOption("preference");
    await page
      .getByRole("combobox", { name: "Substitute exercise", exact: true })
      .selectOption("incline-db");
    await expect(page.getByRole("dialog")).toContainText("2 remaining sets");
    await page
      .getByRole("button", {
        name: "Use substitute for this workout",
        exact: true,
      })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    remote = (await (await readData(page)).json()).data;
    expect(remote.programs).toEqual(state.programs);
    expect(remote.sessions).toEqual([]);
    expect(remote.draft.exercises[0].sets).toEqual([logged]);
    const next = remote.draft.exercises[1];
    expect(next.exerciseId).toBe("incline-db");
    expect(next.sets).toHaveLength(2);
    expect(
      next.sets.every(
        (s: D.SetLog) => s.weight === 0 && !s.done && !s.effortReported,
      ),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "Watch tutorial for Incline dumbbell press",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Renaissance Periodization",
    );
    await expect(page.getByRole("dialog").locator("iframe")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Play demonstration", exact: true })
      .click();
    await expect(page.getByRole("dialog").locator("iframe")).toHaveAttribute(
      "src",
      /youtube-nocookie.com\/embed\/5CECBjd7HLQ/,
    );
    await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const selectedTab = page.getByRole("tab", {
      name: "Incline dumbbell press",
      exact: true,
    });
    const nameBox = await selectedTab
        .locator(":scope > span:not(.tutorial-thumbnail)")
        .boundingBox(),
      tabBox = await selectedTab.boundingBox();
    expect(nameBox!.height).toBeGreaterThanOrEqual(20);
    expect(nameBox!.y + nameBox!.height).toBeLessThanOrEqual(
      tabBox!.y + tabBox!.height,
    );
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/rp-swap-${width}.png`,
      animations: "disabled",
    });
    await page.route("https://i.ytimg.com/**", (r) => r.abort());
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Incline dumbbell press", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".tutorial-open img")).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.setOffline(false);
  });
