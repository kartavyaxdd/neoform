import { it, expect, vi } from "vitest";
import {
  encryptAccountKey,
  decryptAccountKey,
  generateGemini,
  GEMINI_MODEL,
} from "../worker/gemini";
const master = "11".repeat(32),
  account = "qa-only-account";
it("AES-GCM binds ciphertext to account, uses fresh nonce, and never stores plaintext", async () => {
  const key = "AIza-synthetic-fixture-only-not-real-123456";
  const a = await encryptAccountKey(key, account, master),
    b = await encryptAccountKey(key, account, master);
  expect(a).not.toEqual(b);
  expect(JSON.stringify(a)).not.toContain(key);
  expect(await decryptAccountKey(a, account, master)).toBe(key);
  await expect(
    decryptAccountKey(a, "another-account", master),
  ).rejects.toThrow();
  await expect(
    decryptAccountKey(
      {
        ...a,
        ciphertext:
          (a.ciphertext[0] === "0" ? "1" : "0") + a.ciphertext.slice(1),
      },
      account,
      master,
    ),
  ).rejects.toThrow();
});
it("fixture-only Gemini request sends header key and schema, no tools, then validates domain constraints", async () => {
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
    name: "FIXTURE ONLY - Not live AI",
    description: "Synthetic upstream test",
    weeks: 6,
    workouts: [0, 1].map((i) => ({
      name: "Day " + i,
      exercises: [
        { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
      ],
    })),
  };
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/interactions")
      ? Response.json({
          status: "completed",
          model: GEMINI_MODEL,
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: JSON.stringify(program) }],
            },
          ],
          usage: {
            total_input_tokens: 50,
            total_output_tokens: 80,
          },
        })
      : Response.json({
          name: "models/" + GEMINI_MODEL,
          supportedGenerationMethods: ["generateContent"],
        }),
  );
  const result = await generateGemini({
    key: "synthetic-fixture-only",
    input,
    signal: new AbortController().signal,
    fetcher: fetcher as typeof fetch,
  });
  expect(result.program).toEqual(program);
  expect(result.proof.provider).toBe("gemini");
  expect(result.proof.toolsProvided).toBe(0);
  const [url, options] = fetcher.mock.calls[1] as any;
  expect(url).not.toContain("synthetic");
  expect(options.headers["x-goog-api-key"]).toBe("synthetic-fixture-only");
  const payload = JSON.parse(options.body);
  expect(payload.tools).toBeUndefined();
  expect(payload.agent).toBeUndefined();
  expect(payload.store).toBe(false);
  expect(payload.generation_config.max_output_tokens).toBe(4096);
  expect(payload.generation_config.thinking_level).toBe("low");
  expect(payload.response_format.schema).toBeDefined();
  expect(JSON.stringify(payload.response_format.schema)).not.toMatch(
    /minLength|maxLength/,
  );
  expect(payload.response_format.schema.properties.workouts.minItems).toBe(2);
  expect(payload.response_format.schema.properties.workouts.maxItems).toBe(2);
  // Source-backed training policy must reach the actual upstream request,
  // not live only in documentation or a UI label.
  expect(payload.system_instruction).toContain("NEOFORM hypertrophy policy v1");
  for (const heading of ["Specificity:", "Overload:", "Fatigue management:", "SRA:", "Variation:", "Phase potentiation:", "Individualization:"])
    expect(payload.system_instruction).toContain(heading);
  expect(payload.system_instruction).toContain("Recovery takes priority over progression");
  expect(payload.system_instruction).toContain("Do not infer growth from pump or soreness");
  expect(payload.system_instruction).toContain("Beginner:");
  expect(payload.system_instruction).toContain("no intentional failure");
  expect(payload.system_instruction).toContain("Missing history is unknown");
});
