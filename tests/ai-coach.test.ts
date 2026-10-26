import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  buildCoachContext,
  coachContextSchema,
  canUseGemini,
} from "../src/aiCoach";
import { weeklyBrowserFixture } from "./weekly-muscle-fixture";
it("allows only the explicitly entitled Sharma profile in shared profile mode", () => {
  expect(
    canUseGemini({ id: "public-workspace", accessMode: "public-workspace" }),
  ).toBe(false);
  expect(
    canUseGemini({
      id: "public-workspace",
      accessMode: "workspace-profiles",
      profileId: "sharma",
      aiAccess: true,
    }),
  ).toBe(true);
  expect(
    canUseGemini({
      id: "workspace-profile:abhishek",
      accessMode: "workspace-profiles",
      profileId: "abhishek",
      aiAccess: true,
    }),
  ).toBe(false);
  expect(
    canUseGemini({
      id: "public-workspace",
      accessMode: "workspace-profiles",
      profileId: "sharma",
    }),
  ).toBe(false);
});
it("builds bounded read-only context without invented effort, notes or identity details", () => {
  const now = Date.parse("2026-10-26T12:00:00+05:30"),
    s = weeklyBrowserFixture(now);
  s.profile!.name = "Never send my identity";
  s.sessions[0].notes = "Never send private notes";
  const before = JSON.stringify(s),
    context = buildCoachContext(s, now);
  expect(coachContextSchema.parse(context)).toEqual(context);
  expect(JSON.stringify(context)).not.toMatch(/Never send/);
  expect(
    context.workouts
      .at(-1)!
      .entries.flatMap((e) => e.sets)
      .some((t) => t.rir === null),
  ).toBe(true);
  expect(context.workouts).toHaveLength(2);
  expect(JSON.stringify(s)).toBe(before);
  s.sessions.push({
    ...structuredClone(s.sessions[0]),
    id: "future",
    startedAt: now + 100000,
  });
  expect(
    buildCoachContext(s, now).workouts.some((w) => w.id === "future"),
  ).toBe(false);
});
it("retains method/setup/order context and does not use future execution confirmations", () => {
  const now = Date.now(),
    s = weeklyBrowserFixture(now),
    e = s.sessions[0].exercises[0];
  e.setup = {
    label: "Synthetic seat 3",
    execution: "Full range",
    availableLoads: [10, 20],
  };
  e.technique = "tempo";
  e.tempo = { eccentric: 3, pause: 1, concentric: 1 };
  e.protocol = "Recorded tempo";
  e.coachingContext = {
    execution: "changed",
    rest: "shorter",
    recordedAt: now + 1000,
  };
  delete e.convention;
  delete e.equipment;
  const c = buildCoachContext(s, now),
    row = c.workouts[0].entries[0];
  expect(row.setupExecution).toBe("Full range");
  expect(row.tempo).toContain('"eccentric":3');
  expect(row.method).toBe("tempo");
  expect(row.execution).toBe("unknown");
  expect(row.confirmedAt).toBeNull();
  expect(row.convention).toBe("unknown");
  expect(row.equipment).toBe("unknown");
  expect(c.workouts[0].entries.map((e) => e.exerciseId)).toEqual(
    s.sessions[0].exercises.map((e) => e.exerciseId),
  );
});
