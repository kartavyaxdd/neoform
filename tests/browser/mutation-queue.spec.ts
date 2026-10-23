import { syntheticCoachingEvent } from "../coaching-fixture";
import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { MutationQueue } from "../../src/mutationQueue";
import { OfflineVault } from "../../src/offlineVault";
import {
  prepareHistoryMutation,
  type HistoryMutation,
} from "../../src/historyTransport";
import {
  emptyState,
  createEntry,
  catalog,
  startSession,
  completeSession,
} from "../../src/domain";
declare global {
  interface Window {
    __storageQA: {
      MutationQueue: typeof MutationQueue;
      OfflineVault: typeof OfflineVault;
    };
  }
}
let source: string;
test.beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents:
        "import {MutationQueue} from './src/mutationQueue'; import {OfflineVault} from './src/offlineVault'; globalThis.__storageQA={MutationQueue,OfflineVault};",
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  source = bundle.outputFiles[0].text;
});
async function mount(page: Page) {
  await page.route("**/__qa-storage", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Isolated storage QA</title>",
    }),
  );
  await page.goto("/__qa-storage");
  await page.addScriptTag({ content: source });
}
const mutation = () => {
  const base = emptyState(),
    next = structuredClone(base);
  next.settings.unit = "lb";
  return prepareHistoryMutation(base, next, 0);
};

test("queue preserves coaching manifests across reopen and repairs legacy count omission", async ({
  page,
}) => {
  await mount(page);
  const base = emptyState(),
    next = { ...base, coachingEvents: [syntheticCoachingEvent()] };
  const plan = prepareHistoryMutation(base, next, 0);
  const result = await page.evaluate(async (plan) => {
    const name = "neoform-qa-" + crypto.randomUUID();
    let q = await window.__storageQA.MutationQueue.open(name);
    await q.stage("a", plan);
    q.close();
    q = await window.__storageQA.MutationQueue.open(name);
    const recovered = await q.list("a");
    // Simulate the actual old manifest shape through its public staging path.
    const { coachingCount, ...legacy } = plan;
    await q.stage("b", legacy);
    q.close();
    q = await window.__storageQA.MutationQueue.open(name);
    await q.stage("b", plan);
    const repaired = await q.list("b");
    let rejected = false;
    try {
      await q.stage("b", { ...plan, coachingCount: 2 });
    } catch {
      rejected = true;
    }
    q.close();
    return { recovered, repaired, rejected };
  }, plan);
  expect(result.recovered).toEqual([plan]);
  expect(result.repaired).toEqual([plan]);
  expect(result.rejected).toBe(true);
});

test("normalized device journals preserve newer generations through acknowledgement and recreation", async ({
  page,
}) => {
  await mount(page);
  const state = emptyState(),
    plan = mutation();
  const result = await page.evaluate(
    async ({ state, plan }) => {
      const q = await window.__storageQA.OfflineVault.open(
        "neoform-qa-" + crypto.randomUUID(),
      );
      const base = { data: state, revision: 0 },
        first = { data: state, base, revision: 0, dirty: true, generation: 1 };
      await q.save("a", "journal", first);
      const newer = {
        ...first,
        generation: 2,
        data: {
          ...state,
          settings: { ...state.settings, theme: "dark" as const },
        },
      };
      await q.save("a", "journal", newer);
      await q.save(
        "a",
        "cache",
        {
          ...first,
          dirty: false,
          revision: 1,
          base: { data: state, revision: 1 },
        },
        [{ journal: "journal", generation: 1, revision: 1 }],
        { id: plan.id, revision: 1 },
      );
      const kept = await q.load("a", "journal");
      await q.save(
        "a",
        "cache",
        {
          ...newer,
          dirty: false,
          revision: 2,
          base: { data: newer.data, revision: 2 },
        },
        [{ journal: "journal", generation: 2, revision: 2 }],
      );
      const consumed = await q.load("a", "journal");
      await q.save("a", "journal", newer);
      const replay = await q.load("a", "journal");
      await q.save("a", "journal", { ...newer, generation: 3 });
      const recreated = await q.load("a", "journal");
      const other = await q.load("b", "cache"),
        ack = await q.acknowledgedOperation("a", plan.id);
      q.close();
      return { kept, consumed, replay, recreated, other, ack };
    },
    { state, plan },
  );
  expect(result.kept?.generation).toBe(2);
  expect(result.kept?.data.settings.theme).toBe("dark");
  expect(result.consumed).toBeNull();
  expect(result.replay).toBeNull();
  expect(result.recreated?.generation).toBe(3);
  expect(result.other).toBeNull();
  expect(result.ack?.revision).toBe(1);
});

