import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./v2-fixture";
import * as D from "../../src/domain";

test("changed dose and reported effort require explicit confirmation and survive reload", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await fixture(page);
  await page.getByRole('button',{name:'Start Full body A',exact:true}).click();
  await page.getByRole('button',{name:'Targets',exact:true}).click();
  await page.getByRole('button',{name:'Remove Barbell back squat set 3',exact:true}).click();
  await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  let data=(await (await page.request.get('/api/data')).json()).data;
  expect(data.draft.exercises[0].plannedWorkingSets).toBe(3);
  expect(data.draft.exercises[0].sets).toHaveLength(2);
  await page.getByRole('button',{name:'Targets',exact:true}).click();
  await page.getByRole('button',{name:'Confirm planned dose: 2 working sets',exact:true}).click();
  await page.keyboard.press('Escape');
  for(const n of [1,2])await page.getByRole('button',{name:`Complete Barbell back squat set ${n}`,exact:true}).click();
  await page.getByRole('button',{name:'Finish session',exact:true}).click();
  await page.getByRole('checkbox',{name:'I confirm the recorded RIR values describe my actual completed sets.'}).check();
  await page.getByRole('button',{name:'Save completed workout',exact:true}).click();
  await expect(page.locator('.sync-status')).toHaveText('Synced');
  await page.reload();await expect(page.locator('.sync-status')).toHaveText('Synced');
  data=(await (await page.request.get('/api/data')).json()).data;
  const entry=data.sessions.at(-1).exercises[0];
  expect(entry.plannedWorkingSets).toBe(2);
  expect(entry.sets.every((s:D.SetLog)=>s.effortReported===true)).toBe(true);
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
test("moving an exercise stays in preview until explicit save", async ({
  page,
}) => {
  await fixture(page);
  const dialog = await openEditor(page);
  await dialog
    .getByRole("button", { name: "Move exercise down", exact: true })
    .first()
    .click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save mesocycle" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const state = (await (await page.request.get("/api/data")).json()).data;
  expect(state.programs[0].workouts[0].exercises[0].exerciseId).toBe("bench");
});

test("reported history produces per-row targets and completion alone leaves effort unconfirmed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await fixture(page);
  const remote = await (await page.request.get("/api/data")).json();
  const squat = D.catalog.find((x) => x.id === "squat")!;
  remote.data.sessions = [3, 1].map((days) => {
    const entry = D.createEntry(squat, D.target(squat.id));
    entry.sets = entry.sets.map((t, i) => ({
      ...t,
      weight: 60,
      reps: [12, 10, 8][i],
      rir: 3,
      done: true,
      effortReported: true,
    }));
    const s = D.startSession("Synthetic performance", [entry]);
    s.phase = "accumulation";
    const date = new Date();
    date.setDate(date.getDate() - days);
    s.startedAt = date.getTime();
    s.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    s.feedback = { reported: true, pain: false, fatigue: 1, soreness: 1 };
    return s;
  });
  expect(
    (
      await page.request.put("/api/data", {
        headers: { Origin: new URL(page.url()).origin },
        data: remote,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page.getByText("Progression note", { exact: true }).click();
  await page.getByRole("button", { name: "Accept for unlogged sets" }).click();
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
  await page
    .getByRole("button", { name: "Save completed workout", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const saved = (
    await (await page.request.get("/api/data")).json()
  ).data.sessions.at(-1);
  expect(saved.exercises[0].sets[0].effortReported).toBe(false);
  expect(saved.exercises[0].plannedWorkingSets).toBe(3);
});
test("editing a program preserves active identity", async ({ page }) => {
  await fixture(page);
  const remote = await (await page.request.get("/api/data")).json();
  remote.data.programs.push({
    ...D.starterProgram("minimal"),
    name: "Other synthetic program",
  });
  const put = await page.request.put("/api/data", {
    headers: { Origin: new URL(page.url()).origin },
    data: remote,
  });
  expect(put.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const dialog = await openEditor(page);
  await dialog.getByRole("button", { name: "Save mesocycle" }).click();
  await expect(page.locator(".program-card").first().locator("h3")).toHaveText(
    "Balanced foundations",
  );
});
test("finishing workout B recommends workout C", async ({ page }) => {
  await fixture(page);
  const remote = await (await page.request.get("/api/data")).json();
  const program = remote.data.programs[0],
    s = D.startSession("Full body B", [D.createEntry(D.catalog[0])], program);
  s.exercises[0].sets[0].done = true;
  remote.data.sessions = [D.completeSession(s)];
  const put = await page.request.put("/api/data", {
    headers: { Origin: new URL(page.url()).origin },
    data: remote,
  });
  expect(put.status()).toBe(200);
  await page.reload();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await expect(
    page
      .locator(".program-card")
      .first()
      .locator(".program-days > .workout-row b"),
  ).toHaveText("Full body C");
});
test("acknowledged offline work never replays over a newer edit", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/data", async (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("neoform:pending:"),
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.unroute("**/api/data");
  await page.locator(".sync-status").click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  // Old tab journals remain durable; receipts suppress replay without racing a live writer.
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.locator(".sync-status").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const remote = await (await page.request.get("/api/data")).json();
  expect(remote.data.settings.theme).toBe("light");
});
