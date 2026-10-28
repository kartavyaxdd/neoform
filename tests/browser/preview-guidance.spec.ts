import { test, expect } from "@playwright/test";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";

for (const width of [360, 390, 1440])
  for (const scope of ["session", "program"] as const) {
    test(`preview advice is staged and saved with explicit ${scope} scope at ${width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
      else await fixture(page);
      const remote = await (await readData(page)).json(),
        state = D.emptyState();
      state.profile = {
        name: "Guidance QA",
        experience: "Intermediate",
        goal: "Build muscle",
        equipment: ["Barbell"],
        days: 4,
      };
      const program = D.starterProgram("balanced"),
        workout = program.workouts[0];
      workout.name = "Guidance QA";
      workout.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
      program.workouts = [workout];
      state.programs = [program];
      const prior = D.startSession(
        "Comparable history",
        D.prepareWorkout(workout, program, D.catalog, []),
        program,
        workout,
      );
      prior.startedAt = Date.now() - 3 * 86400000;
      prior.date = new Date(prior.startedAt).toISOString().slice(0, 10);
      prior.duration = 3600;
      prior.exercises[0].sets.forEach((t, i) =>
        Object.assign(t, {
          weight: 50,
          reps: [10, 9, 8][i],
          done: true,
          effortReported: true,
          prescription: { ...t.prescription!, weight: 50 },
        }),
      );
      prior.exercises[0].coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: prior.startedAt + 3600000,
      };
      state.sessions = [prior];
      await writeData(page, { data: { ...remote, data: state } });
      await page.reload();
      await expect(page.locator(".sync-status")).toHaveText("Synced");
      await page
        .getByRole("button", { name: "Start Guidance QA", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Readiness", exact: true })
        .click();
      await page
        .getByLabel("Systemic fatigue now", { exact: true })
        .selectOption("1");
      await page
        .getByLabel("Unscoped pain now", { exact: true })
        .selectOption("no");
      await page
        .getByLabel("Broader context today", { exact: true })
        .selectOption("usual");
      await page
        .getByLabel("Chest readiness", { exact: true })
        .selectOption("yes");
      await page
        .getByLabel("Chest pain now", { exact: true })
        .selectOption("no");
      await page
        .getByLabel("Chest soreness now", { exact: true })
        .selectOption("1");
      await page
        .getByRole("checkbox", {
          name: "These answers describe how I feel now.",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Save current readiness", exact: true })
        .click();
      await expect(page.locator(".preview-guidance-row")).toContainText(
        "Add a rep",
      );
      await page
        .getByRole("button", { name: "Review targets", exact: true })
        .click();
      await expect(
        page.getByRole("table", { name: "Current and proposed targets" }),
      ).toContainText("10");
      await page
        .getByLabel("Guidance scope", { exact: true })
        .selectOption(scope);
      await page
        .getByRole("button", { name: "Queue targets", exact: true })
        .click();
      await expect(page.locator(".preview-guidance-row")).toContainText(
        scope === "session" ? "Queued for today" : "Queued for future workouts",
      );
      const beforeStart = (await (await readData(page)).json()).data;
      expect(beforeStart.draft).toBeNull();
      expect(beforeStart.coachingEvents ?? []).toEqual([]);
      expect(beforeStart.programs).toEqual(state.programs);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${process.env.NEOFORM_QA_OUTPUT}/preview-${scope}-${width}.png`,
        animations: "disabled",
      });
      const offline = width === 390 && scope === "session";
      if (offline) {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
        });
        await context.setOffline(true);
      }
      await page
        .getByRole("button", { name: "Start workout", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "Barbell bench press", exact: true }),
      ).toBeVisible();
      if (offline) {
        await expect(page.locator(".sync-status")).toHaveText(
          "Saved on device",
        );
        await page.reload();
        await expect(
          page.getByRole("tab", { name: "Barbell bench press", exact: true }),
        ).toBeVisible();
        await context.setOffline(false);
      }
      await expect(page.locator(".sync-status")).toHaveText("Synced");
      const saved = (await (await readData(page)).json()).data as D.State;
      expect(saved.sessions).toEqual(state.sessions);
      expect(saved.coachingEvents).toHaveLength(1);
      expect(saved.coachingEvents![0].scope).toBe(scope);
      expect(saved.draft!.exercises[0].sets.map((t) => t.reps)).toEqual(
        scope === "session" ? [10, 9, 9] : [8, 8, 8],
      );
      expect(
        saved.draft!.exercises[0].sets.every((t) => t.effortReported === false),
      ).toBe(true);
      if (scope === "session") expect(saved.programs).toEqual(state.programs);
      else
        expect(
          saved.programs[0].workouts[0].exercises[0].nextRows!.map(
            (r) => r.reps,
          ),
        ).toEqual([10, 9, 9]);
      await expect(
        page.getByLabel("Barbell bench press set 1 RIR", { exact: true }),
      ).toHaveValue("");
    });
  }
