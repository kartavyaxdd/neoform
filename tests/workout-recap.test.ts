import { it, expect } from "vitest";
import * as D from "../src/domain";
import { workoutRecap, estimateSessionEnergy } from "../src/workoutRecap";
function session(reps = 10) {
  const e = D.createEntry(D.catalog.find((x) => x.id === "bench")!);
  e.sets.forEach((t) =>
    Object.assign(t, { weight: 50, reps, done: true, effortReported: true }),
  );
  const s = D.startSession("Chest & back", [e]);
  s.phase = "accumulation";
  s.duration = 3600;
  s.bodyweight = { kg: 60, at: s.startedAt };
  return s;
}
it("shows distinct observed PRs without repeating identical set records or modifying history", () => {
  const a = session(),
    b = session(11);
  a.startedAt -= 86400000;
  a.date = "2026-10-20";
  b.date = "2026-10-21";
  const history = [a, b],
    before = structuredClone(history);
  const r = workoutRecap(b, history, D.catalog, "kg");
  expect(r.records).toHaveLength(1);
  expect(r.records[0].label).toContain("10 → 11");
  expect(r.work).toBe(3);
  expect(r.xp).toBe(125);
  expect(history).toEqual(before);
  expect(workoutRecap(a, history, D.catalog, "kg").records).toEqual([]);
  b.exercises[0].sets.forEach((t) => (t.done = false));
  expect(workoutRecap(b, history, D.catalog, "kg").records).toEqual([]);
});
it("uses a labelled gross scenario range, never inferred effort, and rejects missing or implausible inputs", () => {
  expect(estimateSessionEnergy(3600, 60, "session")).toMatchObject({
    low: 210,
    high: 360,
    source: "session",
  });
  for (const duration of [0, -1, NaN, 20000])
    expect(estimateSessionEnergy(duration, 60, "session")).toBeNull();
  expect(estimateSessionEnergy(3600, undefined, "current")).toBeNull();
  const s = session();
  delete s.bodyweight;
  expect(workoutRecap(s, [s], D.catalog, "kg").energy).toBeNull();
  expect(workoutRecap(s, [s], D.catalog, "kg", 60).energy?.source).toBe(
    "current",
  );
});
it("keeps machine labels raw, warmups out and daily reward caps intact", () => {
  const a = session(),
    b = session(12);
  a.startedAt -= 60000;
  a.date = b.date;
  a.exercises[0].convention = b.exercises[0].convention = "machine-label";
  b.exercises[0].sets[1].kind = "warmup";
  const r = workoutRecap(b, [a, b], D.catalog, "lb");
  expect(r.work).toBe(2);
  expect(r.records[0].label).toContain("50 label");
  expect(r.xp).toBe(25);
});
