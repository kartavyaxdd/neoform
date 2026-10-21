import { z } from "zod";
import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
export interface RestAlertEnv {
  REST_ALERTS?: DurableObjectNamespace;
  REST_PUSH_VAPID_PUBLIC_KEY?: string;
  REST_PUSH_VAPID_PRIVATE_KEY?: string;
}
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      value.length <= 2048 &&
      (u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const subscriptionSchema = z
  .object({
    endpoint: z.string().refine(validPushEndpoint),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        auth: z.string().regex(/^[\w-]{22}$/),
        p256dh: z.string().regex(/^[\w-]{87}$/),
      })
      .strict(),
  })
  .strict();
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
type Device = {
  tokenHash: string;
  subscription: PushSubscription | null;
  version: number;
  signature?: string;
  job?: { timerId: string; version: number; deadline: number };
  window?: number;
  count?: number;
};
export class RestAlertDevice {
  constructor(
    private ctx: DurableObjectState,
    private env: RestAlertEnv,
  ) {}
  async fetch(req: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const token = req.headers.get("X-Rest-Device-Token") ?? "";
        if (!/^[a-f0-9]{64}$/.test(token))
          return response({ error: "Invalid device capability." }, 403);
        const tokenHash = await digest(token),
          op = new URL(req.url).pathname.split("/").at(-1),
          input = (await req.json()) as Record<string, unknown>;
        let state = await this.ctx.storage.get<Device>("device");
        if (state && state.tokenHash !== tokenHash)
          return response({ error: "Invalid device capability." }, 403);
        if (op === "register") {
          const sub = subscriptionSchema.parse(input.subscription);
          state = {
            tokenHash,
            subscription: {
              ...sub,
              expirationTime: sub.expirationTime ?? null,
            },
            version: state?.version ?? 0,
          };
          await this.ctx.storage.deleteAlarm();
          await this.ctx.storage.put("device", state);
          return response({ ok: true });
        }
        if (!state)
          return response({ error: "Register this device first." }, 404);
        const version = z
            .number()
            .int()
            .min(1)
            .max(Number.MAX_SAFE_INTEGER)
            .parse(input.version),
          signature = JSON.stringify({ op, input });
        if (
          version < state.version ||
          (version === state.version && signature !== state.signature)
        )
          return response({ error: "Stale timer operation." }, 409);
        if (version === state.version)
          return response({ ok: true, deadline: state.job?.deadline });
        const window = Math.floor(Date.now() / 3600000);
        state.count = state.window === window ? (state.count ?? 0) + 1 : 1;
        state.window = window;
        if (state.count > 120)
          return response(
            {
              error:
                "Too many rest timer changes. Foreground timing remains available.",
            },
            429,
          );
        if (op === "schedule") {
          if (!state.subscription)
            return response({ error: "Enable notifications again." }, 410);
          const timerId = z.string().min(1).max(100).parse(input.timerId),
            delay = z.number().int().min(1).max(3600).parse(input.delaySeconds);
          state.job = { timerId, version, deadline: Date.now() + delay * 1000 };
        } else if (op === "cancel" || op === "disable") {
          state.job = undefined;
          if (op === "disable") state.subscription = null;
        } else
          return response({ error: "Unknown notification operation." }, 404);
        state.version = version;
        state.signature = signature;
        await this.ctx.storage.put("device", state);
        if (state.job) await this.ctx.storage.setAlarm(state.job.deadline);
        else await this.ctx.storage.deleteAlarm();
        return response({ ok: true, deadline: state.job?.deadline });
      } catch {
        return response({ error: "Invalid notification request." }, 400);
      }
    });
  }
  async alarm() {
    const state = await this.ctx.storage.get<Device>("device"),
      job = state?.job;
    if (!state || !job || !state.subscription) return;
    const clear = async () => {
      const latest = await this.ctx.storage.get<Device>("device");
      if (latest?.version === job.version) {
        latest.job = undefined;
        await this.ctx.storage.put("device", latest);
      }
    };
    if (
      Date.now() > job.deadline + 60000 ||
      !this.env.REST_PUSH_VAPID_PRIVATE_KEY ||
      !this.env.REST_PUSH_VAPID_PUBLIC_KEY
    ) {
      await clear();
      return;
    }
    if (Date.now() < job.deadline) {
      await this.ctx.storage.setAlarm(job.deadline);
      return;
    }
    const payload = await buildPushPayload(
      {
        data: {
          type: "neoform-rest",
          timerId: job.timerId,
          version: job.version,
          expiresAt: job.deadline + 60000,
        },
        options: { ttl: 60, urgency: "high" },
      },
      state.subscription,
      {
        subject: "https://neoform-bca721354a.kartavya-neoform.workers.dev",
        publicKey: this.env.REST_PUSH_VAPID_PUBLIC_KEY,
        privateKey: this.env.REST_PUSH_VAPID_PRIVATE_KEY,
      },
    );
    const sent = await fetch(state.subscription.endpoint, {
      ...payload,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (sent.status >= 500 || sent.status === 429)
      throw Error("Transient push service failure.");
    if ([401, 403, 404, 410].includes(sent.status)) {
      const latest = await this.ctx.storage.get<Device>("device");
      if (latest?.version === job.version) {
        latest.subscription = null;
        latest.job = undefined;
        await this.ctx.storage.put("device", latest);
      }
      return;
    }
    await clear();
  }
}
export async function restAlertsRoute(
  req: Request,
  env: RestAlertEnv,
  owner: string,
  readBody: (req: Request, max?: number) => Promise<unknown>,
  limit: (key: string, n: number) => Promise<void>,
) {
  const url = new URL(req.url),
    enabled = !!(
      env.REST_ALERTS &&
      env.REST_PUSH_VAPID_PUBLIC_KEY &&
      env.REST_PUSH_VAPID_PRIVATE_KEY
    );
  if (url.pathname === "/api/rest-alerts/config" && req.method === "GET")
    return response({
      enabled,
      publicKey: enabled ? env.REST_PUSH_VAPID_PUBLIC_KEY : undefined,
    });
  if (!enabled)
    return response(
      {
        error:
          "Background rest alerts are unavailable. Foreground timing still works.",
      },
      503,
    );
  const match = url.pathname.match(
    /^\/api\/rest-alerts\/devices\/([a-f0-9-]{36})\/(register|schedule|cancel|disable)$/,
  );
  if (!match || req.method !== "POST")
    return response({ error: "Unknown rest alert route." }, 404);
  if (match[2] === "register")
    await limit(
      "rest-register:" +
        (await digest(req.headers.get("CF-Connecting-IP") ?? "local")),
      10,
    );
  const input = await readBody(req, 4096),
    id = env.REST_ALERTS!.idFromName(owner + ":" + match[1]);
  return env.REST_ALERTS!.get(id).fetch(
    new Request("https://device/" + match[2], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rest-Device-Token": req.headers.get("X-Rest-Device-Token") ?? "",
      },
      body: JSON.stringify(input),
    }),
  );
}
