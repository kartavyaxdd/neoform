import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { emptyState } from "../../src/domain";
declare global {
  interface Window {
    __race: any;
  }
}
let source = "";
test.beforeAll(async () => {
  const b = await build({
    stdin: {
      contents:
        "import * as store from './src/store';import {OfflineVault} from './src/offlineVault';window.__race.store=store;window.__race.Vault=OfflineVault;",
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    plugins: [
      {
        name: "snapshot-fixture",
        setup(build) {
          build.onResolve({ filter: /^react$/ }, () => ({
            path: "react",
            namespace: "fixture",
          }));
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export function useSyncExternalStore(_subscribe,snapshot){return snapshot()}",
          }));
        },
      },
    ],
  });
  source = b.outputFiles[0].text;
});
async function mount(page: Page) {
  await page.route("**/__qa-races", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Storage race fixture</title>",
    }),
  );
  await page.goto("/__qa-races");
  await page.evaluate((state) => {
    const users = {
      a: { id: "fixture-a", email: "a@example.test", storageFormat: 2 },
      b: { id: "fixture-b", email: "b@example.test", storageFormat: 2 },
    };
    const states: any = {
      "fixture-a": { revision: 0, data: structuredClone(state) },
      "fixture-b": {
        revision: 0,
        data: {
          ...structuredClone(state),
          settings: { ...state.settings, unit: "lb" },
        },
      },
    };
    const writes: any[] = [];
    window.__race = { users, states, writes };
    window.fetch = async (input, options) => {
      const path = String(input).replace("/api", "").split("?")[0],
        owner = (options?.headers as Record<string, string>)?.[
          "X-Neoform-Account"
        ];
      if (path === "/me") return Response.json(users.a);
      const current = states[owner];
      if (!current)
        return Response.json({ error: "Wrong owner" }, { status: 412 });
      if (path === "/storage/head") {
        const { sessions, ...header } = current.data;
        return Response.json({
          revision: current.revision,
          header,
          count: sessions.length,
        });
      }
      if (path === "/storage/history")
        return Response.json({ records: [], next: null });
      if (path === "/storage/revision")
        return Response.json({ revision: current.revision });
      if (path === "/storage/commit") {
        const body = JSON.parse(String(options?.body));
        if (body.revision !== current.revision)
          return Response.json({ error: "Changed" }, { status: 409 });
        writes.push({ owner, body });
        current.data = { ...body.header, sessions: [] };
        return Response.json({ revision: ++current.revision });
      }
      return Response.json({ ok: true });
    };
  }, emptyState());
  await page.addScriptTag({ content: source });
  await expect
    .poll(() => page.evaluate(() => window.__race.store.useStore().ready))
    .toBe(true);
}
test("a prepared write cannot switch accounts during asynchronous device work", async ({
  page,
}) => {
  await mount(page);
  const result = await page.evaluate(async () => {
    const r = window.__race,
      s = r.store,
      original = r.Vault.prototype.save;
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      entered = new Promise<void>((resolve) => (reached = resolve));
    r.Vault.prototype.save = async function (...args: any[]) {
      if (String(args[1]).startsWith("send:")) {
        reached();
        await gate;
      }
      return original.apply(this, args);
    };
    s.change((d: any) => ({
      ...d,
      settings: { ...d.settings, theme: "dark" },
    }));
    const pending = s.sync();
    await entered;
    await s.initialize(r.users.b);
    release();
    await pending;
    r.Vault.prototype.save = original;
    return {
      user: s.useStore().user.id,
      writes: r.writes,
      b: r.states["fixture-b"].data,
    };
  });
  expect(result.user).toBe("fixture-b");
  expect(
    result.writes.filter((w: any) => w.owner === "fixture-b"),
  ).toHaveLength(0);
  expect(result.b.settings.theme).toBe("light");
});
test("late device acknowledgements preserve edits made while acknowledgement is being saved", async ({
  page,
}) => {
  await mount(page);
  const result = await page.evaluate(async () => {
    const r = window.__race,
      s = r.store,
      original = r.Vault.prototype.save;
    let release!: () => void,
      reached!: () => void,
      blocked = false;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      entered = new Promise<void>((resolve) => (reached = resolve));
    r.Vault.prototype.save = async function (...args: any[]) {
      if (args[4] && !blocked) {
        blocked = true;
        reached();
        await gate;
      }
      return original.apply(this, args);
    };
    s.change((d: any) => ({
      ...d,
      settings: { ...d.settings, theme: "dark" },
    }));
    const pending = s.sync();
    await entered;
    s.change((d: any) => ({ ...d, settings: { ...d.settings, unit: "lb" } }));
    release();
    await pending;
    await s.sync();
    r.Vault.prototype.save = original;
    return { local: s.useStore().box.data, remote: r.states["fixture-a"].data };
  });
  expect(result.local.settings.unit).toBe("lb");
  expect(result.remote.settings.unit).toBe("lb");
});

