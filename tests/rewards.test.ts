import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  sessionRecords,
  rewards,
  rirColour,
  recentPersonalRecords,
} from "../src/rewards";
import { exportHistoryBackup, importHistoryBackup } from "../src/historyBackup";
function workout(day: string, reps = 10, weight = 50) {
  const e = D.createEntry(D.catalog[0]);
  e.sets = [
    { ...e.sets[0], weight, reps, done: true, rir: 2, effortReported: true },
  ];
  const s = D.startSession("Synthetic", [e]);
  s.phase = "accumulation";
  s.date = day;
  s.startedAt = Date.parse(day + "T10:00:00Z");
  return s;
}
it("dashboard records reuse comparable observed improvements and deduplicate imports", () => {
  const a = workout("2026-10-01"),
    b = workout("2026-10-02", 11),
    c = workout("2026-10-03", 12);
  expect(recentPersonalRecords([a], D.catalog)).toEqual([]);
  const records = recentPersonalRecords([c, a, b, c], D.catalog);
  expect(records.map((r) => [r.record.before, r.record.after])).toEqual([
    [11, 12],
    [10, 11],
  ]);
  c.exercises[0].sets[0].done = false;
  expect(recentPersonalRecords([a, b, c], D.catalog)).toHaveLength(1);
});
it("requires a comparable baseline and detects raw same-load rep and same-rep load records", () => {
  const a = workout("2026-10-01"),
    b = workout("2026-10-02", 11);
  expect(sessionRecords(a, [], D.catalog)[0].kind).toBe("baseline");
  expect(sessionRecords(b, [a], D.catalog)[0].kind).toBe("reps");
  expect(
    sessionRecords(workout("2026-10-03", 10, 52.5), [a], D.catalog)[0].kind,
  ).toBe("load");
  expect(sessionRecords(workout("2026-10-03", 5, 60), [a], D.catalog)).toEqual(
    [],
  );
});
it("does not mix setup, phase, advanced bouts or warmups", () => {
  const a = workout("2026-10-01"),
    b = workout("2026-10-02", 11);
  b.exercises[0].setup = {
    label: "New rack",
    execution: "Changed",
    availableLoads: [],
  };
  expect(sessionRecords(b, [a], D.catalog)[0].kind).toBe("baseline");
  b.exercises[0].sets[0].kind = "warmup";
  expect(sessionRecords(b, [a], D.catalog)).toEqual([]);
});
it("caps daily XP, derives it once from saved history and ignores unknown effort for bonus", () => {
  const a = workout("2026-10-01"),
    b = workout("2026-10-02", 11),
    c = workout("2026-10-02", 12);
  expect(rewards([a, b, c], D.catalog, "2026-10-01", 4).xp).toBe(225);
  c.exercises[0].sets[0].done = false;
  b.exercises[0].sets[0].effortReported = false;
  expect(rewards([a, b, c], D.catalog, "2026-10-01", 4).xp).toBe(200);
  expect(rewards([a, b, b], D.catalog, "2026-10-01", 4).xp).toBe(200);
});
it("uses an absolute continuous RIR scale and keeps unknown grey", () => {
  expect(rirColour(0, true)).not.toBe(rirColour(10, true));
  expect(rirColour(10, false)).toBe(rirColour(0, false));
  expect(rirColour(4.5, true)).not.toBe(rirColour(4, true));
});
it("keeps phases, conventions, methods and explicitly reported effort separate", () => {
  const a = workout("2026-10-01"),
    b = workout("2026-10-02", 11);
  b.phase = "deload";
  expect(
    sessionRecords(b, [a], D.catalog).every((r) => r.kind === "baseline"),
  ).toBe(true);
  b.phase = a.phase;
  b.exercises[0].technique = "myoreps";
  expect(sessionRecords(b, [a], D.catalog)).toEqual([]);
  b.exercises[0].technique = "straight";
  b.exercises[0].convention = "per-side";
  expect(
    sessionRecords(b, [a], D.catalog).every((r) => r.kind === "baseline"),
  ).toBe(true);
  a.exercises[0].convention = b.exercises[0].convention = "machine-label";
  expect(sessionRecords(b, [a], D.catalog)[0]).toMatchObject({
    kind: "reps",
    convention: "machine-label",
  });
  b.exercises[0].sets[0].done = false;
  expect(sessionRecords(b, [a], D.catalog)).toEqual([]);
  expect(rewards([a, b], D.catalog, "2026-10-01", 4).xp).toBe(100);
});
it("round-trips optional feeling, timer identity and celebration preferences in existing backups", async () => {
  const state = D.emptyState(),
    session = workout("2026-10-01");
  session.sessionFeeling = "rough";
  state.sessions = [session];
  state.settings.celebrations = false;
  state.settings.celebrationSound = true;
  state.timer = {
    id: D.uid(),
    setId: session.exercises[0].sets[0].id,
    endAt: Date.now() + 60000,
    remaining: 60,
    paused: false,
  };
  const restored = await importHistoryBackup(await exportHistoryBackup(state));
  expect(restored).toEqual(state);
  expect(restored.sessions[0].feedback.fatigue).toBe(session.feedback.fatigue);
  expect(rewards(restored.sessions, D.catalog, "2026-10-01", 4).xp).toBe(100);
  expect(Object.keys(restored)).not.toContain("rewards");
});
