import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { qaTarget } from "./qa-target";
const base = qaTarget(),
  password = "synthetic-Gemini-QA-passphrase";
const qaDatabaseDirectory=path.join(process.env.NEOFORM_QA_RUN_DIR!,'d1/v3/d1/miniflare-D1DatabaseObject');
const api = (
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  account?: string,
  origin = base,
) =>
  fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(account ? { "X-Neoform-Account": account } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function signup() {
  const email = "gemini-qa-" + crypto.randomUUID() + "@example.test";
  const r = await api("/api/register", "POST", {
    email,
    password,
  });
  expect(r.status).toBe(201);
  const user = (await r.json()) as any;
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    id: user.id,
    email,
  };
}
function encryptedRow(id: string) {
  const script =
    "import pathlib,sqlite3,json,sys; files=[p for p in pathlib.Path(sys.argv[2]).glob('*.sqlite') if p.name!='metadata.sqlite']; assert len(files)==1; db=sqlite3.connect('file:'+files[0].as_posix()+'?mode=ro',uri=True); row=db.execute('SELECT encrypted FROM account_ai_keys WHERE user_id=?',(sys.argv[1],)).fetchone(); print(json.dumps(json.loads(row[0]) if row else None))";
  const p = spawnSync("python", ["-c", script, id, qaDatabaseDirectory], {
    shell: false,
    encoding: "utf8",
  });
  expect(p.status).toBe(0);
  return JSON.parse(p.stdout);
}
it("real QA D1 key lifecycle: encrypted at rest, two-account isolation, literal AQ. replacement/removal and no API leaks", async () => {
  const a = await signup(),
    b = await signup();
  const key = "AQ.synthetic.fixture.only-123456789",
    replacement = "AQ.replacement.fixture.only-123456789";
  try {
    expect((await api("/api/ai/key")).status).toBe(401);
    expect(
      (
        await api(
          "/api/ai/key",
          "PUT",
          { key },
          a.cookie,
          a.id,
          "https://evil.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (await api("/api/ai/key", "PUT", { key }, a.cookie, b.id)).status,
    ).toBe(412);
    expect(
      (await api("/api/ai/key", "PUT", { key, account: b.id }, a.cookie, a.id))
        .status,
    ).toBe(400);
    const saved = await api("/api/ai/key", "PUT", { key }, a.cookie, a.id);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ configured: true });
    const row = encryptedRow(a.id);
    expect(row.version).toBe(1);
    expect(row.iv).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(row)).not.toContain(key);
    const status = await api("/api/ai/key", "GET", undefined, a.cookie, a.id);
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toEqual({ configured: true });
    expect(
      await (await api("/api/ai/key", "GET", undefined, b.cookie, b.id)).json(),
    ).toEqual({ configured: false });
    expect(encryptedRow(b.id)).toBeNull();
    const backup = await (
      await api("/api/data", "GET", undefined, a.cookie, a.id)
    ).text();
    expect(backup).not.toContain(key);
    expect(backup).not.toContain(row.ciphertext);
    expect(
      (await api("/api/ai/key", "PUT", { key: replacement }, a.cookie, a.id))
        .status,
    ).toBe(200);
    expect(encryptedRow(a.id)).not.toEqual(row);
    const removed = await api("/api/ai/key", "DELETE", {}, a.cookie, a.id);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ configured: false });
    expect(encryptedRow(a.id)).toBeNull();
    const missing = await api(
      "/api/ai/generate",
      "POST",
      {
        goal: "Build muscle",
        experience: "New",
        days: 2,
        minutes: 45,
        equipment: ["Dumbbell"],
        emphasis: "Balanced",
        limitation: "None",
      },
      a.cookie,
      a.id,
    );
    expect(missing.status).toBe(428);
    expect(((await missing.json()) as any).error).toContain("More settings");
  } finally {
    expect(
      (await api("/api/account", "DELETE", { password }, a.cookie, a.id))
        .status,
    ).toBe(200);
    expect(
      (await api("/api/account", "DELETE", { password }, b.cookie, b.id))
        .status,
    ).toBe(200);
  }
}, 30000);
function qaDailyBudget(mode = "get", value: [number, number] | null = null) {
  const script =
    "import pathlib,sqlite3,json,sys; files=[p for p in pathlib.Path(sys.argv[3]).glob('*.sqlite') if p.name!='metadata.sqlite']; assert len(files)==1; db=sqlite3.connect(files[0]); value=json.loads(sys.argv[2]); key='gemini-global-day';\nif sys.argv[1]!='get':\n db.execute('DELETE FROM rate_limits WHERE key=?',(key,))\n if value is not None:db.execute('INSERT INTO rate_limits(key,count,window) VALUES (?,?,?)',(key,*value))\n db.commit()\nprint(json.dumps(db.execute('SELECT count,window FROM rate_limits WHERE key=?',(key,)).fetchone()))";
  const p = spawnSync("python", ["-c", script, mode, JSON.stringify(value), qaDatabaseDirectory], {
    encoding: "utf8",
    shell: false,
  });
  expect(p.status).toBe(0);
  return JSON.parse(p.stdout);
}
it("real QA global daily allowance survives authenticated login cleanup; no provider is called", async () => {
  const previous = qaDailyBudget(),
    a = await signup(),
    day = Math.floor(Date.now() / 86400000);
  try {
    qaDailyBudget("set", [10, day]);
    expect(
      (await api("/api/login", "POST", { email: a.email, password })).status,
    ).toBe(200);
    expect(qaDailyBudget()).toEqual([10, day]);
  } finally {
    qaDailyBudget("set", previous);
    expect(
      (await api("/api/account", "DELETE", { password }, a.cookie, a.id))
        .status,
    ).toBe(200);
  }
}, 30000);
