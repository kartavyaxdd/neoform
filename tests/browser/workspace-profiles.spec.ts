import { test, expect } from "@playwright/test";
import { readData, writeData } from "./storage-client";
import * as D from "../../src/domain";
for (const width of [360, 390, 1440])
  test(`separate profile locks and set logging at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Who’s training?" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Sharma Locked", exact: true })
      .click();
    await page.getByLabel("Profile password", { exact: true }).fill("wrong");
    await page
      .getByRole("button", { name: "Unlock profile", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Incorrect");
    await page
      .getByLabel("Profile password", { exact: true })
      .fill("QA-profile-pass");
    await page
      .getByRole("button", { name: "Unlock profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Who’s training?" }),
    ).toHaveCount(0);
    const before = await (await readData(page)).json(),
      data = D.emptyState();
    data.profile = {
      name: "Synthetic Sharma",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    data.programs = [D.starterProgram("balanced")];
    expect(
      (await writeData(page, { data: { ...before, data } })).status(),
    ).toBe(200);
    await page.reload();
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const progress = page.getByRole("progressbar", {
      name: "Workout set progress",
    });
    await expect(progress).toHaveAttribute("value", "0");
    await expect(progress).toHaveAttribute("max", "12");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const original = (await (await readData(page)).json()).data.draft;
    await page
      .getByRole("button", {
        name: "Change Barbell back squat set 1 type",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Warm-up", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const changed = (await (await readData(page)).json()).data.draft;
    expect(changed.exercises[0].sets[0]).toEqual({
      ...original.exercises[0].sets[0],
      kind: "warmup",
    });
    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      })
      .click();
    await expect(progress).toHaveAttribute("value", "1");
    await page
      .getByRole("button", {
        name: "Undo Barbell back squat set 1",
        exact: true,
      })
      .click();
    await expect(progress).toHaveAttribute("value", "0");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/quick-sets-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Session options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Minimize workout", exact: true })
      .click();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Account & access", { exact: true }).click();
    await page
      .getByRole("button", { name: "Lock & switch profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Who’s training?" }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".compact-logger")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic Sharma", { exact: true }),
    ).toHaveCount(0);
    await context.setOffline(false);
    await page.reload();
    await page
      .getByRole("button", { name: "Abhishek Open profile", exact: true })
      .click();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Abhishek",
    );
    expect((await (await readData(page)).json()).data.sessions).toEqual([]);
    await page
      .getByRole("button", { name: "Switch profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sharma Locked", exact: true })
      .click();
    await page
      .getByLabel("Profile password", { exact: true })
      .fill("QA-profile-pass");
    await page
      .getByRole("button", { name: "Unlock profile", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const restored = (await (await readData(page)).json()).data;
    expect(restored.draft.id).toBe(original.id);
    expect(restored.draft.exercises[0].sets[0].kind).toBe("warmup");
    expect(restored.programs).toEqual(data.programs);
    expect(restored.profile.name).toBe("Synthetic Sharma");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
