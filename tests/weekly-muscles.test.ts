import { it, expect } from "vitest";
import * as D from "../src/domain";
import { weeklyReview } from "../src/weeklyReview";
import { evaluateCoaching } from "../src/coaching";
import { acceptedChangeFixture } from "./accepted-change-fixture";
import { syntheticReadiness } from "./readiness-fixture";
const now = Date.parse("2026-10-25T12:00:00Z"),
  day = 86400000;
export function weeklyMuscleFixture(at = now) {
  const state = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  p.workouts = [w];
  w.exercises = ["bench", "row"].map((id) => ({
    ...D.target(id),
    startingLoad: 50,
  }));
  state.programs = [p];
  const make = (days: number) => {
    const s = D.startSession(
      w.name,
      D.prepareWorkout(w, p, D.catalog, []),
      p,
      w,
    );
    s.startedAt = at - days * day;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = 3600;
    s.exercises.forEach((e) => {
      e.sets.forEach((t) =>
        Object.assign(t, { done: true, effortReported: true, reps: 9 }),
      );
      e.coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt + 3600000,
      };
    });
    return s;
  };
  state.sessions = [make(5), make(2)];
  return { state, p, w, make };
}
it("separates saved assigned dose, actual primary work, indirect involvement and explicitly reported effort", () => {
  const { state } = weeklyMuscleFixture();
  state.sessions[1].exercises[0].sets[2].done = false;
  delete state.sessions[0].exercises[0].sets[0].effortReported;
  state.sessions = state.sessions.map(D.completeSession);
  const before = structuredClone(state);
  const rows = weeklyReview(state, D.catalog, "2026-10-19", now).muscle.rows;
  expect(rows.find((r) => r.muscle === "Chest")).toMatchObject({
    assigned: 6,
    completed: 5,
    qualified: 4,
    unknownEffort: 1,
    advanced: 0,
  });
  expect(rows.find((r) => r.muscle === "Triceps")).toMatchObject({
    completed: 0,
    indirect: 5,
    indirectQualified: 4,
  });
  expect(state).toEqual(before);
});
it("preserves unknown assignment instead of reconstructing past work from the current routine", () => {
  const { state } = weeklyMuscleFixture();
  delete state.sessions[0].exercises[0].plannedWorkingSets;
  state.programs[0].workouts[0].exercises[0].sets = 9;
  const row = weeklyReview(
    state,
    D.catalog,
    "2026-10-19",
    now,
  ).muscle.rows.find((r) => r.muscle === "Chest")!;
  expect(row.assigned).toBeNull();
  expect(row.knownAssigned).toBe(3);
  expect(row.unknownAssignments).toBe(1);
  expect(row.completed).toBe(6);
});
it("recovers accepted but unlogged short-plan entries and keeps deliberately omitted dose separate", () => {
  const { state, make } = weeklyMuscleFixture();
  const s = make(1),
    original = structuredClone(s.exercises);
  original.forEach((e) =>
    e.sets.forEach((t) =>
      Object.assign(t, { done: false, effortReported: false }),
    ),
  );
  const extra = D.createEntry(D.catalog.find((e) => e.id === "squat")!);
  original.push(extra);
  s.shortPlan = {
    minutes: 30,
    acceptedAt: s.startedAt - 1000,
    originalEntries: original,
    keptEntryIds: original.slice(0, 2).map((e) => e.id),
    estimatedLow: 20,
    estimatedHigh: 25,
    timingSourceIds: [],
  };
  s.exercises = s.exercises.slice(0, 1);
  state.sessions = [s];
  state.minimumClientVersion = 2;
  const rows = weeklyReview(state, D.catalog, "2026-10-19", now).muscle.rows;
  expect(rows.find((r) => r.muscle === "Back")).toMatchObject({
    assigned: 3,
    completed: 0,
  });
  expect(rows.find((r) => r.muscle === "Quads")).toMatchObject({
    assigned: 0,
    completed: 0,
    omitted: 3,
  });
});
it("keeps advanced bouts separate and does not manufacture a straight-set assignment", () => {
  const { state } = weeklyMuscleFixture();
  state.sessions = state.sessions.slice(0, 1);
  const e = state.sessions[0].exercises[0];
  e.technique = "myoreps";
  e.sets.forEach((t) => (t.bout = "mini"));
  const row = weeklyReview(
    state,
    D.catalog,
    "2026-10-19",
    now,
  ).muscle.rows.find((r) => r.muscle === "Chest")!;
  expect(row).toMatchObject({
    completed: 0,
    advanced: 3,
    qualified: 0,
    knownAssigned: 0,
  });
});
it("historical recovery and actions never use later workouts, future reports or an active draft", () => {
  const { state, make } = weeklyMuscleFixture();
  state.sessions[0].muscleFeedback = [
    {
      muscle: "Chest",
      pain: true,
      recordedAt: state.sessions[0].startedAt + 3600000,
    },
  ];
  const later = make(-3);
  later.muscleFeedback = [
    {
      muscle: "Chest",
      pain: false,
      recovered: "yes",
      recordedAt: later.startedAt + 3600000,
    },
  ];
  state.sessions.push(later);
  state.draft = make(0);
  const review = weeklyReview(
    state,
    D.catalog,
    "2026-10-19",
    now + 8 * day,
  ).muscle;
  const chest = review.rows.find((r) => r.muscle === "Chest")!;
  expect(chest.recovery.blocked).toBe(true);
  expect(chest.target).toBeUndefined();
  expect(review.current).toBe(false);
  expect(chest.completed).toBe(6);
});
it("only explicit upcoming calendar plans use current routine estimates, and skipped/missed/active plans stay separate", () => {
  const { state, p, w } = weeklyMuscleFixture();
  state.minimumClientVersion = 2;
  state.sessions = [];
  const slot = {
    id: "pending",
    programId: p.id,
    workoutId: w.id,
    programName: p.name,
    workoutName: w.name,
    date: "2026-10-25",
    originalDate: "2026-10-25",
    status: "planned" as const,
    createdAt: 1,
    updatedAt: 1,
  };
  state.schedule = [
    slot,
    { ...slot, id: "missed", date: "2026-10-20" },
    { ...slot, id: "skipped", status: "skipped" },
  ];
  const review = weeklyReview(state, D.catalog, "2026-10-19", now).muscle;
  expect(review.rows.find((r) => r.muscle === "Chest")).toMatchObject({
    assigned: 0,
    completed: 0,
    upcoming: 3,
  });
  expect(review.calendar).toMatchObject({ planned: 1, missed: 1, skipped: 1 });
});
it.each(["techniqueGroup", "repGoal", "phase", "pain"])(
  "legacy %s cannot produce a confirmed weekly lift improvement",
  (issue) => {
    const { state } = weeklyMuscleFixture();
    const e = state.sessions[1].exercises[0];
    e.sets.forEach((t) => t.reps++);
    if (issue === "techniqueGroup") e.techniqueGroup = "ambiguous-legacy";
    if (issue === "repGoal") e.repGoal = 30;
    if (issue === "phase") state.sessions.forEach((s) => delete s.phase);
    if (issue === "pain")
      state.sessions[1].feedback = { reported: true, pain: true };
    expect(
      weeklyReview(state, D.catalog, "2026-10-19", now).comparisons.filter(
        (r) => r.exerciseId === "bench",
      ),
    ).toHaveLength(0);
  },
);

