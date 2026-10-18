import { test, expect, type Page } from "@playwright/test";
import type { State } from "../../src/domain";
import fs from "node:fs";
const password = "qa-only-strong-passphrase-42";
const newEmail = () => `browser-${crypto.randomUUID()}@example.test`;
async function register(page: Page, name = "Avery") {
  const email = newEmail();
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Workout", exact: true }),
  ).toBeVisible();
  await synced(page);
  return email;
}
async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Already have an account? Sign in" })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workout", exact: true }),
  ).toBeVisible();
  await synced(page);
}
async function nav(page: Page, label: string) {
  const mapped: Record<string, string> = {
    Overview: "Dashboard",
    Training: "Workout",
    Insights: "Progress",
  };
  if (label === "Exercises" || label === "Journal") {
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Workout", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: label === "Exercises" ? "Exercise library" : "Workout History",
        exact: false,
      })
      .click();
  } else
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: mapped[label] || label, exact: true })
      .click();
}
async function sessionNotes(page: Page) {
  await page
    .getByRole("button", { name: "Session options", exact: true })
    .click();
}
async function closeSheet(page: Page) {
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
}
async function programOptions(page: Page) {
  await page
    .locator(".program-options")
    .first()
    .getByText("Program options", { exact: true })
    .click();
}
async function synced(page: Page) {
  await expect(page.locator(".sync-status")).toHaveText("Synced");
}
async function json(page: Page) {
  return page.evaluate(
    async () =>
      (await (await fetch("/api/data")).json()) as {
        data: State;
        revision: number;
      },
  );
}
async function settings(page: Page) {
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
}
test("registration → onboarding → edited program → log/undo/resume → history → analytics → backup → sign-in", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const email = await register(page);
  await nav(page, "Training");
  await programOptions(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Program name").fill("Avery · six-week build");
  await dialog.getByLabel("Superset group (optional)").first().fill("A");
  await dialog.getByRole("button", { name: "Save mesocycle" }).click();
  await expect(dialog).not.toBeVisible();
  await synced(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("60");
  await page
    .getByLabel("Barbell back squat set 1 reps", { exact: true })
    .fill("10");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await expect(page.getByRole("region", { name: "Rest timer" })).toBeVisible();
  await page.getByRole("button", { name: "Pause rest", exact: true }).click();
  await expect(page.getByText("REST PAUSED")).toBeVisible();
  await page.getByRole("button", { name: "+30s", exact: true }).click();
  await page
    .getByRole("button", { name: "Undo Barbell back squat set 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("60");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Skip rest", exact: true }).click();
  await sessionNotes(page);
  await page
    .getByLabel("Session notes", { exact: true })
    .fill("Controlled tempo. Good session.");
  await closeSheet(page);
  await synced(page);
  await page.reload();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("60");
  await expect(
    page.getByRole("button", { name: "Undo Barbell back squat set 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page.getByRole("button", { name: "Save completed workout" }).click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Full body A", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("60", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Edit session", exact: true })
    .click();
  await dialog.getByLabel("Duration (minutes)", { exact: true }).fill("42");
  await dialog.getByLabel("Workout date", { exact: true }).fill("2026-10-08");
  await dialog.getByRole("button", { name: "Save journal changes" }).click();
  await synced(page);
  const data = await json(page);
  expect(data.data.sessions).toHaveLength(1);
  expect(data.data.sessions[0].duration).toBe(2520);
  expect(data.data.sessions[0].exercises[0].sets).toHaveLength(1);
  await nav(page, "Insights");
  await expect(
    page.getByRole("heading", { name: "Comparable records" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "60 × 10" })).toBeVisible();
  // The configured superset context is not a valid straight-barbell e1RM.
  const recordRow=page.getByRole("row").filter({has:page.getByRole("cell",{name:/Barbell back squat.*superset/})});
  await expect(recordRow.getByRole("cell",{name:"—",exact:true})).toBeVisible();
  await expect(page.getByRole("cell",{name:"80 kg",exact:true})).toHaveCount(0);
  await page.getByText("View chart data", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Week of" }),
  ).toBeVisible();
  await settings(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON backup" }).click();
  const dl = await downloadPromise;
  const backupPath = await dl.path();
  const backup = fs.readFileSync(backupPath!, "utf8");
  expect(JSON.parse(backup).version).toBe(1);
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session CSV" }).click();
  const csv = await csvPromise;
  expect(fs.readFileSync((await csv.path())!, "utf8")).toContain(
    '"equipment","convention"',
  );
  await page.getByLabel("Import JSON backup", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.getByRole("status")).toContainText("JSON");
  await page.getByLabel("Import JSON backup", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole("dialog")).toContainText(
    "Validated version 1 backup",
  );
  await page.getByRole("button", { name: "Confirm merge" }).click();
  await synced(page);
  expect((await json(page)).data.sessions).toHaveLength(1);
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Make room for progress." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith("neoform:") && k !== "neoform:signed-out",
      ),
    ),
  ).toEqual([]);
  await signIn(page, email);
  await nav(page, "Journal");
  await expect(page.getByRole("button", { name: /Full body A/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test("two browsers synchronize, offline refresh preserves drafts, conflicts require choice, other accounts are isolated", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    c = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage(),
    pc = await c.newPage();
  // Installed Chromium can briefly report online during an offline SW refresh.
  // Explicit API network failure ensures no private request escapes the outage.
  let offlineB = false;
  await b.route("**/api/**", (route) =>
    offlineB ? route.abort("internetdisconnected") : route.continue(),
  );
  const email = await register(pa, "Morgan");
  await signIn(pb, email);
  await pa.getByRole("button", { name: "Empty Workout", exact: true }).click();
  await pa.getByRole("button", { name: "Add exercise", exact: true }).click();
  await pa
    .getByRole("dialog")
    .getByLabel("Search exercises", { exact: true })
    .fill("bench");
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: /Barbell bench press/ })
    .click();
  await pa
    .getByLabel("Barbell bench press set 1 weight", { exact: true })
    .fill("45");
  await synced(pa);
  await pb.reload();
  await expect(
    pb.getByRole("button", { name: "Resume session", exact: true }),
  ).toBeVisible();
  await pb.getByRole("button", { name: "Resume session", exact: true }).click();
  await expect(
    pb.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("45");
  await synced(pb);
  await pb.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => pb.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  offlineB = true;
  await b.setOffline(true);
  expect(await pb.evaluate(() => navigator.onLine)).toBe(false);
  await sessionNotes(pb);
  await pb
    .getByLabel("Session notes", { exact: true })
    .fill("Offline note kept.");
  await pb.reload();
  await sessionNotes(pb);
  await expect(pb.getByLabel("Session notes", { exact: true })).toHaveValue(
    "Offline note kept.",
  );
  await expect(pb.locator(".sync-status")).toContainText("Offline");
  expect(await pb.evaluate(() => navigator.onLine)).toBe(false);
  const untouched = await json(pa);
  expect(untouched.data.draft?.notes).toBe("");
  await pa
    .getByLabel("Barbell bench press set 1 weight", { exact: true })
    .fill("50");
  await synced(pa);
  await closeSheet(pb);
  offlineB = false;
  await b.setOffline(false);
  await expect(
    pb.getByRole("heading", { name: "Both devices made changes." }),
  ).toBeVisible();
  await sessionNotes(pb);
  await expect(pb.getByLabel("Session notes", { exact: true })).toHaveValue(
    "Offline note kept.",
  );
  await closeSheet(pb);
  await pb.getByRole("button", { name: "Merge safe changes" }).click();
  await pb
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await synced(pb);
  await pa.reload();
  await sessionNotes(pa);
  await expect(pa.getByLabel("Session notes", { exact: true })).toHaveValue(
    "Offline note kept.",
  );
  await closeSheet(pa);
  await expect(
    pa.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("50");
  await register(pc, "Taylor");
  expect((await json(pc)).data.draft).toBeNull();
  expect((await json(pc)).data.sessions).toEqual([]);
  await expect(
    pc.getByRole("heading", { name: "Workout", exact: true }),
  ).toBeVisible();
  const cached = await pb.evaluate(async () => {
    const entries = [] as string[];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      entries.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
    }
    return entries;
  });
  expect(cached.some((p) => p.startsWith("/api/"))).toBe(false);
  await a.close();
  await b.close();
  await c.close();
});
test("custom exercise, past workout edit/delete, responsive dark/light screenshots and keyboard dialogs", async ({
  page,
}) => {
  await register(page, "Riley");
  await nav(page, "Exercises");
  await page.getByRole("button", { name: "Custom exercise" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Exercise name")
    .fill(
      "Chest-supported row · Studio machine with an intentionally long name",
    );
  await page
    .getByRole("dialog")
    .getByLabel("Direct muscle")
    .selectOption("Back");
  await page
    .getByRole("dialog")
    .getByLabel("Equipment", { exact: true })
    .selectOption("Machine");
  await page
    .getByRole("dialog")
    .getByLabel("Load convention")
    .selectOption("machine-label");
  await page
    .getByRole("dialog")
    .getByLabel("Instructions / setup notes")
    .fill("Seat at notch 4. Consistent range.");
  await page
    .getByRole("button", { name: "Save exercise", exact: true })
    .click();
  await synced(page);
  await page.getByLabel("Search exercises", { exact: true }).fill("Studio");
  await expect(
    page.getByRole("button", { name: /Chest-supported row/ }),
  ).toBeVisible();
  await nav(page, "Journal");
  await page.getByRole("button", { name: "Add past workout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Session name", { exact: true })
    .fill("Backfilled test workout");
  await dialog.getByLabel("Workout date", { exact: true }).fill("2026-09-28");
  await dialog.getByLabel("Duration (minutes)", { exact: true }).fill("35");
  await dialog
    .getByRole("button", { name: "Add to session", exact: true })
    .click();
  await dialog
    .getByLabel("Barbell bench press set 1 weight", { exact: true })
    .fill("40");
  await dialog.getByRole("button", { name: "Save journal changes" }).click();
  await synced(page);
  await page.getByRole("button", { name: /Backfilled test workout/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await synced(page);
  expect((await json(page)).data.sessions).toHaveLength(0);
  await nav(page, "Overview");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `evidence/screenshots/overview-dark-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.screenshot({
    path: "evidence/screenshots/overview-light-360.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle theme" }).click();
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
  await page.screenshot({
    path: "evidence/screenshots/logger-mobile-360.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "evidence/screenshots/logger-desktop-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Discard session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discard session", exact: true }),
  ).toBeFocused();
});
test("progression acceptance, working/warmup distinctions, substitutions, resume after auth expiry and account controls", async ({
  page,
}) => {
  test.setTimeout(120000);
  const email = await register(page, "Casey");
  for (let session = 0; session < 2; session++) {
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    const indexes = session === 0 ? [2, 3] : [1, 2];
    if (session === 0) {
      await page.getByRole("button", { name: "Warm Up", exact: true }).click();
      await page
        .getByLabel("Barbell back squat set 1 type", { exact: true })
        .selectOption("warmup");
      await closeSheet(page);
      await page
        .getByLabel("Barbell back squat set 1 weight", { exact: true })
        .fill("20");
      await page
        .getByRole("button", {
          name: "Complete Barbell back squat set 1",
          exact: true,
        })
        .click();
    }
    for (const i of indexes) {
      await page
        .getByLabel(`Barbell back squat set ${i} weight`, { exact: true })
        .fill("60");
      await page
        .getByLabel(`Barbell back squat set ${i} reps`, { exact: true })
        .fill("12");
      await page
        .getByRole("button", {
          name: `Complete Barbell back squat set ${i}`,
          exact: true,
        })
        .click();
    }
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    // Explicit fresh reports are required; skipped defaults do not prove recovery.
    await page.getByLabel("Systemic fatigue",{exact:true}).selectOption("1");
    await page.getByLabel("Unscoped pain",{exact:true}).selectOption("no");
    await page.getByText("Other unscoped observations",{exact:true}).click();
    await page.getByLabel("Unscoped soreness",{exact:true}).selectOption("1");
    await page.getByRole("button", { name: "Save completed workout" }).click();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await synced(page);
    await nav(page, "Overview");
  }
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  const squat = page.locator(".log-exercise").filter({
    has: page.getByRole("heading", {
      name: "Barbell back squat",
      exact: true,
    }),
  });
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  const options = page.getByRole("dialog");
  await options.getByText("Progression note", { exact: true }).click();
  await expect(options).toContainText("61.5 kg × 8 reps");
  await options
    .getByRole("button", { name: "Accept for unlogged sets" })
    .click();
  await expect(
    page.getByLabel("Barbell back squat set 1 weight", { exact: true }),
  ).toHaveValue("61.5");
  await expect(options.getByRole("status")).toContainText("accept");
  await options.getByRole("button", { name: "Defer", exact: true }).click();
  await expect(options.getByRole("status")).toContainText("defer");
  await closeSheet(page);
  await squat.getByRole("button", { name: "Add set", exact: true }).click();
  await page.getByRole("button", { name: "Warm Up", exact: true }).click();
  await page
    .getByLabel("Barbell back squat set 4 type", { exact: true })
    .selectOption("drop");
  await page
    .getByRole("button", {
      name: "Remove Barbell back squat set 4",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByLabel("Barbell back squat set 4 weight", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("tab", { name: "Barbell bench press", exact: true })
    .click();
  const bench = page.locator(".log-exercise").filter({
    has: page.getByRole("heading", {
      name: "Barbell bench press",
      exact: true,
    }),
  });
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Swap", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Incline dumbbell press/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Incline dumbbell press", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Barbell back squat", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page.getByRole("button", { name: "Use RPE", exact: true }).click();
  await closeSheet(page);
  await page
    .getByLabel("Barbell back squat set 1 RPE", { exact: true })
    .fill("8");
  await expect(
    page.getByLabel("Barbell back squat set 1 RPE", { exact: true }),
  ).toHaveValue("8");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await nav(page, "Exercises");
  await expect(page.getByRole("region", { name: "Rest timer" })).toBeVisible();
  await nav(page, "Training");
  await page
    .getByRole("button", { name: "Resume session", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip rest", exact: true }).click();
  await synced(page);
  // Revoke the real server session to emulate expiry; do not bypass authentication.
  await page.evaluate(async () => {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });
  await sessionNotes(page);
  await page
    .getByLabel("Session notes", { exact: true })
    .fill("Draft kept through expired login");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await closeSheet(page);
  await expect(
    page.getByRole("button", { name: "Sign in to sync", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign in to sync", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Password", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Restore access & sync" }).click();
  await synced(page);
  await sessionNotes(page);
  await expect(page.getByLabel("Session notes", { exact: true })).toHaveValue(
    "Draft kept through expired login",
  );
  await closeSheet(page);
  await page
    .getByRole("button", { name: "Discard session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await synced(page);
  await settings(page);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill(password + "-changed");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Delete account & data" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Your password", { exact: true })
    .fill(password + "-changed");
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make room for progress." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith("neoform:") && k !== "neoform:signed-out",
      ),
    ),
  ).toEqual([]);
});
test("custom mesocycle, duplication/archive, deload targets and unconverted machine labels", async ({
  page,
}) => {
  await register(page, "Jules");
  await nav(page, "Training");
  await programOptions(page);
  await page
    .getByRole("button", { name: "Duplicate", exact: true })
    .first()
    .click();
  await expect(page.locator(".program-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Archive", exact: true })
    .first()
    .click();
  await expect(page.locator(".program-card.archived")).toHaveCount(1);
  await page.locator(".archive-group > summary").click();
  await page.locator(".program-card.archived > summary").click();
  await page
    .locator(".program-card.archived .program-options > summary")
    .click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".program-card.archived")).toHaveCount(0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "New program", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Program name", { exact: true })
    .fill("Two-day intent");
  await dialog.getByLabel("Cycle weeks", { exact: true }).fill("4");
  await dialog
    .getByLabel("Workout 1 name", { exact: true })
    .fill("Machine focus");
  await dialog
    .getByRole("button", { name: "Add movement", exact: true })
    .click();
  await dialog
    .getByLabel("Exercise 1", { exact: true })
    .selectOption("leg-press");
  await dialog.getByLabel("Machine focus 1 min", { exact: true }).fill("5");
  await dialog.getByLabel("Machine focus 1 max", { exact: true }).fill("8");
  await dialog.getByLabel("Machine focus 1 sets", { exact: true }).fill("3");
  await dialog.getByLabel("Machine focus 1 rest", { exact: true }).fill("90");
  await dialog
    .getByLabel("Superset group (optional)", { exact: true })
    .fill("A");
  await dialog
    .getByRole("button", { name: "Add workout day", exact: true })
    .click();
  await dialog
    .getByLabel("Workout 2 name", { exact: true })
    .fill("Recovery-friendly upper");
  await dialog
    .getByRole("button", { name: "Save mesocycle", exact: true })
    .click();
  await synced(page);
  const program = page.locator(".program-card").filter({
    has: page.getByRole("heading", { name: "Two-day intent", exact: true }),
  });
  await program.locator(":scope > summary").click();
  await program.locator(".program-options > summary").click();
  await program.getByRole("button", { name: /W4/ }).click();
  await program
    .getByRole("button", { name: "Start Machine focus", exact: true })
    .click();
  await expect(
    page.getByLabel("Leg press set 3 weight", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Leg press set 1 RIR", { exact: true }),
  ).toHaveValue("5");
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  await expect(page.getByText(/Target: 2–4 reps/)).toContainText("90s rest");
  await closeSheet(page);
  await page.getByLabel("Leg press set 1 weight", { exact: true }).fill("7");
  await settings(page);
  await page.getByLabel("Load units", { exact: true }).selectOption("lb");
  await nav(page, "Training");
  await page
    .getByRole("button", { name: "Resume session", exact: true })
    .click();
  await expect(
    page.getByLabel("Leg press set 1 weight", { exact: true }),
  ).toHaveValue("7");
  await expect(page.locator(".set-header")).toContainText("LABEL");
  await page
    .getByRole("button", { name: "Complete Leg press set 1", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Rest timer" })).toContainText(
    "RECOVER & RESET",
  );
  await synced(page);
  const data = await json(page);
  expect(data.data.draft?.exercises[0].sets[0].weight).toBe(7);
  expect(data.data.draft?.exercises[0].sets[0].rir).toBe(5);
  expect(data.data.timer?.remaining).toBe(90);
  expect(data.data.programs).toHaveLength(3);
});
