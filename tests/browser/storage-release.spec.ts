import { test, expect } from "@playwright/test";
import { fixture } from "./v2-fixture";
import { readData } from "./storage-client";
import * as D from "../../src/domain";
import {
  exportHistoryBackup,
  importHistoryBackup,
} from "../../src/historyBackup";
import { readFile } from "node:fs/promises";
test("sign out purges the signed-out account from both device databases", async ({
  page,
}) => {
  await fixture(page);
  const user = await (await page.request.get("/api/me")).json();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByText("Account & access", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  const counts = await page.evaluate(async (owner) => {
    const count = (name: string, store: string) =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction(store),
            q = t
              .objectStore(store)
              .count(IDBKeyRange.bound([owner, ""], [owner, "\uffff"]));
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      });
    return Promise.all([
      count("neoform-state-v2", "boxes"),
      count("neoform-history-v1", "plans"),
      count("neoform-history-v1", "receipts"),
    ]);
  }, user.id);
  expect(counts).toEqual([0, 0, 0]);
});
test("large backup restores through the logger, survives offline reload and exports exactly", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await fixture(page);
  const remote = await (await readData(page)).json(),
    state = remote.data as D.State;
  state.sessions = Array.from({ length: 600 }, (_, i) => {
    const e = D.createEntry(D.catalog[0]);
    e.sets[0].done = true;
    e.notes = "训练".repeat(300);
    const s = D.completeSession(D.startSession(`Synthetic ${i}`, [e]));
    s.notes = "é".repeat(1900);
    return s;
  });
  const blob = await exportHistoryBackup(state);
  expect(blob.size).toBeGreaterThan(D.MAX_BACKUP);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByText("Your data, portable.", { exact: true }).click();
  await page.getByLabel("Import JSON backup", { exact: true }).setInputFiles({
    name: "synthetic-history.jsonl",
    mimeType: "application/x-ndjson",
    buffer: Buffer.from(await blob.arrayBuffer()),
  });
  await expect(page.getByRole("dialog")).toContainText("600 sessions");
  await page
    .getByRole("button", { name: "Confirm replace", exact: true })
    .click();
  await expect(page.locator(".sync-status")).toHaveText("Synced", {
    timeout: 60000,
  });
  expect((await (await readData(page)).json()).data).toEqual(state);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON backup", exact: true })
    .click();
  const download = await downloaded,
    file = await download.path();
  expect(file).toBeTruthy();
  expect(
    await importHistoryBackup(
      new Blob([new Uint8Array(await readFile(file!))]),
    ),
  ).toEqual(state);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator(".sync-status")).toHaveText(
    "Offline · saved on device",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.setOffline(false);
  await page.locator(".sync-status").click();
  await expect(page.locator(".sync-status")).toHaveText("Synced", {
    timeout: 60000,
  });
  const final = (await (await readData(page)).json()).data as D.State;
  expect(final.sessions).toEqual(state.sessions);
  expect(final.settings.theme).toBe("dark");
});
