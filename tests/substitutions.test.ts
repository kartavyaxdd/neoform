import { it, expect } from "vitest";
import * as D from "../src/domain";
import { editState } from "../src/stateEdit";
import { nextSetAdvice } from "../src/nextSetAdvice";
import {
  substitutionOptions,
  substituteExercise,
  substitutionFingerprint,
  defaultSwapEquipment,
  substitutePreview,
  substitutionRecoveryWarning,
} from "../src/substitutions";
it("keeps the current equipment type available for a same-equipment swap", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0];
  state.profile!.equipment = ["Barbell"];
  const gear = defaultSwapEquipment(state);
  expect(gear).toContain("Barbell");
  state.customExercises = [
    {
      ...D.catalog.find((e) => e.id === "bench")!,
      id: "custom-bench",
      name: "Other bench",
    },
  ];
  expect(
    substitutionOptions(state, entry, gear).some(
      (o) => o.exercise.id === "custom-bench",
    ),
  ).toBe(true);
});
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
it("swaps through the real immutable store updater without cloning a draft proxy", () => {
  const state = fixture(),
    fingerprint = substitutionFingerprint(state.draft!);
  const result = editState(
    state,
    (data) =>
      substituteExercise(data, {
        fingerprint,
        entryId: state.draft!.exercises[0].id,
        exerciseId: "incline-db",
        available: ["Dumbbell"],
        reason: "preference",
      }).state,
  );
  expect(result.draft!.exercises[0].exerciseId).toBe("incline-db");
});
it("swaps a pre-start preview without creating a draft or modifying the routine/history", () => {
  const s = fixture(),
    session = s.draft!;
  s.draft = null;
  const before = JSON.stringify(s);
  const result = substitutePreview(s, session, {
    fingerprint: substitutionFingerprint(session),
    entryId: session.exercises[0].id,
    exerciseId: "incline-db",
    available: ["Dumbbell"],
    reason: "preference",
  });
  expect(result.session.exercises[0].exerciseId).toBe("incline-db");
  expect(JSON.stringify(s)).toBe(before);
});
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
it("allows an explicitly reviewed different movement while leaving similarity filtering as the default", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0];
  expect(
    substitutionOptions(state, entry, ["Dumbbell"]).some(
      (o) => o.exercise.id === "db-row",
    ),
  ).toBe(false);
  const result = substituteExercise(state, {
    fingerprint: substitutionFingerprint(state.draft!),
    entryId: entry.id,
    exerciseId: "db-row",
    available: ["Dumbbell"],
    reason: "preference",
    scope: "all",
  });
  expect(result.state.draft!.exercises[0].exerciseId).toBe("db-row");
  expect(result.state.programs).toEqual(state.programs);
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
it("permits a reviewed manual Y-raise swap without clearing recovery or inventing a load", () => {
  const state = fixture(),
    now = Date.now();
  const y = {
    ...D.catalog.find((e) => e.id === "lateral")!,
    id: "qa-y-raise",
    name: "Standing Y Raise (Cable)",
    equipment: "Cable" as const,
    convention: "machine-label" as const,
  };
  state.customExercises = [y];
  state.draft!.exercises = [D.createEntry(y)];
  const entry = state.draft!.exercises[0];
  state.draft!.readiness = {
    recordedAt: now,
    fatigue: null,
    pain: null,
    context: "unknown",
    factors: [],
    muscles: [
      { muscle: "Shoulders", recovered: "no", pain: null, soreness: null },
    ],
  };
  const before = structuredClone(state);
  const input = {
    fingerprint: substitutionFingerprint(state.draft!),
    entryId: entry.id,
    exerciseId: "lateral",
    available: ["Dumbbell" as const],
    reason: "preference" as const,
  };
  const warning = substitutionRecoveryWarning(
    state,
    state.draft!,
    entry,
    D.catalog.find((e) => e.id === "lateral")!,
    now,
  );
  expect(warning).toBeTruthy();
  expect(() => substituteExercise(state, input, now)).toThrow(/recovery/);
  const result = substituteExercise(
    state,
    { ...input, reviewedRecovery: warning!.basis },
    now,
  );
  expect(result.state.draft!.exercises[0].exerciseId).toBe("lateral");
  expect(
    result.state.draft!.exercises[0].sets.every(
      (t) => t.weight === 0 && !t.effortReported,
    ),
  ).toBe(true);
  expect(result.state.draft!.readiness).toEqual(before.draft!.readiness);
  expect(
    D.recoveryStatus(
      "Shoulders",
      result.state.sessions,
      [...D.catalog, y],
      now,
      result.state.draft!.readiness,
    ).blocked,
  ).toBe(true);
  expect(result.state.programs).toEqual(before.programs);
  expect(state).toEqual(before);
  // A new concern after acknowledgement requires another review.
  state.draft!.readiness!.muscles[0].pain = true;
  expect(() =>
    substituteExercise(
      state,
      {
        ...input,
        fingerprint: substitutionFingerprint(state.draft!),
        reviewedRecovery: warning!.basis,
      },
      now,
    ),
  ).toThrow(/recovery/);
});
it("a draft pain report appears in the manual swap warning before save", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0];
  state.draft!.feedback.pain = true;
  expect(
    substitutionRecoveryWarning(
      state,
      state.draft!,
      entry,
      D.catalog.find((e) => e.id === "incline-db")!,
    ),
  ).toBeTruthy();
});
it("carries an original exercise pain caution through a reviewed swap without asserting recovery", () => {
  const state = fixture(),
    session = state.draft!,
    entry = session.exercises[0],
    now = Date.now();
  entry.coachingContext = {
    execution: "unknown",
    rest: "unknown",
    skipReason: "pain",
    recordedAt: now,
  };
  const warning = substitutionRecoveryWarning(
    state,
    session,
    entry,
    D.catalog.find((e) => e.id === "incline-db")!,
    now,
  )!;
  const result = substituteExercise(
    state,
    {
      fingerprint: substitutionFingerprint(session),
      entryId: entry.id,
      exerciseId: "incline-db",
      available: ["Dumbbell"],
      reason: "preference",
      reviewedRecovery: warning.basis,
    },
    now,
  );
  expect(result.state.draft!.exercises[0].coachingContext).toMatchObject({
    execution: "unknown",
    rest: "unknown",
    skipReason: "pain",
  });
  expect(
    nextSetAdvice(
      result.state,
      result.state.draft!,
      result.entryId,
      undefined,
      now,
    ).kind,
  ).toBe("pause");
  expect(result.state.draft!.feedback).toEqual(session.feedback);
});
it("rejects advanced row metadata even without an exercise-level technique label", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0];
  entry.sets[0].bout = "activation";
  expect(() =>
    substituteExercise(state, {
      fingerprint: substitutionFingerprint(state.draft!),
      entryId: entry.id,
      exerciseId: "incline-db",
      available: ["Dumbbell"],
      reason: "busy",
    }),
  ).toThrow(/advanced/);
});
it("records a preference as other context rather than an equipment problem", () => {
  const state = fixture(),
    entry = state.draft!.exercises[0];
  entry.sets[0].done = true;
  const result = substituteExercise(state, {
    fingerprint: substitutionFingerprint(state.draft!),
    entryId: entry.id,
    exerciseId: "incline-db",
    available: ["Dumbbell"],
    reason: "preference",
  });
  expect(result.state.draft!.exercises[0].coachingContext!.skipReason).toBe(
    "other",
  );
  expect(result.state.draft!.exercises[1].notes).toContain(
    "Personal preference",
  );
});
