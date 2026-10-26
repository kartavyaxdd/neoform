import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  moveGroup,
  removeEntry,
  removeSet,
  restoreRemoval,
  saveSessionOrder,
} from "../src/workoutActions";
import { editState } from "../src/stateEdit";
function fixture() {
  return D.startSession(
    "Synthetic",
    D.catalog.slice(0, 3).map((x) => D.createEntry(x)),
  );
}
it("moves stable entries without rewriting logged values or prescriptions", () => {
  const s = fixture();
  s.exercises[0].sets[0].done = true;
  const before = structuredClone(s),
    next = moveGroup(s, s.exercises[0].id, s.exercises[2].id);
  expect(next.exercises.map((x) => x.id)).toEqual([
    s.exercises[1].id,
    s.exercises[2].id,
    s.exercises[0].id,
  ]);
  expect(s).toEqual(before);
  expect(next.exercises[2]).toEqual(s.exercises[0]);
});
it("moves/removes linked pairs together and undo preserves later edits", () => {
  const s = fixture();
  s.exercises[0].techniqueGroup = s.exercises[1].techniqueGroup = "pair";
  const result = removeEntry(s, s.exercises[0].id);
  expect(result.session.exercises).toHaveLength(1);
  result.session.exercises[0].notes = "New edit";
  const restored = restoreRemoval(result.session, result.undo);
  expect(restored.exercises).toHaveLength(3);
  expect(restored.exercises[2].notes).toBe("New edit");
  expect(() => restoreRemoval(restored, result.undo)).toThrow();
});
it("preserves planned dose on removal and restores only the removed row", () => {
  const s = fixture(),
    e = s.exercises[0],
    result = removeSet(s, e.id, e.sets[0].id);
  expect(result.session.exercises[0].plannedWorkingSets).toBe(3);
  result.session.exercises[0].sets[0].weight = 75;
  const restored = restoreRemoval(result.session, result.undo);
  expect(restored.exercises[0].sets[1].weight).toBe(75);
  expect(restored.exercises[0].sets[0]).toEqual(e.sets[0]);
});
it("saves an explicit future order through the actual Immer edit boundary without cloning a draft proxy", () => {
  const state = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  p.workouts = [w];
  w.exercises = [D.target("bench"), D.target("row")];
  state.programs = [p];
  const s = D.startSession(w.name, D.prepareWorkout(w, p, D.catalog, []), p, w);
  state.draft = s;
  const before = structuredClone(state),
    ordered = { ...s, exercises: [...s.exercises].reverse() };
  const next = editState(state, (draft) => saveSessionOrder(draft, ordered));
  expect(next.programs[0].workouts[0].exercises.map((t) => t.id)).toEqual(
    ordered.exercises.map((e) => e.sourceTargetId),
  );
  expect(next.draft).toEqual(state.draft);
  expect(next.sessions).toBe(state.sessions);
  expect(state).toEqual(before);
  expect(() =>
    editState(state, (draft) =>
      saveSessionOrder(draft, {
        ...ordered,
        exercises: ordered.exercises.slice(1),
      }),
    ),
  ).toThrow("every original program target");
});
