import { z } from "zod";
import { HistoryStorage } from "./historyStorage";
import { restAlertsRoute, type RestAlertEnv } from "./restAlerts";
import { geminiRoute, type GeminiEnv } from "./geminiRoutes";
export class ProfileFault extends Error {
  readonly accessMode = "workspace-profiles";
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Profile = { id: string; name: string; owner: string; locked: number };
type Helpers = {
  body: (req: Request, max?: number) => Promise<unknown>;
  hash: (password: string, salt: string) => Promise<string>;
  throttle: (key: string, limit: number) => Promise<void>;
};
const bytes = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
const matches = (a: string, b: string) => {
  let n = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    n |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return n === 0;
};
const identity = (p: Profile) => ({
  id: p.id === "sharma" ? "public-workspace" : `workspace-profile:${p.id}`,
  profileId: p.id,
  profileName: p.name,
  kind: "workspace",
  accessMode: "workspace-profiles",
  storageFormat: 2,
  aiAccess: p.id === "sharma" && p.locked === 1,
});
const tokenOf = (req: Request) =>
  req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)neoform_profile=([a-f0-9]{64})(?:;|$)/)?.[1];
const cookie = (req: Request, token: string, age = 604800) =>
  `neoform_profile=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
export async function workspaceProfilesRoute(
  req: Request,
  env: RestAlertEnv & GeminiEnv,
  helpers: Helpers,
) {
  const path = new URL(req.url).pathname,
    method = req.method;
  if (path === "/api/profiles" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id,name,locked FROM workspace_profiles ORDER BY CASE id WHEN 'sharma' THEN 0 ELSE 1 END",
    ).all<{ id: string; name: string; locked: number }>();
    return Response.json({
      profiles: rows.results.map((p) => ({ ...p, locked: !!p.locked })),
    });
  }
  if (path === "/api/profiles/open" && method === "POST") {
    const parsed = z
      .object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        password: z.string().max(128).optional(),
      })
      .strict()
      .safeParse(await helpers.body(req, 2048));
    if (!parsed.success) throw new ProfileFault(400, "Choose a valid profile.");
    await helpers.throttle(
      "profile-ip:" +
        (await digest(req.headers.get("CF-Connecting-IP") || "local")),
      40,
    );
    await helpers.throttle("profile-open:" + parsed.data.id, 12);
    const p = await env.DB.prepare(
      "SELECT id,name,owner,locked,pass_hash,salt FROM workspace_profiles WHERE id=?",
    )
      .bind(parsed.data.id)
      .first<Profile & { pass_hash: string | null; salt: string | null }>();
    if (!p) throw new ProfileFault(404, "Profile not found.");
    if (p.locked) {
      if (!p.pass_hash || !p.salt)
        throw new ProfileFault(
          503,
          "Profile lock is being set up. Try again shortly.",
        );
      if (
        !matches(
          await helpers.hash(parsed.data.password || "", p.salt),
          p.pass_hash,
        )
      )
        throw new ProfileFault(401, "Incorrect profile password.");
    }
    const token = bytes(32),
      old = tokenOf(req);
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM workspace_profile_sessions WHERE expires_at<?",
      ).bind(Date.now()),
      env.DB.prepare(
        "DELETE FROM workspace_profile_sessions WHERE token_hash=?",
      ).bind(old ? await digest(old) : ""),
      env.DB.prepare(
        "INSERT INTO workspace_profile_sessions(token_hash,profile_id,expires_at) VALUES (?,?,?)",
      ).bind(await digest(token), p.id, Date.now() + 604800000),
    ]);
    return Response.json(identity(p), {
      headers: { "Set-Cookie": cookie(req, token) },
    });
  }
  const token = tokenOf(req);
  if (!token) throw new ProfileFault(401, "Choose your profile.");
  const p = await env.DB.prepare(
    "SELECT p.id,p.name,p.owner,p.locked FROM workspace_profiles p JOIN workspace_profile_sessions s ON s.profile_id=p.id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(await digest(token), Date.now())
    .first<Profile>();
  if (!p) throw new ProfileFault(401, "Unlock your profile again.");
  const user = identity(p),
    expected = req.headers.get("X-Neoform-Account");
  if (expected !== null && expected !== user.id)
    throw new ProfileFault(
      412,
      "Profile changed. Reopen the correct profile before syncing.",
    );
  if (path === "/api/profiles/lock" && method === "POST") {
    await env.DB.prepare(
      "DELETE FROM workspace_profile_sessions WHERE token_hash=?",
    )
      .bind(await digest(token))
      .run();
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie(req, "", 0) } },
    );
  }
  if (path === "/api/me" && method === "GET") return Response.json(user);
  if (path.startsWith("/api/ai/")) {
    if (!user.aiAccess || expected !== user.id)
      throw new ProfileFault(
        403,
        "Gemini is available only inside the locked Sharma profile.",
      );
    return geminiRoute(
      req,
      env,
      "workspace-profile:sharma",
      helpers.body,
      helpers.throttle,
      "sharma",
    );
  }
  if (path.startsWith("/api/storage/"))
    return new HistoryStorage(env.DB, null, p.owner).route(req, helpers.body);
  if (path.startsWith("/api/rest-alerts/"))
    return restAlertsRoute(req, env, user.id, helpers.body, helpers.throttle);
  if (path === "/api/data")
    throw new ProfileFault(
      426,
      "Use the current profile-aware history format. Reload the app.",
    );
  throw new ProfileFault(
    403,
    "Private account administration and AI are unavailable in workspace profiles.",
  );
}
