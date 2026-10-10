import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  selectAccount,
  productionConfig,
  assertDatabaseBinding,
} from "../scripts/cloud-launch-policy.mjs";
describe("cloud launch scope guards", () => {
  it("loads the checked-in configuration using the launcher's JSON parser", () => {
    const base = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
    const config = productionConfig(base, "a".repeat(32), "abcdef1234");
    expect(config.compatibility_date).toBe(base.compatibility_date);
    expect(config.assets.directory).toBe("./dist");
  });
  it("refuses unauthenticated launch", () =>
    expect(() => selectAccount({ loggedIn: false })).toThrow(/login/i));
  it("refuses ambiguous account selection", () =>
    expect(() =>
      selectAccount({
        loggedIn: true,
        accounts: [{ id: "a".repeat(32) }, { id: "b".repeat(32) }],
      }),
    ).toThrow(/account-id/i));
  it("permits only an authenticated explicitly selected account", () =>
    expect(
      selectAccount(
        {
          loggedIn: true,
          accounts: [{ id: "a".repeat(32) }, { id: "b".repeat(32) }],
        },
        "b".repeat(32),
      ),
    ).toBe("b".repeat(32)));
  it("does not carry unrelated routes or resource bindings into a fresh deployment", () => {
    const c = productionConfig(
      {
        compatibility_date: "2026-10-01",
        routes: ["unrelated.example/*"],
        d1_databases: [{ binding: "OLD" }],
      },
      "a".repeat(32),
      "abcdef1234",
    );
    expect(c.name).toBe("neoform-abcdef1234");
    expect(c.routes).toBeUndefined();
    expect(c.d1_databases).toBeUndefined();
    expect(c.workers_dev).toBe(true);
    expect(c.observability.enabled).toBe(false);
  });
  it("rejects placeholder database IDs", () =>
    expect(() =>
      assertDatabaseBinding({
        d1_databases: [
          {
            binding: "DB",
            database_id: "00000000-0000-0000-0000-000000000001",
          },
        ],
      }),
    ).toThrow(/database/i));
});