it("a shortened or unconfirmed preceding exercise cannot establish a full-dose progression baseline for a later lift", () => {
  const { state, p, w } = weeklyMuscleFixture();
  state.sessions[1].exercises[0].sets[2].done = false;
  state.sessions = state.sessions.map(D.completeSession);
  const next = D.startSession(
    w.name,
    D.prepareWorkout(w, p, D.catalog, state.sessions),
    p,
    w,
  );
  next.startedAt = now;
  next.readiness = syntheticReadiness(now);
  next.readiness.muscles = D.muscles.map((m) => ({
    muscle: m,
    recovered: "yes",
    pain: false,
    soreness: 1,
    recordedAt: now,
  }));
  expect(
    evaluateCoaching(state, next, now)
      .filter((p) => p.exerciseId === "row")
      .map((p) => p.action),
  ).toEqual(["hold"]);
  expect(
    weeklyReview(state, D.catalog, "2026-10-19", now).comparisons.filter(
      (r) => r.exerciseId === "row",
    ),
  ).toHaveLength(0);
});

it("local pain does not relabel unrelated confirmed work as unknown", () => {
  const { state } = weeklyMuscleFixture();
  state.sessions[1].muscleFeedback = [
    {
      muscle: "Quads",
      pain: true,
      recordedAt: state.sessions[1].startedAt + 3600000,
    },
  ];
  expect(weeklyReview(state, D.catalog, "2026-10-19", now).targets.met).toBe(
    12,
  );
});
it("calendar edits after a historical week do not rewrite its historical status", () => {
  const { state, p, w } = weeklyMuscleFixture();
  state.minimumClientVersion = 2;
  state.schedule = [
    {
      id: "later-edit",
      programId: p.id,
      workoutId: w.id,
      programName: p.name,
      workoutName: w.name,
      date: "2026-11-03",
      originalDate: "2026-10-22",
      status: "skipped",
      createdAt: now - 5 * day,
      updatedAt: now + 6 * day,
    },
  ];
  expect(
    weeklyReview(state, D.catalog, "2026-10-19", now + 8 * day).muscle.calendar,
  ).toMatchObject({ revised: 1, skipped: 0, logged: 0, planned: 0 });
});

