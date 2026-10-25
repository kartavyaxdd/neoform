import { it, expect } from "vitest";
import * as D from "../src/domain";
import { estimateWorkout, shorterAlternative } from "../src/workoutTiming";

const now = Date.parse("2026-10-25T12:00:00Z");
function fixture() {
  const state = D.emptyState(),
    program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  workout.exercises = ["bench", "row", "squat", "ohp", "curl"].map((id) => ({
    ...D.target(id),
    sets: 4,
    rest: 180,
  }));
  const valid = new Set(D.catalog.map((x) => x.id));
  workout.exercises = workout.exercises.filter((t) => valid.has(t.exerciseId));
  program.workouts = [workout];
  state.programs = [program];
  const session = D.startSession(
    workout.name,
    D.prepareWorkout(workout, program, D.catalog, []),
    program,
    workout,
  );
  session.startedAt = now;
  session.date = "2026-10-25";
  return { state, session };
}
it("reviews shorter alternatives without compressing rest or modifying retained targets", () => {
  const { state, session } = fixture(),
    before = structuredClone(session);
  const p = shorterAlternative(state, session, 30, now);
  expect(p.feasible).toBe(true);
  expect(p.omitted.length).toBeGreaterThan(0);
  expect(p.estimate.high).toBeLessThanOrEqual(30);
  expect(p.session.exercises).toEqual(
    session.exercises.slice(0, p.session.exercises.length),
  );
  expect(p.originalEntries).toEqual(before.exercises);
  expect(session).toEqual(before);
});
it("larger budgets do not silently omit more work or append catch-up volume", () => {
  const { state, session } = fixture();
  const plans = [30, 45, 60].map((n) =>
    shorterAlternative(state, session, n as 30 | 45 | 60, now),
  );
  expect(plans[0].session.exercises.length).toBeLessThanOrEqual(
    plans[1].session.exercises.length,
  );
  expect(plans[1].session.exercises.length).toBeLessThanOrEqual(
    plans[2].session.exercises.length,
  );
  expect(state.programs[0].workouts[0].exercises).toHaveLength(
    session.exercises.length,
  );
  expect(state.sessions).toEqual([]);
});
it("preserves linked groups as complete units and keeps warmups on retained exercises", () => {
  const { state, session } = fixture();
  for (const e of session.exercises.slice(0, 2)) {
    e.technique = "superset";
    e.techniqueGroup = "pair";
    e.superset = "pair";
  }
  const e = session.exercises[0];
  e.sets.unshift({
    ...e.sets[0],
    id: "warmup",
    kind: "warmup",
    reps: 10,
    rest: 60,
  });
  const p = shorterAlternative(state, session, 45, now);
  const kept = p.session.exercises.filter((x) => x.techniqueGroup === "pair");
  expect(kept.length === 0 || kept.length === 2).toBe(true);
  if (kept.length) expect(kept[0].sets[0].id).toBe("warmup");
});
it("reports infeasibility instead of splitting a long first group or shrinking rest", () => {
  const { state, session } = fixture();
  session.exercises.slice(0, 2).forEach((e) => {
    e.techniqueGroup = "pair";
    e.superset = "pair";
    e.sets.forEach((t) => (t.prescription!.rest = 900));
  });
  const p = shorterAlternative(state, session, 30, now);
  expect(p.feasible).toBe(false);
  expect(p.session.exercises).toHaveLength(2);
  expect(p.estimate.high).toBeGreaterThan(30);
});
it("never edits an already logged draft", () => {
  const { state, session } = fixture();
  session.exercises[0].sets[0].done = true;
  expect(() => shorterAlternative(state, session, 30, now)).toThrow(
    /before logging/,
  );
});
it("uses actual recent comparable durations only with enough complete matching history", () => {
  const { state, session } = fixture(),
    initial = estimateWorkout(state, session, now);
  state.sessions = [1, 2, 3].map((n) => {
    const s = structuredClone(session);
    s.id = `timing-${n}`;
    s.startedAt = now - n * 3 * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = initial.point * 60 * 1.2;
    s.exercises.forEach((e) => {
      e.sets.forEach((t) => (t.done = true));
      e.coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt + s.duration * 1000,
      };
    });
    return s;
  });
  const measured = estimateWorkout(state, session, now);
  expect(measured.sources).toHaveLength(3);
  expect(measured.point).toBeGreaterThanOrEqual(initial.point);
  state.sessions[0].exercises[0].setup = {
    label: "Different",
    execution: "",
    availableLoads: [],
  };
  expect(estimateWorkout(state, session, now).sources).toHaveLength(0);
});
it("advanced rep goals and controlled tempo increase timing rather than inheriting a short straight-set guess", () => {
  const { state, session } = fixture(),
    plain = estimateWorkout(state, session, now).point;
  session.exercises[0].technique = "giant-set";
  session.exercises[0].repGoal = 300;
  session.exercises[0].tempo = { eccentric: 5, pause: 2, concentric: 3 };
  expect(estimateWorkout(state, session, now).point).toBeGreaterThan(
    plain + 30,
  );
});
it("an unspecified zero cadence cannot shrink the timing estimate", () => {
  const { state, session } = fixture(),
    plain = estimateWorkout(state, session, now).point;
  session.exercises[0].tempo = { eccentric: 0, pause: 0, concentric: 0 };
  expect(estimateWorkout(state, session, now).point).toBeGreaterThanOrEqual(
    plain,
  );
});
