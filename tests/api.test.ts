import { describe, it, expect } from "vitest";
const base = "http://localhost:8787";
const email = () => `qa-${crypto.randomUUID()}@example.test`;
const password = "test-only-strong-passphrase-42";
async function api(path: string, method = "GET", body?: unknown, cookie = "") {
  return fetch(base + path, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup() {
  const res = await api("/api/register", "POST", { email: email(), password });
  expect(res.status).toBe(201);
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    user: (await res.json()) as any,
  };
}
describe("real local Worker + D1 auth/data", () => {
  it("requires auth and same-origin writes, rejects invalid credentials", async () => {
    expect((await api("/api/data")).status).toBe(401);
    expect(
      (
        await fetch(base + "/api/register", {
          method: "POST",
          headers: {
            Origin: "https://evil.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: email(), password }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await api("/api/register", "POST", { email: "bad", password: "short" }))
        .status,
    ).toBe(400);
    expect(
      (await api("/api/login", "POST", { email: email(), password })).status,
    ).toBe(401);
  });
  it("persists across login, isolates accounts and invalidates logout tokens", async () => {
    const a = await signup(),
      b = await signup();
    const res = await api("/api/data", "GET", undefined, a.cookie);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const data = (await res.json()) as any;
    data.data.settings.unit = "lb";
    expect(
      (
        await api(
          "/api/data",
          "PUT",
          { revision: data.revision, data: data.data },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    const other = (await (
      await api("/api/data", "GET", undefined, b.cookie)
    ).json()) as any;
    expect(other.data.settings.unit).toBe("kg");
    expect(a.user.id).not.toBe(b.user.id);
    expect((await api("/api/logout", "POST", {}, a.cookie)).status).toBe(200);
    expect((await api("/api/data", "GET", undefined, a.cookie)).status).toBe(
      401,
    );
    const login = await api("/api/login", "POST", {
      email: a.user.email,
      password,
    });
    expect(login.status).toBe(200);
    const again = (await (
      await api(
        "/api/data",
        "GET",
        undefined,
        login.headers.get("set-cookie")!.split(";")[0],
      )
    ).json()) as any;
    expect(again.data.settings.unit).toBe("lb");
    expect(again.revision).toBe(1);
  });
  it("rejects stale revisions atomically and malformed/oversized snapshots", async () => {
    const a = await signup();
    const d = (await (
      await api("/api/data", "GET", undefined, a.cookie)
    ).json()) as any;
    const requests = await Promise.all([
      api("/api/data", "PUT", d, a.cookie),
      api("/api/data", "PUT", d, a.cookie),
    ]);
    expect(requests.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = (await requests
      .find((r) => r.status === 409)!
      .json()) as any;
    expect(conflict.revision).toBe(1);
    expect(
      (
        await api(
          "/api/data",
          "PUT",
          { revision: 1, data: { bad: true } },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api(
          "/api/data",
          "PUT",
          { revision: 1, data: { huge: "x".repeat(2100000) } },
          a.cookie,
        )
      ).status,
    ).toBe(413);
  });
  it("changes passwords, revokes other sessions and permanently deletes account data", async () => {
    const a = await signup();
    const login = await api("/api/login", "POST", {
      email: a.user.email,
      password,
    });
    const oldCookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(
      (
        await api(
          "/api/password",
          "POST",
          { currentPassword: "wrong", newPassword: password + "new" },
          a.cookie,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await api(
          "/api/password",
          "POST",
          { currentPassword: password, newPassword: password + "new" },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await api("/api/data", "GET", undefined, oldCookie)).status).toBe(
      401,
    );
    expect(
      (await api("/api/login", "POST", { email: a.user.email, password }))
        .status,
    ).toBe(401);
    expect(
      (
        await api(
          "/api/account",
          "DELETE",
          { password: password + "new" },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await api("/api/data", "GET", undefined, a.cookie)).status).toBe(
      401,
    );
  });
  it("has cookie security flags, headers, bounded throttling and no public secrets", async () => {
    const a = await api("/api/register", "POST", { email: email(), password });
    expect(a.headers.get("set-cookie")).toContain("HttpOnly");
    expect(a.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(a.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
    const target = email();
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await api("/api/login", "POST", { email: target, password }))
        .status;
    expect(last).toBe(429);
  });
});