test("a durable receipt cannot reject a timer pause while send cleanup is pending", async ({
  page,
}) => {
  await mount(page);
  const result = await page.evaluate(async () => {
    const r = window.__race,
      s = r.store,
      original = r.Vault.prototype.remove;
    let release!: () => void,
      reached!: () => void,
      blocked = false;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      entered = new Promise<void>((resolve) => (reached = resolve));
    r.Vault.prototype.remove = async function (...args: any[]) {
      if (String(args[1]).startsWith("send:") && !blocked) {
        blocked = true;
        reached();
        await gate;
      }
      return original.apply(this, args);
    };
    s.change((d: any) => ({
      ...d,
      timer: {
        id: "qa-rest",
        endAt: Date.now() + 60000,
        remaining: 60,
        paused: false,
      },
    }));
    const pending = s.sync();
    await entered;
    s.change((d: any) => ({ ...d, timer: { ...d.timer, paused: true } }));
    const during = {
      paused: s.useStore().box.data.timer.paused,
      error: s.useStore().error,
    };
    release();
    await pending;
    r.Vault.prototype.remove = original;
    await s.sync();
    return {
      during,
      local: s.useStore().box.data.timer,
      remote: r.states["fixture-a"].data.timer,
    };
  });
  expect(result.during.paused).toBe(true);
  expect(result.during.error).toBe("");
  expect(result.local.paused).toBe(true);
  expect(result.remote.paused).toBe(true);
});
test("offline writes report saving until the device transaction actually commits", async ({
  page,
  context,
}) => {
  await mount(page);
  await context.setOffline(true);
  await page.evaluate(() => {
    const r = window.__race,
      original = r.Vault.prototype.save;
    let release!: () => void;
    r.gate = new Promise<void>((resolve) => (release = resolve));
    r.release = release;
    r.Vault.prototype.save = async function (...args: any[]) {
      if (String(args[1]).startsWith("neoform:pending:")) {
        await r.gate;
        throw Error("Injected device failure");
      }
      return original.apply(this, args);
    };
    r.store.change((d: any) => ({
      ...d,
      settings: { ...d.settings, theme: "dark" },
    }));
  });
  expect(await page.evaluate(() => window.__race.store.useStore().status)).toBe(
    "Saving on device",
  );
  await page.evaluate(() => window.__race.release());
  await expect
    .poll(() => page.evaluate(() => window.__race.store.useStore().status))
    .toBe("Not saved · kept in memory");
  expect(
    await page.evaluate(
      () => window.__race.store.useStore().box.data.settings.theme,
    ),
  ).toBe("dark");
  await context.setOffline(false);
});
test("an obsolete initializer cannot replace the active account cache", async ({
  page,
}) => {
  await mount(page);
  const result = await page.evaluate(async () => {
    const r = window.__race,
      s = r.store,
      original = r.Vault.open;
    let release!: () => void,
      reached!: () => void,
      first = true;
    const gate = new Promise<void>((resolve) => (release = resolve)),
      entered = new Promise<void>((resolve) => (reached = resolve));
    r.Vault.open = async (...args: any[]) => {
      if (first) {
        first = false;
        reached();
        await gate;
      }
      return original(...args);
    };
    const older = s.initialize(r.users.a);
    await entered;
    await s.initialize(r.users.b);
    release();
    await older;
    r.Vault.open = original;
    return {
      user: s.useStore().user.id,
      unit: s.useStore().box.data.settings.unit,
    };
  });
  expect(result).toEqual({ user: "fixture-b", unit: "lb" });
});
