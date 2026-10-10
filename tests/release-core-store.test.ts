import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { emptyState, startSession } from "../src/domain";
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
    snapshot(),
}));
const a = { id: "account-a", email: "a@example.test" },
  b = { id: "account-b", email: "b@example.test" };
const reply = (body: unknown, status = 200) =>
  Promise.resolve(Response.json(body, { status }));
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
let storage: Storage,
  events: EventTarget,
  network: { onLine: boolean },
  fetcher: ReturnType<typeof vi.fn>,
  store: typeof import("../src/store");
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  events = new EventTarget();
  network = { onLine: true };
  const items: Record<string, string> = {};
  storage = Object.defineProperties(items, {
    getItem: { value: (k: string) => items[k] ?? null },
    setItem: {
      value: (k: string, v: string) => {
        items[k] = String(v);
      },
    },
    removeItem: {
      value: (k: string) => {
        delete items[k];
      },
    },
    clear: { value: () => Object.keys(items).forEach((k) => delete items[k]) },
  }) as unknown as Storage;
  fetcher = vi.fn((url: string) =>
    reply(url === "/api/me" ? a : { data: emptyState(), revision: 1 }),
  );
  vi.stubGlobal("window", events);
  vi.stubGlobal("navigator", network);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", fetcher);
  store = await import("../src/store");
  await flush();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const event = (key: string, newValue: string | null) => {
  const e = new Event("storage");
  Object.defineProperties(e, {
    key: { value: key },
    newValue: { value: newValue },
    storageArea: { value: storage },
  });
  events.dispatchEvent(e);
};
it("binds GET, PUT and sensitive authenticated requests to the tab account", async () => {
  expect(
    fetcher.mock.calls.find(([url]) => url === "/api/data")?.[1],
  ).toMatchObject({ headers: { "X-Neoform-Account": a.id } });
  fetcher.mockImplementation(() => reply({ revision: 2 }));
  store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  await store.sync();
  await store.request("/password", "POST", {});
  for (const call of fetcher.mock.calls.filter(
    ([url]) => url === "/api/password" || url === "/api/data",
  ))
    expect(call[1]).toMatchObject({ headers: { "X-Neoform-Account": a.id } });
});
it("never sends an authenticated request without an expected local identity", async () => {
  store.clearLocal();
  fetcher.mockClear();
  fetcher.mockImplementation(() => reply({ data: emptyState(), revision: 7 }));
  await expect(store.request("/data")).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("never caches a mismatched shared-cookie GET and pauses stale dirty PUTs", async () => {
  const before = storage.getItem("neoform:account:" + a.id);
  fetcher.mockImplementation(() =>
    reply({ error: "Browser account changed. Please sign in again." }, 412),
  );
  await store.sync();
  expect(storage.getItem("neoform:account:" + a.id)).toBe(before);
  expect(store.useStore().status).toMatch(/account.*changed/i);
  expect(store.useStore().box.data.settings.unit).toBe("kg");
});
it("observes cross-tab account switches and fences a pending response without overwriting B identity", async () => {
  let finish!: (r: Response) => void;
  fetcher.mockImplementation((url: string) =>
    url === "/api/data" ? new Promise<Response>((r) => (finish = r)) : reply(b),
  );
  const pending = store.sync();
  await flush();
  storage.setItem("neoform:identity", JSON.stringify(b));
  event("neoform:identity", JSON.stringify(b));
  await flush();
  finish(
    Response.json({
      data: {
        ...emptyState(),
        settings: { ...emptyState().settings, unit: "lb" },
      },
      revision: 99,
    }),
  );
  await pending;
  await flush();
  expect(JSON.parse(storage.getItem("neoform:identity")!).id).toBe(b.id);
  expect(
    JSON.parse(storage.getItem("neoform:account:" + a.id)!).data.settings.unit,
  ).toBe("kg");
  expect(store.useStore().user?.id).not.toBe(a.id);
});
it("preserves dirty A work for backup and prevents editing/sync after a browser account change", async () => {
  network.onLine = false;
  store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  const before = storage.getItem("neoform:account:" + a.id);
  storage.setItem("neoform:identity", JSON.stringify(b));
  event("neoform:identity", JSON.stringify(b));
  network.onLine = true;
  fetcher.mockClear();
  await store.sync();
  expect(store.useStore().box.data.settings.unit).toBe("lb");
  expect(store.useStore().error).toMatch(/backup|export/i);
  expect(fetcher).not.toHaveBeenCalled();
  expect(storage.getItem("neoform:account:" + a.id)).toBe(before);
  expect(
    store.change((s) => ({
      ...s,
      settings: { ...s.settings, theme: "light" },
    })),
  ).toBe(false);
});
it.each([401, "offline"] as const)(
  "clears clean private state on %s logout and cannot restore it on offline reload",
  async (failure) => {
    fetcher.mockImplementation(() =>
      failure === 401
        ? reply({ error: "Session expired" }, 401)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    await store.logout();
    expect(store.useStore().user).toBeNull();
    expect(store.useStore().box.data).toEqual(emptyState());
    expect(storage.getItem("neoform:identity")).toBeNull();
    expect(storage.getItem("neoform:account:" + a.id)).toBeNull();
    network.onLine = false;
    await store.initialize();
    expect(store.useStore().user).toBeNull();
    // Exercise a new module instance, as a full offline page reload would.
    vi.resetModules();
    vi.clearAllTimers();
    events = new EventTarget();
    vi.stubGlobal("window", events);
    fetcher.mockClear();
    const reloaded = await import("../src/store");
    await flush();
    expect(reloaded.useStore().user).toBeNull();
    expect(reloaded.useStore().ready).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    // A server cookie can survive offline logout. Automatic online startup must also respect local sign-out.
    network.onLine = true;
    fetcher.mockImplementation((url: string) =>
      reply(url === "/api/me" ? a : { data: emptyState(), revision: 1 }),
    );
    await store.initialize();
    expect(store.useStore().user).toBeNull();
    await store.initialize(a);
    expect(store.useStore().user?.id).toBe(a.id);
  },
);
it("keeps dirty offline work until the existing explicit backup/clear path is used", async () => {
  network.onLine = false;
  store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  await expect(store.logout()).rejects.toThrow(/Sync or export/);
  expect(store.useStore().box.dirty).toBe(true);
  expect(storage.getItem("neoform:identity")).not.toBeNull();
  store.clearLocal();
  await store.initialize();
  expect(store.useStore().user).toBeNull();
  expect(storage.getItem("neoform:account:" + a.id)).toBeNull();
});
it("does not let in-flight initialization undo explicit local sign-out", async () => {
  let finish!: (r: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>((r) => (finish = r)));
  const pending = store.initialize();
  await flush();
  store.clearLocal();
  finish(Response.json(a));
  await pending;
  expect(store.useStore().user).toBeNull();
  expect(storage.getItem("neoform:identity")).toBeNull();
});
it("does not let initial /me restore A after another tab switched to B", async () => {
  vi.resetModules();
  vi.clearAllTimers();
  events = new EventTarget();
  vi.stubGlobal("window", events);
  let finish!: (r: Response) => void;
  fetcher.mockImplementation((url: string) =>
    url === "/api/me"
      ? new Promise<Response>((r) => (finish = r))
      : reply({ data: emptyState(), revision: 1 }),
  );
  const opening = await import("../src/store");
  await flush();
  storage.setItem("neoform:identity", JSON.stringify(b));
  event("neoform:identity", JSON.stringify(b));
  finish(Response.json(a));
  await flush();
  expect(JSON.parse(storage.getItem("neoform:identity")!).id).toBe(b.id);
  expect(opening.useStore().user).toBeNull();
});
it("preserves edits made while clean logout waits for a response", async () => {
  let finish!: (r: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>((r) => (finish = r)));
  const signingOut = store.logout();
  await flush();
  network.onLine = false;
  store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  finish(Response.json({ ok: true }));
  await expect(signingOut).rejects.toThrow(/Sync or export/);
  expect(store.useStore().box.dirty).toBe(true);
  expect(store.useStore().box.data.settings.unit).toBe("lb");
  expect(storage.getItem("neoform:identity")).not.toBeNull();
});
it("uses the cached common base to merge remote edits and deletions through the real store", async () => {
  const base = emptyState();
  base.sessions = [startSession("Edit", []), startSession("Delete", [])];
  fetcher.mockImplementation(() => reply({ data: base, revision: 2 }));
  await store.sync();
  network.onLine = false;
  store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  const remote = structuredClone(base);
  remote.sessions[0].notes = "Remote";
  remote.sessions.pop();
  network.onLine = true;
  fetcher.mockImplementation(() =>
    reply({ error: "Conflict", data: remote, revision: 3 }, 409),
  );
  await store.sync();
  network.onLine = false;
  store.resolveConflict("merge");
  expect(store.useStore().conflict).toBeNull();
  expect(store.useStore().box.data).toEqual({
    ...remote,
    settings: { ...remote.settings, unit: "lb" },
  });
  expect(store.useStore().box).toHaveProperty("base", {
    data: remote,
    revision: 3,
  });
});
it("keeps explicit conflict choices and rejects merge if a legacy dirty cache has no common base", async () => {
  network.onLine = false;
  storage.setItem(
    "neoform:account:" + a.id,
    JSON.stringify({
      data: emptyState(),
      revision: 4,
      dirty: true,
      generation: 1,
    }),
  );
  await store.initialize(a);
  network.onLine = true;
  const remote = emptyState();
  remote.settings.theme = "light";
  fetcher.mockImplementation(() =>
    reply({ error: "Conflict", data: remote, revision: 5 }, 409),
  );
  await store.sync();
  network.onLine = false;
  const before = store.useStore().box;
  store.resolveConflict("merge");
  expect(store.useStore().box).toEqual(before);
  expect(store.useStore().conflict).not.toBeNull();
  expect(store.useStore().error).toMatch(
    /common base.*export|export.*common base/i,
  );
  store.resolveConflict("remote");
  expect(store.useStore().box.data).toEqual(remote);
  expect(store.useStore().conflict).toBeNull();
});
