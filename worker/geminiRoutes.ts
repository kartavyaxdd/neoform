import { z } from "zod";
import { generationInput } from "../src/generation";
import {
  GeminiFault,
  encryptAccountKey,
  decryptAccountKey,
  generateGemini,
} from "./gemini";
export interface GeminiEnv {
  DB: D1Database;
  GEMINI_KEY_MASTER?: string;
  GEMINI_DAILY_LIMIT?: string;
}
const keyInput = z
  .object({
    key: z
      .string()
      .min(20)
      .max(200)
      .regex(/^[A-Za-z0-9_.-]+$/),
  })
  .strict();
const pending = new Map<
  string,
  { account: string; controller: AbortController }
>();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new GeminiFault(400, "Invalid Gemini input.");
  return result.data;
}
async function cancelAccount(env: GeminiEnv, account: string) {
  for (const job of pending.values())
    if (job.account === account) job.controller.abort();
  await env.DB.prepare(
    "UPDATE ai_generation_lock SET cancelled=1 WHERE user_id=?",
  )
    .bind(account)
    .run();
}
export async function geminiRoute(
  req: Request,
  env: GeminiEnv,
  account: string,
  body: (r: Request, max?: number) => Promise<unknown>,
  throttle: (key: string, limit: number) => Promise<void>,
) {
  const path = new URL(req.url).pathname;
  if (path === "/api/ai/key") {
    if (req.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT 1 AS configured FROM account_ai_keys WHERE user_id=?",
      )
        .bind(account)
        .first();
      return Response.json({ configured: !!row });
    }
    if (req.method === "PUT") {
      const input = parse(keyInput, await body(req, 1024));
      await throttle("gemini-key:" + account, 10);
      const encrypted = await encryptAccountKey(
        input.key,
        account,
        env.GEMINI_KEY_MASTER,
      );
      await env.DB.prepare(
        "INSERT INTO account_ai_keys(user_id,encrypted,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at",
      )
        .bind(account, JSON.stringify(encrypted), Date.now())
        .run();
      await cancelAccount(env, account);
      return Response.json({ configured: true });
    }
    if (req.method === "DELETE") {
      parse(z.object({}).strict(), await body(req, 1024));
      await throttle("gemini-key:" + account, 10);
      await env.DB.prepare("DELETE FROM account_ai_keys WHERE user_id=?")
        .bind(account)
        .run();
      await cancelAccount(env, account);
      return Response.json({ configured: false });
    }
    throw new GeminiFault(
      405,
      "Use GET, PUT or DELETE for Gemini key settings.",
    );
  }
  if (path === "/api/ai/cancel" && req.method === "POST") {
    const { requestId } = parse(
      z.object({ requestId: z.string().uuid() }).strict(),
      await body(req, 4096),
    );
    const job = pending.get(requestId);
    if (job?.account === account) job.controller.abort();
    await env.DB.prepare(
      "UPDATE ai_generation_lock SET cancelled=1 WHERE user_id=? AND request_id=?",
    )
      .bind(account, requestId)
      .run();
    return Response.json({ ok: true });
  }
  if (path !== "/api/ai/generate" || req.method !== "POST")
    throw new GeminiFault(404, "Route not found.");
  const input = parse(generationInput, await body(req, 4096));
  const requestId =
    req.headers.get("X-Neoform-Generation") || crypto.randomUUID();
  if (!z.string().uuid().safeParse(requestId).success)
    throw new GeminiFault(400, "Invalid generation ID.");
  if (req.signal.aborted) throw new GeminiFault(499, "Generation cancelled.");
  const stored = await env.DB.prepare(
    "SELECT encrypted FROM account_ai_keys WHERE user_id=?",
  )
    .bind(account)
    .first<{ encrypted: string }>();
  if (!stored)
    throw new GeminiFault(
      428,
      "Add your Gemini API key in More settings before generating a program.",
    );
  let key: string;
  try {
    key = await decryptAccountKey(
      JSON.parse(stored.encrypted),
      account,
      env.GEMINI_KEY_MASTER,
    );
  } catch (e) {
    if (e instanceof GeminiFault) throw e;
    throw new GeminiFault(
      503,
      "Stored Gemini key cannot be opened. Replace it in More settings.",
    );
  }
  await throttle("ai:" + account, 3);
  const dailyLimit = Number(env.GEMINI_DAILY_LIMIT || 10);
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100)
    throw new GeminiFault(503, "Invalid server generation allowance.");
  const owner = crypto.randomUUID(),
    now = Date.now();
  const lock = await env.DB.prepare(
    "INSERT INTO ai_generation_lock(singleton,user_id,request_id,owner,expires_at,cancelled) VALUES (1,?,?,?,?,0) ON CONFLICT(singleton) DO UPDATE SET user_id=excluded.user_id,request_id=excluded.request_id,owner=excluded.owner,expires_at=excluded.expires_at,cancelled=0 WHERE ai_generation_lock.expires_at<=? RETURNING owner",
  )
    .bind(account, requestId, owner, now + 130000, now)
    .first<{ owner: string }>();
  if (lock?.owner !== owner)
    throw new GeminiFault(429, "Generator busy. Try again shortly.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.signal.addEventListener("abort", abort, { once: true });
  if (req.signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 110000);
  pending.set(requestId, { account, controller });
  try {
    if (controller.signal.aborted)
      throw new GeminiFault(499, "Generation cancelled.");
    // Atomic persistent allowance across accounts, requests, restarts and isolates;
    // unsuccessful/cancelled attempts count before any model request.
    const row = await env.DB.prepare(
      "INSERT INTO rate_limits(key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    )
      .bind("gemini-global-day", Math.floor(Date.now() / 86400000))
      .first<{ count: number }>();
    if (!row || row.count > dailyLimit)
      throw new GeminiFault(
        429,
        "Daily generation allowance reached. Try tomorrow.",
      );
    const active = await env.DB.prepare(
      "SELECT cancelled FROM ai_generation_lock WHERE owner=?",
    )
      .bind(owner)
      .first<{ cancelled: number }>();
    if (!active || active.cancelled || controller.signal.aborted)
      throw new GeminiFault(499, "Generation cancelled.");
    const generated = await generateGemini({
      key,
      input,
      signal: controller.signal,
    });
    const finished = await env.DB.prepare(
      "SELECT cancelled FROM ai_generation_lock WHERE owner=?",
    )
      .bind(owner)
      .first<{ cancelled: number }>();
    if (!finished || finished.cancelled || controller.signal.aborted)
      throw new GeminiFault(499, "Generation cancelled.");
    return Response.json(generated);
  } catch (e) {
    if (req.signal.aborted) throw new GeminiFault(499, "Generation cancelled.");
    if (e instanceof GeminiFault) throw e;
    throw new GeminiFault(
      controller.signal.aborted ? 504 : 503,
      controller.signal.aborted
        ? "Gemini generation timed out or was cancelled."
        : "Gemini unavailable. No fallback was used.",
    );
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", abort);
    pending.delete(requestId);
    await env.DB.prepare("DELETE FROM ai_generation_lock WHERE owner=?")
      .bind(owner)
      .run();
  }
}
