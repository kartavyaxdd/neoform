import { toggleTheme, exerciseOptions } from "./premium-controls";
import { readData, writeData } from "./storage-client";
import { test, expect, type Page } from "@playwright/test";
import { fixture, currentReadiness } from "./v2-fixture";
import * as D from "../../src/domain";
import { mkdir } from "node:fs/promises";

for (const [width, unit] of [
  [360, "kg"],
  [390, "lb"],
] as const) {
  test(`equipment setup is explicit, persists and fits ${width}px in ${unit}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    if (unit === "lb") {
      const remote = await (await readData(page)).json();
      remote.data.settings.unit = unit;
      expect(
        (
          await writeData(page, {
            headers: { Origin: new URL(page.url()).origin },
            data: remote,
          })
        ).status(),
      ).toBe(200);
      await page.reload();
    }
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    const open = async () => {
      await exerciseOptions(page);
      await page
        .getByRole("button", { name: "Equipment setup", exact: true })
        .click();
    };
    await open();
    await page.getByLabel("Setup name", { exact: true }).fill("QA rack A");
    await page
      .getByLabel("Execution notes", { exact: true })
      .fill("Comfortable depth, same shoes");
    await page
      .getByLabel(`Available loads (${unit})`, { exact: true })
      .fill("60, nope");
    await page
      .getByRole("button", { name: "Save session setup", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("numbers");
    await page
      .getByLabel(`Available loads (${unit})`, { exact: true })
      .fill("60, 61.25, 62.5");
    await page
      .getByRole("button", { name: "Save session setup", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Session setup saved");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    let state = (await (await readData(page)).json()).data;
    expect(state.programs[0].workouts[0].exercises[0].setup).toBeUndefined();
    expect(state.draft.exercises[0].setup.label).toBe("QA rack A");
    expect(state.draft.exercises[0].setup.availableLoads[1]).toBeCloseTo(
      D.canonicalLoad(61.25, "total", unit),
      8,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const output =
      process.env.NEOFORM_QA_OUTPUT || ".qa-state/equipment-browser";
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/equipment-${width}.png` });
    await page
      .getByRole("button", {
        name: "Use saved setup for this workout in the program",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    state = (await (await readData(page)).json()).data;
    expect(state.programs[0].workouts[0].exercises[0].setup).toEqual(
      state.draft.exercises[0].setup,
    );
    const savedLoads = state.draft.exercises[0].setup.availableLoads;
    // Switching display units and editing only notes must never round canonical inventory.
    const remote = await (await readData(page)).json();
    remote.data.settings.unit = unit === "kg" ? "lb" : "kg";
    expect(
      (
        await writeData(page, {
          headers: { Origin: new URL(page.url()).origin },
          data: remote,
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await open();
    await page
      .getByLabel("Execution notes", { exact: true })
      .fill("Same depth, reviewed notes");
    await page
      .getByRole("button", { name: "Save session setup", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    state = (await (await readData(page)).json()).data;
    expect(state.draft.exercises[0].setup.availableLoads).toEqual(savedLoads);
    await page
      .getByRole("button", { name: "Clear session setup", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Clear setup from this workout in the program",
        exact: true,
      })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    state = (await (await readData(page)).json()).data;
    expect(state.draft.exercises[0].setup).toBeUndefined();
    expect(state.programs[0].workouts[0].exercises[0].setup).toBeUndefined();
    await page
      .getByRole("button", {
        name: "Complete Barbell back squat set 1",
        exact: true,
      })
      .click();
    await open();
    await expect(
      page.getByText("Working sets have already been recorded.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Setup name", { exact: true })).toHaveCount(0);
  });
}

test("changed dose and reported effort require explicit confirmation and survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: "Remove Barbell back squat set 3",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  let data = (await (await readData(page)).json()).data;
  expect(data.draft.exercises[0].plannedWorkingSets).toBe(3);
  expect(data.draft.exercises[0].sets).toHaveLength(2);
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Confirm planned dose: 2 working sets",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
  for (const n of [1, 2]) {
    await page
      .getByLabel(`Barbell back squat set ${n} RIR`, { exact: true })
      .fill("2");
    await page
      .getByRole("button", {
        name: `Complete Barbell back squat set ${n}`,
        exact: true,
      })
      .click();
  }
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  data = (await (await readData(page)).json()).data;
  const entry = data.sessions.at(-1).exercises[0];
  expect(entry.plannedWorkingSets).toBe(2);
  expect(entry.sets.every((s: D.SetLog) => s.effortReported === true)).toBe(
    true,
  );
});
async function openEditor(page: Page) {
  await page
    .locator(".program-options")
    .first()
    .getByText("Program options", { exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  return page.getByRole("dialog");
}
test("replacing a program exercise clears its equipment setup without changing history", async ({
  page,
}) => {
  await fixture(page);
  const remote = await (await readData(page)).json();
  const setup = {
    label: "QA squat rack",
    execution: "Comfortable depth",
    availableLoads: [60, 61.25],
  };
  remote.data.programs[0].workouts[0].exercises[0].setup = setup;
  const entry = D.createEntry(D.catalog.find((x) => x.id === "squat")!);
  entry.setup = setup;
  entry.sets[0].done = true;
  remote.data.sessions = [
    D.completeSession(D.startSession("QA preserved setup", [entry])),
  ];
  const preserved = structuredClone(remote.data.sessions);
  expect(
    (
      await writeData(page, {
        headers: { Origin: new URL(page.url()).origin },
        data: remote,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  const dialog = await openEditor(page);
  await dialog
    .getByRole("button", {
      name: "Edit Barbell back squat targets",
      exact: true,
    })
    .click();
  const targetDialog = page.getByRole("dialog", {
    name: "Edit base targets",
    exact: true,
  });
  await targetDialog
    .getByLabel("Exercise 1", { exact: true })
    .first()
    .selectOption("bench");
  await targetDialog.getByRole("button", { name: "Done", exact: true }).click();
  await dialog.getByRole("button", { name: "Save program" }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const state = (await (await readData(page)).json()).data;
  expect(state.programs[0].workouts[0].exercises[0].exerciseId).toBe("bench");
  expect(state.programs[0].workouts[0].exercises[0].setup).toBeUndefined();
  expect(state.sessions).toEqual(preserved);
});
test("moving an exercise stays in preview until explicit save", async ({
  page,
}) => {
  await fixture(page);
  const dialog = await openEditor(page);
  await dialog.getByRole("button", { name: "Re-order", exact: true }).click();
  const orderDialog = page.getByRole("dialog", {
    name: "Re-order exercises",
    exact: true,
  });
  await orderDialog
    .getByRole("button", { name: "Move Barbell back squat down", exact: true })
    .first()
    .click();
  await orderDialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save program" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const state = (await (await readData(page)).json()).data;
  expect(state.programs[0].workouts[0].exercises[0].exerciseId).toBe("bench");
});

test("reported history produces per-row targets and completion alone leaves effort unconfirmed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await fixture(page);
  const remote = await (await readData(page)).json();
  const squat = D.catalog.find((x) => x.id === "squat")!;
  remote.data.sessions = [3, 1].map((days) => {
    const entry = D.createEntry(
      squat,
      remote.data.programs[0].workouts[0].exercises[0],
    );
    entry.sets = entry.sets.map((t, i) => ({
      ...t,
      weight: 60,
      reps: [12, 10, 8][i],
      rir: 3,
      done: true,
      effortReported: true,
    }));
    const s = D.startSession(
      "Synthetic performance",
      [entry],
      remote.data.programs[0],
      remote.data.programs[0].workouts[0],
    );
    s.phase = "accumulation";
    const date = new Date();
    date.setDate(date.getDate() - days);
    s.startedAt = date.getTime();
    s.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    s.feedback = { reported: true, pain: false, fatigue: 1, soreness: 1 };
    s.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: s.startedAt,
    };
    s.exercises[0].sets.forEach((t) => {
      t.prescription = { ...t.prescription!, weight: t.weight };
    });
    return s;
  });
  expect(
    (
      await writeData(page, {
        headers: { Origin: new URL(page.url()).origin },
        data: remote,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByText("Program options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await currentReadiness(page, "Quads");
  await page.getByRole("button", { name: "Progression", exact: true }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 3; i++)
    expect(
      await page
        .getByLabel(`Barbell back squat set ${i + 1} reps`, { exact: true })
        .inputValue(),
    ).toBe(String([12, 10, 9][i]));
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const saved = (await (await readData(page)).json()).data.sessions.at(-1);
  expect(saved.exercises[0].sets[0].effortReported).toBe(false);
  expect(saved.exercises[0].plannedWorkingSets).toBe(3);
});
test("editing a program preserves active identity", async ({ page }) => {
  await fixture(page);
  const remote = await (await readData(page)).json();
  remote.data.programs.push({
    ...D.starterProgram("minimal"),
    name: "Other synthetic program",
  });
  const put = await writeData(page, {
    headers: { Origin: new URL(page.url()).origin },
    data: remote,
  });
  expect(put.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const dialog = await openEditor(page);
  await dialog.getByRole("button", { name: "Save program" }).click();
  await expect(page.locator(".program-card").first().locator("h3")).toHaveText(
    "Balanced foundations",
  );
});
test("finishing workout B recommends workout C", async ({ page }) => {
  await fixture(page);
  const remote = await (await readData(page)).json();
  const program = remote.data.programs[0],
    s = D.startSession("Full body B", [D.createEntry(D.catalog[0])], program);
  s.exercises[0].sets[0].done = true;
  remote.data.sessions = [D.completeSession(s)];
  const put = await writeData(page, {
    headers: { Origin: new URL(page.url()).origin },
    data: remote,
  });
  expect(put.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await expect(
    page.locator(".program-card").first().locator(".featured-workout h2"),
  ).toHaveText("Full body C");
});
test("acknowledged offline work never replays over a newer edit", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/storage/**", async (route) =>
    ["POST", "PUT"].includes(route.request().method())
      ? route.abort()
      : route.continue(),
  );
  await toggleTheme(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector(".sync-status")
          ?.textContent?.includes("saved on device") ||
        document
          .querySelector(".sync-status")
          ?.textContent?.includes("sync paused")
          ? 1
          : 0,
      ),
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.unroute("**/api/storage/**");
  await page.locator(".sync-status").click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  // Old tab journals remain durable; receipts suppress replay without racing a live writer.
  await toggleTheme(page);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.locator(".sync-status").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const remote = await (await readData(page)).json();
  expect(remote.data.settings.theme).toBe("light");
});
