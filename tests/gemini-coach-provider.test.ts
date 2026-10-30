import { it, expect, vi } from "vitest";
import {
  coachGemini,
  testGemini,
  probeGemini,
  GEMINI_MODEL,
} from "../worker/gemini";
import { buildCoachContext } from "../src/aiCoach";
import { weeklyBrowserFixture } from "./weekly-muscle-fixture";
const key = "synthetic-provider-fixture-only-123456",
  signal = new AbortController().signal;
function fixture() {
  const context = buildCoachContext(weeklyBrowserFixture(Date.now()));
  const input = { question: "Review my training", context, conversation: [] };
  const reply = {
    answer: "Keep the current plan while collecting comparable effort reports.",
    sourceIds: [context.workouts[0].id],
    uncertainties: ["Unreported RIR is unknown."],
    nextCheck: "Confirm effort and setup next session.",
  };
  const output = {
    model: GEMINI_MODEL,
    status: "completed",
    steps: [
      {
        type: "model_output",
        content: [{ type: "text", text: JSON.stringify(reply) }],
      },
    ],
    usage: { total_input_tokens: 100, total_output_tokens: 60 },
  };
  const fetcher = vi.fn(async (url: any) =>
    Response.json(
      String(url).endsWith("/interactions")
        ? output
        : {
            name: "models/" + GEMINI_MODEL,
            supportedGenerationMethods: ["generateContent"],
          },
    ),
  );
  return { input, reply, output, fetcher };
}
it("sends bounded stateless coaching with training rules and validates observed source references", async () => {
  const f = fixture(),
    before = JSON.stringify(f.input);
  const result = await coachGemini({
    key,
    input: f.input,
    signal,
    fetcher: f.fetcher as typeof fetch,
  });
  expect(result.reply).toEqual(f.reply);
  expect(result.proof.inputTokens).toBe(100);
  expect(JSON.stringify(f.input)).toBe(before);
  const payload = JSON.parse((f.fetcher.mock.calls[1] as any)[1].body);
  expect(payload.store).toBe(false);
  expect(payload.tools).toBeUndefined();
  expect(payload.agent).toBeUndefined();
  expect(payload.system_instruction).toContain("NEOFORM hypertrophy policy v1");
  expect(payload.system_instruction).toContain("Missing data is unknown");
  expect(payload.system_instruction).toContain("do not assign new numeric");
  expect(payload.input).not.toContain(key);
  expect(payload.response_format.schema.additionalProperties).toBe(false);
});
it.each([
  "unknown source",
  "tool use",
  "wrong model",
  "missing usage",
  "key echo",
  "invalid schema",
])("rejects %s without substituting a template", async (kind) => {
  const f = fixture();
  if (kind === "unknown source")
    f.reply.sourceIds = ["not-in-supplied-evidence"];
  if (kind === "key echo") f.reply.answer = key;
  if (kind === "invalid schema") (f.reply as any).apply = { sets: 100 };
  f.output.steps[0].content[0].text = JSON.stringify(f.reply);
  if (kind === "tool use") (f.output.usage as any).total_tool_use_tokens = 1;
  if (kind === "wrong model") (f.output as any).model = "some-other-model";
  if (kind === "missing usage")
    delete (f.output.usage as any).total_output_tokens;
  await expect(
    coachGemini({
      key,
      input: f.input,
      signal,
      fetcher: f.fetcher as typeof fetch,
    }),
  ).rejects.toMatchObject({ status: 502 });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("connection testing never generates content and rejects unavailable models", async () => {
  const f = fixture();
  expect(
    await testGemini({ key, signal, fetcher: f.fetcher as typeof fetch }),
  ).toEqual({ connected: true, model: GEMINI_MODEL });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const denied = vi.fn(
    async () => new Response("sensitive upstream body", { status: 403 }),
  );
  await expect(
    testGemini({ key, signal, fetcher: denied as typeof fetch }),
  ).rejects.toMatchObject({ status: 422 });
});
it.each([false, true])(
  "explains a rejected authorization key without exposing Google's body (array %s)",
  async (array) => {
    const error = {
      error: {
        code: 401,
        status: "UNAUTHENTICATED",
        message: `API key not valid: ${key}`,
        details: [{ reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" }],
      },
    };
    const fetcher = vi.fn(async () =>
      Response.json(array ? [error] : error, { status: 401 }),
    );
    const fault = await testGemini({
      key,
      signal,
      fetcher: fetcher as typeof fetch,
    }).catch((e) => e);
    expect(fault).toMatchObject({
      status: 422,
      code: "GEMINI_KEY_TYPE_UNSUPPORTED",
    });
    expect(fault.message).not.toContain(key);
    expect(fault.message).toContain("AI Studio");
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([
  [400, "API_KEY_INVALID", "", "GEMINI_KEY_REJECTED"],
  [403, "SERVICE_DISABLED", "", "GEMINI_API_DISABLED"],
  [403, "API_KEY_HTTP_REFERRER_BLOCKED", "", "GEMINI_KEY_RESTRICTED"],
  [403, "", "Your API key was reported as leaked.", "GEMINI_KEY_BLOCKED"],
  [403, "", "Your project has been denied access.", "GEMINI_ACCESS_DENIED"],
  [429, "", "Resource exhausted.", "GEMINI_QUOTA"],
  [404, "", "Model missing.", "GEMINI_MODEL_UNAVAILABLE"],
  [503, "", "", "GEMINI_UNAVAILABLE"],
])(
  "classifies %s/%s into a static actionable fault",
  async (status, reason, message, code) => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { message: `${message} ${key}`, details: [{ reason }] } },
        { status: status as number },
      ),
    );
    try {
      await testGemini({ key, signal, fetcher: fetcher as typeof fetch });
      throw Error("Expected a provider fault");
    } catch (e) {
      expect(e).toMatchObject({ code });
      expect((e as Error).message).not.toContain(key);
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("tests actual inference with a fixed non-personal prompt, no tools and strict provider evidence", async () => {
  const f = fixture();
  f.output.steps[0].content[0].text = JSON.stringify({ status: "ready" });
  const result = await probeGemini({
    key,
    signal,
    fetcher: f.fetcher as typeof fetch,
  });
  expect(result).toMatchObject({
    connected: true,
    reply: true,
    model: GEMINI_MODEL,
    proof: { provider: "gemini", model: GEMINI_MODEL },
  });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = f.fetcher.mock.calls[0] as any;
  expect(url).toMatch(/\/interactions$/);
  const payload = JSON.parse(options.body);
  expect(payload.input).not.toMatch(
    /workouts|profile|program|synthetic-provider/,
  );
  expect(payload.tools).toBeUndefined();
  expect(payload.agent).toBeUndefined();
  expect(payload.store).toBe(false);
  expect(payload.generation_config.max_output_tokens).toBeLessThanOrEqual(128);
});
it.each(["wrong reply", "tool use", "wrong model", "missing usage"])(
  "never claims inference works for %s",
  async (kind) => {
    const f = fixture();
    f.output.steps[0].content[0].text = JSON.stringify({ status: "ready" });
    if (kind === "wrong reply")
      f.output.steps[0].content[0].text = JSON.stringify({ status: "failed" });
    if (kind === "tool use") (f.output.usage as any).total_tool_use_tokens = 1;
    if (kind === "wrong model") f.output.model = "another-model" as any;
    if (kind === "missing usage")
      delete (f.output.usage as any).total_output_tokens;
    await expect(
      probeGemini({ key, signal, fetcher: f.fetcher as typeof fetch }),
    ).rejects.toMatchObject({ status: 502 });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  },
);
it("bounds and cancels oversized provider errors instead of relaying their body", async () => {
  let cancelled = false;
  const fetcher = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(key.repeat(2000)));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 401 },
      ),
  );
  await expect(
    testGemini({ key, signal, fetcher: fetcher as typeof fetch }),
  ).rejects.toMatchObject({ status: 422, code: "GEMINI_KEY_REJECTED" });
  expect(cancelled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
