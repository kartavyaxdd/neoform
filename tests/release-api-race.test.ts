import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../worker/index";

it("atomically rejects an old-password login paused after verification until rotation finishes", async () => {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("migrations/" + file, "utf8"));
  let pause = false,
    release!: () => void,
    entered!: () => void;
  const waiting = new Promise<void>((r) => (entered = r)),
    gate = new Promise<void>((r) => (release = r));
  const prepare = (sql: string) => ({
    sql,
    args: [] as any[],
    bind(...args: any[]) {
      this.args = args;
      return this;
    },
    async first() {
      return db.prepare(sql).get(...this.args) || null;
    },
    async run() {
      const result = db.prepare(sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  });
  const env = {
    DB: {
      prepare,
      async batch(statements: ReturnType<typeof prepare>[]) {
        if (
          pause &&
          statements.some((s) => s.sql.includes("INSERT INTO sessions"))
        ) {
          pause = false;
          entered();
          await gate;
        }
        db.exec("BEGIN");
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          db.exec("COMMIT");
          return results;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    ASSETS: { fetch: async () => new Response("unused") },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const call = (path: string, body: unknown, cookie = "") =>
    worker.fetch(
      new Request("http://local.test/api/" + path, {
        method: "POST",
        headers: {
          Origin: "http://local.test",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  const email = "race@example.test",
    password = "old-password-passphrase",
    newPassword = "new-password-passphrase";
  try {
    const registered = await call("register", { email, password });
    expect(registered.status).toBe(201);
    const cookie = registered.headers.get("set-cookie")!.split(";")[0];
    pause = true;
    const login = call("login", { email, password });
    await waiting;
    try {
      expect(
        (
          await call(
            "password",
            { currentPassword: password, newPassword },
            cookie,
          )
        ).status,
      ).toBe(200);
    } finally {
      release();
    }
    const stale = await login;
    expect(stale.status).toBe(401);
    expect(stale.headers.get("set-cookie")).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM sessions").get()!.n).toBe(1);
    expect((await call("login", { email, password: newPassword })).status).toBe(
      200,
    );
  } finally {
    release?.();
    db.close();
  }
});
