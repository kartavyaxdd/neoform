import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./v2-fixture";
import * as D from "../../src/domain";

const header =
  "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe";
const source =
  "\uFEFF" +
  header +
  "\r\n" +
  [
    '"Hevy QA","18 Oct 2026, 09:00","18 Oct 2026, 10:00","<img src=x onerror=window.__hevyXss=1>","Bench Press (Barbell)",,"Keep bar",0,warmup,45,10,,,6',
    '"Hevy QA","18 Oct 2026, 09:00","18 Oct 2026, 10:00","<img src=x onerror=window.__hevyXss=1>","Bench Press (Barbell)",,"Keep bar",1,normal,100,8,,,8',
    '"Hevy QA","18 Oct 2026, 09:00","18 Oct 2026, 10:00","<img src=x onerror=window.__hevyXss=1>","Bench Press (Barbell)",,"No effort recorded",2,normal,100,8,,,',
    '"Hevy QA","18 Oct 2026, 09:00","18 Oct 2026, 10:00","<img src=x onerror=window.__hevyXss=1>","Running",,"Easy",0,normal,,,1,600,',
  ].join("\r\n");
async function data(page: Page): Promise<D.State> {
  return page.evaluate(async () => {
    const r = await fetch("/api/data");
    if (!r.ok) throw Error("QA read failed");
    return ((await r.json()) as { data: D.State }).data;
  });
}
async function openImport(page: Page) {
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import from Hevy", exact: true })
    .click();
}
async function preview(page: Page, text = source) {
  await page.getByLabel("Hevy CSV file", { exact: true }).setInputFiles({
    name: "hevy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
  await page
    .getByLabel("Original workout UTC offset", { exact: true })
    .fill("+05:30");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
}

test("Hevy rejects invalid UTF-8 and oversized files; cancelling a 360px preview leaves all data untouched", async ({
  page,
  baseURL,
}) => {
  expect(new URL(baseURL!).port).toBe("8787");
  await page.setViewportSize({ width: 360, height: 800 });
  await fixture(page);
  const before = await data(page);
  await openImport(page);
  await page.getByLabel("Hevy CSV file", { exact: true }).setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([0xff]),
  });
  await page
    .getByLabel("Original workout UTC offset", { exact: true })
    .fill("+05:30");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/UTF-8/i);
  await page.getByLabel("Hevy CSV file", { exact: true }).setInputFiles({
    name: "huge.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(2_000_001, 65),
  });
  await expect(page.getByRole("alert")).toContainText("2 MB");
  await preview(page, source);
  await expect(
    page.getByRole("region", { name: "Hevy preview" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Use exported RPE for supported sets", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("region", { name: "Hevy preview" })
    .locator("summary")
    .click();
  await expect(
    page.getByRole("region", { name: "Hevy preview" }),
  ).toContainText("<img src=x onerror=window.__hevyXss=1>");
  expect(
    await page.evaluate(() => {
      const d = document.querySelector("dialog")!;
      return d.scrollWidth <= d.clientWidth;
    }),
  ).toBe(true);
  await page.screenshot({ path: ".planning/hevy-import-360.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await data(page)).toEqual(before);
});

test("Hevy preview, explicit mappings, supported RPE sets and source archive persist without replacing program/history/draft", async ({
  page,
  baseURL,
}) => {
  expect(new URL(baseURL!).port).toBe("8787");
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  const original = await data(page);
  const seeded = {
    ...original,
    sessions: [D.startSession("Existing QA history", [])],
    draft: D.startSession("Existing QA draft", [D.createEntry(D.catalog[0])]),
  };
  await page.evaluate(async (data) => {
    const r = await fetch("/api/data");
    const state = (await r.json()) as { revision: number };
    const me = (await (await fetch("/api/me")).json()) as {
      id: string;
      accessMode?: string;
    };
    if (me.accessMode === "single-user-local")
      throw Error("Refusing personal single-user runtime");
    const saved = await fetch("/api/data", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Neoform-Account": me.id,
      },
      body: JSON.stringify({ revision: state.revision, data }),
    });
    if (!saved.ok) throw Error("QA seed failed " + saved.status);
  }, seeded);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await openImport(page);
  await preview(page);
  await expect(
    page.getByRole("region", { name: "Hevy preview" }),
  ).toContainText("1 workout");
  await expect(
    page.getByRole("region", { name: "Hevy preview" }),
  ).toContainText("4 source rows");
  await expect(
    page.getByRole("region", { name: "Hevy preview" }),
  ).toContainText("lb");
  await expect(page.getByText(/Timed\/distance records/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Hevy merge", exact: true }),
  ).toBeDisabled();
  expect(await data(page)).toEqual(seeded);
  await page
    .getByLabel("Map Bench Press (Barbell)", { exact: true })
    .selectOption("bench");
  await page.getByLabel("Map Running", { exact: true }).selectOption("custom");
  await page
    .getByLabel("Running · Direct muscle", { exact: true })
    .selectOption("Core");
  await page
    .getByLabel("Running · Equipment", { exact: true })
    .selectOption("Bodyweight");
  await page
    .getByLabel("Running · Movement pattern", { exact: true })
    .selectOption("Core");
  await page
    .getByLabel("Running · Load convention", { exact: true })
    .selectOption("added-bodyweight");
  await page
    .getByLabel("Use exported RPE for supported sets", { exact: true })
    .check();
  await page
    .getByLabel(
      "I reviewed mappings, units, timezone and source-only limitations",
      { exact: true },
    )
    .check();
  await expect(
    page.getByRole("status", { name: "Hevy merge summary" }),
  ).toContainText("2 logged sets");
  await expect(
    page.getByRole("status", { name: "Hevy merge summary" }),
  ).toContainText("2 source-only rows");
  expect(await data(page)).toEqual(seeded);
  await expect(
    page.getByRole("region", { name: "Hevy preview" }).locator("img"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "__hevyXss"))).toBe(
    false,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".planning/hevy-import-390.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm Hevy merge", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Hevy import result" }),
  ).toContainText("1 workout added");
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const saved = await data(page);
  expect(saved.programs).toEqual(seeded.programs);
  expect(saved.draft).toEqual(seeded.draft);
  expect(saved.sessions[0]).toEqual(seeded.sessions[0]);
  expect(saved.settings).toEqual(seeded.settings);
  expect(saved.sessions).toHaveLength(2);
  expect(saved.customExercises).toHaveLength(1);
  expect(saved.customExercises[0].name).toBe("Running");
  const imported = saved.sessions.find((s) => s.id.startsWith("hevy-"))!;
  expect(imported.startedAt).toBe(Date.parse("2026-10-18T09:00:00+05:30"));
  expect(imported.duration).toBe(3600);
  expect(imported.exercises.flatMap((e) => e.sets)).toHaveLength(2);
  expect(imported.exercises.flatMap((e) => e.sets)[1]).toMatchObject({
    reps: 8,
    rir: 2,
    kind: "working",
    done: true,
  });
  expect(imported.exercises.flatMap((e) => e.sets)[1].weight).toBeCloseTo(
    D.convertWeight(100, "lb", "kg"),
  );
  expect(imported.exercises.every((e) => !e.target)).toBe(true);
  expect(imported.exercises.map((e) => e.notes).join(" ")).toContain(
    '"distance_miles":"1"',
  );
  await openImport(page);
  await preview(page);
  await page
    .getByLabel(
      "I reviewed mappings, units, timezone and source-only limitations",
      { exact: true },
    )
    .check();
  await expect(
    page.getByRole("status", { name: "Hevy merge summary" }),
  ).toContainText("1 duplicate");
  await page
    .getByRole("button", { name: "Confirm Hevy merge", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Hevy import result" }),
  ).toContainText("0 workouts added");
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  expect(await data(page)).toEqual(saved);
});
