import { test, expect, type Page } from "@playwright/test";
const password = "parent-acceptance-fixture-passphrase";
async function create(page: Page, name: string) {
  const email = "parent-" + crypto.randomUUID() + "@example.test";
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  return email;
}
test("parent: shared-cookie account switching removes old private dialogs and keeps B isolated", async ({
  page,
}) => {
  await create(page, "ParentA");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Training", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Program name")
    .fill("PRIVATE A PROGRAM");
  await page.getByRole("button", { name: "Save mesocycle" }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const b = await page.context().newPage();
  await b.goto("/");
  await expect(b.locator(".sync-status")).toHaveText("Synced");
  await b.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  const bEmail = await create(b, "ParentB");
  await page
    .getByRole("button", { name: "Already have an account? Sign in" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(bEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("PRIVATE A PROGRAM", { exact: true }),
  ).toHaveCount(0);
  const data = await page.evaluate(
    async () =>
      (await (await fetch("/api/data")).json()) as {
        data: { programs: { name: string }[] };
      },
  );
  expect(
    data.data.programs.some(
      (p: { name: string }) => p.name === "PRIVATE A PROGRAM",
    ),
  ).toBe(false);
  await b.close();
});
test("parent: clean offline logout clears identity/cache and stays signed out after offline reload", async ({
  page,
  context,
}) => {
  await create(page, "OfflineQA");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/server session could not be revoked/),
  ).toBeVisible();
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => k === "neoform:identity" || k.startsWith("neoform:account:"),
    ),
  );
  expect(keys).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});