test("a stale connection resets its normalized cache before applying a newer complete snapshot", async ({
  page,
}) => {
  await mount(page);
  const first = emptyState(),
    entry = createEntry(catalog[0]);
  entry.sets[0].done = true;
  first.sessions = [completeSession(startSession("One", [entry]))];
  const second = structuredClone(first);
  second.sessions.push({
    ...structuredClone(first.sessions[0]),
    id: crypto.randomUUID(),
    name: "Second",
  });
  const result = await page.evaluate(
    async ({ first, second }) => {
      const name = "neoform-qa-" + crypto.randomUUID(),
        a = await window.__storageQA.OfflineVault.open(name),
        b = await window.__storageQA.OfflineVault.open(name);
      const box = (data: typeof first, revision: number) => ({
        data,
        revision,
        dirty: false,
        generation: revision,
        base: { data, revision },
      });
      await a.save("a", "cache", box(first, 1));
      await b.save("a", "cache", box(second, 2));
      await a.save("a", "cache", box(first, 3));
      const loaded = await b.load("a", "cache");
      await Promise.all([
        a.save("a", "cache", box(second, 4)),
        a.save("a", "cache", box(first, 5)),
      ]);
      const overlapped = await b.load("a", "cache");
      await a.save("b", "cache", box(second, 1));
      await a.clearOwner("a");
      const cleared = await b.load("a", "cache"),
        other = await b.load("b", "cache");
      a.close();
      b.close();
      return { loaded, overlapped, cleared, other };
    },
    { first, second },
  );
  expect(result.loaded?.data).toEqual(first);
  expect(result.loaded?.revision).toBe(3);
  expect(result.overlapped?.data).toEqual(first);
  expect(result.cleared).toBeNull();
  expect(result.other?.data).toEqual(second);
});

test("native IndexedDB preserves pending transactions and receipts across reopen, scoped to the account", async ({
  page,
}) => {
  await mount(page);
  const plan = mutation(),
    name = "neoform-qa-" + crypto.randomUUID();
  const result = await page.evaluate(
    async ({ name, plan }) => {
      let q = await window.__storageQA.MutationQueue.open(name);
      await q.stage("account-a", plan);
      await q.stage("account-b", plan);
      q.close();
      q = await window.__storageQA.MutationQueue.open(name);
      const a = await q.list("account-a"),
        b = await q.list("account-b"),
        other = await q.list("account-c");
      const receipt = await q.acknowledge("account-a", plan.id, 1);
      q.close();
      q = await window.__storageQA.MutationQueue.open(name);
      const retry = await q.stage("account-a", plan),
        afterA = await q.list("account-a"),
        afterB = await q.list("account-b");
      q.close();
      return { a, b, other, receipt, retry, afterA, afterB };
    },
    { name, plan },
  );
  expect(result.a).toEqual([plan]);
  expect(result.b).toEqual([plan]);
  expect(result.other).toEqual([]);
  expect(result.receipt).toEqual(result.retry);
  expect(result.afterA).toEqual([]);
  expect(result.afterB).toEqual([plan]);
});

test("two actual tabs cannot overwrite one operation ID or resurrect it after an acknowledgement", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await mount(page);
  await mount(second);
  const name = "neoform-qa-" + crypto.randomUUID(),
    left = mutation(),
    right = structuredClone(left);
  right.header.settings.unit = "kg";
  const stage = (tab: Page, plan: HistoryMutation) =>
    tab.evaluate(
      async ({ name, plan }) => {
        const q = await window.__storageQA.MutationQueue.open(name);
        try {
          await q.stage("account-a", plan);
          return "stored";
        } catch (e) {
          return (e as Error).message;
        } finally {
          q.close();
        }
      },
      { name, plan },
    );
  const results = await Promise.all([stage(page, left), stage(second, right)]);
  expect(results.filter((r) => r === "stored")).toHaveLength(1);
  expect(results.filter((r) => r.includes("different changes"))).toHaveLength(
    1,
  );
  const winner = results[0] === "stored" ? left : right;
  await Promise.all([
    page.evaluate(
      async ({ name, id }) => {
        const q = await window.__storageQA.MutationQueue.open(name);
        try {
          await q.acknowledge("account-a", id, 1);
        } finally {
          q.close();
        }
      },
      { name, id: left.id },
    ),
    stage(second, winner),
  ]);
  await second.reload();
  await second.addScriptTag({ content: source });
  const final = await second.evaluate(
    async ({ name, winner }) => {
      const q = await window.__storageQA.MutationQueue.open(name);
      try {
        return {
          pending: await q.list("account-a"),
          receipt: await q.stage("account-a", winner),
        };
      } finally {
        q.close();
      }
    },
    { name, winner },
  );
  expect(final.pending).toEqual([]);
  expect(final.receipt?.revision).toBe(1);
  await second.close();
});

