import { toggleTheme } from "./premium-controls";
import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import type { State } from "../../src/domain";
import { writeFile } from "node:fs/promises";
test("all five bottom actions stay fully within the 360px logger viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await fixture(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const name of ["Dashboard", "Workout", "Create", "Progress", "More"]) {
    const box = await nav
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(box!.y).toBeGreaterThan(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
});
test("logger exposes exactly one movement with accessible exercise tabs", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await expect(page.locator(".log-exercise")).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: "Barbell bench press", exact: true }),
  ).toBeVisible();
});
test("logger offers a video Info sheet", async ({ page }) => {
  await fixture(page);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Workout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page.getByRole("button", { name: /^Watch tutorial for / }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Play demonstration" }),
  ).toBeVisible();
});
test("bounded AI wizard exposes stepped input and explicit generation", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "AI program", exact: true })
    .click();
  await expect(page.getByLabel("Goal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Training days", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate preview", exact: true }),
  ).toBeVisible();
});
test("compact light Workout home, one selected exercise, refresh/undo and lazy video with fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: "Workout", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await expect(page.locator(".log-exercise")).toHaveCount(1);
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("60");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("tab", { name: "Barbell bench press", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Barbell bench press", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Barbell back squat", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Watch tutorial for / }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await expect(
    dialog.getByText("Renaissance Periodization", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Play demonstration", exact: true })
    .click();
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "src",
    /https:\/\/www.youtube-nocookie.com\/embed\/gMgvBspQ9lk/,
  );
  await expect(
    dialog.getByRole("link", { name: "Watch on YouTube", exact: true }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=gMgvBspQ9lk");
  const popupPromise = page.waitForEvent("popup");
  await dialog
    .getByRole("link", { name: "Watch on YouTube", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://www.youtube.com/watch?v=gMgvBspQ9lk");
  await popup.close();
  await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await page
    .getByRole("tab", { name: "Barbell back squat", exact: true })
    .click();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("60");
  await page
    .getByRole("button", { name: "Undo Barbell back squat set 1", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    }),
  ).toBeVisible();
});
test("personal video validation, save/reload and unmapped exercise Info", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: /Exercise library/ }).click();
  await page
    .getByLabel("Search exercises", { exact: true })
    .fill("Goblet squat");
  await page.getByRole("button", { name: /Goblet squat/ }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No verified demonstration");
  await dialog.getByText("Add a personal video", { exact: true }).click();
  await dialog
    .getByLabel("YouTube video URL", { exact: true })
    .fill("https://evil.test/video");
  await dialog.getByRole("button", { name: "Save video link" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "specific HTTPS YouTube",
  );
  await dialog
    .getByLabel("YouTube video URL", { exact: true })
    .fill("https://youtu.be/vcBig73ojpE");
  await dialog.getByRole("button", { name: "Save video link" }).click();
  await expect(dialog.getByRole("status")).toContainText("saved");
  await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await page
    .getByLabel("Search exercises", { exact: true })
    .fill("Goblet squat");
  await page.getByRole("button", { name: /Goblet squat/ }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("link", { name: "Watch on YouTube" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=vcBig73ojpE");
  await expect(dialog).toContainText("Your saved video");
});
test("AI rejects malformed provider output and shows unavailable without changing stored programs", async ({
  page,
}) => {
  await fixture(page);
  const before = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        program: { name: "Invalid", workouts: [] },
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
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("invalid plan");
  await expect(
    page.getByRole("button", { name: "Save program", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/ai/generate");
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "AI unavailable. Gemini is temporarily unavailable." },
    }),
  );
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("AI unavailable");
  const after = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  expect(after.programs).toEqual(before.programs);
  expect(after.sessions).toEqual(before.sessions);
});
test("unauthorized AI API remains inaccessible to browser without an account", async ({
  page,
}) => {
  await page.goto("/");
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
  );
  expect(status).toBe(401);
});
test("cancelling generation suppresses late results and sends an account-bound cancellation", async ({
  page,
}) => {
  await fixture(page);
  let release: (() => void) | undefined;
  let cancelBody: any;
  await page.route("**/api/ai/generate", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ status: 503, json: { error: "Late provider response" } })
      .catch(() => {});
  });
  await page.route("**/api/ai/cancel", async (route) => {
    cancelBody = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "AI program", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel generation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await expect.poll(() => cancelBody?.requestId).toMatch(/^[a-f0-9-]{36}$/);
  release?.();
  await expect(
    page.getByRole("heading", { name: "Review your program" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate preview" }),
  ).toBeVisible();
});
test("REAL model generation -> editable preview -> explicit save/activate -> reload preserves history; 360/390/desktop screenshots", async ({
  page,
}) => {
  test.skip(
    process.env.NEOFORM_REAL_AI !== "1",
    "Parent-owned provider story: opt in only with the existing QA sidecar running.",
  );
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  const videoNetwork: { url: string; status?: number; failure?: string }[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (
      /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|i\.ytimg\.com\/vi\/)/.test(
        r.url(),
      )
    )
      videoNetwork.push({ url: r.url(), status: r.status() });
  });
  page.on("requestfailed", (r) => {
    if (
      /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|i\.ytimg\.com\/vi\/)/.test(
        r.url(),
      )
    )
      videoNetwork.push({ url: r.url(), failure: r.failure()?.errorText });
  });
  await fixture(page);
  async function captures(name: string) {
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
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
        .poll(async () => {
          const box = await nav.boundingBox();
          return Math.round(box!.y + box!.height);
        })
        .toBe(width === 1440 ? 1000 : 844);
      await page.screenshot({ path: `evidence/v2/${name}-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await captures("workout-home");
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await captures("logger");
  for (let i = 1; i <= 3; i++) {
    const box = await page
      .getByLabel(`Barbell back squat set ${i} weight`, { exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThan(650);
  }
  await page.getByRole("button", { name: /^Watch tutorial for / }).click();
  await captures("video-info");
  await page
    .getByRole("button", { name: "Play demonstration", exact: true })
    .click();
  const videoFrame = page.frameLocator(
    'iframe[title="Barbell back squat demonstration"]',
  );
  await videoFrame
    .locator("body")
    .waitFor({ state: "attached", timeout: 10000 })
    .catch(() => {});
  const frameText = await videoFrame
    .locator("body")
    .innerText({ timeout: 5000 })
    .catch(() => "Frame unavailable in QA network");
  const directPromise = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Watch on YouTube", exact: true })
    .click();
  const direct = await directPromise;
  await expect(direct).toHaveURL("https://www.youtube.com/watch?v=i7J5h7BJ07g");
  await direct
    .waitForLoadState("domcontentloaded", { timeout: 10000 })
    .catch(() => {});
  await writeFile(
    "evidence/v2/video-browser-proof.json",
    JSON.stringify(
      {
        videoNetwork,
        frameText: frameText.slice(0, 1000),
        directWatchUrl: direct.url(),
        directWatchTitle: await direct.title().catch(() => "Unavailable"),
        note: "Playback is external; a loaded document does not prove media playback. The visible watch fallback opens the exact verified video.",
      },
      null,
      2,
    ),
  );
  await direct.close();
  await page.screenshot({ path: "evidence/v2/video-playing-390.png" });
  await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("60");
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
  await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Workout", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const before = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "AI program", exact: true }).click();
  await captures("ai-wizard");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Training days", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const responsePromise = page.waitForResponse("**/api/ai/generate", {
    timeout: 120000,
  });
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Building");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const generated = await response.json();
  expect(generated.proof.model).toBe("gemini-3.5-flash-lite");
  expect(generated.proof.provider).toBe("gemini");
  expect(generated.proof.toolsProvided).toBe(0);
  expect(generated.proof.agentLoop).toBe(false);
  expect(generated.proof.outputTokens).toBeGreaterThan(0);
  expect(generated.proof.toolCalls).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Review your program" }),
  ).toBeVisible();
  const during = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  expect(during.programs).toEqual(before.programs);
  expect(during.sessions).toEqual(before.sessions);
  await page
    .getByLabel("Generated program name", { exact: true })
    .fill("Reviewed real Codex program");
  await captures("ai-review");
  await page.getByLabel("Activate this program", { exact: false }).check();
  await page
    .getByRole("button", { name: "Save and activate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  const saved = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  expect(saved.programs[0].name).toBe("Reviewed real Codex program");
  expect(saved.programs[1]).toEqual(before.programs[0]);
  expect(saved.sessions).toEqual(before.sessions);
  expect(saved.programs[0].workouts).toHaveLength(2);
  await toggleTheme(page);
  await page.screenshot({ path: "evidence/v2/workout-home-dark-390.png" });
  await page
    .getByRole("button", { name: /Start / })
    .first()
    .click();
  await page.screenshot({ path: "evidence/v2/logger-dark-390.png" });
  expect(errors).toEqual([]);
});
