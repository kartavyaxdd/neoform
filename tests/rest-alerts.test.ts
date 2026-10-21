import { it, expect } from "vitest";
import { validPushEndpoint, RestAlertDevice } from "../worker/restAlerts";
it("accepts only known HTTPS push services without credentials, ports or redirects", () => {
  expect(validPushEndpoint("https://web.push.apple.com/Q/test")).toBe(true);
  for (const url of [
    "http://web.push.apple.com/a",
    "https://web.push.apple.com.evil.test/a",
    "https://user@web.push.apple.com/a",
    "https://127.0.0.1/a",
    "https://web.push.apple.com:8443/a",
  ])
    expect(validPushEndpoint(url)).toBe(false);
});
function fixture(env = {}) {
  let alarm: number | null = null;
  const data = new Map<string, unknown>();
  const storage = {
    get: async (k: string) => data.get(k),
    put: async (k: string, v: unknown) => {
      data.set(k, structuredClone(v));
    },
    setAlarm: async (n: number) => {
      alarm = n;
    },
    deleteAlarm: async () => {
      alarm = null;
    },
  };
  const object = new RestAlertDevice(
    {
      storage,
      blockConcurrencyWhile: async (fn: () => Promise<unknown>) => fn(),
    } as any,
    env,
  );
  return {
    object,
    data,
    get alarm() {
      return alarm;
    },
  };
}
it("isolates device capabilities, versions and cancellation, with idempotent retries", async () => {
  const f = fixture(),
    token = "a".repeat(64);
  const call = (op: string, body: unknown, t = token) =>
    f.object.fetch(
      new Request("https://internal/" + op, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Rest-Device-Token": t,
        },
        body: JSON.stringify(body),
      }),
    );
  expect(
    (
      await call("register", {
        subscription: {
          endpoint: "https://web.push.apple.com/test",
          expirationTime: null,
          keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "schedule",
        { version: 1, timerId: "timer", delaySeconds: 60 },
        "b".repeat(64),
      )
    ).status,
  ).toBe(403);
  expect(
    (await call("schedule", { version: 1, timerId: "timer", delaySeconds: 60 }))
      .status,
  ).toBe(200);
  const deadline = f.alarm;
  expect(
    (await call("schedule", { version: 1, timerId: "timer", delaySeconds: 60 }))
      .status,
  ).toBe(200);
  expect(f.alarm).toBe(deadline);
  expect((await call("cancel", { version: 2 })).status).toBe(200);
  expect(f.alarm).toBeNull();
  expect((await call("disable", { version: 2 })).status).toBe(409);
  expect(
    (await call("schedule", { version: 1, timerId: "timer", delaySeconds: 60 }))
      .status,
  ).toBe(409);
});
it("expires a late alarm without contacting its push endpoint", async () => {
  const f = fixture({
    REST_PUSH_VAPID_PUBLIC_KEY: "synthetic",
    REST_PUSH_VAPID_PRIVATE_KEY: "synthetic",
  });
  f.data.set("device", {
    tokenHash: "synthetic",
    subscription: { endpoint: "https://web.push.apple.com/never-send" },
    version: 7,
    job: { timerId: "late", version: 7, deadline: Date.now() - 61000 },
  });
  await f.object.alarm();
  expect((f.data.get("device") as { job?: unknown }).job).toBeUndefined();
});
