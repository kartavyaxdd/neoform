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

it("does not claim durable success when offline device persistence fails", async () => {
  network.onLine = false;
  const original = storage.setItem;
  vi.stubGlobal(
    "localStorage",
    new Proxy(storage, {
      get(target, property) {
        if (property === "setItem")
          return () => {
            throw new DOMException("quota", "QuotaExceededError");
          };
        return Reflect.get(target, property);
      },
    }),
  );
  expect(
    store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } })),
  ).toBe(false);
  expect(store.useStore().box.data.settings.unit).toBe("lb");
  expect(store.useStore().status).toMatch(/not saved|memory/i);
  expect(store.useStore().error).toMatch(/storage|export/i);
  expect(original).toBeDefined();
});
it("preserves two same-account offline tab snapshots after both reload without storage-event delivery", async () => {
  const first = store;
  vi.resetModules();
  vi.clearAllTimers();
  const second = await import("../src/store");
  await flush();
  network.onLine = false;
  first.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
  second.change((s) => ({ ...s, settings: { ...s.settings, theme: "dark" } }));
  vi.resetModules();
  vi.clearAllTimers();
  fetcher.mockImplementation(() => Promise.reject(new TypeError("offline")));
  const reload = await import("../src/store");
  await flush();
  expect(reload.useStore().box.data.settings.unit).toBe("lb");
  expect(reload.useStore().box.data.settings.theme).toBe("dark");
  expect(reload.useStore().box.dirty).toBe(true);
});
it("aborts account-bound generation immediately when shared identity switches", async () => {
  let signal!: AbortSignal;
  fetcher.mockImplementation((_url: string, options: RequestInit) => {
    signal = options.signal!;
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () =>
        reject(new DOMException("abort", "AbortError")),
      ),
    );
  });
  const pending = store.request("/ai/generate", "POST", {});
  const rejected = expect(pending).rejects.toThrow();
  storage.setItem("neoform:identity", JSON.stringify(b));
  event("neoform:identity", JSON.stringify(b));
  expect(signal.aborted).toBe(true);
  await rejected;
});

it("retires a reloaded journal only after acknowledgement so later edits are not replayed", async () => {
  let remote = { data: emptyState(), revision: 1 };
  fetcher.mockImplementation((url: string, options?: RequestInit) => {
    if (url === "/api/me") return reply(a);
    if (options?.method === "PUT") {
      const sent = JSON.parse(options.body as string);
      remote = { data: sent.data, revision: sent.revision + 1 };
      return reply({ revision: remote.revision });
    }
    return reply(remote);
  });
  network.onLine = false;
  store.change(s => ({ ...s, settings: { ...s.settings, theme: "dark" } }));
  const oldKey = Object.keys(storage).find(k => k.startsWith("neoform:pending:"))!;
  expect(storage.getItem(oldKey)).not.toBeNull();
  vi.resetModules();
  vi.clearAllTimers();
  events = new EventTarget();
  vi.stubGlobal("window", events);
  const reloaded = await import("../src/store");
  await flush();
  expect(storage.getItem(oldKey)).not.toBeNull();
  network.onLine = true;
  await reloaded.sync();
  expect(remote.data.settings.theme).toBe("dark");
  expect(storage.getItem(oldKey)).not.toBeNull(); // Foreign journals need atomic storage before garbage collection.
  reloaded.change(s => ({ ...s, settings: { ...s.settings, theme: "light" } }));
  await reloaded.sync();
  await reloaded.sync();
  expect(reloaded.useStore().box.data.settings.theme).toBe("light");
  expect(remote.data.settings.theme).toBe("light");
});

it("an explicit cloud conflict choice survives subsequent sync and reload", async () => {
  network.onLine = false;
  store.change(s => ({...s, settings:{...s.settings,theme:'dark'}}));
  vi.resetModules(); vi.clearAllTimers();
  events = new EventTarget(); vi.stubGlobal('window',events);
  const reloaded=await import('../src/store'); await flush();
  const remote={data:emptyState(),revision:2}; remote.data.settings.unit='lb';
  fetcher.mockImplementation(()=>reply({...remote,error:'Conflict'},409));
  network.onLine=true; await reloaded.sync();
  expect(reloaded.useStore().conflict).not.toBeNull();
  network.onLine=false; reloaded.resolveConflict('remote');
  expect(reloaded.useStore().box.data.settings).toMatchObject({theme:'light',unit:'lb'});
  vi.resetModules(); vi.clearAllTimers();
  events=new EventTarget();vi.stubGlobal('window',events);
  fetcher.mockImplementation(()=>Promise.reject(new TypeError('offline')));
  const again=await import('../src/store');await flush();
  expect(again.useStore().box.data.settings).toMatchObject({theme:'light',unit:'lb'});
});

