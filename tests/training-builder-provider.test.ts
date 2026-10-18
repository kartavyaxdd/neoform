import { expect, it, vi } from "vitest";
import { generateGemini, GEMINI_MODEL } from "../worker/gemini";
const preferences = {
  goal: "Build muscle",
  experience: "Intermediate",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
};
const fixture = () => ({
  name: "FIXTURE ONLY",
  description: "Synthetic provider fixture",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: `Day ${i}`,
    exercises: [
      { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
});

it("fixture-only provider restricts technique schema and communicates opt-in/manual-only boundaries", async () => {
  const bodies: any[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (!url.endsWith("/interactions"))
      return Response.json({
        name: `models/${GEMINI_MODEL}`,
        supportedGenerationMethods: ["generateContent"],
      });
    const body = JSON.parse(options!.body as string);
    bodies.push(body);
    const requested = JSON.parse(body.input).preferences;
    const program = fixture();
    if (requested.technique === "tempo" && requested.experience !== "New")
      Object.assign(program.workouts[0].exercises[0], {
        technique: "tempo",
        tempo: { eccentric: 3, pause: 1, concentric: 1 },
      });
    return Response.json({
      model: GEMINI_MODEL,
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(program) }],
        },
      ],
      usage: { total_input_tokens: 10, total_output_tokens: 20 },
    });
  });
  for (const input of [
    preferences,
    { ...preferences, technique: "tempo" },
    { ...preferences, technique: "tempo", experience: "New" },
  ]) {
    const result = await generateGemini({
      input,
      key: "synthetic-fixture-only",
      signal: new AbortController().signal,
      fetcher: fetcher as typeof fetch,
    });
    if ("technique" in input && input.experience !== "New")
      expect(result.program.workouts[0].exercises[0]).toMatchObject({
        technique: "tempo",
        tempo: { eccentric: 3, pause: 1, concentric: 1 },
      });
  }
  const enumFor = (body: any) =>
    body.response_format.schema.properties.workouts.items.properties.exercises
      .items.properties.technique.enum;
  expect(enumFor(bodies[0])).toEqual(["straight"]);
  expect(enumFor(bodies[1])).toEqual(["straight", "tempo"]);
  expect(enumFor(bodies[2])).toEqual(["straight"]);
  expect(bodies[1].system_instruction).toContain("explicit tempo opt-in");
  expect(bodies[1].system_instruction).toContain("manual-only");
  expect(bodies[0].system_instruction).toContain("physical PDF");
  expect(bodies[0].tools).toBeUndefined();
  expect(bodies[0].model).toBe(GEMINI_MODEL);
});

it("fixture-only actual provider output cannot bypass opt-in, catalog, equipment or movement limitations", async () => {
  const cadence = {
    technique: "tempo",
    tempo: { eccentric: 3, pause: 1, concentric: 1 },
  };
  for (const [patch, input] of [
    [cadence, preferences],
    [cadence, { ...preferences, technique: "tempo", experience: "New" }],
    [
      { ...cadence, exerciseId: "not-in-catalog" },
      { ...preferences, technique: "tempo" },
    ],
    [
      { ...cadence, exerciseId: "bench" },
      { ...preferences, technique: "tempo" },
    ],
    [
      cadence,
      {
        ...preferences,
        technique: "tempo",
        limitation: "Avoid deep knee bend",
      },
    ],
    [
      { technique: "superset", techniqueGroup: "fabricated" },
      { ...preferences, technique: "tempo" },
    ],
  ]) {
    const program = fixture();
    Object.assign(program.workouts[0].exercises[0], patch);
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/interactions")
        ? Response.json({
            model: GEMINI_MODEL,
            status: "completed",
            steps: [
              {
                type: "model_output",
                content: [{ type: "text", text: JSON.stringify(program) }],
              },
            ],
            usage: { total_input_tokens: 10, total_output_tokens: 20 },
          })
        : Response.json({
            name: `models/${GEMINI_MODEL}`,
            supportedGenerationMethods: ["generateContent"],
          }),
    );
    await expect(
      generateGemini({
        input,
        key: "synthetic-fixture-only",
        signal: new AbortController().signal,
        fetcher: fetcher as typeof fetch,
      }),
    ).rejects.toThrow(/invalid program.*unchanged/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
});
