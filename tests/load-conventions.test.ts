import { it, expect } from "vitest";
import * as D from "../src/domain";
it("preserves raw machine labels and converts standardized loads without changing stored values", () => {
  expect(D.displayLoad(7, "machine-label", "lb")).toBe(7);
  expect(D.canonicalLoad(7, "machine-label", "lb")).toBe(7);
  expect(D.displayLoad(50, "per-dumbbell", "lb")).toBeCloseTo(110.231131);
  expect(D.canonicalLoad(110.231131, "per-dumbbell", "lb")).toBeCloseTo(50);
});
it("exports machine labels in a separate column instead of pretending they are kilograms", () => {
  const e = D.createEntry(D.catalog.find((x) => x.id === "leg-press")!);
  e.sets[0] = { ...e.sets[0], weight: 7, done: true };
  const csv = D.csvSessions(
    [D.completeSession(D.startSession("Labels", [e]))],
    D.catalog,
  );
  expect(csv).toContain('"load_kg","machine_label"');
  expect(csv).toContain('"working","","7"');
});
