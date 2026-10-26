import { it, expect, vi } from "vitest";
import { coachGemini, testGemini, GEMINI_MODEL } from "../worker/gemini";
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
