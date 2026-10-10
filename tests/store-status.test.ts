import { it, expect, vi } from "vitest";
import { emptyState } from "../src/domain";
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
it("reports pending sync when a successful response acknowledges an older edit generation", async () => {
  vi.useFakeTimers();
  const items: Record<string, string> = {};
  const storage = Object.defineProperties(items, {
    getItem: { value: (k: string) => items[k] ?? null },
    setItem: { value: (k: string, v: string) => (items[k] = v) },
    removeItem: { value: (k: string) => delete items[k] },
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", storage);
  const fetcher = vi.fn((url: string) =>
    Promise.resolve(
      Response.json(
        url === "/api/me"
          ? { id: "status-test", email: "status@example.test" }
          : { data: emptyState(), revision: 1 },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    const store = await import("../src/store");
    for (let i = 0; i < 30; i++) await Promise.resolve();
    let finish!: (r: Response) => void;
    fetcher.mockImplementation(
      () => new Promise<Response>((r) => (finish = r)),
    );
    store.change((s) => ({ ...s, settings: { ...s.settings, unit: "lb" } }));
    const sent = store.sync();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    store.change((s) => ({
      ...s,
      settings: { ...s.settings, theme: "light" },
    }));
    finish(Response.json({ revision: 2 }));
    await sent;
    expect(store.useStore().box.dirty).toBe(true);
    expect(store.useStore().status).toBe("Pending sync");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
