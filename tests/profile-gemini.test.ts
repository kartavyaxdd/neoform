import { it, expect, vi } from "vitest";
import worker from "../worker/index";
import { encryptAccountKey, decryptAccountKey } from "../worker/gemini";
function env(profileId: string, locked = 1) {
  return {
    PUBLIC_WORKSPACE: "enabled",
    WORKSPACE_PROFILES: "enabled",
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("JOIN workspace_profile_sessions")
              ? {
                  id: profileId,
                  name: "Synthetic",
                  owner:
                    profileId === "sharma"
                      ? "public-workspace"
                      : "profile:abhishek",
                  locked,
                }
              : null,
          run: async () => ({ meta: { changes: 1 } }),
        }),
      })),
    },
    ASSETS: { fetch: vi.fn() },
  } as any;
}
function request(account = "public-workspace") {
  return new Request("https://example.test/api/ai/key", {
    headers: {
      Cookie: "neoform_profile=" + "a".repeat(64),
      "X-Neoform-Account": account,
    },
  });
}
it("locked Sharma receives key status without a key or training-data disclosure", async () => {
  const r = await worker.fetch(request(), env("sharma"));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ configured: false });
});
it("Abhishek, unlocked Sharma and stale profile headers cannot access Gemini", async () => {
  expect(
    (
      await worker.fetch(
        request("workspace-profile:abhishek"),
        env("abhishek", 0),
      )
    ).status,
  ).toBe(403);
  expect((await worker.fetch(request(), env("sharma", 0))).status).toBe(403);
  expect(
    (await worker.fetch(request("workspace-profile:abhishek"), env("sharma")))
      .status,
  ).toBe(412);
});
it("profile credentials are encrypted in the profile table with a distinct identity binding", async () => {
  const e = env("sharma");
  e.GEMINI_KEY_MASTER = "11".repeat(32);
  const binds: any[] = [];
  e.DB.prepare = vi.fn((sql: string) => ({
    bind: (...args: any[]) => {
      binds.push({ sql, args });
      return {
        first: async () =>
          sql.includes("JOIN workspace_profile_sessions")
            ? {
                id: "sharma",
                name: "Synthetic",
                owner: "public-workspace",
                locked: 1,
              }
            : null,
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  }));
  const key = "AQ.synthetic.scope-fixture-only-123456";
  const r = await worker.fetch(
    new Request("https://example.test/api/ai/key", {
      method: "PUT",
      headers: {
        Origin: "https://example.test",
        Cookie: "neoform_profile=" + "a".repeat(64),
        "X-Neoform-Account": "public-workspace",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
    }),
    e,
  );
  expect(r.status).toBe(200);
  const saved = binds.find((b) =>
    b.sql.startsWith("INSERT INTO profile_ai_keys"),
  );
  expect(saved.args[0]).toBe("sharma");
  expect(saved.args[1]).not.toContain(key);
  expect(
    await decryptAccountKey(
      JSON.parse(saved.args[1]),
      "workspace-profile:sharma",
      e.GEMINI_KEY_MASTER,
    ),
  ).toBe(key);
  await expect(
    decryptAccountKey(
      JSON.parse(saved.args[1]),
      "public-workspace",
      e.GEMINI_KEY_MASTER,
    ),
  ).rejects.toThrow();
  expect(binds.some((b) => b.sql.includes("account_ai_keys"))).toBe(false);
  const other = await encryptAccountKey(
    key,
    "private-test-account",
    e.GEMINI_KEY_MASTER,
  );
  await expect(
    decryptAccountKey(other, "workspace-profile:sharma", e.GEMINI_KEY_MASTER),
  ).rejects.toThrow();
});
it("anonymous profile AI calls are denied before credential-table access", async () => {
  const e = env("sharma");
  const r = await worker.fetch(
    new Request("https://example.test/api/ai/key"),
    e,
  );
  expect(r.status).toBe(401);
  expect(e.DB.prepare).not.toHaveBeenCalled();
});