test("a mid-write storage failure aborts the entire transaction and preserves other pending work", async ({
  page,
}) => {
  await mount(page);
  const name = "neoform-qa-" + crypto.randomUUID(),
    first = mutation(),
    interrupted = mutation();
  interrupted.parts = [
    { upserts: [], deletes: [] },
    { upserts: [], deletes: [] },
  ];
  const result = await page.evaluate(
    async ({ name, first, interrupted }) => {
      const q = await window.__storageQA.MutationQueue.open(name);
      await q.stage("account-a", first);
      const original = IDBObjectStore.prototype.put;
      let writes = 0,
        failure = "";
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (++writes === 3)
          throw new DOMException(
            "Synthetic mid-write failure",
            "QuotaExceededError",
          );
        return original.apply(this, args);
      };
      try {
        await q.stage("account-a", interrupted);
      } catch (e) {
        failure = (e as Error).name;
      } finally {
        IDBObjectStore.prototype.put = original;
      }
      const after = await q.list("account-a");
      await q.stage("account-a", interrupted);
      let rejected = false;
      try {
        await q.acknowledge("account-a", interrupted.id, 9);
      } catch {
        rejected = true;
      }
      const kept = await q.list("account-a");
      await q.acknowledge("account-a", interrupted.id, 1);
      const final = await q.list("account-a");
      q.close();
      return { failure, after, rejected, kept, final };
    },
    { name, first, interrupted },
  );
  expect(result.failure).toBe("QuotaExceededError");
  expect(result.after).toEqual([first]);
  expect(result.rejected).toBe(true);
  expect(result.kept).toHaveLength(2);
  expect(result.final).toEqual([first]);
});

test("coaching ledger and target changes commit atomically in native IndexedDB", async ({
  page,
}) => {
  await mount(page);
  const first = emptyState(),
    second = { ...first, coachingEvents: [syntheticCoachingEvent()] };
  const result = await page.evaluate(
    async ({ first, second }) => {
      const name = "neoform-qa-" + crypto.randomUUID();
      let a = await window.__storageQA.OfflineVault.open(name);
      const box = (data: typeof first, revision: number) => ({
        data,
        revision,
        dirty: false,
        generation: revision,
        base: { data, revision },
      });
      await a.save("a", "cache", box(first, 1));
      const original = IDBObjectStore.prototype.put;
      let writes = 0,
        rejected = false;
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (++writes === 2)
          throw new DOMException(
            "Synthetic device failure",
            "QuotaExceededError",
          );
        return original.apply(this, args);
      };
      try {
        await a.save("a", "cache", box(second, 2));
      } catch {
        rejected = true;
      } finally {
        IDBObjectStore.prototype.put = original;
      }
      const rolledBack = await a.load("a", "cache");
      await a.save("a", "cache", box(second, 2));
      a.close();
      a = await window.__storageQA.OfflineVault.open(name);
      const reopened = await a.load("a", "cache");
      await a.save("b", "cache", box(second, 1));
      await a.clearOwner("a");
      const purged = await a.load("a", "cache"),
        other = await a.load("b", "cache");
      a.close();
      return { rejected, rolledBack, reopened, purged, other };
    },
    { first, second },
  );
  expect(result.rejected).toBe(true);
  expect(result.rolledBack!.data).toEqual(first);
  expect(result.reopened!.data).toEqual(second);
  expect(result.purged).toBeNull();
  expect(result.other!.data).toEqual(second);
});
