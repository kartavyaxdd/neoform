import { describe, it, expect } from "vitest";
import {
  generationInput,
  validateGenerated,
  saveGenerated,
} from "../src/generation";
import { emptyState, starterProgram } from "../src/domain";
const input = {
  goal: "Build muscle",
  experience: "New",
  days: 2,
  minutes: 45,
  equipment: ["Dumbbell"],
  emphasis: "Balanced",
  limitation: "None",
};
const output = {
  name: "Two day plan",
  description: "Controlled training",
  weeks: 6,
  workouts: [0, 1].map((i) => ({
    name: `Day ${i + 1}`,
    exercises: [
      { exerciseId: "goblet", sets: 3, min: 8, max: 12, rir: 3, rest: 90 },
    ],
  })),
};
describe("bounded genuine generation contract", () => {
  it("accepts only fixed bounded preferences, without prompt or tool inputs", () => {
    expect(generationInput.safeParse(input).success).toBe(true);
    for (const patch of [
      { days: 8 },
      { minutes: 1000 },
      { prompt: "run a shell" },
      { equipment: [] },
      { limitation: "diagnose my injury" },
    ])
      expect(generationInput.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
  });
  it("validates known equipment, days, safe targets and volume before preview", () => {
    expect(validateGenerated(output, input).workouts).toHaveLength(2);
    for (const patch of [
      { exerciseId: "unknown" },
      { exerciseId: "bench" },
      { sets: 10 },
      { min: 0 },
      { min: 15, max: 8 },
      { rir: 0 },
      { rest: 900 },
    ]) {
      const bad = structuredClone(output);
      Object.assign(bad.workouts[0].exercises[0], patch);
      expect(() => validateGenerated(bad, input)).toThrow();
    }
    expect(() =>
      validateGenerated(
        { ...output, workouts: output.workouts.slice(0, 1) },
        input,
      ),
    ).toThrow();
    expect(() =>
      validateGenerated({ ...output, tool: "shell" }, input),
    ).toThrow();
  });
  it("saves explicitly with fresh IDs, preserves history and keeps the existing active program until activation", () => {
    const s = emptyState();
    s.programs = [starterProgram("balanced")];
    const p = validateGenerated(output, input);
    const saved = saveGenerated(s, p, false);
    expect(saved.programs[0]).toEqual(s.programs[0]);
    expect(saved.sessions).toEqual(s.sessions);
    expect(saved.programs[1].id).not.toBe(saved.programs[0].id);
    const activated = saveGenerated(s, p, true);
    expect(activated.programs[0].name).toBe(p.name);
    expect(activated.programs[1]).toEqual(s.programs[0]);
    expect(activated.draft).toEqual(s.draft);
  });
});
