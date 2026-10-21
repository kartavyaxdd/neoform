import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./v2-fixture";
const program = {
  name: "Synthetic retained preview",
  description: "Synthetic bounded preview for persistence regression",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: "Day " + (i + 1),
    exercises: [
      { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
};
async function preview(page: Page) {
  await fixture(page);
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        program,
        proof: {
          provider: "gemini",
          model: "gemini-3.5-flash-lite",
          inputTokens: 50,
          outputTokens: 80,
          toolCalls: 0,
          toolsProvided: 0,
          agentLoop: false,
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "AI program", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Training days", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(
    page.getByLabel("Generated program name", { exact: true }),
  ).toHaveValue(program.name);
}
async function quota(page: Page) {
  await page.evaluate(() => {
    (window as any).__restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("synthetic quota", "QuotaExceededError");
    };
  });
}
test("quota and offline failure retain edited AI preview with export and retry without duplicate save", async ({
  page,
}) => {
  await preview(page);
  await quota(page);
  await page.route("**/api/data", (route) =>
    route.abort("internetdisconnected"),
  );
  await page
    .getByLabel("Generated program name", { exact: true })
    .fill("Edited retained preview");
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "preview is kept",
  );
  await expect(
    page.getByLabel("Generated program name", { exact: true }),
  ).toHaveValue("Edited retained preview");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export preview", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "neoform-program-preview.json",
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as any).__restoreStorage;
  });
  await page.unroute("**/api/data");
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  const saved = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: any }).data,
  );
  expect(
    saved.programs.filter((p: any) => p.name === "Edited retained preview"),
  ).toHaveLength(1);
});
test("quota failure still permits preview save after genuine QA server acknowledgement", async ({
  page,
}) => {
  await preview(page);
  await quota(page);
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: any }).data,
  );
  expect(
    saved.programs.filter((p: any) => p.name === program.name),
  ).toHaveLength(1);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
});

test("same-account two offline tabs retain both edits after both reload", async ({
  page,
  context,
}) => {
  await fixture(page);
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".sync-status")).toHaveText("Synced");
  await context.route("**/api/**", (route) =>
    route.abort("internetdisconnected"),
  );
  for (const tab of [page, second]) {
    await tab.addInitScript(() =>
      Object.defineProperty(navigator, "onLine", {
        get: () => false,
        configurable: true,
      }),
    );
    await tab.evaluate(() =>
      Object.defineProperty(navigator, "onLine", {
        get: () => false,
        configurable: true,
      }),
    );
  }
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByLabel("Load units", { exact: true }).selectOption("lb");
  await second
    .getByRole("button", { name: "Toggle theme", exact: true })
    .click();
  await page.reload();
  await second.reload();
  for (const tab of [page, second]) {
    await tab.getByRole("button", { name: "More", exact: true }).click();
    await expect(tab.getByLabel("Load units", { exact: true })).toHaveValue(
      "lb",
    );
    await expect(tab.locator("html")).toHaveAttribute("data-theme", "dark");
  }
  await second.close();
});
