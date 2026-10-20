import { z } from "zod";
import * as D from "./domain";
export const catalogExercises = D.catalog;
export const generationInput = z
  .object({
    goal: z.enum(["Build muscle", "Strength + muscle", "Consistency"]),
    experience: z.enum(["New", "Intermediate", "Advanced"]),
    days: z.number().int().min(2).max(6),
    minutes: z.union([
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(75),
    ]),
    equipment: z
      .array(z.enum(D.equipment))
      .min(1)
      .max(6)
      .refine((x) => new Set(x).size === x.length),
    emphasis: z.enum(["Balanced", ...D.muscles]),
    // Omission preserves historical requests and means straight sets only.
    technique: z.enum(["straight", "tempo"]).optional(),
    limitation: z.enum([
      "None",
      "Avoid overhead",
      "Avoid deep knee bend",
      "Avoid heavy hinges",
    ]),
  })
  .strict();
export type GenerationInput = z.infer<typeof generationInput>;
export const generatedSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().min(1).max(800),
    weeks: z.number().int().min(4).max(8),
    workouts: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            exercises: z
              .array(
                z
                  .object({
                    exerciseId: z.enum(
                      D.catalog.map((e) => e.id) as [string, ...string[]],
                    ),
                    sets: z.number().int().min(1).max(4),
                    min: z.number().int().min(5).max(20),
                    max: z.number().int().min(5).max(20),
                    rir: z.number().int().min(2).max(4),
                    rest: z.number().int().min(45).max(180),
                    technique: z.enum(["straight", "tempo"]).optional(),
                    tempo: z
                      .object({
                        eccentric: z.number().int().min(1).max(5),
                        pause: z.number().int().min(0).max(2),
                        concentric: z.number().int().min(1).max(3),
                      })
                      .strict()
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(7),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();
export type Generated = z.infer<typeof generatedSchema>;
export function validateGenerated(
  output: unknown,
  preferences: unknown,
): Generated {
  const input = generationInput.parse(preferences),
    p = generatedSchema.parse(output);
  if (p.workouts.length !== input.days)
    throw new Error("Training days do not match.");
  let weeklySets = 0;
  for (const w of p.workouts) {
    if (
      new Set(w.exercises.map((e) => e.exerciseId)).size !== w.exercises.length
    )
      throw new Error("Duplicate movement.");
    const sets = w.exercises.reduce((n, e) => n + e.sets, 0);
    weeklySets += sets;
    if (sets > Math.min(24, Math.floor(input.minutes / 3)))
      throw new Error("Session volume exceeds budget.");
    for (const t of w.exercises) {
      const e = D.catalog.find((e) => e.id === t.exerciseId)!;
      if (t.technique === "tempo" && input.technique !== "tempo")
        throw new Error("Tempo requires explicit opt-in.");
      if ((t.technique === "tempo") !== !!t.tempo)
        throw new Error(
          "Tempo requires cadence metadata; straight sets cannot hide cadence.",
        );
      if (t.technique === "tempo" && input.experience === "New")
        throw new Error("Beginner generation uses straight sets only.");
      if (t.technique === "tempo" && input.limitation !== "None")
        throw new Error(
          "Tempo with a movement limitation needs manual review, not AI prescription.",
        );
      if (!input.equipment.includes(e.equipment) || t.max < t.min)
        throw new Error("Equipment or rep target mismatch.");
      if (
        input.limitation === "Avoid overhead" &&
        ["ohp", "db-press", "db-extension"].includes(e.id)
      )
        throw new Error("Overhead limitation.");
      if (input.limitation === "Avoid deep knee bend" && e.pattern === "Squat")
        throw new Error("Knee bend limitation.");
      if (input.limitation === "Avoid heavy hinges" && e.pattern === "Hinge")
        throw new Error("Hinge limitation.");
    }
  }
  if (weeklySets > 90) throw new Error("Weekly volume exceeds budget.");
  return p;
}
export type ProgramAudit = {
  policyVersion: string;
  warnings: { code: string; message: string; sourcePages: number[] }[];
  muscles: {
    muscle: D.Exercise["muscle"];
    directSets: number;
    indirectSets: number;
    frequency: number;
  }[];
};

// Original deterministic review heuristics, not book thresholds or a recovery diagnosis.
// All citations refer to physical PDF pages in TRAINING-PRINCIPLES.md/book notes.
export function auditGenerated(
  output: Generated,
  preferences: unknown,
): ProgramAudit {
  const input = generationInput.parse(preferences);
  const p = validateGenerated(output, input);
  const muscles = D.muscles.map((muscle) => ({
    muscle,
    directSets: p.workouts.reduce(
      (sum, w) =>
        sum +
        w.exercises.reduce(
          (n, t) =>
            n +
            (D.catalog.find((e) => e.id === t.exerciseId)!.muscle === muscle
              ? t.sets
              : 0),
          0,
        ),
      0,
    ),
    indirectSets: p.workouts.reduce(
      (sum, w) =>
        sum +
        w.exercises.reduce(
          (n, t) =>
            n +
            (D.catalog
              .find((e) => e.id === t.exerciseId)!
              .secondary.includes(muscle)
              ? t.sets
              : 0),
          0,
        ),
      0,
    ),
    frequency: p.workouts.filter((w) =>
      w.exercises.some(
        (t) => D.catalog.find((e) => e.id === t.exerciseId)!.muscle === muscle,
      ),
    ).length,
  }));
  const warnings: ProgramAudit["warnings"] = [];
  const warn = (code: string, message: string, sourcePages: number[]) =>
    warnings.push({ code, message, sourcePages });
  const priority = muscles.find((m) => m.muscle === input.emphasis);
  if (
    priority &&
    (priority.directSets === 0 ||
      priority.directSets < Math.max(...muscles.map((m) => m.directSets)) ||
      p.workouts.some(
        (w) =>
          w.exercises.some(
            (t) =>
              D.catalog.find((e) => e.id === t.exerciseId)!.muscle ===
              priority.muscle,
          ) &&
          D.catalog.find((e) => e.id === w.exercises[0].exerciseId)!.muscle !==
            priority.muscle,
      ))
  )
    warn(
      "priority",
      `${priority.muscle} priority is not consistently first or highest in direct planned sets. Review exercise order and redistribute the existing budget; this is not an instruction to add unlimited sets.`,
      [13, 27, 32, 255, 256],
    );
  const missing = muscles
    .filter((m) => m.directSets === 0)
    .map((m) => m.muscle);
  if (missing.length)
    warn(
      "coverage",
      `No direct catalog work for ${missing.join(", ")}. Supporting work may contribute but is not equivalent to complete complementary-action coverage. Equipment/catalog limits and your goals may justify omissions.`,
      [13, 22, 243, 246],
    );
  const ids = new Set(
    p.workouts.flatMap((w) => w.exercises.map((t) => t.exerciseId)),
  );
  const complements: string[] = [];
  const hasRow = ["row", "db-row", "cable-row", "band-row"].some((id) =>
    ids.has(id),
  );
  const hasVertical = ["pulldown", "pullup"].some((id) => ids.has(id));
  if (hasRow !== hasVertical)
    complements.push("Back: review horizontal and vertical pulling options");
  const hasHinge = ["rdl", "db-rdl"].some((id) => ids.has(id));
  if (hasHinge !== ids.has("leg-curl"))
    complements.push("Hamstrings: review hip-hinge and knee-flexion options");
  if (complements.length)
    warn(
      "complementary-actions",
      `${complements.join("; ")}. These are catalog coverage prompts, not mandatory exercise quotas; unavailable or intolerable actions remain limitations, not complete coverage.`,
      [19, 22, 243, 246],
    );
  const once = muscles.filter((m) => m.frequency === 1).map((m) => m.muscle);
  warn(
    "frequency",
    `Direct planned exposures: ${muscles
      .filter((m) => m.frequency)
      .map((m) => `${m.muscle} ${m.frequency}×`)
      .join(
        "; ",
      )}. ${once.length ? `${once.join(", ")} trained directly once: review distribution if priorities or session fatigue warrant it. ` : ""}These are not total gym days or proven recovery windows. Actual weekdays, overlap and rest-day spacing remain unverified.`,
    [187, 204, 217, 224],
  );
  for (const w of p.workouts) {
    // Original planning allowance: five warm-up minutes, 1.5 setup/transition
    // minutes per movement, upper target reps at declared cadence (else 3s),
    // and only within-exercise inter-set rests. Not an observed duration.
    const minutes =
      5 +
      w.exercises.reduce((n, t) => {
        const secondsPerRep = t.tempo
          ? t.tempo.eccentric + t.tempo.pause + t.tempo.concentric
          : 3;
        return (
          n +
          1.5 +
          (t.sets * t.max * secondsPerRep + (t.sets - 1) * t.rest) / 60
        );
      }, 0);
    if (minutes > input.minutes)
      warn(
        "time-pressure",
        `${w.name}: approximately ${Math.ceil(minutes)} minutes under a planning allowance exceeds the ${input.minutes}-minute preference even though the set-count screen passes. Assumes five warm-up minutes, 1.5 minutes setup per movement, upper target reps at declared cadence (otherwise 3 seconds/rep), and between-set rest. Actual unilateral work, waiting and readiness may take longer; edit rather than rush.`,
        [68, 71, 107, 113],
      );
  }
  warn(
    "time-assumptions",
    `The set budget is a software screen, not a timed guarantee for ${input.minutes}-minute sessions. Warm-ups, setup, transitions, unilateral work and readiness-based rest may require longer; shorten the plan rather than rush recovery.`,
    [68, 71, 107, 113],
  );
  warn(
    "effective-volume",
    "Counts are planned direct sets and separate unweighted supporting-muscle sets, not measured effective volume or growth. Intended 2–4 RIR may qualify under an app effort heuristic, but execution, target limitation and recovery are unobserved. No fractional technique credits are assigned.",
    [83, 87, 107, 109, 257],
  );
  const tempo = p.workouts
    .flatMap((w) => w.exercises)
    .filter((t) => t.technique === "tempo").length;
  warn(
    "advanced-fit",
    tempo
      ? `${tempo} tempo prescriptions explicitly opted in. Cadence is a repeatability tool, not superior growth or injury treatment. Select tolerable loads manually and keep cadence stable; other advanced methods require manual setup.`
      : "Straight sets remain the starting method. Tempo is optional for experienced lifters without declared limitations; paired, load-changing and activation/mini-bout methods need manual setup rather than invented AI pairings.",
    [81, 82, 246, 247, 257],
  );
  warn(
    "unknown-history",
    "Personal MEV/MAV/MRV and recovery are unknown: no comparable training history or muscle response is supplied. Start conservatively and review repeated performance and recovery before changing dose. Final-week deload is a planning default, not a measured recovery deadline.",
    [95, 99, 165, 174, 298, 334],
  );
  return { policyVersion: "builder-v1", warnings, muscles };
}

export function toProgram(p: Generated): D.Program {
  return D.programSchema.parse({
    id: D.uid(),
    name: p.name,
    description: p.description,
    weeks: p.weeks,
    deloadWeek: p.weeks,
    currentWeek: 1,
    archived: false,
    workouts: p.workouts.map((w, i) => ({
      id: D.uid(),
      name: w.name,
      day: `Day ${i + 1}`,
      exercises: w.exercises.map((t) => ({
        ...t,
        id: D.uid(),
        kind: "working",
        superset: "",
      })),
    })),
  });
}
export function saveGenerated(
  s: D.State,
  p: Generated,
  activate: boolean,
): D.State {
  const program = toProgram(generatedSchema.parse(p));
  return D.historyStateSchema.parse({
    ...s,
    programs: activate ? [program, ...s.programs] : [...s.programs, program],
  });
}
