import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
test("history navigation, Undo and adding sets never save until explicit submission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
  else await fixture(page);
  const remote = await (await readData(page)).json(),
    state = D.emptyState();
  state.profile = {
    name: "History QA",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell", "Dumbbell"],
    days: 4,
  };
  const entries = [D.createEntry(D.catalog[0]), D.createEntry(D.catalog[1])];
  entries.forEach((e) => e.sets.forEach((t) => (t.done = true)));
  state.sessions = [
    D.completeSession(D.startSession("History controls QA", entries)),
  ];
  await writeData(page, { data: { ...remote, data: state } });
  await page.reload();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: /History controls QA/ }).click();
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await page.getByRole("tab", { name: D.catalog[1].name, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Edit logged session");
  await page
    .getByRole("button", {
      name: `Undo ${D.catalog[1].name} set 1`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(4);
  expect((await (await readData(page)).json()).data.sessions).toEqual(
    state.sessions,
  );
  await expect(
    page.getByRole("button", {
      name: `Undo ${D.catalog[1].name} set 4`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save journal changes", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced");
  const saved = (await (await readData(page)).json()).data.sessions[0];
  expect(saved.exercises[1].sets).toHaveLength(3);
  expect(
    saved.exercises[1].sets.some(
      (t: D.SetLog) => t.id === entries[1].sets[0].id,
    ),
  ).toBe(false);
  expect(saved.exercises[0]).toEqual(entries[0]);
});
for (const width of [360, 390, 1440])
  test(`gym rewards, drag, swipe, finish and rest settings at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: () => {
          sessionStorage.setItem(
            "qa:pr-haptics",
            String(Number(sessionStorage.getItem("qa:pr-haptics") ?? 0) + 1),
          );
          return true;
        },
      }),
    );
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState(),
      program = D.starterProgram("balanced"),
      workout = program.workouts[0];
    state.profile = {
      name: "Synthetic gym QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell", "Dumbbell"],
      days: 4,
    };
    workout.name = "Gym QA";
    workout.exercises = [D.target("bench"), D.target("db-row")];
    program.workouts = [workout];
    state.programs = [program];
    const entry = D.createEntry(
      D.catalog.find((x) => x.id === "bench")!,
      workout.exercises[0],
    );
    entry.sets.forEach((t) =>
      Object.assign(t, {
        weight: 50,
        reps: 10,
        done: true,
        effortReported: true,
        rir: 2,
        prescription: { ...t.prescription!, weight: 50 },
      }),
    );
    const prior = D.startSession("Prior synthetic", [entry], program, workout);
    prior.startedAt = Date.now() - 3 * 86400000;
    prior.date = new Date(prior.startedAt).toISOString().slice(0, 10);
    prior.duration = 3600;
    state.sessions = [prior];
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Start Gym QA", exact: true })
      .click();
    const handle = page.getByRole("button", {
        name: "Drag Barbell bench press",
        exact: true,
      }),
      target = page.locator(".queue-row").nth(1);
    await target.scrollIntoViewIfNeeded();
    const a = await handle.boundingBox(),
      b = await target.boundingBox();
    await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.move(b!.x + 40, b!.y + b!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".queue-name").first()).toContainText(
      "Single-arm dumbbell row",
    );
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await expect(page.getByRole("tab").first()).toHaveAccessibleName(
      "Single-arm dumbbell row",
    );
    await page
      .getByRole("button", { name: "Exercise queue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Move Barbell bench press up", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Move Barbell bench press down",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Save order for future workouts",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Order saved for future workouts.",
    );
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const reordered = (await (await readData(page)).json()).data;
    expect(
      reordered.programs[0].workouts[0].exercises.map((e: any) => e.exerciseId),
    ).toEqual(["db-row", "bench"]);
    expect(reordered.sessions).toEqual(state.sessions);
    await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
    await page
      .getByRole("tab", { name: "Barbell bench press", exact: true })
      .click();
    const headingBox = await page
        .getByRole("heading", { name: "Barbell bench press", exact: true })
        .boundingBox(),
      queueBox = await page
        .getByRole("button", { name: "Exercise queue", exact: true })
        .boundingBox();
    expect(queueBox!.x).toBeGreaterThan(headingBox!.x);
    expect(queueBox!.y).toBeLessThan(headingBox!.y + headingBox!.height);
    const num = page.locator(".set-row .previous-set").first(),
      box = await num.boundingBox();
    await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      Math.max(2, box!.x + box!.width - 100),
      box!.y + box!.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.locator(".set-row")).toHaveCount(2);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".set-row")).toHaveCount(3);
    await page
      .getByLabel("Barbell bench press set 1 weight", { exact: true })
      .fill("50");
    await page
      .getByLabel("Barbell bench press set 1 reps", { exact: true })
      .fill("11");
    const rir = page.getByLabel("Barbell bench press set 1 RIR", {
      exact: true,
    });
    await rir.fill("0");
    const red = await rir.evaluate((el) => getComputedStyle(el).color);
    await rir.fill("10");
    expect(await rir.evaluate((el) => getComputedStyle(el).color)).not.toBe(
      red,
    );
    await rir.fill("2");
    await expect(
      page.getByLabel("Barbell bench press set 2 RIR", { exact: true }),
    ).toHaveValue("");
    const inputsBeforePR = await page
      .getByLabel("Barbell bench press set 2 reps", { exact: true })
      .boundingBox();
    await page
      .getByRole("button", {
        name: "Complete Barbell bench press set 1",
        exact: true,
      })
      .click();
    await expect(page.locator(".pr-banner")).toContainText("Rep PR: 10 → 11");
    expect(
      (
        await page
          .getByLabel("Barbell bench press set 2 reps", { exact: true })
          .boundingBox()
      )?.y,
    ).toBe(inputsBeforePR?.y);
    await expect(page.locator(".pr-banner")).toHaveCSS(
      "animation-name",
      "none",
    );
    await page
      .getByRole("button", {
        name: "Undo Barbell bench press set 1",
        exact: true,
      })
      .click();
    await expect(page.locator(".pr-banner")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Complete Barbell bench press set 1",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Rest timer controls", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Foreground");
    if (width === 360) {
      await page.evaluate(() =>
        Object.defineProperty(Notification, "requestPermission", {
          configurable: true,
          value: async () => "denied",
        }),
      );
      await page
        .getByRole("button", { name: "Enable rest notifications", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Notifications are not allowed",
      );
      await expect(
        page.getByRole("button", {
          name: "Enable rest notifications",
          exact: true,
        }),
      ).toBeVisible();
      // Real isolated gateway/DO scheduling; only browser permission and the
      // OS-issued subscription are synthetic. No push is delivered externally.
      await page.evaluate(() => {
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => "granted",
        });
        Object.defineProperty(Notification, "requestPermission", {
          configurable: true,
          value: async () => "granted",
        });
        Object.defineProperty(PushManager.prototype, "getSubscription", {
          configurable: true,
          value: async () => ({
            toJSON: () => ({
              endpoint:
                "https://web.push.apple.com/browser-synthetic-never-delivered",
              expirationTime: null,
              keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
            }),
          }),
        });
      });
      await page
        .getByRole("button", { name: "Enable rest notifications", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Lock-screen alert armed",
      );
      await page
        .getByRole("button", { name: "Pause timer", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "No background rest alert armed",
      );
      await page
        .getByRole("button", { name: "+30 seconds", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Resume timer", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Lock-screen alert armed",
      );
      await context.setOffline(true);
      await page
        .getByRole("button", { name: "Pause timer", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Offline: background alert is not armed",
      );
      await context.setOffline(false);
      await expect(page.getByRole("dialog")).toContainText(
        "No background rest alert armed",
      );
      await page
        .getByRole("button", { name: "Disable notifications", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Rest notifications disabled",
      );
      await page.addInitScript(() =>
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => "granted",
        }),
      );
      await page.reload();
      await page
        .getByRole("button", { name: "Rest timer controls", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Enable rest notifications",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", {
          name: "Disable notifications",
          exact: true,
        }),
      ).toHaveCount(0);
    }
    await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Barbell bench press", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Single-arm dumbbell row", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("tab", { name: "Barbell bench press", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Complete Barbell bench press set 2",
        exact: true,
      })
      .click();
    expect(
      await page.evaluate(() => sessionStorage.getItem("qa:pr-haptics")),
    ).toBe("1");
    await page
      .getByRole("button", { name: "Finish session", exact: true })
      .click();
    await expect(
      page.getByText("How did it feel?", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Barbell bench press review set 1 reps", { exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Good", exact: true }).click();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/gym-finish-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Save workout", exact: true })
      .click();
    await expect(page.locator(".workout-celebration")).toContainText("+125 XP");
    await context.setOffline(false);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data as D.State;
    expect(saved.sessions.find((s) => s.id === prior.id)).toEqual(prior);
    expect(saved.sessions.find((s) => s.id !== prior.id)?.sessionFeeling).toBe(
      "good",
    );
    expect(saved.draft).toBeNull();
    expect(saved.programs[0].workouts[0].exercises.map((e) => e.id)).toEqual(
      [...workout.exercises].reverse().map((e) => e.id),
    );
    await page.reload();
    await expect(page.locator(".workout-celebration")).toHaveCount(0);
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator(".reward-progress")).toContainText("225 XP");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/gym-rewards-${width}.png`,
      animations: "disabled",
    });
  });
