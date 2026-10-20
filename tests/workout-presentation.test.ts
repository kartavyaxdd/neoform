import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  previousWorkingRows,
  resumeExerciseId,
  nextExerciseId,
  weeklyPrimarySets,
} from "../src/workoutPresentation";
it("previous rows exclude warmups, unfinished bouts and different execution contexts", () => {
  const e = D.createEntry(D.catalog[0], D.target(D.catalog[0].id));
  e.sets[0].done = true;
  e.sets[0].weight = 50;
  const later = structuredClone(e);
  later.id = D.uid();
  later.setup = {
    label: "Other rack",
    execution: "Different",
    availableLoads: [],
  };
  later.sets[0].weight = 90;
  const first = D.startSession("Prior", [e]),
    second = D.startSession("Other setup", [later]);
  first.startedAt = 1;
  second.startedAt = 2;
  expect(
    previousWorkingRows([first, second], e, D.catalog[0]).map((s) => s.weight),
  ).toEqual([50]);
  e.sets[0].kind = "warmup";
  expect(previousWorkingRows([first], e, D.catalog[0])).toEqual([]);
});
it("resumes unfinished work and never advances over incomplete advanced bouts", () => {
  const a = D.createEntry(D.catalog[0]),
    b = D.createEntry(D.catalog[1]);
  a.sets.forEach((t) => (t.done = true));
  const s = D.startSession("QA", [a, b]);
  expect(resumeExerciseId(s)).toBe(b.id);
  a.sets.push({ ...a.sets[0], id: D.uid(), kind: "drop", done: false });
  expect(nextExerciseId(s, a.id)).toBe(a.id);
  a.sets.at(-1)!.done = true;
  expect(nextExerciseId(s, a.id)).toBe(b.id);
});
it("weekly body-map counts primary completed working sets without inventing hard-set qualification", () => {
  const e = D.createEntry(D.catalog[0]);
  e.sets[0].done = true;
  e.sets[0].effortReported = false;
  e.sets[1].done = true;
  e.sets[1].kind = "warmup";
  e.sets[2].done = true;
  e.sets[2].kind = "drop";
  const s = D.startSession("QA", [e]);
  s.date = "2026-10-19";
  expect(
    weeklyPrimarySets([s], D.catalog, "2026-10-19")[D.catalog[0].muscle],
  ).toBe(1);
  expect(
    weeklyPrimarySets([s], D.catalog, "2026-10-26")[D.catalog[0].muscle],
  ).toBe(0);
});
