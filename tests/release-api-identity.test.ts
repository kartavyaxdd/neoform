import { it, expect } from "vitest";
import { qaTarget } from "./qa-target";
const base = qaTarget(),
  password = "release-test-passphrase-42";
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  account?: string,
) {
  return fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(account ? { "X-Neoform-Account": account } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup() {
  const res = await api("/register", "POST", {
    email: `release-${crypto.randomUUID()}@example.test`,
    password,
  });
  expect(res.status).toBe(201);
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    user: (await res.json()) as { id: string; email: string },
  };
}
it("exposes minimal public health without account data", async () => {
  const res = await api("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("set-cookie")).toBeNull();
});
it("rejects stale A requests using the shared B cookie before reading or changing B", async () => {
  const a = await signup(),
    b = await signup();
  try {
    const before = await (
      await api("/data", "GET", undefined, b.cookie, b.user.id)
    ).json();
    for (const [path, method, body] of [
      ["/data", "GET", undefined],
      ["/data", "PUT", before],
      ["/logout", "POST", {}],
      [
        "/password",
        "POST",
        { currentPassword: password, newPassword: password + "new" },
      ],
      ["/account", "DELETE", { password }],
    ] as const) {
      const res = await api(path, method, body, b.cookie, a.user.id);
      expect(res.status, `${method} ${path}`).toBe(412);
      const error = (await res.json()) as Record<string, unknown>;
      expect(error.error).toMatch(/account.*changed/i);
      expect(error).not.toHaveProperty("data");
    }
    expect(
      await (await api("/data", "GET", undefined, b.cookie, b.user.id)).json(),
    ).toEqual(before);
  } finally {
    await api("/account", "DELETE", { password }, a.cookie, a.user.id);
    await api("/account", "DELETE", { password }, b.cookie, b.user.id);
  }
});
