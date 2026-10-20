import { it, expect } from "vitest";
import * as D from "../src/domain";
import { weeklyReview } from "../src/weeklyReview";
import {
  evaluateCoaching,
  applyCoaching,
  classifyCoachingOutcomes,
} from "../src/coaching";
import { syntheticReadiness } from "./readiness-fixture";
const now = Date.parse("2026-10-21T12:00:00Z");
function fixture() {
  const state = D.emptyState(),
    program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  workout.exercises = [
    {
      ...D.target("bench"),
      startingLoad: 50,
      setup: {
        label: "QA bench",
        execution: "Usual ROM",
        availableLoads: [50, 51],
      },
    },
  ];
  state.programs = [program];
  const session = (days: number, reps: number[]) => {
    const entry = D.createEntry(D.catalog[0], workout.exercises[0]);
    entry.sets.forEach((t, i) =>
      Object.assign(t, {
        weight: 50,
        reps: reps[i],
        rir: 2,
        done: true,
        effortReported: true,
        prescription: { ...t.prescription!, weight: 50 },
      }),
    );
    const s = D.startSession("Synthetic", [entry], program, workout);
    s.startedAt = now - days * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = 3600;
    entry.coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: s.startedAt + 3600000,
    };
    return s;
  };
  state.sessions = [session(7, [10, 9, 8]), session(1, [10, 9, 9])];
  return { state, session, program, workout };
}
it("compares equal load/dose/effort streams without mutating data", () => {
  const { state } = fixture(),
    before = structuredClone(state),
    r = weeklyReview(state, D.catalog, "2026-10-19", now);
  expect(r.comparisons).toHaveLength(1);
  expect(r.comparisons[0].repDelta).toBe(1);
  expect(r.targets.met).toBe(3);
  expect(state).toEqual(before);
});
it.each([
  "setup",
  "phase",
  "effort",
  "load",
  "rest",
  "incomplete",
  "unconfirmed",
  "order",
  "prescription",
  "assigned rest",
])("does not invent progress across %s changes", (reason) => {
  const { state } = fixture(),
    s = state.sessions[1],
    e = s.exercises[0];
  if (reason === "setup") e.setup!.label = "Other bench";
  if (reason === "phase") s.phase = "deload";
  if (reason === "effort") e.sets[0].rir = 1;
  if (reason === "load") e.sets[0].weight = 51;
  if (reason === "rest") e.coachingContext!.rest = "shorter";
  if (reason === "incomplete") e.sets[0].done = false;
  if (reason === "unconfirmed") e.sets[0].effortReported = false;
  if (reason === "order") s.exercises.unshift(D.createEntry(D.catalog[1]));
  if (reason === "prescription") delete e.sets[0].prescription;
  if (reason === "assigned rest") e.sets[0].prescription!.rest = 75;
  expect(
    weeklyReview(state, D.catalog, "2026-10-19", now).comparisons,
  ).toHaveLength(0);
});
it("does not jump over an intervening changed setup or unfinished exposure", () => {
  for (const issue of ["setup", "incomplete"]) {
    const { state, session } = fixture();
    const between = session(3, [10, 9, 8]);
    if (issue === "setup") between.exercises[0].setup!.label = "Other";
    else between.exercises[0].sets[0].done = false;
    state.sessions.splice(1, 0, between);
    expect(
      weeklyReview(state, D.catalog, "2026-10-19", now).comparisons,
    ).toHaveLength(0);
  }
});
it("separates below-target, unknown effort, changed load and unfinished dose", () => {
  const { state } = fixture(),
    e = state.sessions[1].exercises[0];
  e.sets[0].reps = 1;
  e.sets[1].effortReported = false;
  e.sets[2].weight = 51;
  const r = weeklyReview(state, D.catalog, "2026-10-19", now);
  expect(r.targets).toEqual({
    met: 0,
    below: 1,
    easier: 0,
    changed: 1,
    unknown: 1,
  });
  e.sets[2].done = false;
  expect(weeklyReview(state, D.catalog, "2026-10-19", now).unfinished).toBe(1);
});
it("keeps future workouts and draft observations out of the review", () => {
  const { state, session } = fixture();
  state.sessions.push(session(-1, [20, 20, 20]));
  state.draft = session(0, [20, 20, 20]);
  const r = weeklyReview(state, D.catalog, "2026-10-19", now);
  expect(r.sessions).toHaveLength(1);
  expect(r.comparisons[0].repDelta).toBe(1);
  expect(
    weeklyReview(state, D.catalog, "2026-11-02", now).sessions,
  ).toHaveLength(0);
});
it("reports easier sets separately and does not invent historical prescriptions", () => {
  const { state } = fixture(),
    entry = state.sessions[1].exercises[0];
  entry.sets[0].rir = 5;
  delete entry.sets[1].prescription;
  const r = weeklyReview(state, D.catalog, "2026-10-19", now);
  expect(r.targets).toEqual({
    met: 1,
    below: 0,
    easier: 1,
    changed: 0,
    unknown: 1,
  });
  delete entry.target;
  expect(
    weeklyReview(state, D.catalog, "2026-10-19", now).comparisons,
  ).toHaveLength(0);
});
it("keeps advanced bouts outside straight-set attainment and comparisons", () => {
  const { state } = fixture(),
    entry = state.sessions[1].exercises[0];
  entry.technique = "giant-set";
  entry.sets.forEach((t) => (t.bout = "giant"));
  entry.sets[0].done = false;
  const r = weeklyReview(state, D.catalog, "2026-10-19", now);
  expect(r.targets).toEqual({
    met: 0,
    below: 0,
    easier: 0,
    changed: 0,
    unknown: 0,
  });
  expect(r.unfinished).toBe(0);
  expect(r.comparisons).toHaveLength(0);
});
it("counts accepted outcomes once and marks edited history as needing reassessment", () => {
  const { state, program, workout } = fixture();
  state.sessions = state.sessions.slice(0, 1);
  state.draft = D.startSession(
    "QA",
    D.prepareWorkout(workout, program, D.catalog, state.sessions),
    program,
    workout,
  );
  state.draft.startedAt = now;
  state.draft.date = "2026-10-21";
  state.draft.readiness = syntheticReadiness(now);
  const p = evaluateCoaching(state, state.draft, now)[0],
    next = applyCoaching(
      state,
      state.draft,
      [{ proposal: p, choice: "accept", scope: "session" }],
      now,
    );
  const completed = structuredClone(next.draft!);
  completed.exercises[0].sets.forEach((t) => {
    t.done = true;
    t.effortReported = true;
  });
  completed.exercises[0].coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: now,
  };
  next.sessions.push(completed);
  next.coachingEvents!.push(...classifyCoachingOutcomes(next, completed, now));
  next.coachingEvents!.push({
    ...next.coachingEvents!.at(-1)!,
    id: "coach-synthetic-duplicate",
  });
  expect(weeklyReview(next, D.catalog, "2026-10-19", now).coaching.met).toBe(1);
  completed.exercises[0].sets[0].reps = 1;
  const corrected = weeklyReview(next, D.catalog, "2026-10-19", now);
  expect(corrected.coaching.met).toBe(0);
  expect(corrected.coaching.recheck).toBe(1);
});
