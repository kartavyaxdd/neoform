import { z } from "zod";
import { emptyState, stateSchema, MAX_BACKUP } from "../src/domain";
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}
const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
  })
  .strict();
const encoder = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(b instanceof Uint8Array ? b.buffer : b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const random = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
// Cloudflare's native PBKDF2 ceiling is 100,000. SHA-512, 128-bit random salts,
// minimum 12-character passwords and server throttling; see SECURITY.md.
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-512",
        salt: encoder.encode(salt),
        iterations: 100000,
      },
      key,
      256,
    ),
  );
}
function equal(a: string, b: string) {
  let result = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
class Fault extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });
function cookie(req: Request, token: string, maxAge = 604800) {
  return `neoform_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function body(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new Fault(415, "Use JSON.");
  if (Number(req.headers.get("content-length")) > MAX_BACKUP)
    throw new Fault(413, "Request exceeds 2 MB.");
  const reader = req.body?.getReader();
  if (!reader) throw new Fault(400, "Missing body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > MAX_BACKUP) {
      await reader.cancel();
      throw new Fault(413, "Request exceeds 2 MB.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Fault(400, "Malformed JSON.");
  }
}
function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new Fault(400, "Invalid input: " + result.error.issues[0]?.message);
  return result.data;
}
async function throttle(env: Env, key: string, limit: number) {
  const window = Math.floor(Date.now() / 900000);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count",
  )
    .bind(key, window)
    .first<{ count: number }>();
  if (row && row.count > limit)
    throw new Fault(429, "Too many attempts. Try again in 15 minutes.");
}
async function authenticate(req: Request, env: Env) {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)neoform_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) throw new Fault(401, "Please sign in.");
  const hash = await digest(token);
  const user = await env.DB.prepare(
    "SELECT u.id,u.email,u.password_hash,u.salt FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(hash, Date.now())
    .first<{
      id: string;
      email: string;
      password_hash: string;
      salt: string;
    }>();
  if (!user) throw new Fault(401, "Session expired. Please sign in.");
  const expected = req.headers.get("X-Neoform-Account");
  if (expected !== null && expected !== user.id)
    throw new Fault(
      412,
      "Browser account changed. Export pending changes and sign in again.",
    );
  return { ...user, tokenHash: hash };
}
async function issueSession(
  req: Request,
  env: Env,
  user: { id: string; email: string; password_hash: string; salt: string },
  status = 200,
) {
  const token = random(32);
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM rate_limits WHERE window<?").bind(
      Math.floor(Date.now() / 900000) - 2,
    ),
    env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=? AND salt=?",
    ).bind(
      await digest(token),
      Date.now() + 604800000,
      user.id,
      user.password_hash,
      user.salt,
    ),
  ]);
  if (!results[2].meta.changes)
    throw new Fault(401, "Credentials changed. Please sign in again.");
  return json({ id: user.id, email: user.email }, status, {
    "Set-Cookie": cookie(req, token),
  });
}
async function snapshot(env: Env, id: string) {
  const row = await env.DB.prepare(
    "SELECT revision,body FROM account_data WHERE user_id=?",
  )
    .bind(id)
    .first<{ revision: number; body: string }>();
  if (!row) throw new Fault(404, "Account data not found.");
  return { revision: row.revision, data: JSON.parse(row.body) };
}
async function route(req: Request, env: Env) {
  const path = new URL(req.url).pathname,
    method = req.method;
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
  if (path === "/api/health" && method === "GET") return json({ ok: true });
  if (
    !["GET", "HEAD"].includes(method) &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    throw new Fault(403, "Same-origin requests required.");
  if (
    (path === "/api/register" || path === "/api/login") &&
    method === "POST"
  ) {
    const input = validate(credentials, await body(req));
    await throttle(
      env,
      "ip:" + (await digest(req.headers.get("CF-Connecting-IP") || "local")),
      100,
    );
    await throttle(env, "email:" + (await digest(input.email)), 10);
    if (path === "/api/register") {
      const id = crypto.randomUUID(),
        salt = random(16),
        hash = await passwordHash(input.password, salt);
      try {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO users(id,email,password_hash,salt,created_at) VALUES (?,?,?,?,?)",
          ).bind(id, input.email, hash, salt, Date.now()),
          env.DB.prepare(
            "INSERT INTO account_data(user_id,revision,body,updated_at) VALUES (?,0,?,?)",
          ).bind(id, JSON.stringify(emptyState()), Date.now()),
        ]);
      } catch {
        throw new Fault(409, "Unable to create this account. Try signing in.");
      }
      return issueSession(
        req,
        env,
        { id, email: input.email, password_hash: hash, salt },
        201,
      );
    }
    const user = await env.DB.prepare(
      "SELECT id,email,password_hash,salt FROM users WHERE email=?",
    )
      .bind(input.email)
      .first<{
        id: string;
        email: string;
        password_hash: string;
        salt: string;
      }>();
    const hash = await passwordHash(
      input.password,
      user?.salt || "00000000000000000000000000000000",
    );
    if (!user || !equal(hash, user.password_hash))
      throw new Fault(401, "Email or password incorrect.");
    return issueSession(req, env, user);
  }
  const user = await authenticate(req, env);
  if (path === "/api/me" && method === "GET")
    return json({ id: user.id, email: user.email });
  if (path === "/api/logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(user.tokenHash)
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
  }
  if (path === "/api/data" && method === "GET")
    return json(await snapshot(env, user.id));
  if (path === "/api/data" && method === "PUT") {
    const input = validate(
      z
        .object({ revision: z.number().int().min(0), data: stateSchema })
        .strict(),
      await body(req),
    );
    const result = await env.DB.prepare(
      "UPDATE account_data SET body=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?",
    )
      .bind(JSON.stringify(input.data), Date.now(), user.id, input.revision)
      .run();
    if (!result.meta.changes)
      return json(
        {
          error: "Another device changed your data.",
          ...(await snapshot(env, user.id)),
        },
        409,
      );
    return json({ revision: input.revision + 1 });
  }
  if (path === "/api/password" && method === "POST") {
    const input = validate(
      z
        .object({
          currentPassword: z.string().max(128),
          newPassword: z.string().min(12).max(128),
        })
        .strict(),
      await body(req),
    );
    await throttle(env, "sensitive:" + user.id, 10);
    if (
      !equal(
        await passwordHash(input.currentPassword, user.salt),
        user.password_hash,
      )
    )
      throw new Fault(401, "Password incorrect.");
    const salt = random(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=?,salt=? WHERE id=?").bind(
        await passwordHash(input.newPassword, salt),
        salt,
        user.id,
      ),
      env.DB.prepare(
        "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
      ).bind(user.id, user.tokenHash),
    ]);
    return json({ ok: true });
  }
  if (path === "/api/account" && method === "DELETE") {
    const input = validate(
      z.object({ password: z.string().max(128) }).strict(),
      await body(req),
    );
    await throttle(env, "sensitive:" + user.id, 10);
    if (
      !equal(await passwordHash(input.password, user.salt), user.password_hash)
    )
      throw new Fault(401, "Password incorrect.");
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
  }
  throw new Fault(404, "Route not found.");
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      res =
        e instanceof Fault
          ? json({ error: e.message }, e.status)
          : json({ error: "Unable to process request. Please retry." }, 500);
    }
    const headers = new Headers(res.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (new URL(req.url).protocol === "https:")
      headers.set("Strict-Transport-Security", "max-age=31536000");
    if (new URL(req.url).pathname.startsWith("/api/"))
      headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, headers });
  },
};
