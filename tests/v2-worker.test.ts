import { it, expect, vi, afterEach } from "vitest";
import worker from "../worker/index";
import { encryptAccountKey, GEMINI_MODEL } from "../worker/gemini";
const input = {
  goal: "Build muscle",
  experience: "New",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
};
const program = {
  name: "FIXTURE ONLY - NOT LIVE",
  description: "Synthetic upstream fixture",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: "Day " + i,
    exercises: [
      { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
};
const master = "11".repeat(32),
  key = "AQ.synthetic.fixture.only-123456789";
async function env(count = 1, globalCount = 1, configured = true) {
  const encrypted = JSON.stringify(
    await encryptAccountKey(key, "synthetic-a", master),
  );
  return {
    GEMINI_KEY_MASTER: master,
    ASSETS: { fetch: vi.fn() },
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () =>
            sql.startsWith("SELECT u.id")
              ? {
                  id: "synthetic-a",
                  email: "fixture@example.test",
                  password_hash: "unused",
                  salt: "unused",
                }
              : sql.startsWith("SELECT encrypted")
                ? configured
                  ? { encrypted }
                  : null
                : sql.startsWith("INSERT INTO ai_generation_lock")
                  ? { owner: args[2] }
                  : sql.startsWith("SELECT cancelled")
                    ? { cancelled: 0 }
                    : {
                        count:
                          args[0] === "gemini-global-day" ? globalCount : count,
                      },
          run: async () => ({ meta: { changes: 1 } }),
        }),
      })),
    },
  } as any;
}
function req(account = "synthetic-a", signal?: AbortSignal) {
  return new Request("http://localhost:8787/api/ai/generate", {
    method: "POST",
    headers: {
      Origin: "http://localhost:8787",
      "Content-Type": "application/json",
      Cookie: "neoform_session=" + "a".repeat(64),
      "X-Neoform-Account": account,
    },
    body: JSON.stringify(input),
    signal,
  });
}
const response = (p: unknown = program) => ({
  status: "completed",
  model: GEMINI_MODEL,
  steps: [
    {
      type: "model_output",
      content: [{ type: "text", text: JSON.stringify(p) }],
    },
  ],
  usage: {
    total_input_tokens: 50,
    total_output_tokens: 80,
    total_tool_use_tokens: 0,
  },
});
const upstream = (data: unknown = response()) =>
  vi.fn(async (url: any) =>
    String(url).endsWith("/interactions")
      ? Response.json(data)
      : Response.json({
          name: "models/" + GEMINI_MODEL,
          supportedGenerationMethods: ["generateContent"],
        }),
  );
afterEach(() => vi.unstubAllGlobals());
it("missing key is private and never calls a provider or sidecar", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const r = await worker.fetch(req(), await env(1, 1, false));
  expect(r.status).toBe(428);
  expect(((await r.json()) as any).error).toContain("More settings");
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(spy).not.toHaveBeenCalled();
});
it("account mismatch and persistent account/global caps precede model calls", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  expect((await worker.fetch(req("synthetic-b"), await env())).status).toBe(
    412,
  );
  expect((await worker.fetch(req(), await env(4))).status).toBe(429);
  expect((await worker.fetch(req(), await env(1, 11))).status).toBe(429);
  expect(spy).not.toHaveBeenCalled();
});
it("fixture-only success has Gemini evidence but no browser key or upstream cookie", async () => {
  const spy = upstream();
  vi.stubGlobal("fetch", spy);
  const r = await worker.fetch(req(), await env());
  expect(r.status).toBe(200);
  const result = (await r.json()) as any;
  expect(result.proof).toEqual({
    provider: "gemini",
    model: GEMINI_MODEL,
    inputTokens: 50,
    outputTokens: 80,
    toolCalls: 0,
    toolsProvided: 0,
    agentLoop: false,
  });
  expect(JSON.stringify(result)).not.toContain(key);
  expect(JSON.stringify(spy.mock.calls)).not.toContain("neoform_session");
  expect(spy.mock.calls.map((c) => String(c[0]))).toEqual([
    "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL,
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  ]);
});
it("malformed output and secret fields are rejected independently", async () => {
  for (const p of [null, { name: "bad" }, { ...program, secret: key }]) {
    vi.stubGlobal("fetch", upstream(response(p)));
    const r = await worker.fetch(req(), await env());
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain(key);
  }
});
it("tool/model responses and provider diagnostics cannot leak credentials", async () => {
  for (const bad of [
    { ...response(), model: "other" },
    { ...response(), steps: [{ type: "function_call", name: "execute" }] },
    {
      ...response(),
      usage: {
        total_input_tokens: 50,
        total_output_tokens: 80,
        total_tool_use_tokens: 1,
      },
    },
  ]) {
    vi.stubGlobal("fetch", upstream(bad));
    expect((await worker.fetch(req(), await env())).status).toBe(502);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: { message: key } }, { status: 403 }),
    ),
  );
  const r = await worker.fetch(req(), await env());
  expect(r.status).toBe(422);
  expect(await r.text()).not.toContain(key);
});
it("incoming disconnect aborts model request and removes listener", async () => {
  const c = new AbortController(),
    request = req("synthetic-a", c.signal),
    remove = vi.spyOn(request.signal, "removeEventListener");
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: any, options: any) => {
      signal = options.signal;
      return new Promise<Response>((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("disconnected", "AbortError")),
          { once: true },
        ),
      );
    }),
  );
  const pending = worker.fetch(request, await env());
  for (let i = 0; i < 100 && !signal; i++)
    await new Promise((r) => setTimeout(r, 1));
  expect(signal).toBeDefined();
  c.abort();
  expect((await pending).status).toBe(499);
  expect(signal?.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("already disconnected requests never call a provider", async () => {
  const c = new AbortController();
  c.abort();
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  expect(
    (await worker.fetch(req("synthetic-a", c.signal), await env())).status,
  ).toBe(499);
  expect(spy).not.toHaveBeenCalled();
});
