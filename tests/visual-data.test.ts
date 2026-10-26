import { expect, it } from "vitest";
import * as D from "../src/domain";
import {
  trainingTrend,
  weightTrend,
  muscleTrend,
  primaryWork,
} from "../src/visualData";
import { weeklyBrowserFixture } from "./weekly-muscle-fixture";
import { weeklyPrimarySets } from "../src/workoutPresentation";
const now = Date.parse("2026-10-26T12:00:00+05:30");
it("counts training days once and excludes drafts, future work and warmups", () => {
  const s = weeklyBrowserFixture(now),
    one = s.sessions.at(-1)!;
  s.sessions.push({ ...structuredClone(one), id: "same-day" });
  s.sessions.push({
    ...structuredClone(one),
    id: "future",
    startedAt: now + 86400000,
    date: "2026-10-27",
  });
  const points = trainingTrend(s.sessions, 8, "2026-10-26", now);
  expect(points).toHaveLength(8);
  expect(points.at(-1)!.value).toBe(1);
  expect(trainingTrend([], 8, "2026-10-26", now)).toEqual([]);
});
it("uses actual primary work with advanced bouts kept separate", () => {
  const s = weeklyBrowserFixture(now),
    e = s.sessions.at(-1)!.exercises[0];
  const before = primaryWork(s.sessions, D.catalog, "Chest");
  e.sets.push({
    ...e.sets[0],
    id: "drop",
    done: true,
    kind: "drop",
    bout: "drop",
  });
  expect(primaryWork(s.sessions, D.catalog, "Chest")).toBe(before);
  const points = muscleTrend(
    s.sessions,
    D.catalog,
    "Chest",
    8,
    "2026-10-26",
    now,
  );
  expect(points.at(-1)!.value).toBe(2);
});
it("weight plots keep the latest actual daily report, display units and exclude future reports", () => {
  const s = weeklyBrowserFixture(now);
  s.coaching = {
    enabled: true,
    minutes: 60,
    diet: "unknown",
    earlyTrials: false,
    priorities: [],
    bodyweight: { kg: 60, at: now },
  };
  s.sessions.at(-1)!.bodyweight = { kg: 59, at: now - 1000 };
  const p = weightTrend(s, 8, now);
  expect(p.at(-1)!.value).toBe(60);
  s.settings.unit = "lb";
  expect(weightTrend(s, 8, now).at(-1)!.value).toBeCloseTo(132.277, 2);
  s.coaching.bodyweight = { kg: 100, at: now + 1000 };
  expect(weightTrend(s, 8, now).at(-1)!.value).toBeCloseTo(130.073, 2);
});
it("visual selectors never change saved targets, observations or effort", () => {
  const s = weeklyBrowserFixture(now),
    original = JSON.stringify(s);
  trainingTrend(s.sessions, 12, "2026-10-26", now);
  weightTrend(s, 12, now);
  muscleTrend(s.sessions, D.catalog, "Back", 12, "2026-10-26", now);
  expect(JSON.stringify(s)).toBe(original);
});
it("the body-map count never treats advanced entries as primary straight sets", () => {
  const s = weeklyBrowserFixture(now),
    one = s.sessions.at(-1)!;
  one.exercises.forEach((e) => {
    e.technique = "drop-set";
  });
  expect(weeklyPrimarySets([one], D.catalog, "2026-10-26").Chest).toBe(0);
});
