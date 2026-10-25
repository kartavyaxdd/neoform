import { it, expect } from "vitest";
import * as D from "../src/domain";
import { liftSegments, liftPoints } from "../src/liftProgress";

import { liftProgressFixture } from "./lift-progress-fixture";
const fixture = () => liftProgressFixture(now);
const now = Date.parse("2026-10-25T12:00:00Z");

it("shows reps at a fixed actual load, row and reported effort with exact observations", () => {
  const state = fixture(),
    before = structuredClone(state),
    segments = liftSegments(state, "bench", now);
  expect(segments).toHaveLength(1);
  expect(liftPoints(segments[0], 0, 50, 2).map((p) => p.reps)).toEqual([
    8, 9, 10,
  ]);
  expect(state).toEqual(before);
});
it.each([
  "setup",
  "phase",
  "method",
  "order",
  "dose",
  "equipment",
  "convention",
])(
  "a changed %s starts a new segment without joining across a later return",
  (issue) => {
    const state = fixture(),
      s = state.sessions[1],
      e = s.exercises[0];
    if (issue === "setup")
      e.setup = { label: "Other rack", execution: "", availableLoads: [] };
    if (issue === "phase") s.phase = "deload";
    if (issue === "method") e.technique = "down-set";
    if (issue === "order")
      s.exercises.unshift(
        D.createEntry(D.catalog.find((x) => x.id === "squat")!),
      );
    if (issue === "dose") e.plannedWorkingSets = 2;
    if (issue === "equipment") e.equipment = "Machine";
    if (issue === "convention") e.convention = "machine-label";
    expect(liftSegments(state, "bench", now)).toHaveLength(3);
  },
);
it("unknown effort stays visible as unknown and cannot manufacture matched-effort progress", () => {
  const state = fixture();
  state.sessions[1].exercises[0].sets[0].effortReported = false;
  const s = liftSegments(state, "bench", now)[0];
  expect(s.exposures[1].rows[0].rir).toBeNull();
  expect(liftPoints(s, 0, 50, 2).map((p) => p.reps)).toEqual([8, 10]);
  expect(liftPoints(s, 0, 50, null)).toEqual([]);
});
it("different loads, efforts and row positions are never silently collapsed into an estimated strength score", () => {
  const state = fixture();
  state.sessions[1].exercises[0].sets[0].weight = 55;
  state.sessions[2].exercises[0].sets[0].rir = 1;
  const s = liftSegments(state, "bench", now)[0];
  expect(liftPoints(s, 0, 50, 2)).toHaveLength(1);
  expect(liftPoints(s, 1, 50, 2)).toHaveLength(3);
});
it("incomplete dose, unknown execution, advanced work and future reports remain raw observations", () => {
  for (const issue of [
    "dose",
    "execution",
    "method",
    "confirmation",
    "phase",
  ]) {
    const state = fixture(),
      e = state.sessions[1].exercises[0];
    if (issue === "dose") e.sets[2].done = false;
    if (issue === "execution") e.coachingContext = undefined;
    if (issue === "method") e.technique = "drop-set";
    if (issue === "confirmation") e.coachingContext!.recordedAt = now + 1000;
    if (issue === "phase") state.sessions[1].phase = undefined;
    const segments = liftSegments(state, "bench", now);
    const middle = segments
      .flatMap((s) => s.exposures)
      .find((s) => s.sessionId === state.sessions[1].id)!;
    expect(middle.comparable).toBe(false);
    expect(middle.rows.length).toBeGreaterThan(0);
  }
});
it("warmups and future workouts are excluded and undo/edit/import are reflected without a competing cache", () => {
  const state = fixture(),
    e = state.sessions[2].exercises[0];
  e.sets.unshift({ ...e.sets[0], id: "warmup", kind: "warmup", reps: 99 });
  let s = liftSegments(state, "bench", now)[0];
  expect(s.exposures.at(-1)!.rows).toHaveLength(3);
  e.sets[1].reps = 11;
  s = liftSegments(D.historyStateSchema.parse(state), "bench", now)[0];
  expect(liftPoints(s, 0, 50, 2).at(-1)!.reps).toBe(11);
  state.sessions[2].startedAt = now + 86400000;
  expect(liftSegments(state, "bench", now)[0].exposures).toHaveLength(2);
});
it("reported pain stays visible but does not become a favorable comparison point", () => {
  const state = fixture();
  state.sessions[1].muscleFeedback = [{ muscle: "Chest", pain: true }];
  const segment = liftSegments(state, "bench", now)[0];
  expect(segment.exposures[1].note).toMatch(/pain/);
  expect(liftPoints(segment, 0, 50, 2).map((p) => p.reps)).toEqual([8, 10]);
});
it("unlabelled legacy group/rep-goal metadata remains raw rather than an ordinary straight-set comparison", () => {
  const state = fixture();
  state.sessions[1].exercises[0].repGoal = 50;
  const segment = liftSegments(state, "bench", now).find((s) =>
    s.exposures.some((e) => e.sessionId === state.sessions[1].id),
  )!;
  expect(segment.exposures[0].comparable).toBe(false);
});
