import { test, expect } from "@playwright/test";
import { readData, writeData } from "./storage-client";
import { toggleTheme } from "./premium-controls";
import * as D from "../../src/domain";

for (const width of [360, 390, 1440])
  test(`one-button Android update, retry and cancellation at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
    const before = await (await readData(page)).json(),
      data = D.emptyState();
    data.profile = {
      name: "Synthetic update QA",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: ["Dumbbell"],
      days: 4,
    };
    data.programs = [D.starterProgram("balanced")];
    expect(
      (await writeData(page, { data: { ...before, data } })).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("region", { name: "App updates" })).toHaveCount(
      0,
    );
    await page.addInitScript(() => {
      const win = window as any;
      win.androidBridge = {};
      win.updateCalls = [];
      win.updateMode = "latest";
      const nativeMethods = [
        "request",
        "cancel",
        "bindProfile",
        "setTheme",
        "healthStatus",
        "healthSnapshot",
        "healthCancel",
        "notificationStatus",
        "restCancel",
      ];
      win.Capacitor = {
        PluginHeaders: [
          {
            name: "NeoformNative",
            methods: nativeMethods.map((name) => ({ name, rtype: "promise" })),
          },
          {
            name: "AppUpdates",
            methods: ["status", "check", "download", "install", "cancel"].map(
              (name) => ({ name, rtype: "promise" }),
            ),
          },
        ],
        nativePromise: async (plugin: string, method: string, o: any = {}) => {
          if (plugin === "AppUpdates") {
            win.updateCalls.push(method);
            if (method === "status")
              return { version: "1.1.0", versionCode: 53 };
            if (method === "check")
              return {
                status: win.updateMode === "latest" ? "latest" : "ready",
                version: "1.1.1",
                versionCode: 54,
              };
            if (method === "download") {
              if (win.updateMode === "broken")
                throw Error("Update verification failed. Try again.");
              if (win.updateMode === "hold")
                return new Promise((resolve) => {
                  win.finishUpdateDownload = () =>
                    resolve({ status: "ready", version: "1.1.1" });
                });
              return { status: "ready", version: "1.1.1" };
            }
            if (method === "install" && win.updateMode === "denied")
              throw Error(
                "Installation permission was not enabled. Try again.",
              );
            return {};
          }
          if (method === "request") {
            const response = await fetch(o.path, {
              method: o.method,
              body: o.body,
              headers: o.headers,
              credentials: "same-origin",
            });
            return { status: response.status, body: await response.text() };
          }
          if (method === "healthStatus")
            return { availability: "unsupported", permissions: [] };
          if (method === "healthSnapshot") return { snapshot: null };
          if (method === "notificationStatus")
            return { enabled: false, allowed: false, armed: false };
          return {};
        },
      };
    });
    await page.reload();
    await expect(page.locator(".sync-status")).toHaveText("Synced");
    await page.getByRole("button", { name: "More", exact: true }).click();
    if (width === 390) {
      await toggleTheme(page);
      await expect(page.locator(".sync-status")).toHaveText("Synced");
    }
    const baseline = (await (await readData(page)).json()).data;
    const panel = page.getByRole("region", { name: "App updates" });
    const button = panel.getByRole("button", {
      name: "Check for updates",
      exact: true,
    });
    await expect(panel).toContainText("Version 1.1.0 (53)");
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(panel.getByRole("status")).toHaveText("You’re up to date.");
    expect(
      await page.evaluate(() =>
        (window as any).updateCalls.includes("download"),
      ),
    ).toBe(false);
    await page.evaluate(() => {
      (window as any).updateMode = "broken";
    });
    await button.click();
    await expect(panel.getByRole("status")).toContainText(
      "verification failed",
    );
    expect(
      await page.evaluate(() =>
        (window as any).updateCalls.includes("install"),
      ),
    ).toBe(false);
    await page.evaluate(() => {
      (window as any).updateMode = "denied";
    });
    await button.click();
    await expect(panel.getByRole("status")).toContainText(
      "permission was not enabled",
    );
    await page.evaluate(() => {
      (window as any).updateMode = "ready";
    });
    await button.click();
    await expect(panel.getByRole("status")).toContainText(
      "Confirm the update in Android",
    );
    await expect(panel).toContainText("Version 1.1.0 (53)");
    await page.evaluate(() => {
      (window as any).updateMode = "hold";
      (window as any).updateCalls = [];
    });
    await button.click();
    await expect(
      panel.getByRole("button", { name: "Downloading update…", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).updateCalls.includes("cancel")),
      )
      .toBe(true);
    await page.evaluate(() => {
      (window as any).finishUpdateDownload();
    });
    await page.getByRole("button", { name: "More", exact: true }).click();
    expect(
      await page.evaluate(() =>
        (window as any).updateCalls.includes("install"),
      ),
    ).toBe(false);
    expect((await (await readData(page)).json()).data).toEqual(baseline);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.NEOFORM_QA_OUTPUT}/app-updates-${width}.png`,
    });
    expect(errors).toEqual([]);
  });
