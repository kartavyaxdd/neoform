import { expect, it } from "vitest";
import * as D from "../src/domain";
const now = Date.parse("2026-10-19T12:00:00Z");
const ready = (): D.Readiness => ({
  recordedAt: now,
  fatigue: 1,
  pain: false,
  context: "usual",
  factors: [],
  muscles: [{ muscle: "Chest", recovered: "yes", pain: false, soreness: 1 }],
});
const history = () =>
  [3, 1].map((days) => {
    const entry = D.createEntry(D.catalog[0]);
    entry.setup = {
      label: "QA rack",
      execution: "",
      availableLoads: [60, 61.25],
    };
    entry.sets.forEach((t) =>
      Object.assign(t, {
        done: true,
        effortReported: true,
        weight: 60,
        reps: 12,
        rir: 2,
      }),
    );
    const s = D.startSession("Synthetic", [entry]);
    s.startedAt = now - days * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.feedback = { reported: true, pain: false, fatigue: 1, soreness: 1 };
    return s;
  });
const rec = (sessions = history(), readiness?: D.Readiness) =>
  D.recommend(
    "bench",
    sessions,
    D.catalog,
    { min: 8, max: 12 },
    { now, readiness },
  );
it("requires current readiness rather than treating immediate post-workout feedback as today's recovery", () => {
  expect(rec().action).toBe("hold");
  expect(rec(history(), ready()).action).toBe("load");
});
it("current pain, incomplete local recovery and systemic fatigue veto escalation", () => {
  for (const r of [
    { ...ready(), pain: true },
    { ...ready(), fatigue: 4 },
    {
      ...ready(),
      muscles: [{ muscle: "Chest", recovered: "no", pain: false, soreness: 1 }],
    },
  ] satisfies D.Readiness[])
    expect(rec(history(), r).action).toBe("recover");
});
it("unknown reports do not clear unresolved pain, but explicitly current pain-free reports can", () => {
  const sessions = history();
  sessions[1].feedback.pain = true;
  sessions[1].muscleFeedback = [{ muscle: "Chest", pain: true }];
  const r = ready();
  expect(rec(sessions, { ...r, pain: null, muscles: [] }).action).toBe(
    "recover",
  );
  expect(rec(sessions, r).action).toBe("load");
  expect(sessions[1].feedback.pain).toBe(true);
});
it("keeps local scope and checks assisting muscles", () => {
  const r = ready();
  expect(
    rec(history(), {
      ...r,
      muscles: [
        ...r.muscles,
        { muscle: "Quads", pain: true, recovered: "no", soreness: null },
      ],
    }).action,
  ).toBe("load");
  expect(
    rec(history(), {
      ...r,
      muscles: [
        ...r.muscles,
        { muscle: "Triceps", pain: true, recovered: "no", soreness: null },
      ],
    }).action,
  ).toBe("recover");
});
it("does not infer good readiness from unknown, future, stale or pre-exposure reports", () => {
  for (const r of [
    { ...ready(), fatigue: null },
    { ...ready(), context: "unknown" },
    { ...ready(), recordedAt: now + 60000 },
    { ...ready(), recordedAt: now - 13 * 3600000 },
    { ...ready(), recordedAt: now - 2 * 86400000 },
    {
      ...ready(),
      muscles: [
        { muscle: "Chest", recovered: "unknown", pain: null, soreness: null },
      ],
    },
  ] satisfies D.Readiness[])
    expect(rec(history(), r).action).toBe("hold");
  const sessions = history();
  sessions[1].startedAt = now - 3600000;
  sessions[1].date = "2026-10-19";
  expect(
    rec(sessions, { ...ready(), recordedAt: now - 2 * 3600000 }).action,
  ).toBe("hold");
});
it("records context without claiming it caused a performance change", () => {
  const r: D.Readiness = {
    ...ready(),
    context: "changed",
    factors: ["poor-sleep", "travel"],
  };
  expect(rec(history(), r).action).toBe("hold");
  expect(rec(history(), r).evidence?.join(" ")).toContain("travel");
});
it("retains unresolved pain reported before an older workout even when finish feedback is unknown", () => {
  const sessions = history();
  sessions[1].readiness = {
    ...ready(),
    recordedAt: sessions[1].startedAt,
    pain: true,
  };
  sessions[1].feedback = { reported: false, pain: null, fatigue: null };
  expect(rec(sessions).action).toBe("recover");
  expect(rec(sessions, { ...ready(), pain: null }).action).toBe("recover");
  expect(rec(sessions, ready()).action).toBe("load");
});
it("current low soreness and recovery can resolve old high soreness without editing history", () => {
  const sessions = history();
  sessions[1].feedback.soreness = 5;
  const r = ready();
  r.muscles.push(
    ...(["Triceps", "Shoulders"] as const).map((muscle) => ({
      muscle,
      recovered: "yes" as const,
      pain: false,
      soreness: 1,
    })),
  );
  expect(rec(sessions, r).action).toBe("load");
  expect(sessions[1].feedback.soreness).toBe(5);
});
it("persists readiness separately and preserves it through completion and backup/merge", () => {
  const state = D.emptyState();
  state.draft = D.startSession("QA readiness", [D.createEntry(D.catalog[0])]);
  state.draft.readiness = ready();
  expect(D.stateSchema.safeParse(state).success).toBe(true);
  expect(D.importBackup(JSON.stringify({version:1,data:state})).draft?.readiness).toEqual(ready());
  state.draft.exercises[0].sets[0].done = true;
  const complete = D.completeSession(state.draft);
  expect(complete.readiness).toEqual(ready());
  expect(complete.feedback.reported).not.toBe(true);
  expect(D.mergeStates(D.emptyState(), state).draft?.readiness).toEqual(
    ready(),
  );
});
it("a fresh global check-in never refreshes an older muscle observation", () => {
  const r = ready();
  r.muscles[0].recordedAt = now - 13 * 3600000;
  expect(rec(history(), r).action).toBe("hold");
  const sessions = history();
  sessions[1].startedAt = now - 3600000;
  sessions[1].date = "2026-10-19";
  r.muscles[0].recordedAt = now - 2 * 3600000;
  expect(rec(sessions, r).action).toBe("hold");
});
it("unknown assisting muscle fields never erase known incomplete recovery, soreness or fatigue", () => {
  for (const flag of [
    { recovered: "no" as const },
    { soreness: 5 },
    { fatigue: 5 },
  ]) {
    const sessions = history();
    sessions[1].muscleFeedback = [{ muscle: "Triceps", ...flag }];
    const r = ready();
    r.muscles.push({
      muscle: "Triceps",
      recovered: "unknown",
      pain: null,
      soreness: null,
    });
    expect(rec(sessions, r).action).toBe("recover");
      r.muscles[1]={muscle:"Triceps",recovered:"yes",pain:false,soreness:1,fatigue:1};
      expect(rec(sessions,r).action).toBe("load");
  }
});
it("future favorable feedback cannot clear explicitly current pain or high fatigue", () => {
  const sessions = history();
  sessions[1].startedAt = now + 3600000;
  sessions[1].date = "2026-10-19";
  expect(rec(sessions, { ...ready(), pain: true }).action).toBe("recover");
  expect(rec(sessions, { ...ready(), fatigue: 4 }).action).toBe("recover");
});
