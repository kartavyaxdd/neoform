import { it, expect } from "vitest";
import * as D from "../src/domain";
import { nextSetAdvice } from "../src/nextSetAdvice";
import { liftProgressFixture } from "./lift-progress-fixture";
const now = Date.parse("2026-10-25T12:00:00Z"),
  check = { execution: "consistent", rest: "usual" } as const;
function fixture() {
  const state = liftProgressFixture(now),
    p = state.programs[0],
    w = p.workouts[0];
  const session = D.startSession(
    w.name,
    D.prepareWorkout(w, p, D.catalog, state.sessions),
    p,
    w,
  );
  session.startedAt = now;
  session.date = "2026-10-25";
  const entry = session.exercises[0];
  entry.setup = {
    label: "QA rack",
    execution: "Same ROM",
    availableLoads: [45, 50, 55],
  };
  Object.assign(entry.sets[0], {
    done: true,
    reps: 6,
    rir: 0,
    effortReported: true,
  });
  state.draft = session;
  return { state, session, entry };
}
it("requires reported effort and a current explicit execution/rest check before a numeric load review", () => {
  const { state, session, entry } = fixture();
  expect(nextSetAdvice(state, session, entry.id, undefined, now).kind).toBe(
    "context",
  );
  entry.sets[0].effortReported = false;
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe(
    "effort",
  );
});
it("can review a selected lower load after a genuine range/reserve miss without changing any row or dose", () => {
  const { state, session, entry } = fixture(),
    before = structuredClone(state);
  const advice = nextSetAdvice(state, session, entry.id, check, now);
  expect(advice.kind).toBe("load");
  expect(advice.load).toBe(45);
  expect(advice.nextSetId).toBe(entry.sets[1].id);
  expect(state).toEqual(before);
});
it("keeps the planned reserve rather than chasing reps or adding weight after an easy set", () => {
  const { state, session, entry } = fixture();
  Object.assign(entry.sets[0], { reps: 12, rir: 7 });
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe("keep");
  expect(
    nextSetAdvice(state, session, entry.id, check, now).load,
  ).toBeUndefined();
});
it("reviews rest first while the matching deadline is active or paused", () => {
  const { state, session, entry } = fixture();
  state.timer = {
    setId: entry.sets[0].id,
    paused: false,
    remaining: 60,
    endAt: now + 60000,
  };
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe("rest");
  state.timer.paused = true;
  state.timer.endAt = now - 1000;
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe("rest");
  state.timer.paused = false;
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe("load");
});
it.each([
  "changed rest",
  "changed execution",
  "unknown inventory",
  "coarse inventory",
  "manual actual",
  "phase",
  "advanced",
  "linked",
  "order",
])("does not invent a load under %s", (issue) => {
  const { state, session, entry } = fixture();
  let current = { ...check } as {
    execution: "consistent" | "changed";
    rest: "usual" | "shorter";
  };
  if (issue === "changed rest") current.rest = "shorter";
  if (issue === "changed execution") current.execution = "changed";
  if (issue === "unknown inventory") entry.setup!.availableLoads = [];
  if (issue === "coarse inventory") entry.setup!.availableLoads = [30, 50];
  if (issue === "manual actual") entry.sets[0].weight = 55;
  if (issue === "phase") session.phase = "deload";
  if (issue === "advanced") entry.technique = "myoreps";
  if (issue === "linked") entry.superset = "A";
  if (issue === "order") {
    entry.sets[0].done = false;
    entry.sets[1].done = true;
  }
  expect(
    nextSetAdvice(state, session, entry.id, current, now).load,
  ).toBeUndefined();
});
it("reported pain vetoes numeric coaching immediately", () => {
  const { state, session, entry } = fixture();
  entry.coachingContext = {
    execution: "consistent",
    rest: "usual",
    skipReason: "pain",
    recordedAt: now,
  };
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe(
    "pause",
  );
});
it("a planned back-off remains a back-off rather than being reduced again without evidence", () => {
  const { state, session, entry } = fixture();
  entry.sets[1].prescription!.weight = 45;
  entry.sets[1].weight = 45;
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe("keep");
});
it("a planned heavier row cannot turn a miss into another suggested escalation", () => {
  const { state, session, entry } = fixture();
  entry.sets[1].weight = 55;
  entry.sets[1].prescription!.weight = 55;
  expect(nextSetAdvice(state, session, entry.id, check, now).load).toBe(45);
});
it("draft pain reports are a veto before they become saved workout history", () => {
  const { state, session, entry } = fixture();
  session.feedback.pain = true;
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe(
    "pause",
  );
  session.feedback.pain = null;
  session.muscleFeedback = [{ muscle: "Chest", pain: true }];
  expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe(
    "pause",
  );
});
it.each(["dose", "row context", "machine", "bodyweight"])(
  "does not suggest numeric adaptation for changed %s",
  (issue) => {
    const { state, session, entry } = fixture();
    if (issue === "dose") entry.plannedWorkingSets = 2;
    if (issue === "row context") entry.sets[1].prescription!.rir++;
    if (issue === "machine") entry.convention = "machine-label";
    if (issue === "bodyweight") entry.convention = "added-bodyweight";
    expect(
      nextSetAdvice(state, session, entry.id, check, now).load,
    ).toBeUndefined();
  },
);
it.each(["group", "rep goal"])(
  "keeps ambiguous legacy %s metadata out of straight-set advice",
  (kind) => {
    const { state, session, entry } = fixture();
    if (kind === "group") entry.techniqueGroup = "legacy-group";
    else entry.repGoal = 50;
    expect(nextSetAdvice(state, session, entry.id, check, now).kind).toBe(
      "manual",
    );
  },
);
