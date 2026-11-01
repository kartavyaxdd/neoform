import { test, expect } from "@playwright/test";
import { readData, writeData } from "./storage-client";
import * as D from "../../src/domain";
import { closeSheets } from "./premium-controls";
import { liftProgressFixture } from "../lift-progress-fixture";
import { weeklyBrowserFixture } from "../weekly-muscle-fixture";

for (const width of [360, 390, 1440])
  test(`Android health bridge and private reviewed context at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [],
      uploads: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.url().includes("/api/")) uploads.push(r.postData() ?? "");
    });
    await page.setViewportSize({ width, height: 900 });
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
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    const remote = await (await readData(page)).json();
    const fixture = weeklyBrowserFixture(Date.now());
    expect(
      (await writeData(page, { data: { ...remote, data: fixture } })).status(),
    ).toBe(200);
    // This is a synthetic native bridge against this run's real isolated Worker/D1,
    // not a claim that browser emulation reads Android sensors.
    await page.addInitScript(() => {
      const win = window as any;
      win.androidBridge = {};
      const methods = [
        "request",
        "cancel",
        "bindProfile",
        "healthStatus",
        "healthPreferences",
        "healthReserveReduction",
        "healthEnableBackground",
        "healthDisableBackground",
        "healthSnapshot",
        "healthConnect",
        "healthCancel",
        "healthSync",
        "healthSources",
        "healthDelete",
        "healthDisconnect",
        "openHealthSettings",
        "notificationStatus",
        "restCancel",
        "restSchedule",
        "enableNotifications",
        "disableNotifications",
      ];
      let connected = sessionStorage.getItem("qa-health-connected") === "yes",
        bound: string | null = null;
      let firstPermission = true;
      let controls = JSON.parse(
        sessionStorage.getItem("qa-health-controls") ?? "{}",
      );
      const saveControls = () =>
        sessionStorage.setItem("qa-health-controls", JSON.stringify(controls));
      const now = Date.now();
      const records = Array.from({ length: 23 }, (_, i) => ({
        id: `health-private-fixture-${i}`,
        kind: "sleep",
        source: "health-private-ring",
        sourceName: "Synthetic ring source",
        startAt: now - i * 86400000 - (i ? 10 : 6) * 3600000,
        endAt: now - i * 86400000 - 2 * 3600000,
        day: new Date(now - i * 86400000).toISOString().slice(0, 10),
        value: i ? 480 : 240,
        unit: "min",
        asleepMinutes: i ? 450 : 200,
        awakeMinutes: i ? 30 : 40,
        stageCoverage: 1,
      }));
      for (let i = 0; i < 23; i++)
        for (const kind of ["hrv-rmssd", "resting-heart-rate"]) {
          const endAt = now - i * 86400000 - 2 * 3600000;
          records.push({
            id: `health-private-${kind}-${i}`,
            kind,
            source: "health-private-ring",
            sourceName: "Synthetic ring source",
            startAt: endAt,
            endAt,
            day: new Date(now - i * 86400000).toISOString().slice(0, 10),
            value: kind === "hrv-rmssd" ? (i ? 50 : 10) : i ? 60 : 72,
            unit: kind === "hrv-rmssd" ? "ms" : "bpm",
          } as any);
        }
      const snapshot = () =>
        connected
          ? {
              version: 2,
              syncedAt: now,
              enabled: true,
              records,
              sources: {},
              permissions: ["sleep", "hrv-rmssd", "resting-heart-rate"],
            }
          : null;
      win.Capacitor = {
        PluginHeaders: [
          {
            name: "NeoformNative",
            methods: methods.map((name) => ({ name, rtype: "promise" })),
          },
        ],
        nativePromise: async (_plugin: string, method: string, o: any = {}) => {
          if (method === "request") {
            const response = await fetch(o.path, {
              method: o.method,
              body: o.body,
              headers: o.headers,
              credentials: "same-origin",
            });
            return { status: response.status, body: await response.text() };
          }
          if (method === "bindProfile") {
            bound = o.profile;
            return {};
          }
          if (method === "notificationStatus")
            return { enabled: false, allowed: false, armed: false };
          if (method === "healthStatus")
            return {
              availability: "available",
              permissions: connected
                ? ["sleep", "hrv-rmssd", "resting-heart-rate"]
                : [],
              backgroundSupported: true,
              backgroundGranted: controls.backgroundEnabled === true,
              controls: JSON.parse(JSON.stringify(controls)),
            };
          if (
            method === "healthEnableBackground" ||
            method === "healthDisableBackground"
          ) {
            controls.backgroundEnabled = method === "healthEnableBackground";
            saveControls();
            return {};
          }
          if (method === "healthPreferences") {
            controls.autoReduce = o.autoReduce;
            saveControls();
            return { controls };
          }
          if (method === "healthReserveReduction") {
            const key = `${o.session}:${o.entry}`;
            if (
              !controls.autoReduce ||
              (controls.reductions ?? []).includes(key)
            )
              return { reserved: false };
            controls.reductions = [...(controls.reductions ?? []), key];
            controls.undo = o.undo;
            saveControls();
            return { reserved: true };
          }
          if (method === "healthConnect") {
            if (firstPermission) {
              firstPermission = false;
              return new Promise<void>((resolve) => {
                win.__finishHealthPermission = resolve;
              });
            }
            connected = true;
            sessionStorage.setItem("qa-health-connected", "yes");
            return {};
          }
          if (method === "healthDelete" || method === "healthDisconnect") {
            connected = false;
            sessionStorage.removeItem("qa-health-connected");
            controls = {};
            saveControls();
            return {};
          }
          if (
            method === "healthSnapshot" ||
            method === "healthSync" ||
            method === "healthSources"
          ) {
            if (bound !== "sharma") throw Error("wrong profile");
            return { snapshot: snapshot() };
          }
          return {};
        },
      };
    });
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Health Connect", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Connect Health Connect", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Connect Health Connect", exact: true })
      .click();
    await expect(
      page.getByText("Opening Android health permissions…", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel connection", exact: true })
      .click();
    await page.evaluate(() => (window as any).__finishHealthPermission());
    await expect(
      page.getByText(
        "Connection stopped. You can review permissions or try syncing again. Existing workout data is unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator(".health-context")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Connect Health Connect", exact: true })
      .click();
    await expect(
      page.getByText("Saved privately on this phone. No cloud upload.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.locator(".health-context > summary").click();
    await expect(page.locator(".health-context")).toContainText("240 min");
    await expect(page.locator(".health-context")).toContainText(
      "Synthetic ring source",
    );
    await expect(page.locator(".health-context")).toContainText(
      "Did you actually sleep poorly?",
    );
    const current = await (await readData(page)).json();
    expect(JSON.stringify(current)).not.toContain("health-private");
    expect(current.data.sessions).toEqual(fixture.sessions);
    expect(current.data.programs).toEqual(fixture.programs);
    await expect(
      page.getByRole("region", { name: "Recovery estimate", exact: true }),
    ).toContainText("Lower signals");
    await page
      .getByRole("button", {
        name: "Enable private background imports",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Disable background imports",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "Automatic next-set load reductions",
        exact: true,
      })
      .check();
    const training = liftProgressFixture();
    training.profile = fixture.profile;
    const p = training.programs[0],
      w = p.workouts[0];
    w.exercises[0].setup = {
      label: "QA rack",
      execution: "Same ROM",
      availableLoads: [45, 50, 55],
    };
    const session = D.startSession(
      w.name,
      D.prepareWorkout(w, p, D.catalog, training.sessions),
      p,
      w,
    );
    session.readiness = {
      recordedAt: Date.now(),
      pain: false,
      fatigue: 3,
      context: "changed",
      factors: ["poor-sleep"],
      muscles: [],
    };
    const entry = session.exercises[0];
    entry.sets.forEach((t) => {
      t.weight = 50;
      t.prescription!.weight = 50;
    });
    Object.assign(entry.sets[0], {
      done: true,
      reps: 6,
      rir: 0,
      effortReported: true,
    });
    training.draft = session;
    const beforeTraining = await (await readData(page)).json();
    expect(
      (
        await writeData(page, { data: { ...beforeTraining, data: training } })
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "Workout", exact: true }).click();
    await page
      .getByRole("button", { name: "Resume session", exact: true })
      .click();
    const input = page.getByLabel("Barbell bench press set 2 weight", {
      exact: true,
    });
    await expect(input).toHaveValue("50");
    await page
      .getByRole("button", { name: "Live next-set guidance", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "The last completed set used usual rest and the same execution.",
        exact: true,
      })
      .check();
    await closeSheets(page);
    await expect(input).toHaveValue("45");
    await expect(
      page.getByRole("button", { name: "Undo load change", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Undo load change", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Undo load change", exact: true })
      .click();
    await expect(
      page.getByLabel("Barbell bench press set 2 weight", { exact: true }),
    ).toHaveValue("50");
    const afterUndo = (await (await readData(page)).json()).data;
    expect(afterUndo.programs).toEqual(training.programs);
    expect(afterUndo.sessions).toEqual(training.sessions);
    await page
      .getByRole("button", { name: "Session options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Minimize workout", exact: true })
      .click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Recovery estimate", exact: true }),
    ).toContainText("Lower signals");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/android-recovery-${width}.png`,
    });
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("region", { name: "Recovery estimate", exact: true }),
    ).toContainText("Lower signals");
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/android-recovery-dark-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByText("Health Connect", { exact: true }).click();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(
      page.getByText("Disconnected. Imported data deleted from this phone.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".health-context")).toHaveCount(0);
    await expect(
      page.getByText(
        "Permissions: None granted. Allow only what you want to share.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(uploads.some((b) => b.includes("health-private"))).toBe(false);
    expect(errors).toEqual([]);
  });
