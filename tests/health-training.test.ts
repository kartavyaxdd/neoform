import { it, expect } from "vitest";
import * as D from "../src/domain";
import { liftProgressFixture } from "./lift-progress-fixture";
import {
  automaticReduction,
  applyAutomaticReduction,
  undoAutomaticReduction,
} from "../src/healthTraining";
import type { RecoveryEstimate } from "../src/healthRecovery";
const now = Date.parse("2026-11-01T10:00:00Z");
const low: RecoveryEstimate = {
  policy: "recovery-v1",
  at: now,
  score: 25,
  band: "lower",
  confidence: "moderate",
  components: [],
  reason: "test",
};
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
  session.readiness = {
    recordedAt: now - 1000,
    pain: false,
    fatigue: 3,
    context: "changed",
    factors: ["poor-sleep"],
    muscles: [],
  };
  const entry = session.exercises[0];
  entry.setup = {
    label: "rack",
    execution: "usual",
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
it("changes only the imminent unedited row and its displayed prescription, with a targeted undo", () => {
  const { state, session, entry } = fixture();
  const before = structuredClone(state);
  const proposal = automaticReduction(
    state,
    session,
    entry.id,
    low,
    true,
    now,
  )!;
  expect(proposal.to.weight).toBe(45);
  const changed = applyAutomaticReduction(state, proposal);
  expect(state).toEqual(before);
  expect(changed.draft!.exercises[0].sets[0]).toEqual(entry.sets[0]);
  expect(changed.draft!.exercises[0].sets[1].prescription!.weight).toBe(45);
  expect(changed.programs).toEqual(state.programs);
  expect(changed.sessions).toEqual(state.sessions);
  changed.draft!.notes = "new note";
  const undone = undoAutomaticReduction(changed, proposal);
  expect(undone.draft!.notes).toBe("new note");
  expect(undone.draft!.exercises[0].sets[1]).toEqual(entry.sets[1]);
});
it.each([
  "no-check",
  "unknown-effort",
  "edited",
  "pain",
  "severe-fatigue",
  "stale-check",
  "no-check-in",
  "rest",
  "advanced",
  "healthy",
  "stale-score",
  "wrong-profile-draft",
])("cannot auto reduce under %s", (issue) => {
  const { state, session, entry } = fixture();
  let checked = true;
  let score = { ...low };
  if (issue === "no-check") checked = false;
  if (issue === "unknown-effort") entry.sets[0].effortReported = false;
  if (issue === "edited") entry.sets[1].reps++;
  if (issue === "pain") session.readiness!.pain = true;
  if (issue === "severe-fatigue") session.readiness!.fatigue = 4;
  if (issue === "stale-check")
    session.readiness!.recordedAt = now - 13 * 3600000;
  if (issue === "no-check-in") delete session.readiness;
  if (issue === "rest")
    state.timer = {
      endAt: now + 1000,
      remaining: 10,
      paused: false,
      setId: entry.sets[0].id,
    };
  if (issue === "advanced") entry.technique = "myoreps";
  if (issue === "healthy") score.score = 80;
  if (issue === "stale-score") score.at = now - 25 * 3600000;
  if (issue === "wrong-profile-draft") state.draft = null;
  expect(
    automaticReduction(state, session, entry.id, score, checked, now),
  ).toBeNull();
});
it("rejects stale apply and cannot undo a completed or edited set", () => {
  const { state, session, entry } = fixture();
  const p = automaticReduction(state, session, entry.id, low, true, now)!;
  const edited = structuredClone(state);
  edited.draft!.exercises[0].sets[0].reps++;
  expect(applyAutomaticReduction(edited, p)).toBe(edited);
  const applied = applyAutomaticReduction(state, p);
  applied.draft!.exercises[0].sets[1].done = true;
  expect(undoAutomaticReduction(applied, p)).toBe(applied);
});
import { editState } from "../src/stateEdit";
it("applies and undoes through the actual Immer-backed persistence transaction", () => {
  const { state, session, entry } = fixture();
  const p = automaticReduction(state, session, entry.id, low, true, now)!;
  const saved = editState(state, (draft) => {
    expect(
      automaticReduction(draft, draft.draft!, entry.id, low, true, now),
    ).not.toBeNull();
    return applyAutomaticReduction(draft, p);
  });
  expect(saved.draft!.exercises[0].sets[1].weight).toBe(45);
  expect(
    editState(saved, (s) => undoAutomaticReduction(s, p)).draft!.exercises[0]
      .sets[1].weight,
  ).toBe(50);
});
