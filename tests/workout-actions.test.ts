import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  moveGroup,
  removeEntry,
  removeSet,
  restoreRemoval,
} from "../src/workoutActions";
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
