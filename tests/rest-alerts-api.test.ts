import { it, expect } from "vitest";
import { qaTarget } from "./qa-target";
const origin = qaTarget();
it("real Worker/D1/DO notification gateway isolates devices and rejects cross-origin writes", async () => {
  const publicMode = process.env.NEOFORM_QA_MODE === "public";
  let cookie = "";
  if (!publicMode) {
    const r = await fetch(origin + "/api/register", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `rest-${crypto.randomUUID()}@example.test`,
        password: "synthetic-strong-password-42",
      }),
    });
    expect(r.status).toBe(201);
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  }
  const id = crypto.randomUUID(),
    token = "a".repeat(64);
  const call = (op: string, body: unknown, t = token, o = origin) =>
    fetch(`${origin}/api/rest-alerts/devices/${id}/${op}`, {
      method: "POST",
      headers: {
        Origin: o,
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Rest-Device-Token": t,
        ...(publicMode ? { "X-Neoform-Account": "public-workspace" } : {}),
      },
      body: JSON.stringify(body),
    });
  const config = await fetch(origin + "/api/rest-alerts/config", {
    headers: { Cookie: cookie },
  });
  expect(config.status).toBe(200);
  expect(((await config.json()) as { enabled: boolean }).enabled).toBe(true);
  expect((await call("register", {}, token, "https://evil.test")).status).toBe(
    403,
  );
  expect(
    (
      await call("register", {
        subscription: {
          endpoint: "https://127.0.0.1/private",
          keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call("register", {
        subscription: {
          endpoint: "https://web.push.apple.com/synthetic-not-delivered",
          expirationTime: null,
          keys: { auth: "A".repeat(22), p256dh: "B".repeat(87) },
        },
      })
    ).status,
  ).toBe(200);
  try {
    expect(
      (
        await call(
          "schedule",
          { version: 1, timerId: "owned", delaySeconds: 3600 },
          "b".repeat(64),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("schedule", {
          version: 1,
          timerId: "owned",
          delaySeconds: 3600,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("schedule", {
          version: 1,
          timerId: "owned",
          delaySeconds: 3600,
        })
      ).status,
    ).toBe(200);
    expect((await call("cancel", { version: 2 })).status).toBe(200);
    expect(
      (
        await call("schedule", {
          version: 1,
          timerId: "stale",
          delaySeconds: 3600,
        })
      ).status,
    ).toBe(409);
  } finally {
    expect((await call("disable", { version: 3 })).status).toBe(200);
  }
});
