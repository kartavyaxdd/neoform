import { test, expect } from "@playwright/test";
import { readData } from "./storage-client";
test("actual public mode logs and reloads without exposing private account or AI controls", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Synthetic public QA");
  await page
    .getByRole("button", { name: "Build my workspace", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("60");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("60");
  const remote = (await (await readData(page)).json()).data;
  expect(remote.draft.exercises[0].sets[0].weight).toBe(60);
  expect((await page.request.get("/api/me")).status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
});
