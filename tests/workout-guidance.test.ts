import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  createGuidancePreview,
  stageGuidance,
  commitGuidance,
  guidanceRows,
  replayGuidance,
} from "../src/workoutGuidance";
import { syntheticReadiness } from "./readiness-fixture";
import { pendingProgramTarget } from "../src/programReview";

const now = Date.parse("2026-10-24T12:00:00Z");
it("today's original targets do not count as assessing a queued future-program change", () => {
  const { state, preview } = fixture(),
    row = guidanceRows(state, preview, now)[0];
  const staged = stageGuidance(
    state,
    preview,
    { proposal: row.proposal, choice: "accept", scope: "program" },
    now,
  ).preview;
  const next = commitGuidance(state, staged, now + 1000);
  const completed = structuredClone(next.draft!);
  completed.duration = 3600;
  completed.exercises[0].sets.forEach((t) => {
    t.done = true;
    t.effortReported = true;
  });
  completed.exercises[0].coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: now + 3600000,
  };
  next.sessions = [...next.sessions, completed];
  next.draft = null;
  const program = next.programs[0],
    workout = program.workouts[0];
  const upcoming = D.startSession(
    workout.name,
    D.prepareWorkout(workout, program, D.catalog, next.sessions),
    program,
    workout,
  );
  expect(
    pendingProgramTarget(next, upcoming, upcoming.exercises[0], now + 7200000),
  ).toBe(true);
});
it("records coordinated preview choices as one bundle without mixing their targets", () => {
  const { state, program, workout } = fixture();
  const target = { ...D.target("bench"), startingLoad: 40 };
  workout.exercises.push(target);
  const entry = D.createEntry(D.catalog[0], target),
    prior = state.sessions[0];
  entry.sets.forEach((t, i) =>
    Object.assign(t, {
      weight: 40,
      reps: [10, 9, 8][i],
      done: true,
      effortReported: true,
      prescription: { ...t.prescription!, weight: 40 },
    }),
  );
  entry.coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: prior.startedAt + 3600000,
  };
  prior.exercises.push(entry);
  let preview = createGuidancePreview(state, program.id, workout.id, now);
  preview.seed.readiness = syntheticReadiness(now);
  for (const current of preview.seed.exercises) {
    const row = guidanceRows(state, preview, now).find(
      (r) => r.proposal.entryId === current.id,
    )!;
    preview = stageGuidance(
      state,
      preview,
      { proposal: row.proposal, choice: "accept", scope: "session" },
      now,
    ).preview;
  }
  const next = commitGuidance(state, preview, now);
  expect(next.coachingEvents).toHaveLength(2);
  expect(next.coachingEvents![0].note).toBe(next.coachingEvents![1].note);
  expect(next.draft!.exercises.map((e) => e.sets.map((t) => t.weight))).toEqual(
    [
      [50, 50, 50],
      [40, 40, 40],
    ],
  );
});
it("replaying queued acceptance preserves decision identity and timestamp", () => {
  const { state, preview } = fixture(),
    row = guidanceRows(state, preview, now)[0];
  const staged = stageGuidance(
    state,
    preview,
    { proposal: row.proposal, choice: "accept", scope: "session" },
    now,
  ).preview;
  expect(
    replayGuidance(state, staged, now + 1000).state.coachingEvents,
  ).toEqual(replayGuidance(state, staged, now + 2000).state.coachingEvents);
});
function fixture() {
  const state = D.emptyState(),
    program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  workout.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
  program.workouts = [workout];
  state.programs = [program];
  const prior = D.startSession(
    "Confirmed",
    D.prepareWorkout(workout, program, D.catalog, []),
    program,
    workout,
  );
  prior.startedAt = now - 3 * 86400000;
  prior.date = "2026-10-21";
  prior.duration = 3600;
  prior.exercises[0].sets.forEach((t, i) =>
    Object.assign(t, {
      weight: 50,
      reps: [10, 9, 8][i],
      done: true,
      effortReported: true,
      prescription: { ...t.prescription!, weight: 50 },
    }),
  );
  prior.exercises[0].coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: prior.startedAt + 3600000,
  };
  state.sessions = [prior];
  const preview = createGuidancePreview(state, program.id, workout.id, now);
  preview.seed.readiness = syntheticReadiness(now);
  return { state, program, workout, preview };
}
it("stages exact next-workout rows without changing state, then atomically starts and records acceptance", () => {
  const { state, preview } = fixture(),
    before = structuredClone(state);
  const row = guidanceRows(state, preview, now)[0];
  expect(row.label).toBe("Add a rep");
  const staged = stageGuidance(
    state,
    preview,
    { proposal: row.proposal, choice: "accept", scope: "session" },
    now,
  );
  expect(state).toEqual(before);
  expect(staged.session.exercises[0].sets.map((t) => t.reps)).toEqual([
    10, 9, 9,
  ]);
  const committed = commitGuidance(state, staged.preview, now + 1000);
  expect(committed.draft!.exercises[0].sets.map((t) => t.reps)).toEqual([
    10, 9, 9,
  ]);
  expect(committed.coachingEvents).toHaveLength(1);
  expect(committed.programs).toEqual(before.programs);
  expect(committed.sessions).toEqual(before.sessions);
  expect(committed.draft!.startedAt).toBe(now + 1000);
});
it("rejects stale guidance after history, readiness, targets or active draft changes", () => {
  for (const issue of ["history", "readiness", "targets", "draft"] as const) {
    const { state, preview } = fixture(),
      row = guidanceRows(state, preview, now)[0];
    const staged = stageGuidance(
      state,
      preview,
      { proposal: row.proposal, choice: "accept", scope: "session" },
      now,
    ).preview;
    if (issue === "history") {
      state.sessions = structuredClone(state.sessions);
      state.sessions[0].exercises[0].sets[0].reps = 5;
    }
    if (issue === "readiness") staged.seed.readiness = undefined;
    if (issue === "targets") state.programs[0].workouts[0].exercises[0].min = 7;
    if (issue === "draft") state.draft = D.startSession("Another draft", []);
    expect(() => commitGuidance(state, staged, now)).toThrow();
  }
});
it("future scope changes the routine only after Start and preserves today's original prescription", () => {
  const { state, preview } = fixture(),
    row = guidanceRows(state, preview, now)[0];
  const staged = stageGuidance(
    state,
    preview,
    { proposal: row.proposal, choice: "accept", scope: "program" },
    now,
  );
  expect(state.programs[0].workouts[0].exercises[0].nextRows).toBeUndefined();
  expect(staged.session.exercises[0].sets[2].reps).toBe(8);
  const next = commitGuidance(state, staged.preview, now);
  expect(next.programs[0].workouts[0].exercises[0].nextRows![2].reps).toBe(9);
  expect(next.draft!.exercises[0].sets[2].reps).toBe(8);
});
it("missing effort and absent readiness stay unknown and cannot stage an escalation", () => {
  const { state, preview } = fixture();
  delete preview.seed.readiness;
  expect(guidanceRows(state, preview, now)[0].proposal.action).toBe("hold");
  state.sessions[0].exercises[0].sets[0].effortReported = false;
  expect(guidanceRows(state, preview, now)[0].proposal.action).toBe("hold");
});
