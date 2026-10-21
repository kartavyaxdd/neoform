import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as D from "../../src/domain";
import { fixture } from "./v2-fixture";
import { readData, writeData } from "./storage-client";
for (const width of [360, 390, 1440])
  test(`past workout recap, private share poster and chime controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (
        text,
        ...args: Parameters<typeof original> extends [string, ...infer R]
          ? R
          : never
      ) {
        ((window as any).qaPosterText ??= []).push(text);
        return original.call(this, text, ...args);
      };
      Object.defineProperty(navigator, "audioSession", {
        configurable: true,
        value: { type: "auto" },
      });
    });
    if (process.env.NEOFORM_QA_MODE === "public") await page.goto("/");
    else await fixture(page);
    const remote = await (await readData(page)).json(),
      state = D.emptyState(),
      program = D.starterProgram("balanced"),
      workout = program.workouts[0];
    state.profile = {
      name: "PRIVATE_NAME_DONT_SHARE",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Barbell"],
      days: 4,
    };
    program.workouts = [workout];
    workout.exercises = [D.target("bench")];
    state.programs = [program];
    const make = (name: string, reps: number, days: number) => {
      const e = D.createEntry(
        D.catalog.find((x) => x.id === "bench")!,
        workout.exercises[0],
      );
      e.sets.forEach((t) =>
        Object.assign(t, {
          weight: 50,
          reps,
          done: true,
          effortReported: true,
          rir: 2,
        }),
      );
      const s = D.startSession(name, [e], program, workout);
      s.startedAt -= days * 86400000;
      s.date = new Date(s.startedAt).toISOString().slice(0, 10);
      s.duration = 3600;
      s.bodyweight = { kg: 60, at: s.startedAt };
      s.notes = "PRIVATE_NOTES";
      return s;
    };
    const prior = make("Earlier baseline", 10, 3),
      current = make("Golden session", 11, 0);
    state.sessions = [prior, current];
    expect(
      (await writeData(page, { data: { ...remote, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: /Golden session/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Workout recap");
    await expect(page.locator(".recap-score")).toContainText("+125");
    await expect(page.locator(".recap-body .body-maps svg")).toHaveCount(2);
    await expect(page.locator(".recap-body")).toHaveCSS(
      "background-image",
      "none",
    );
    await expect(page.locator(".recap-exercises > details")).toHaveCount(1);
    await page.locator(".recap-exercises > details > summary").click();
    await expect(page.locator(".recap-exercises table")).toContainText("RIR");
    await expect(page.locator(".recap-exercises table tbody tr")).toHaveCount(
      3,
    );
    await page.locator(".recap-exercises > details > summary").click();
    await expect(page.locator(".recap-records li")).toHaveCount(1);
    await expect(page.locator(".recap-records")).toContainText("10 → 11");
    await expect(page.locator(".recap-energy")).toContainText("210–360");
    await page
      .getByRole("dialog")
      .locator(".modal-body")
      .evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/recap-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Create share poster", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save PNG", exact: true }),
    ).toBeEnabled();
    const texts = await page.evaluate(() =>
      (window as any).qaPosterText.join("\n"),
    );
    expect(texts).not.toContain("PRIVATE_NAME");
    expect(texts).not.toContain("PRIVATE_NOTES");
    expect(texts).toContain("~210–360");
    await page
      .getByRole("checkbox", {
        name: "Include estimated calories",
        exact: true,
      })
      .uncheck();
    await expect(
      page.getByRole("button", { name: "Save PNG", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => ((window as any).qaPosterText = []));
    await page
      .getByRole("button", { name: "Hide poster", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create share poster", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save PNG", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() => (window as any).qaPosterText.join("\n")),
    ).not.toContain("KCAL");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save PNG", exact: true }).click();
    const image = await pending;
    const path = `${process.env.NEOFORM_QA_OUTPUT}/story-${width}.png`;
    await image.saveAs(path);
    const png = await readFile(path);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1920);
    expect(png.length).toBeGreaterThan(20000);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: `Start ${workout.name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rest timer controls", exact: true })
      .click();
    const volume = page.getByRole("slider", {
      name: "In-app chime volume",
      exact: true,
    });
    await volume.fill("0.4");
    await page
      .getByRole("button", { name: "Preview in-app chime", exact: true })
      .click();
    expect(
      await page.evaluate(() => (navigator as any).audioSession.type),
    ).toBe("ambient");
    await expect(page.getByRole("dialog")).toContainText("controlled by iOS");
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Rest timer controls", exact: true })
      .click();
    await expect(
      page.getByRole("slider", { name: "In-app chime volume", exact: true }),
    ).toHaveValue("0.4");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.programs).toEqual(state.programs);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
