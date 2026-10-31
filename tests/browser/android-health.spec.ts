import { test, expect } from "@playwright/test";
import { readData, writeData } from "./storage-client";
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
        "healthSnapshot",
        "healthConnect",
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
      let connected = false,
        bound: string | null = null;
      const now = Date.now();
      const records = Array.from({ length: 8 }, (_, i) => ({
        id: `health-private-fixture-${i}`,
        kind: "sleep",
        source: "health-private-ring",
        sourceName: "Synthetic ring source",
        startAt: now - i * 86400000 - (i ? 10 : 6) * 3600000,
        endAt: now - i * 86400000 - 2 * 3600000,
        day: new Date(now - i * 86400000).toISOString().slice(0, 10),
        value: i ? 480 : 240,
        unit: "min",
      }));
      const snapshot = () =>
        connected
          ? {
              version: 1,
              syncedAt: now,
              enabled: true,
              records,
              sources: {},
              permissions: ["sleep"],
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
              permissions: connected ? ["sleep"] : [],
            };
          if (method === "healthConnect") {
            connected = true;
            return {};
          }
          if (method === "healthDelete" || method === "healthDisconnect") {
            connected = false;
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
