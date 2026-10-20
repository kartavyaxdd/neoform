import { describe, it, expect } from "vitest";
import { syntheticReadiness } from "./readiness-fixture";
import {
  emptyState,
  stateSchema,
  importBackup,
  mergeStates,
  completeSession,
  toggleSet,
  volume,
  records,
  csvSessions,
  recommend,
  convertWeight,
  starterProgram,
  catalog,
  type Session,
} from "../src/domain";
const session = (weight = 60, pain = false): Session => ({
  id: crypto.randomUUID(),
  name: "Upper",
  date: new Date().toISOString().slice(0, 10),
  startedAt: 1,
  duration: 1800,
  notes: "",
  feedback: { pump: 3, soreness: 1, fatigue: 1, pain, reported: true },
  exercises: [
    {
      id: crypto.randomUUID(),
      exerciseId: "bench",
      target: {min:8,max:10,rir:2,rest:120},
      plannedWorkingSets: 2,
      notes: "",
      sets: [
        { id: "s1", weight, reps: 10, rir: 2, kind: "working", done: true },
        { id: "s2", weight: 20, reps: 15, rir: 4, kind: "warmup", done: true },
        { id: "s3", weight, reps: 10, rir: 2, kind: "working", done: false },
      ],
    },
  ],
});
describe("training vertical slice", () => {
  it("exports unreported effort as blank while retaining measured load and reps", () => {
    const s = session();
    s.exercises[0].sets[0].effortReported = false;
    const rows = csvSessions([s], catalog).split("\r\n");
    expect(rows[1]).toContain('"60","","10","",');
    s.exercises[0].sets[0].effortReported = true;
    expect(csvSessions([s], catalog).split("\r\n")[1]).toContain('"60","","10","2",');
  });
  it("completes only logged sets and allows undo without losing numbers", () => {
    const s = session();
    const undone = toggleSet(s, "s1");
    expect(undone.exercises[0].sets[0].done).toBe(false);
    expect(undone.exercises[0].sets[0].weight).toBe(60);
    expect(completeSession(s).exercises[0].sets).toHaveLength(2);
  });
  it("counts direct completed hard working/drop sets, not warmup or indirect muscles", () => {
    expect(volume([session()], catalog)).toEqual({ Chest: 1 });
  });
  it("separates conventions and suppresses machine e1RM", () => {
    const s = session();
    expect(records([s], catalog)[0].e1rm).toBeCloseTo(80);
    const machine = {
      ...s,
      exercises: [{ ...s.exercises[0], exerciseId: "leg-press" }],
    };
    expect(records([machine], catalog)[0].e1rm).toBeNull();
  });
  it("keeps canonical kg without conversion drift", () => {
    expect(
      convertWeight(convertWeight(100, "kg", "lb"), "lb", "kg"),
    ).toBeCloseTo(100, 8);
  });
  it("needs two comparable sessions and caps increases, blocks on pain and poor recovery", () => {
    expect(
      recommend("bench", [session()], catalog, { min: 8, max: 10 }).action,
    ).toBe("hold");
    const completed = () => {
      const s = session();
      s.exercises[0].setup = { label: "Synthetic rack", execution: "", availableLoads: [60, 61.5] };
      s.exercises[0].sets.forEach(t => { t.done = true; t.effortReported = true; });
      return s;
    };
    const rec = recommend("bench", [completed(), completed()], catalog, {
      min: 8,
      max: 10,
    }, {readiness:syntheticReadiness()});
    expect(rec.action).toBe("load");
    expect(rec.weight).toBeLessThanOrEqual(63);
    expect(
      recommend("bench", [session(), session(60, true)], catalog, {
        min: 8,
        max: 10,
      }).action,
    ).toBe("recover");
    const poor = session();
    poor.feedback.fatigue = 5;
    expect(
      recommend("bench", [session(), poor], catalog, { min: 8, max: 10 })
        .action,
    ).toBe("recover");
  });
  it("creates templates without fabricated history and validates backup strictly", () => {
    const s = emptyState();
    s.programs = [starterProgram("balanced")];
    expect(s.sessions).toEqual([]);
    expect(stateSchema.safeParse(s).success).toBe(true);
    expect(() => importBackup("{broken")).toThrow();
    expect(() =>
      importBackup(JSON.stringify({ version: 999, data: s })),
    ).toThrow();
    expect(() =>
      importBackup(
        JSON.stringify({ version: 1, data: { ...s, unknown: true } }),
      ),
    ).toThrow();
    expect(importBackup(JSON.stringify({ version: 1, data: s }))).toEqual(s);
  });
  it("rejects impossible set values and orphan exercise references", () => {
    const s = emptyState();
    const bad = session();
    bad.exercises[0].sets[0].reps = -1;
    s.sessions = [bad];
    expect(stateSchema.safeParse(s).success).toBe(false);
    bad.exercises[0].sets[0].reps = 10;
    bad.exercises[0].exerciseId = "missing";
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
  it("merges unique IDs but makes local duplicate changes explicit", () => {
    const a = emptyState(),
      b = emptyState();
    a.sessions = [session()];
    b.sessions = [{ ...a.sessions[0], name: "Edited" }, session()];
    const merged = mergeStates(a, b);
    expect(merged.sessions).toHaveLength(2);
    expect(merged.sessions[0].name).toBe("Edited");
  });
});
