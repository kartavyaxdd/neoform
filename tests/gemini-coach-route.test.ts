import { it, expect, vi, afterEach } from "vitest";
import worker from "../worker/index";
import { encryptAccountKey, GEMINI_MODEL } from "../worker/gemini";
import { buildCoachContext } from "../src/aiCoach";
import { weeklyBrowserFixture } from "./weekly-muscle-fixture";
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const account = "workspace-profile:sharma",
    master = "22".repeat(32),
    key = "synthetic-coach-route-fixture-only-123456";
  const cipher = JSON.stringify(await encryptAccountKey(key, account, master));
  const job = { owner: "", cancelled: 0, count: 0, cipher, changed: false };
  const env = {
    PUBLIC_WORKSPACE: "enabled",
    WORKSPACE_PROFILES: "enabled",
    GEMINI_KEY_MASTER: master,
    GEMINI_DAILY_LIMIT: "10",
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("JOIN workspace_profile_sessions"))
              return {
                id: "sharma",
                name: "Synthetic",
                owner: "public-workspace",
                locked: 1,
              };
            if (sql.startsWith("SELECT encrypted"))
              return { encrypted: job.changed ? "replaced" : job.cipher };
            if (sql.startsWith("INSERT INTO ai_generation_lock")) {
              job.owner = args[2];
              return { owner: job.owner };
            }
            if (sql.startsWith("SELECT cancelled"))
              return { cancelled: job.cancelled };
            if (sql.startsWith("INSERT INTO rate_limits"))
              return {
                count: args[0] === "gemini-global-day" ? ++job.count : 1,
              };
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
        }),
      })),
    },
    ASSETS: { fetch: vi.fn() },
  } as any;
  const context = buildCoachContext(weeklyBrowserFixture(Date.now())),
    input = { question: "Explain my next session", context, conversation: [] };
  const reply = {
    answer: "Confirm effort before changing the current targets.",
    sourceIds: [],
    uncertainties: ["Effort is partly unknown."],
    nextCheck: "Confirm setup next time.",
  };
  const fetcher = vi.fn(async (url: any) =>
    Response.json(
      String(url).endsWith("/interactions")
        ? {
            model: GEMINI_MODEL,
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: JSON.stringify(reply) }],
              },
            ],
            usage: { total_input_tokens: 20, total_output_tokens: 30 },
          }
        : {
            name: "models/" + GEMINI_MODEL,
            supportedGenerationMethods: ["generateContent"],
          },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const request = () =>
    new Request("https://example.test/api/ai/chat", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        Cookie: "neoform_profile=" + "a".repeat(64),
        "Content-Type": "application/json",
        "X-Neoform-Account": "public-workspace",
        "X-Neoform-Generation": crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    });
  return { env, job, fetcher, input, request, reply };
}
it("authenticated profile chat decrypts only its key, returns provider proof and releases its lease", async () => {
  const f = await fixture(),
    r = await worker.fetch(f.request(), f.env);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    reply: f.reply,
    proof: { provider: "gemini", model: GEMINI_MODEL },
  });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const sql = f.env.DB.prepare.mock.calls.map((c: any) => c[0]).join("\n");
  expect(sql).toContain("profile_ai_keys");
  expect(sql).not.toContain("account_ai_keys");
  expect(sql).toContain("DELETE FROM ai_generation_lock");
});
it.each(["daily allowance", "cancelled", "rotated key"])(
  "does not call Google for %s",
  async (kind) => {
    const f = await fixture();
    if (kind === "daily allowance") f.job.count = 10;
    if (kind === "cancelled") f.job.cancelled = 1;
    if (kind === "rotated key") {
      const prepare = f.env.DB.prepare;
      let reads = 0;
      f.env.DB.prepare = (sql: string) => {
        if (sql.startsWith("SELECT encrypted")) {
          reads++;
          if (reads > 1) f.job.changed = true;
        }
        return prepare(sql);
      };
    }
    const r = await worker.fetch(f.request(), f.env);
    expect(r.status).toBe(
      kind === "daily allowance" ? 429 : kind === "cancelled" ? 499 : 409,
    );
    expect(f.fetcher).not.toHaveBeenCalled();
  },
);
it.each(["cancelled", "rotated key"])(
  "discards a completed upstream reply when %s during generation",
  async (kind) => {
    const f = await fixture(),
      upstream = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url: any) => {
      const result = await upstream(url);
      if (String(url).endsWith("/interactions")) {
        if (kind === "cancelled") f.job.cancelled = 1;
        else f.job.changed = true;
      }
      return result;
    });
    const r = await worker.fetch(f.request(), f.env);
    expect(r.status).toBe(kind === "cancelled" ? 499 : 409);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(await r.text()).not.toContain(f.reply.answer);
  },
);
