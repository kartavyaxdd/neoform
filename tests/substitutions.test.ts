import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  substitutionOptions,
  substituteExercise,
  substitutionFingerprint,
} from "../src/substitutions";
function fixture() {
  const state = D.emptyState();
  state.profile = {
    name: "Synthetic",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell", "Dumbbell", "Machine"],
    days: 4,
  };
  const p = D.starterProgram("balanced"),
    w = p.workouts[0];
  w.exercises = [{ ...D.target("bench"), startingLoad: 80 }];
  state.programs = [p];
  state.draft = D.startSession(
    w.name,
    D.prepareWorkout(w, p, D.catalog, []),
    p,
    w,
  );
  return state;
}
it("offers only matching movement/muscle and currently selected equipment", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0],
    rows = substitutionOptions(state, entry, ["Dumbbell"]);
  expect(rows.some((x) => x.exercise.id === "incline-db")).toBe(true);
  expect(
    rows.every(
      (x) =>
        x.exercise.equipment === "Dumbbell" &&
        x.exercise.muscle === "Chest" &&
        x.exercise.pattern === "Push",
    ),
  ).toBe(true);
  expect(substitutionOptions(state, entry, [])).toHaveLength(0);
});
it.each([false, true])(
  "preserves completed observations and separate history (partial %s)",
  (partial) => {
    const state = fixture(),
      e = state.draft!.exercises[0];
    e.sets[0].weight = 80;
    e.sets[0].done = partial;
    e.sets[0].effortReported = true;
    e.sets[0].rir = 1;
    state.sessions = [D.startSession("Prior", [structuredClone(e)])];
    const before = structuredClone(state);
    const result = substituteExercise(state, {
      fingerprint: substitutionFingerprint(state.draft!),
      entryId: e.id,
      exerciseId: "incline-db",
      available: ["Dumbbell"],
      reason: "busy",
    });
    expect(state).toEqual(before);
    expect(result.state.programs).toEqual(state.programs);
    expect(result.state.sessions).toEqual(state.sessions);
    const replacement = result.state.draft!.exercises.find(
      (x) => x.id === result.entryId,
    )!;
    expect(replacement.exerciseId).toBe("incline-db");
    expect(replacement.convention).toBe("per-dumbbell");
    expect(replacement.setup).toBeUndefined();
    expect(replacement.sets).toHaveLength(partial ? 2 : 3);
    expect(
      replacement.sets.every(
        (t) => t.weight === 0 && t.effortReported === false && !t.done,
      ),
    ).toBe(true);
    expect(replacement.notes).toContain("Equipment busy");
    if (partial) {
      const old = result.state.draft!.exercises[0];
      expect(old.sets).toEqual([before.draft!.exercises[0].sets[0]]);
      expect(old.plannedWorkingSets).toBe(3);
      expect(old.coachingContext?.skipReason).toBe("equipment");
    } else expect(result.state.draft!.exercises).toHaveLength(1);
  },
);
it("does not erase completed warmups when no working set was logged", () => {
  const state = fixture(),
    e = state.draft!.exercises[0];
  e.sets.unshift({ ...e.sets[0], id: D.uid(), kind: "warmup", done: true });
  const result = substituteExercise(state, {
    fingerprint: substitutionFingerprint(state.draft!),
    entryId: e.id,
    exerciseId: "incline-db",
    available: ["Dumbbell"],
    reason: "unavailable",
  });
  expect(result.state.draft!.exercises[0].sets).toEqual([e.sets[0]]);
  expect(result.state.draft!.exercises[1].sets).toHaveLength(3);
});
it.each([
  "stale",
  "advanced",
  "finished",
  "wrong movement",
  "unavailable equipment",
  "pain",
])("rejects %s substitutions without mutation", (issue) => {
  const state = fixture(),
    e = state.draft!.exercises[0],
    fingerprint = substitutionFingerprint(state.draft!);
  let id = "incline-db",
    available: D.Exercise["equipment"][] = ["Dumbbell"];
  if (issue === "stale") e.sets[0].done = true;
  if (issue === "advanced") {
    e.technique = "superset";
    e.techniqueGroup = "pair";
  }
  if (issue === "finished") e.sets.forEach((t) => (t.done = true));
  if (issue === "wrong movement") id = "db-row";
  if (issue === "unavailable equipment") available = [];
  if (issue === "pain")
    e.coachingContext = {
      execution: "unknown",
      rest: "unknown",
      recordedAt: Date.now(),
      skipReason: "pain",
    };
  const before = structuredClone(state);
  expect(() =>
    substituteExercise(state, {
      fingerprint:
        issue === "stale" ? fingerprint : substitutionFingerprint(state.draft!),
      entryId: e.id,
      exerciseId: id,
      available,
      reason: "busy",
    }),
  ).toThrow();
  expect(state).toEqual(before);
});
it("does not bypass a reported assisting-muscle recovery concern", () => {
  const state = fixture(),
    e = state.draft!.exercises[0],
    prior = D.startSession("Recovery report", []);
  prior.startedAt = Date.now() - 86400000;
  prior.muscleFeedback = [{ muscle: "Triceps", pain: true }];
  state.sessions = [prior];
  expect(() =>
    substituteExercise(state, {
      fingerprint: substitutionFingerprint(state.draft!),
      entryId: e.id,
      exerciseId: "incline-db",
      available: ["Dumbbell"],
      reason: "busy",
    }),
  ).toThrow(/recovery/);
});
