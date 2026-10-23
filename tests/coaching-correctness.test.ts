import { it, expect } from "vitest";
import * as D from "../src/domain";
import * as C from "../src/coaching";
import * as T from "../src/techniques";
import {
  substituteExercise,
  substitutionFingerprint,
} from "../src/substitutions";
import { syntheticReadiness } from "./readiness-fixture";
const now = Date.parse("2026-10-23T12:00:00Z");
it("keeps session-only substitute coaching out of the original program target", () => {
  let state = D.emptyState();
  state.profile = {
    name: "Synthetic QA",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell", "Dumbbell"],
    days: 2,
  };
  const program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  workout.exercises = [{ ...D.target("bench"), startingLoad: 80 }];
  program.workouts = [workout];
  state.programs = [program];
  const originalId = workout.exercises[0].id;
  function startReplacement(at: number) {
    state.draft = D.startSession(
      "Synthetic QA",
      D.prepareWorkout(workout, program, D.catalog, state.sessions),
      program,
      workout,
    );
    state.draft.startedAt = at;
    state.draft.date = new Date(at).toISOString().slice(0, 10);
    state = substituteExercise(
      state,
      {
        fingerprint: substitutionFingerprint(state.draft),
        entryId: state.draft.exercises[0].id,
        exerciseId: "incline-db",
        available: ["Dumbbell"],
        reason: "busy",
      },
      at,
    ).state;
    return state.draft!;
  }
  const prior = startReplacement(now - 3 * 86400000);
  prior.duration = 3600;
  prior.exercises[0].coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: prior.startedAt + 3600000,
  };
  prior.exercises[0].sets.forEach((s, i) => {
    s.weight = 20;
    s.reps = [10, 9, 8][i];
    s.rir = 2;
    s.done = true;
    s.effortReported = true;
    s.prescription!.weight = 20;
  });
  state.sessions = [prior];
  state.draft = null;
  const current = startReplacement(now);
  current.readiness = syntheticReadiness(now);
  const p = C.evaluateCoaching(state, current, now).find(
    (p) => p.exerciseId === "incline-db",
  )!;
  expect(p).toBeTruthy();
  expect(p.exerciseId).toBe("incline-db");
  expect(p.targetId).toBeUndefined();
  expect(() =>
    C.applyCoaching(
      state,
      current,
      [{ proposal: p, choice: "accept", scope: "program" }],
      now,
    ),
  ).toThrow(/target|identity|exercise/i);
});
it("rebuilds the activation prescription when explicitly changing method", () => {
  const original = D.createEntry(D.catalog.find((x) => x.id === "bench")!);
  const advanced = T.configureTechnique(original, "myoreps");
  expect(advanced.target).toMatchObject({ min: 10, max: 20 });
  expect(advanced.sets).toHaveLength(1);
  expect(advanced.sets[0].reps).toBe(10);
  expect(advanced.sets[0].prescription).toMatchObject({
    reps: 10,
    min: 10,
    max: 20,
  });
  expect(advanced.plannedWorkingSets).toBe(1);
});
it("rejects stale historical readiness for added volume", () => {
  const state = D.emptyState();
  state.profile = {
    name: "Synthetic QA",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 2,
  };
  state.coaching = {
    enabled: true,
    minutes: 75,
    diet: "gain",
    earlyTrials: true,
    priorities: ["Chest"],
  };
  const program = D.starterProgram("balanced"),
    w = program.workouts[0];
  w.exercises = [
    {
      ...D.target("bench"),
      setup: { label: "QA rack", execution: "Same ROM", availableLoads: [50] },
    },
    D.target("row"),
    { ...D.target("squat"), sets: 4 },
  ];
  program.workouts = [w];
  state.programs = [program];
  state.sessions = [18, 13, 8, 3].map((days) => {
    const s = D.startSession(
      "Synthetic QA",
      [
        D.createEntry(
          D.catalog.find((x) => x.id === "bench")!,
          w.exercises[0],
        ),
      ],
      program,
      w,
    );
    s.startedAt = now - days * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = 3600;
    s.readiness = syntheticReadiness(now - 40 * 86400000);
    s.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: s.startedAt + 3600000,
    };
    s.exercises[0].sets.forEach((t) =>
      Object.assign(t, {
        weight: 50,
        reps: 12,
        rir: 3,
        done: true,
        effortReported: true,
        prescription: { ...t.prescription!, weight: 50 },
      }),
    );
    return s;
  });
  const session = D.startSession(
    "Synthetic QA",
    D.prepareWorkout(w, program, D.catalog, state.sessions),
    program,
    w,
  );
  session.startedAt = now;
  session.date = "2026-10-23";
  session.readiness = syntheticReadiness(now);
  state.draft = session;
  const proposal = C.evaluateCoaching(state, session, now).find(
    (p) => p.action === "add-volume",
  );
  expect(proposal).toBeUndefined();
  expect(
    state.sessions.every(
      (s) => s.startedAt - s.readiness!.recordedAt > 12 * 3600000,
    ),
  ).toBe(true);
});
