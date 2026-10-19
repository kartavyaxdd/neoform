import { expect, it } from "vitest";
import * as D from "../src/domain";

function exposures(weight = 100) {
  return [2, 1].map((days) => {
    const entry = D.createEntry(D.catalog[0]);
    entry.sets.forEach((s) =>
      Object.assign(s, {
        weight,
        reps: 12,
        rir: 2,
        done: true,
        effortReported: true,
      }),
    );
    const session = D.startSession("Synthetic", [entry]);
    session.startedAt -= days * 86400000;
    session.date = new Date(session.startedAt).toISOString().slice(0, 10);
    session.feedback = { reported: true, soreness: 1, fatigue: 1, pain: false };
    return session;
  });
}
const advise = (sessions: D.Session[], entry?: D.Entry) =>
  D.recommend("bench", sessions, D.catalog, { min: 8, max: 12 }, { entry });

it("does not invent an available increment when the equipment is unknown", () => {
  expect(advise(exposures()).action).toBe("hold");
});
it("chooses the smallest explicitly available load within both conservative caps", () => {
  const sessions = exposures();
  for (const s of sessions)
    (s.exercises[0] as any).setup = {
      label: "Rack A",
      execution: "normal grip",
      availableLoads: [100, 101.25, 102.5, 105],
    };
  expect(advise(sessions).weight).toBe(101.25);
  expect(advise(sessions).setTargets?.every((t) => t.weight === 101.25)).toBe(
    true,
  );
});
it("holds when the next available jump is too large", () => {
  const sessions = exposures(20);
  for (const s of sessions)
    (s.exercises[0] as any).setup = {
      label: "DB rack",
      execution: "",
      availableLoads: [20, 22],
    };
  expect(advise(sessions).action).toBe("hold");
});
it("separates setup and execution identities without treating inventory as performance context", () => {
  const a = D.createEntry(D.catalog[0]),
    b = structuredClone(a);
  (a as any).setup = {
    label: "Rack A",
    execution: "paused",
    availableLoads: [100, 101],
  };
  (b as any).setup = {
    label: "Rack A",
    execution: "paused",
    availableLoads: [100, 102],
  };
  expect(D.comparableKey(a, D.catalog[0])).toBe(
    D.comparableKey(b, D.catalog[0]),
  );
  (b as any).setup.execution = "touch and go";
  expect(D.comparableKey(a, D.catalog[0])).not.toBe(
    D.comparableKey(b, D.catalog[0]),
  );
});
it("holds when today's setup changes and uses today's explicitly updated inventory", () => {
  const sessions = exposures();
  for (const s of sessions)
    (s.exercises[0] as any).setup = {
      label: "Rack A",
      execution: "",
      availableLoads: [100, 101],
    };
  const entry = structuredClone(sessions[0].exercises[0]);
  (entry as any).setup.availableLoads = [100, 105];
  expect(advise(sessions, entry).action).toBe("hold");
  (entry as any).setup.label = "Rack B";
  expect(advise(sessions, entry).reason).toContain("baseline");
});
it("never converts or progresses raw machine labels using an available-load list", () => {
  const sessions = exposures();
  for (const s of sessions) {
    s.exercises[0].exerciseId = "pulldown";
    s.exercises[0].convention = "machine-label";
    s.exercises[0].equipment = "Cable";
    (s.exercises[0] as any).setup = {
      label: "Stack A",
      execution: "",
      availableLoads: [100, 101],
    };
  }
  expect(
    D.recommend("pulldown", sessions, D.catalog, { min: 8, max: 12 }).action,
  ).toBe("hold");
});
it("snapshots program equipment context without changing historical records", () => {
  const program = D.starterProgram("minimal");
  const target = program.workouts[0].exercises[0];
  target.setup = {
    label: "Rack A",
    execution: "comfortable depth",
    availableLoads: [60, 61.25],
  };
  const entry = D.prepareWorkout(
    program.workouts[0],
    program,
    D.catalog,
    [],
  )[0];
  expect(entry.sourceTargetId).toBe(target.id);
  expect(entry.setup).toEqual(target.setup);
  target.setup.label = "Rack B";
  target.setup.availableLoads.push(62.5);
  expect(entry.setup?.label).toBe("Rack A");
  expect(entry.setup?.availableLoads).toEqual([60, 61.25]);
  const state = D.emptyState();
  state.programs = [program];
  state.draft = D.startSession("Synthetic", [entry]);
  expect(D.stateSchema.parse(state)).toEqual(state);
  const merged = D.mergeStates(D.emptyState(), state);
  expect(merged.programs[0].workouts[0].exercises[0].setup).toEqual(target.setup);
  expect(merged.draft?.exercises[0].setup).toEqual(entry.setup);
  expect(merged.draft?.exercises[0].sourceTargetId).toBe(target.id);
  for (const availableLoads of [[61, 60], [60, 60], [NaN], [-1], [2001]]) {
    expect(
      D.equipmentSetupSchema.safeParse({
        label: "Rack",
        execution: "",
        availableLoads,
      }).success,
    ).toBe(false);
  }
});
it("shows setup identity in distinct performance records", () => {
  const history = exposures();
  history[0].exercises[0].setup = {
    label: "Rack A",
    execution: "paused",
    availableLoads: [],
  };
  history[1].exercises[0].setup = {
    label: "Rack B",
    execution: "touch and go",
    availableLoads: [],
  };
  const records = D.records(history, D.catalog);
  expect(records).toHaveLength(2);
  expect(records.map((r) => r.context).join(" ")).toContain("Rack A");
  expect(records.map((r) => r.context).join(" ")).toContain("touch and go");
});
it("does not offer rep progression on a load excluded by today's inventory", () => {
  const sessions = exposures();
  for (const s of sessions) {
    s.exercises[0].setup = {
      label: "Rack A",
      execution: "",
      availableLoads: [100, 101],
    };
    s.exercises[0].sets.forEach((t) => (t.reps = 10));
  }
  const current = structuredClone(sessions[1].exercises[0]);
  current.setup!.availableLoads = [90, 95];
  expect(advise(sessions, current).action).toBe("hold");
  expect(advise(sessions, current).reason).toContain("available");
});
