import { it, expect } from "vitest";
import { syntheticReadiness } from "./readiness-fixture";
import {
  createEntry,
  catalog,
  startSession,
  completeSession,
  recommend,
} from "../src/domain";
const history = (weight: number) =>
  [1, 2].map((n) => {
    const e = createEntry(catalog[0]);
    e.setup = { label: "Synthetic rack", execution: "", availableLoads: [weight, weight + 0.81] };
    e.sets = e.sets.map((s) => ({
      ...s,
      weight,
      reps: 12,
      rir: 2,
      done: true,
      effortReported: true,
    }));
    const s = completeSession(startSession("Upper", [e]));
    s.feedback = {
      pump: 3,
      soreness: 1,
      fatigue: 1,
      pain: false,
      reported: true,
    };
    s.startedAt = n;
    return s;
  });
it("rounds recommended increments down so decimals never breach the 2.5% cap", () => {
  const rec = recommend("bench", history(32.6), catalog, { min: 8, max: 12 }, {readiness:syntheticReadiness()});
  expect(rec.action, JSON.stringify(rec)).toBe("load");
  expect(rec.weight).toBeLessThanOrEqual(32.6 * 1.025);
});
it("holds rather than suggesting a meaningless increment below numeric resolution", () => {
  expect(
    recommend("bench", history(0.21), catalog, { min: 8, max: 12 }, {readiness:syntheticReadiness()}).action,
  ).toBe("hold");
});
