import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";

test("pointer onboarding and focus restoration keep skip link hidden; keyboard users can skip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const skip = page.getByRole("link", { name: "Skip to workspace" });
  // Native focus restoration can focus this new first link after pointer onboarding.
  // Cover that path explicitly without removing the link from the tab order.
  await page.getByRole("heading", { name: "Workout", exact: true }).click();
  await skip.focus();
  expect((await skip.boundingBox())!.y).toBeLessThan(0);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(skip).toBeFocused();
  expect((await skip.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("exercise tabs use roving keyboard focus and retain set edits across navigation", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  const squat = page.getByRole("tab", {
    name: "Barbell back squat",
    exact: true,
  });
  const bench = page.getByRole("tab", {
    name: "Barbell bench press",
    exact: true,
  });
  await page
    .getByLabel("Barbell back squat set 1 reps", { exact: true })
    .fill("9");
  await squat.focus();
  await page.keyboard.press("ArrowRight");
  await expect(bench).toBeFocused();
  await expect(bench).toHaveAttribute("aria-selected", "true");
  await expect(squat).toHaveAttribute("tabindex", "-1");
  await expect(page.locator(".log-exercise")).toHaveCount(1);
  await page.keyboard.press("Home");
  await expect(squat).toBeFocused();
  await expect(
    page.getByLabel("Barbell back squat set 1 reps", { exact: true }),
  ).toHaveValue("9");
  await page.keyboard.press("End");
  const last = page.getByRole("tab").last();
  await expect(last).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(squat).toBeFocused();
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Info", exact: true }),
  ).toBeFocused();
});
