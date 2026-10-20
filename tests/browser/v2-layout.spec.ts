import {readData} from "./storage-client";
import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { mkdir, writeFile } from "node:fs/promises";
import type { State } from "../../src/domain";

test("responsive home/logger/video/wizard/review and explicit save preserve existing data (synthetic provider fixture)", async ({
  page,
}) => {
  const output = `${process.env.NEOFORM_QA_OUTPUT || "evidence"}/v2-layout`;
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const geometry: unknown[] = [];
  async function capture(name: string, sheet = false) {
    for (const width of [360, 390, 1440]) {
      const height = width === 1440 ? 1000 : 844;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect
        .poll(async () =>
          Math.round(
            (await nav.boundingBox())!.y + (await nav.boundingBox())!.height,
          ),
        )
        .toBe(height);
      if (sheet) {
        const box = await page.getByRole("dialog").boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
        expect(
          await page
            .getByRole("dialog")
            .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
        ).toBe(true);
      }
      if (name === "logger") {
        await expect(page.locator(".log-exercise")).toHaveCount(1);
        for (let set = 1; set <= 3; set++) {
          const box = await page
            .getByLabel(`Barbell back squat set ${set} weight`, { exact: true })
            .boundingBox();
          expect(box!.y + box!.height).toBeLessThan(650);
          geometry.push({ width, set, bottom: box!.y + box!.height });
        }
      }
      await page.screenshot({ path: `${output}/${name}-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await capture("home");
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await capture("logger");
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await capture("video", true);
  await expect(page.getByRole("dialog").locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save completed workout", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Workout", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const snapshot = async () =>
    (await (await readData(page)).json()).data;
  const before = await snapshot();
  // This fixture exercises UI/schema/save behavior. It is not provider evidence.
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        program: {
          name: "Synthetic review fixture",
          description: "Deterministic browser fixture, not real model output.",
          weeks: 6,
          workouts: [1, 2].map((day) => ({
            name: `Day ${day}`,
            exercises: [
              {
                exerciseId: "goblet",
                sets: 2,
                min: 8,
                max: 12,
                rir: 3,
                rest: 90,
              },
              {
                exerciseId: "db-row",
                sets: 2,
                min: 8,
                max: 12,
                rir: 3,
                rest: 90,
              },
            ],
          })),
        },
        proof: {
          provider: "gemini",
          model: "gemini-3.5-flash-lite",
          toolsProvided: 0,
          agentLoop: false,
          inputTokens: 10,
          outputTokens: 20,
          toolCalls: 0,
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "AI program", exact: true }).click();
  await capture("wizard", true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Training days", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your program" }),
  ).toBeVisible();
  expect((await snapshot()).programs).toEqual(before.programs);
  await page
    .getByLabel("Generated program name", { exact: true })
    .fill(
      "Reviewed synthetic fixture with a deliberately long workout program name",
    );
  await page.locator(".preview-movement > summary").first().click();
  await page.getByLabel("Day 1 exercise 1 sets", { exact: true }).fill("3");
  await capture("review-synthetic", true);
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  const saved = await snapshot();
  expect(saved.programs[0]).toEqual(before.programs[0]);
  expect(saved.programs[1].workouts[0].exercises[0].sets).toBe(3);
  expect(saved.sessions).toEqual(before.sessions);
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await capture("home-dark");
  await page
    .getByRole("button", { name: "Start Full body B", exact: true })
    .click();
  await capture("logger-dark");
  expect(errors).toEqual([]);
  await writeFile(
    `${output}/geometry.json`,
    JSON.stringify(
      {
        errors,
        geometry,
        provider: "synthetic fixture; real generation deferred to parent",
      },
      null,
      2,
    ),
  );
});
