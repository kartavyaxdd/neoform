import { expect, type Page } from "@playwright/test";

export async function fixture(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`v2-${crypto.randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-v2-passphrase-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("V2 QA");
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
}
