import { test, expect, type Route } from "@playwright/test";
import { readData, writeData } from "./storage-client";
import { weeklyBrowserFixture } from "../weekly-muscle-fixture";
import { GEMINI_MODEL } from "../../src/aiProof";
const proof = {
  provider: "gemini",
  model: GEMINI_MODEL,
  inputTokens: 100,
  outputTokens: 60,
  toolCalls: 0,
  toolsProvided: 0,
  agentLoop: false,
};
for (const width of [360, 390, 1440])
  test(`Sharma Gemini connection, read-only coach and explicit program preview at ${width}px`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sharma Locked", exact: true })
      .click();
    await page
      .getByLabel("Profile password", { exact: true })
      .fill("QA-profile-pass");
    await page
      .getByRole("button", { name: "Unlock profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Who’s training?" }),
    ).toHaveCount(0);
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const initial = await (await readData(page)).json(),
      state = weeklyBrowserFixture(Date.now());
    state.profile!.name = "Synthetic private identity";
    state.sessions[0].notes = "Private note never sent";
    expect(
      (await writeData(page, { data: { ...initial, data: state } })).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Gemini coach & connection", { exact: true }).click();
    const key = "AQ.synthetic.browser-fixture-only-123456";
    await page.getByLabel("Gemini API key", { exact: true }).fill(key);
    await page
      .getByRole("button", { name: "Save Gemini key", exact: true })
      .click();
    await expect(
      page.getByText("Gemini key saved for this account.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Gemini API key", { exact: true }),
    ).toHaveValue("");
    await page.route("**/api/ai/test", (r) =>
      r.fulfill({ json: { connected: true, model: GEMINI_MODEL } }),
    );
    await page
      .getByRole("button", { name: "Test connection", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Key accepted" }),
    ).toBeVisible();
    const calls: any[] = [];
    let held: Route | undefined;
    await page.route("**/api/ai/chat", async (r) => {
      const data = r.request().postDataJSON();
      calls.push(data);
      if (data.question === "Wait for cancellation") {
        held = r;
        return;
      }
      expect(r.request().headers()["x-neoform-account"]).toBe(
        "public-workspace",
      );
      await r.fulfill({
        json: {
          reply: {
            answer:
              "Repeat your prescribed targets while confirming comparable effort.",
            sourceIds: [state.sessions[0].id],
            uncertainties: ["Unreported RIR stays unknown."],
            nextCheck: "Report effort next workout.",
          },
          proof,
        },
      });
    });
    await page
      .getByRole("button", { name: "Open Gemini coach", exact: true })
      .click();
    await page
      .getByLabel("Ask your coach", { exact: true })
      .fill("How should I progress my bench?");
    await page.getByRole("button", { name: "Ask Gemini", exact: true }).click();
    await expect(page.locator(".gemini-message.assistant")).toContainText(
      "Repeat your prescribed targets",
    );
    expect(JSON.stringify(calls[0])).not.toMatch(
      /Synthetic private identity|Private note never sent|AQ.synthetic/,
    );
    expect(
      calls[0].context.workouts
        .flatMap((w: any) => w.entries.flatMap((e: any) => e.sets))
        .some((s: any) => s.rir === null),
    ).toBe(true);
    expect((await (await readData(page)).json()).data).toEqual(state);
    await page
      .getByRole("button", { name: "Review my program", exact: true })
      .click();
    await expect(page.locator(".gemini-message.assistant")).toHaveCount(2);
    expect(calls[1].conversation).toHaveLength(2);
    await page
      .getByLabel("Ask your coach", { exact: true })
      .fill("Wait for cancellation");
    await page.getByRole("button", { name: "Ask Gemini", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Ask Gemini", exact: true }),
    ).toBeEnabled();
    await held
      ?.fulfill({
        json: {
          reply: {
            answer: "Stale reply",
            sourceIds: [],
            uncertainties: [],
            nextCheck: "Ignore",
          },
          proof,
        },
      })
      .catch(() => {});
    await expect(page.locator(".gemini-message.assistant")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/gemini-coach-${width}.png`,
      animations: "disabled",
    });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/gemini-dark-${width}.png`,
      animations: "disabled",
    });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "light"),
    );
    await page.route("**/api/ai/generate", async (r) => {
      expect(r.request().postDataJSON().trainingContext.workouts).toHaveLength(
        2,
      );
      await r.fulfill({
        json: {
          program: {
            name: "SYNTHETIC reviewed program",
            description: "Fixture only",
            weeks: 6,
            workouts: [0, 1].map((i) => ({
              name: "Day " + i,
              exercises: [
                {
                  exerciseId: "bench",
                  sets: 2,
                  min: 8,
                  max: 12,
                  rir: 3,
                  rest: 90,
                },
              ],
            })),
          },
          proof,
        },
      });
    });
    await page
      .getByRole("button", { name: "Generate a program", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Training days", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByRole("button", { name: "Generate preview", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review your program", exact: true }),
    ).toBeVisible();
    expect((await (await readData(page)).json()).data).toEqual(state);
    await page
      .getByRole("button", { name: "Save program", exact: true })
      .click();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const saved = (await (await readData(page)).json()).data;
    expect(saved.sessions).toEqual(state.sessions);
    expect(
      saved.programs.find((p: any) => p.id === state.programs[0].id),
    ).toEqual(state.programs[0]);
    expect(
      saved.programs.some((p: any) => p.name === "SYNTHETIC reviewed program"),
    ).toBe(true);
    expect(
      await page.evaluate(
        (k) =>
          JSON.stringify(localStorage).includes(k) ||
          JSON.stringify(sessionStorage).includes(k),
        key,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: "Start Weekly QA", exact: true })
      .click();
    await page
      .getByRole("button", { name: /^(Why\?|Review targets)$/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Explain with Gemini", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Explain recommendation", exact: true })
      .click();
    await expect(page.locator(".gemini-message.assistant")).toContainText(
      "Repeat your prescribed targets",
    );
    expect(calls.at(-1).context.focus.reason).toBeTruthy();
    expect(Array.isArray(calls.at(-1).context.focus.targets)).toBe(true);
    expect((await (await readData(page)).json()).data).toEqual(saved);
    for (let i = 0; i < 3; i++)
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Gemini coach & connection", { exact: true }).click();
    await page
      .getByRole("button", { name: "Remove Gemini key", exact: true })
      .click();
    await expect(
      page.getByText("Gemini key removed.", { exact: true }),
    ).toBeVisible();
    await page.getByText("Account & access", { exact: true }).click();
    await page
      .getByRole("button", { name: "Lock & switch profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abhishek Open profile", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/me")).json()).profileId,
      )
      .toBe("abhishek");
    await expect(page.getByRole("heading", { name: "Gemini AI" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Open Gemini coach", exact: true }),
    ).toHaveCount(0);
    const denied = await page.request.get("/api/ai/key", {
      headers: { "X-Neoform-Account": "workspace-profile:abhishek" },
    });
    expect(denied.status()).toBe(403);
    expect(errors).toEqual([]);
  });
