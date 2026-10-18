import { it, expect, vi, afterEach } from "vitest";
import worker from "../worker/index";
function env() {
  return {
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.startsWith("SELECT u.id")
              ? {
                  id: "synthetic-gemini-a",
                  email: "fixture@example.test",
                  password_hash: "unused",
                  salt: "unused",
                }
              : null,
          run: async () => ({ meta: { changes: 1 } }),
        }),
      })),
    },
    ASSETS: { fetch: vi.fn() },
  } as any;
}
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  origin = "http://localhost:8787",
) =>
  new Request("http://localhost:8787" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "neoform_session=" + "a".repeat(64),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());
it("Gemini key status returns only configured boolean, never a key", async () => {
  const r = await worker.fetch(request("/api/ai/key"), env());
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ configured: false });
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("missing account key is actionable without any upstream or sidecar call", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const r = await worker.fetch(
    request("/api/ai/generate", "POST", {
      goal: "Build muscle",
      experience: "New",
      days: 2,
      minutes: 45,
      equipment: ["Dumbbell"],
      emphasis: "Balanced",
      limitation: "None",
    }),
    env(),
  );
  expect(r.status).toBe(428);
  expect(((await r.json()) as { error: string }).error).toContain(
    "More settings",
  );
  expect(spy).not.toHaveBeenCalled();
});
it("preserves header-safe AQ. key literals with periods without repair", async () => {
  const e = env();
  e.GEMINI_KEY_MASTER = "11".repeat(32);
  const r = await worker.fetch(
    request("/api/ai/key", "PUT", {
      key: "AQ.synthetic.fixture.only-123456789",
    }),
    e,
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ configured: true });
});
it("key mutations are same-origin and strict account-free schemas", async () => {
  expect(
    (
      await worker.fetch(
        request(
          "/api/ai/key",
          "PUT",
          { key: "synthetic-key-fixture-123", account: "other" },
          "https://evil.test",
        ),
        env(),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await worker.fetch(
        request("/api/ai/key", "PUT", {
          key: "synthetic-key-fixture-123",
          account: "other",
        }),
        env(),
      )
    ).status,
  ).toBe(400);
});
