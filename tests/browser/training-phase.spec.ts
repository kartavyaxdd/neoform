import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./v2-fixture";
import type { State } from "../../src/domain";
const output=process.env.NEOFORM_QA_OUTPUT!;
const synced = (page: Page) =>
  expect(page.locator(".sync-status")).toHaveText("Synced");
async function data(page: Page): Promise<State> {
  return page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
}
async function edit(page: Page) {
  const options = page.locator(".program-options").first();
  if ((await options.getAttribute("open")) === null)
    await options.getByText("Program options", { exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  return page.getByRole("dialog");
}
for (const width of [360, 390])
  test(`phase dose → optional muscle finish → Worker reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fixture(page);
    const before = await data(page);
    const original = before.programs[0];
    let dialog = await edit(page);
    await dialog
      .getByLabel("Training phase", { exact: true })
      .selectOption("deload");
    await expect(
      dialog.getByText("Future workouts only", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Actual next-workout targets", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Save mesocycle" }).click();
    await synced(page);
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await synced(page);
    let state = await data(page);
    expect(state.draft).not.toBeNull();
    const entry = state.draft!.exercises[0];
    expect(entry.sets).toHaveLength(
      Math.max(1, Math.ceil(original.workouts[0].exercises[0].sets / 2)),
    );
    expect(entry.target!.min).toBe(
      Math.max(1, Math.floor(original.workouts[0].exercises[0].min / 2)),
    );
    expect(entry.sets.every((s) => s.rir >= 4)).toBe(true);
    await page.screenshot({
      path: `${output}/training-engine-ui/logger-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await expect(
      dialog.getByLabel("Systemic fatigue", { exact: true }),
    ).toHaveValue("unknown");
    await dialog.getByText("Muscle-specific feedback", { exact: true }).click();
    await dialog
      .getByLabel("Feedback muscle", { exact: true })
      .selectOption("Quads");
    await dialog
      .getByRole("button", { name: "Add muscle feedback", exact: true })
      .click();
    await dialog
      .getByLabel("Quads soreness", { exact: true })
      .selectOption("4");
    await dialog.getByLabel("Quads pain", { exact: true }).selectOption("yes");
    await dialog
      .getByLabel("Quads recovery", { exact: true })
      .selectOption("no");
    await page.screenshot({
      path: `${output}/training-engine-ui/finish-sheet-${width}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Save completed workout" })
      .click();
    await synced(page);
    state = await data(page);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].feedback).toMatchObject({
      pump: null,
      soreness: null,
      fatigue: null,
      pain: null,
      reported: false,
    });
    expect(state.sessions[0].muscleFeedback).toEqual([
      expect.objectContaining({
        muscle: "Quads",
        soreness: 4,
        pain: true,
        recovered: "no",
        pump: null,
        fatigue: null,
      }),
    ]);
    const saved = state.sessions;
    await page.reload();
    await synced(page);
    expect((await data(page)).sessions).toEqual(saved);
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Progress", exact: true })
      .click();
    await page
      .getByLabel("Review muscle", { exact: true })
      .selectOption("Quads");
    await expect(
      page.getByRole("heading", { name: "Muscle review", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".muscle-review")).toContainText(/recover|pain/i);
    await page
      .locator(".muscle-review")
      .getByText("Evidence and uncertainty", { exact: true })
      .click();
    await expect(page.locator(".muscle-review")).toContainText("Policy");
    await expect(page.locator(".muscle-review")).toContainText("PDF pp.");
    await page.getByLabel("Review muscle", { exact: true }).selectOption("Chest");
    await expect(page.locator(".muscle-review").getByRole("heading", {name:"Hold and observe",exact:true})).toBeVisible();
    await page.getByLabel("Review muscle", { exact: true }).selectOption("Quads");
    await page.screenshot({
      path: `${output}/training-engine-ui/review-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Workout", exact: true })
      .click();
    dialog = await edit(page);
    await dialog
      .getByLabel("Training phase", { exact: true })
      .selectOption("active-rest");
    // Closing the sheet does not implicitly accept the edit.
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    expect((await data(page)).programs[0].phase).toBe("deload");
    dialog = await edit(page);
    await dialog
      .getByLabel("Training phase", { exact: true })
      .selectOption("active-rest");
    await dialog.getByRole("button", { name: "Save mesocycle" }).click();
    await synced(page);
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Active rest");
    expect((await data(page)).draft).toBeNull();
    expect((await data(page)).sessions).toEqual(saved);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
