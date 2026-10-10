import { it, expect } from "vitest";
import {
  catalog,
  createEntry,
  startSession,
  completeSession,
  recommend,
} from "../src/domain";
const logged = () => {
  const e = createEntry(catalog[0]);
  e.sets = e.sets.map((s) => ({ ...s, weight: 60, reps: 12, done: true }));
  return completeSession(startSession("Upper", [e]));
};
it("holds progression when the latest recovery feedback came from drop-only or another exercise", () => {
  const a = logged(),
    b = logged(),
    pain = logged();
  a.startedAt = 1;
  b.startedAt = 2;
  pain.startedAt = 3;
  pain.feedback.pain = true;
  pain.exercises[0].sets.forEach((s) => (s.kind = "drop"));
  expect(
    recommend("bench", [a, b, pain], catalog, { min: 8, max: 12 }).action,
  ).toBe("recover");
  pain.exercises[0].exerciseId = "row";
  expect(
    recommend("bench", [a, b, pain], catalog, { min: 8, max: 12 }).action,
  ).toBe("recover");
});
