import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import type { State } from "../../src/domain";
import { mkdir } from "node:fs/promises";

for (const technique of [
  "down-set",
  "drop-set",
  "giant-set",
  "tempo",
] as const) {
  test(`${technique} manual controls persist real raw metadata and never rewrite saved programs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page);
    await page
      .getByRole("button", { name: "Start Full body A", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Exercise options", exact: true })
      .click();
    await page
      .getByLabel("Training technique", { exact: true })
      .selectOption(technique);
    await page
      .getByRole("button", {
        name: "Apply technique to unlogged exercise",
        exact: true,
      })
      .click();
    if (technique === "tempo") {
      await page.getByLabel("eccentric seconds", { exact: true }).fill("4");
      await page.getByLabel("pause seconds", { exact: true }).fill("2");
    }
    if (technique === "giant-set")
      await page.getByLabel("Total rep goal", { exact: true }).fill("25");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const count = await page.locator(".set-row").count();
    for (let i = 1; i <= count; i++)
      await page
        .getByLabel(`Barbell back squat set ${i} weight`, { exact: true })
        .fill("20");
    if (technique !== "tempo") {
      await page
        .getByRole("button", {
          name:
            technique === "down-set"
              ? "Add down set"
              : technique === "drop-set"
                ? "Add drop bout"
                : "Add giant bout",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Bout load", { exact: true })
        .fill(technique === "giant-set" ? "20" : "15");
      await page.getByLabel("Bout reps", { exact: true }).fill("6");
      await page
        .getByLabel("Rest before bout (seconds)", { exact: true })
        .fill("35");
      await page
        .getByRole("button", { name: "Append raw bout", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const before = await page.evaluate(
      async () =>
        ((await (await fetch("/api/data")).json()) as { data: State }).data,
    );
    await page.reload();
    const after = await page.evaluate(
      async () =>
        ((await (await fetch("/api/data")).json()) as { data: State }).data,
    );
    const e = after.draft!.exercises[0];
    expect(e.technique).toBe(technique);
    if (technique === "tempo")
      expect(e.tempo).toEqual({ eccentric: 4, pause: 2, concentric: 1 });
    else
      expect(e.sets.at(-1)).toMatchObject({
        bout:
          technique === "down-set"
            ? "down"
            : technique === "drop-set"
              ? "drop"
              : "giant",
        rest: 35,
        reps: 6,
        weight: technique === "giant-set" ? 20 : 15,
      });
    if (technique === "giant-set") expect(e.repGoal).toBe(25);
    expect(after.programs).toEqual(before.programs);
    expect(after.sessions).toEqual(before.sessions);
    expect(
      await page.locator(".set-row").first().locator(":scope > *").count(),
    ).toBe(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir("evidence/techniques/screenshots", { recursive: true });
    await page.screenshot({
      path: `evidence/techniques/screenshots/${technique}-390.png`,
      fullPage: true,
    });
  });
}

test("manual superset pairs round IDs and can unpair both untouched exercises", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page
    .getByLabel("Training technique", { exact: true })
    .selectOption("superset");
  await page
    .getByLabel("Partner exercise", { exact: true })
    .selectOption({ label: "Barbell bench press" });
  await page
    .getByRole("button", {
      name: "Apply technique to unlogged exercise",
      exact: true,
    })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const data = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  const pair = data.draft!.exercises.slice(0, 2);
  expect(pair.every((e) => e.technique === "superset")).toBe(true);
  expect(pair[0].sets[0].groupId).toBe(pair[1].sets[0].groupId);
  await page
    .getByRole("button", { name: "Unpair unlogged exercises", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  const after = await page.evaluate(
    async () =>
      ((await (await fetch("/api/data")).json()) as { data: State }).data,
  );
  expect(
    after
      .draft!.exercises.slice(0, 2)
      .every((e) => e.technique === "straight" && !e.techniqueGroup),
  ).toBe(true);
  expect(after.programs).toEqual(data.programs);
  expect(after.sessions).toEqual(data.sessions);
});

test("manual pre-exhaust orders isolation before its compound and persists paired metadata", async ({page})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page);
 await page.getByRole('button',{name:'Start Full body A',exact:true}).click();
 await page.getByRole('tab',{name:'Dumbbell lateral raise',exact:true}).click();
 await page.getByRole('button',{name:'Exercise options',exact:true}).click();
 await page.getByLabel('Training technique',{exact:true}).selectOption('pre-exhaust');
 await page.getByLabel('Partner exercise',{exact:true}).selectOption({label:'Barbell bench press'});
 await page.getByRole('button',{name:'Apply technique to unlogged exercise',exact:true}).click();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect(page.locator('.sync-status')).toHaveText('Synced');await page.reload();
 const data=await page.evaluate(async()=>((await(await fetch('/api/data')).json()) as {data:State}).data);
 const first=data.draft!.exercises.findIndex(e=>e.exerciseId==='lateral');
 const pair=data.draft!.exercises.slice(first,first+2);
 expect(pair.map(e=>e.exerciseId)).toEqual(['lateral','bench']);
 expect(pair.every(e=>e.technique==='pre-exhaust' && !!e.protocol)).toBe(true);
 expect(pair[0].sets[0].groupId).toBe(pair[1].sets[0].groupId);
 expect(data.sessions).toHaveLength(0);
});

test("manual myorep activation and mini bouts survive refresh in five-column mobile rows", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await fixture(page);
  await page
    .getByRole("button", { name: "Start Full body A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page
    .getByLabel("Training technique", { exact: true })
    .selectOption("myoreps");
  await page
    .getByRole("button", {
      name: "Apply technique to unlogged exercise",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Myoreps: activation + mini bouts",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(1);
  await expect(
    page.locator(".set-row").first().locator(":scope > *"),
  ).toHaveCount(5);
  await page
    .getByLabel("Barbell back squat set 1 weight", { exact: true })
    .fill("20");
  await page
    .getByRole("button", {
      name: "Complete Barbell back squat set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Add mini bout", exact: true })
    .click();
  await page.getByLabel("Bout load", { exact: true }).fill("20");
  await page.getByLabel("Bout reps", { exact: true }).fill("5");
  await page
    .getByLabel("Rest before bout (seconds)", { exact: true })
    .fill("25");
  await page
    .getByRole("button", { name: "Append raw bout", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(2);
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  await page.reload();
  await expect(page.locator(".set-row")).toHaveCount(2);
  await expect(
    page.getByLabel("Barbell back squat set 2 reps", { exact: true }),
  ).toHaveValue("5");
  await expect(page.locator(".set-number").nth(1)).toHaveText("M");
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page.getByText("Progression note", { exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Accept for unlogged sets", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Apply technique to unlogged exercise",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await mkdir("evidence/techniques/screenshots", { recursive: true });
  await page.screenshot({
    path: "evidence/techniques/screenshots/technique-360.png",
    fullPage: true,
  });
});