it("does not delete another journal generation written while acknowledgement is pending", async () => {
  network.onLine = false;
  store.change(s => ({ ...s, settings: { ...s.settings, theme: "dark" } }));
  const oldKey = Object.keys(storage).find(k => k.startsWith("neoform:pending:"))!;
  vi.resetModules(); vi.clearAllTimers();
  events = new EventTarget(); vi.stubGlobal("window", events);
  const reloaded = await import("../src/store"); await flush();
  let finish!: (r: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  network.onLine = true;
  const syncing = reloaded.sync(); await flush();
  const newer = JSON.parse(storage.getItem(oldKey)!);
  newer.generation++;
  newer.data.settings.unit = "lb";
  storage.setItem(oldKey, JSON.stringify(newer));
  finish(Response.json({ revision: 2 })); await syncing;
  expect(JSON.parse(storage.getItem(oldKey)!).data.settings.unit).toBe("lb");
  expect(reloaded.exportPendingCopies().some(box => box.data.settings.unit === "lb")).toBe(true);
});

it("an already-open third tab cannot replay work explicitly discarded by another tab", async () => {
  let remote = {data:emptyState(),revision:2};remote.data.settings.unit='lb';
  fetcher.mockImplementation((url:string,options?:RequestInit)=>{
    if(url==='/api/me')return reply(a);
    if(options?.method==='PUT'){
      const sent=JSON.parse(options.body as string);
      if(sent.revision!==remote.revision)return reply({...remote,error:'Conflict'},409);
      remote={data:sent.data,revision:remote.revision+1};return reply({revision:remote.revision});
    }
    return reply(remote);
  });
  const first=store;
  vi.resetModules();vi.clearAllTimers();events=new EventTarget();vi.stubGlobal('window',events);
  const third=await import('../src/store');await flush();
  expect(third.useStore().box.revision).toBe(2);
  network.onLine=false;
  first.change(s=>({...s,settings:{...s.settings,theme:'dark'}}));
  vi.resetModules();vi.clearAllTimers();events=new EventTarget();vi.stubGlobal('window',events);
  const recovering=await import('../src/store');await flush();
  network.onLine=true;await recovering.sync();
  expect(recovering.useStore().conflict).not.toBeNull();
  recovering.resolveConflict('remote');await flush();
  await third.sync();await flush();
  expect(remote.data.settings).toMatchObject({theme:'light',unit:'lb'});
});
it.each(['local','merge'] as const)('allows an explicit %s choice after reviewing a foreign acknowledgement', async choice => {
  let remote={data:emptyState(),revision:1};
  network.onLine=false;
  store.change(s=>({...s,settings:{...s.settings,unit:'lb'}}));
  const original=Object.keys(storage).find(k=>k.startsWith('neoform:pending:'))!;
  const journal='neoform:pending:account-a:foreign';
  storage.setItem(journal,storage.getItem(original)!);
  const generation=JSON.parse(storage.getItem(journal)!).generation;
  storage.setItem(`neoform:journal-ack:${journal}:${generation}`,'1');
  fetcher.mockImplementation((_url:string,options?:RequestInit)=>{
    if(options?.method==='PUT'){
      const sent=JSON.parse(options.body as string);remote={data:sent.data,revision:2};
      return reply({revision:2});
    }
    return reply(remote);
  });
  network.onLine=true;await store.sync();
  expect(store.useStore().conflict).not.toBeNull();
  store.resolveConflict(choice);await flush();
  expect(store.useStore().conflict).toBeNull();
  expect(store.useStore().status).toBe('Synced');
  expect(remote.data.settings.unit).toBe('lb');
  vi.resetModules();vi.clearAllTimers();events=new EventTarget();vi.stubGlobal('window',events);
  network.onLine=false;fetcher.mockImplementation(()=>Promise.reject(new TypeError('offline')));
  const reloaded=await import('../src/store');await flush();
  expect(reloaded.useStore().box.data.settings.unit).toBe('lb');
  expect(reloaded.useStore().conflict).toBeNull();
});

it('accepts online acknowledgement when device storage is full without reporting a false offline save', async()=>{
 vi.stubGlobal('localStorage',new Proxy(storage,{get(target,property){
  if(property==='setItem')return ()=>{throw new DOMException('quota','QuotaExceededError')};
  return Reflect.get(target,property);
 }}));
 fetcher.mockImplementation(()=>reply({revision:2}));
 expect(await store.saveChange(s=>({...s,settings:{...s.settings,unit:'lb'}}))).toBe(true);
 expect(store.useStore().box.dirty).toBe(false);
 expect(store.useStore().status).toBe('Synced');
 expect(store.useStore().error).toMatch(/saved online.*offline/i);
});