it("later muscle feedback on an earlier session cannot erase a historical pain observation", () => {
  const { state } = weeklyMuscleFixture();
  state.sessions[0].muscleFeedback = [
    {
      muscle: "Chest",
      pain: true,
      recordedAt: state.sessions[0].startedAt + 3600000,
    },
  ];
  state.sessions[1].muscleFeedback = [
    {
      muscle: "Chest",
      pain: false,
      recovered: "yes",
      recordedAt: now + 5 * day,
    },
  ];
  expect(
    weeklyReview(
      state,
      D.catalog,
      "2026-10-19",
      now + 8 * day,
    ).muscle.rows.find((r) => r.muscle === "Chest")!.recovery.blocked,
  ).toBe(true);
});
it("future saved workouts do not establish that a current calendar occurrence was logged", () => {
  const { state, p, w, make } = weeklyMuscleFixture();
  state.minimumClientVersion = 2;
  const slot = {
    id: "future-observation",
    programId: p.id,
    workoutId: w.id,
    programName: p.name,
    workoutName: w.name,
    date: "2026-10-25",
    originalDate: "2026-10-25",
    status: "planned" as const,
    createdAt: 1,
    updatedAt: 1,
  };
  state.schedule = [slot];
  const future = make(-3);
  future.scheduleOccurrenceId = slot.id;
  future.scheduledDate = slot.date;
  state.sessions.push(future);
  expect(
    weeklyReview(state, D.catalog, "2026-10-19", now).muscle.calendar,
  ).toMatchObject({ logged: 0, planned: 1 });
});

it("historical target attainment and lift comparisons exclude execution confirmations entered after that week", () => {
  const { state, make } = weeklyMuscleFixture();
  state.sessions[1] = make(0);
  state.sessions[1].exercises[0].coachingContext!.recordedAt =
    now + 13 * 3600000;
  const review = weeklyReview(state, D.catalog, "2026-10-19", now + 5 * day);
  expect(review.targets.unknown).toBe(3);
  expect(
    review.comparisons.filter((r) => r.exerciseId === "bench"),
  ).toHaveLength(0);
});

it("a single eligible follow-up remains observe longer in the muscle's next action", () => {
  const { state } = acceptedChangeFixture(now + 3 * day, ["met"]);
  const row = weeklyReview(
    state,
    D.catalog,
    "2026-10-19",
    now,
  ).muscle.rows.find((r) => r.muscle === "Chest")!;
  expect(row.action.label).toBe("Observe accepted targets");
  expect(row.accepted?.followups).toBe(1);
});

it("a mixed legacy working/drop plan does not fabricate a zero assigned straight-set dose", () => {
  const { state } = weeklyMuscleFixture();
  state.sessions = state.sessions.slice(0, 1);
  const e = state.sessions[0].exercises[0];
  e.sets.push({ ...e.sets[0], id: "extra-drop", kind: "drop", bout: "drop" });
  const row = weeklyReview(
    state,
    D.catalog,
    "2026-10-19",
    now,
  ).muscle.rows.find((r) => r.muscle === "Chest")!;
  expect(row.assigned).toBeNull();
  expect(row.completed).toBe(3);
  expect(row.advanced).toBe(1);
});
