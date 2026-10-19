import { describe, it, expect } from "vitest";
import { syntheticReadiness } from "./readiness-fixture";
import {
  catalog,
  emptyState,
  stateSchema,
  recommend,
  importBackup,
  MAX_BACKUP,
  type Session,
} from "../src/domain";
const entry = (
  id: string,
  weight: number,
  convention: "total" | "per-side" = "total",
  kind: "working" | "drop" = "working",
) => ({
  id,
  exerciseId: "bench",
  target: {min:8,max:10,rir:2,rest:120},
  plannedWorkingSets: kind === 'working' ? 1 : 0,
  notes: "",
  convention,
  equipment: "Barbell" as const,
  sets: [{ id: "set-" + id, weight, reps: 8, rir: 2, kind, done: true, effortReported: true }],
});
const session = (id: string, entries: any[]): Session => ({
  id,
  name: "Parent QA upper",
  date: new Date().toISOString().slice(0, 10),
  startedAt: id === "a" ? 1 : 2,
  duration: 600,
  notes: "",
  feedback: { pump: 3, soreness: 1, fatigue: 1, pain: false, reported: true },
  exercises: entries,
});
describe("independent release regressions", () => {
  it("uses only comparable entries when an exercise appears with multiple conventions", () => {
    const sessions = [
      session("a", [entry("a-side", 100, "per-side"), entry("a-total", 60)]),
      session("b", [entry("b-side", 100, "per-side"), entry("b-total", 60)]),
    ];
    const rec = recommend("bench", sessions, catalog, { min: 8, max: 10 }, {readiness:syntheticReadiness()});
    expect(rec.action).toBe("reps");
    expect(rec.weight).toBe(60);
  });
  it("does not treat a drop-only session as a second working-session evidence point", () => {
    const sessions = [
      session("a", [
        {
          ...entry("drop", 60, "total", "drop"),
          sets: [
            {
              id: "d",
              weight: 60,
              reps: 10,
              rir: 2,
              kind: "drop" as const,
              done: true,
            },
          ],
        },
      ]),
      session("b", [
        {
          ...entry("working", 60),
          sets: [
            {
              id: "w",
              weight: 60,
              reps: 10,
              rir: 2,
              kind: "working" as const,
              done: true,
            },
          ],
        },
      ]),
    ];
    expect(
      recommend("bench", sessions, catalog, { min: 8, max: 10 }).action,
    ).toBe("hold");
  });
  it("rejects duplicate set IDs across exercises within one session", () => {
    const s = emptyState();
    const a = entry("bench", 60),
      b = { ...entry("row", 40), exerciseId: "row" };
    b.sets[0].id = a.sets[0].id;
    s.sessions = [session("a", [a, b])];
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
  it("rejects local states which cannot fit their own round-trip backup budget", () => {
    const s = emptyState();
    s.sessions = Array.from({ length: 1000 }, (_, i) => ({
      ...session("s-" + i, [entry("e-" + i, 60)]),
      notes: "x".repeat(2000),
    }));
    expect(
      new TextEncoder().encode(JSON.stringify({ version: 1, data: s })).length,
    ).toBeGreaterThan(MAX_BACKUP);
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
  it("allows ordinary valid state to export and import unchanged", () => {
    const s = emptyState();
    s.sessions = [session("a", [entry("normal", 60)])];
    expect(importBackup(JSON.stringify({ version: 1, data: s }))).toEqual(s);
  });
});
