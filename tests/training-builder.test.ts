import { describe, expect, it } from "vitest";
import { emptyState, starterProgram } from "../src/domain";
import {
  auditGenerated,
  generationInput,
  saveGenerated,
  validateGenerated,
} from "../src/generation";

export const preferences = {
  goal: "Build muscle",
  experience: "Intermediate",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
} as const;
export const fixture = () => ({
  name: "FIXTURE ONLY — builder",
  description: "Synthetic conservative start",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: `Day ${i + 1}`,
    exercises: [
      { exerciseId: "goblet", sets: 2, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
});

describe("builder explicit technique boundary", () => {
  it("preserves optional technique metadata only when an explicit save creates the new program", () => {
    const raw = fixture();
    Object.assign(raw.workouts[0].exercises[0], {
      technique: "tempo",
      tempo: { eccentric: 3, pause: 1, concentric: 1 },
    });
    const p = validateGenerated(raw, { ...preferences, technique: "tempo" });
    const state = emptyState();
    state.programs = [starterProgram("balanced")];
    const before = JSON.stringify(state);
    auditGenerated(p, { ...preferences, technique: "tempo" });
    expect(JSON.stringify(state)).toBe(before);
    const saved = saveGenerated(state, p, false);
    expect(saved.programs[0]).toEqual(state.programs[0]);
    expect(saved.sessions).toEqual(state.sessions);
    expect(saved.programs[1].workouts[0].exercises[0]).toMatchObject({
      technique: "tempo",
      tempo: { eccentric: 3, pause: 1, concentric: 1 },
    });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("accepts bounded tempo opt-in while omitted preference remains backward-compatible straight", () => {
    expect(generationInput.parse(preferences).technique).toBeUndefined();
    expect(
      generationInput.parse({ ...preferences, technique: "tempo" }).technique,
    ).toBe("tempo");
    for (const technique of ["superset", "drop-set", "BFR", "anything"])
      expect(
        generationInput.safeParse({ ...preferences, technique }).success,
      ).toBe(false);
    const p = fixture();
    Object.assign(p.workouts[0].exercises[0], {
      technique: "tempo",
      tempo: { eccentric: 3, pause: 1, concentric: 1 },
    });
    expect(() => validateGenerated(p, preferences)).toThrow(/opt-in/i);
    expect(
      validateGenerated(p, { ...preferences, technique: "tempo" }).workouts[0]
        .exercises[0].tempo,
    ).toEqual({ eccentric: 3, pause: 1, concentric: 1 });
  });
  it("rejects unrequested cadence, incomplete metadata, beginner complexity and unknown/forbidden output", () => {
    const opted = { ...preferences, technique: "tempo" };
    for (const patch of [
      { tempo: { eccentric: 3, pause: 1, concentric: 1 } },
      {
        technique: "straight",
        tempo: { eccentric: 3, pause: 1, concentric: 1 },
      },
      { technique: "tempo" },
      { technique: "tempo", tempo: { eccentric: 0, pause: 1, concentric: 1 } },
      { technique: "tempo", techniqueGroup: "invented-pair" },
      { technique: "superset" },
      {
        technique: "tempo",
        tempo: { eccentric: 3, pause: 1, concentric: 1 },
        exerciseId: "unknown",
      },
      {
        technique: "tempo",
        tempo: { eccentric: 3, pause: 1, concentric: 1 },
        exerciseId: "bench",
      },
    ]) {
      const p = fixture();
      Object.assign(p.workouts[0].exercises[0], patch);
      expect(() => validateGenerated(p, opted)).toThrow();
    }
    const p = fixture();
    Object.assign(p.workouts[0].exercises[0], {
      technique: "tempo",
      tempo: { eccentric: 3, pause: 1, concentric: 1 },
    });
    expect(() => validateGenerated(p, { ...opted, experience: "New" })).toThrow(
      /beginner/i,
    );
    expect(() =>
      validateGenerated(p, { ...opted, limitation: "Avoid deep knee bend" }),
    ).toThrow(/Knee|limitation/i);
    expect(() =>
      validateGenerated(p, { ...opted, limitation: "Avoid overhead" }),
    ).toThrow(/limitation/i);
  });
});

describe("deterministic source-linked program audit", () => {
  it("reports missing priorities/coverage, planned frequency and unknown effective volume without invented history", () => {
    const p = validateGenerated(fixture(), preferences);
    const before = JSON.stringify(p);
    const audit = auditGenerated(p, { ...preferences, emphasis: "Chest" });
    expect(audit.policyVersion).toBe("builder-v1");
    expect(audit.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "priority",
        "coverage",
        "frequency",
        "time-assumptions",
        "effective-volume",
        "advanced-fit",
        "unknown-history",
      ]),
    );
    for (const warning of audit.warnings) {
      expect(warning.sourcePages.length).toBeGreaterThan(0);
      expect(warning.message.length).toBeGreaterThan(20);
    }
    expect(audit.muscles.find((m) => m.muscle === "Quads")).toMatchObject({
      directSets: 4,
      indirectSets: 0,
      frequency: 2,
    });
    expect(audit.muscles.find((m) => m.muscle === "Chest")).toMatchObject({
      directSets: 0,
      frequency: 0,
    });
    expect(
      audit.warnings.find((w) => w.code === "unknown-history")?.message,
    ).toMatch(/MRV.*unknown/i);
    expect(audit).toEqual(
      auditGenerated(p, { ...preferences, emphasis: "Chest" }),
    );
    expect(JSON.stringify(p)).toBe(before);
  });
  it("audits actual rest/cadence time pressure and missing complementary actions rather than only total sets", () => {
    const p = fixture();
    p.workouts[0].exercises = ["goblet", "db-row", "db-rdl", "curl"].map(
      (exerciseId) => ({
        exerciseId,
        sets: 2,
        min: 12,
        max: 20,
        rir: 3,
        rest: 180,
      }),
    );
    const audit = auditGenerated(
      validateGenerated(p, { ...preferences, minutes: 30 }),
      { ...preferences, minutes: 30 },
    );
    expect(
      audit.warnings.find((w) => w.code === "time-pressure")?.message,
    ).toMatch(/Day 1.*30/);
    expect(
      audit.warnings.find((w) => w.code === "complementary-actions")?.message,
    ).toMatch(/Back.*Hamstrings/);
    expect(audit.warnings.find((w) => w.code === "frequency")?.message).toMatch(
      /once/,
    );
  });
});
