import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  native: false,
  request: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mock.native,
    getPlatform: () => (mock.native ? "android" : "web"),
  },
  registerPlugin: () => ({ request: mock.request, cancel: mock.cancel }),
}));
import { appFetch } from "../src/native";
beforeEach(() => {
  mock.native = false;
  vi.clearAllMocks();
  mock.cancel.mockResolvedValue(undefined);
});
describe("Android API transport", () => {
  it("leaves browser requests unchanged", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const init = {
      method: "POST",
      credentials: "same-origin" as const,
      body: "{}",
    };
    await appFetch("/api/profiles/open", init);
    expect(fetch).toHaveBeenCalledWith("/api/profiles/open", init);
    vi.unstubAllGlobals();
  });
  it("passes scoped headers but no cookies or arbitrary API origin", async () => {
    mock.native = true;
    mock.request.mockResolvedValue({ status: 200, body: '{"ok":true}' });
    const result = await appFetch("/api/data", {
      method: "GET",
      headers: { "X-Neoform-Account": "public-workspace" },
    });
    expect(await result.json()).toEqual({ ok: true });
    expect(mock.request.mock.calls[0][0]).toMatchObject({
      path: "/api/data",
      headers: { "x-neoform-account": "public-workspace" },
    });
    for (const path of [
      "https://evil.example/api/me",
      "//evil.example/api/me",
      "/api/../secrets",
      "/api/%2e%2e/me",
    ])
      await expect(appFetch(path, {})).rejects.toThrow("Unsupported");
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
  it("cancels native work and rejects late results", async () => {
    mock.native = true;
    let resolve!: (r: { status: number; body: string }) => void;
    mock.request.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const abort = new AbortController(),
      task = appFetch("/api/data", { signal: abort.signal });
    abort.abort();
    resolve({ status: 200, body: "{}" });
    await expect(task).rejects.toHaveProperty("name", "AbortError");
    expect(mock.cancel).toHaveBeenCalledTimes(1);
    await expect(
      appFetch("/api/me", { signal: abort.signal }),
    ).rejects.toHaveProperty("name", "AbortError");
  });
});
