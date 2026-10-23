import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  reviewProgram,
  applyProgramReview,
  pendingProgramTarget,
} from "../src/programReview";
import { evaluateCoaching } from "../src/coaching";
import { syntheticReadiness } from "./readiness-fixture";
const now = Date.parse("2026-10-21T12:00:00Z");
function fixture(reps = [10, 10, 10]) {
  const state = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  state.profile = {
    name: "Synthetic",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 4,
  };
  w.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
  p.workouts = [w];
  state.programs = [p];
  state.sessions = reps.map((rep, i) => {
    const e = D.createEntry(D.catalog[0], w.exercises[0]);
    e.sets.forEach((t) =>
      Object.assign(t, {
        weight: 50,
        reps: rep,
        rir: 2,
        done: true,
        effortReported: true,
        prescription: { ...t.prescription!, weight: 50 },
      }),
    );
    const s = D.startSession("QA", [e], p, w);
    s.startedAt = now - (17 - i * 7) * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = 3600;
    e.coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: s.startedAt + 3600000,
    };
    return s;
  });
  return { state, p };
}
it("keeps a repeatedly productive lift without modifying targets", () => {
  const { state, p } = fixture([9, 10, 11]),
    before = structuredClone(state),
    r = reviewProgram(state, p.id, now);
  expect(r[0].status).toBe("keep");
  expect(r[0].sourceIds).toHaveLength(3);
  expect(state).toEqual(before);
});
it("reviews sustained flat performance without recommending automatic rotation", () => {
  const { state, p } = fixture();
  const row = reviewProgram(state, p.id, now)[0];
  expect(row.status).toBe("review");
  expect(row.reason).toContain("flat");
  expect(state.programs[0].workouts[0].exercises[0].exerciseId).toBe("bench");
});
it("reviews repeated confirmed misses", () => {
  const { state, p } = fixture([9, 6, 6]);
  expect(reviewProgram(state, p.id, now)[0].status).toBe("review");
});
it.each(["effort", "setup", "incomplete", "phase", "stale", "prescription"])(
  "requires context for %s evidence",
  (issue) => {
    const { state, p } = fixture([9, 10, 11]),
      s = state.sessions.at(-1)!,
      e = s.exercises[0];
    if (issue === "effort") e.sets[0].effortReported = false;
    if (issue === "setup")
      e.setup = { label: "Changed rack", execution: "New", availableLoads: [] };
    if (issue === "incomplete") e.sets[0].done = false;
    if (issue === "phase") s.phase = "deload";
    if (issue === "stale") {
      state.sessions.forEach((s) => {
        s.startedAt -= 30 * 86400000;
        s.date = new Date(s.startedAt).toISOString().slice(0, 10);
        s.exercises[0].coachingContext!.recordedAt = s.startedAt + 3600000;
      });
    }
    if (issue === "prescription") delete e.sets[0].prescription;
    expect(reviewProgram(state, p.id, now)[0].status).toBe("context");
  },
);
it("flags reported pain before productive-performance notes", () => {
  const { state, p } = fixture([9, 10, 11]);
  state.sessions.at(-1)!.feedback = { reported: true, pain: true };
  expect(reviewProgram(state, p.id, now)[0].status).toBe("recovery");
});
it.each(["maintenance", "resensitization", "deload"] as const)(
  "does not label %s as a productive accumulation trend",
  (phase) => {
    const { state, p } = fixture([9, 10, 11]);
    p.phase = phase;
    state.sessions.forEach((s) => (s.phase = phase));
    expect(reviewProgram(state, p.id, now)[0].status).toBe("context");
  },
);
it("does not prepare working-set targets during active rest", () => {
  const { state, p } = fixture();
  p.phase = "active-rest";
  expect(reviewProgram(state, p.id, now)).toEqual([]);
});
it("applies future targets explicitly without creating a draft or changing history, and waits for new evidence", () => {
  const { state, p } = fixture([9, 10, 11]),
    row = reviewProgram(state, p.id, now)[0];
  row.session.readiness = syntheticReadiness(now);
  const proposal = evaluateCoaching(state, row.session, now).find(
    (p) => !["hold", "recover"].includes(p.action),
  )!;
  expect(proposal).toBeTruthy();
  const before = structuredClone(state);
  const next = applyProgramReview(
    state,
    row.session,
    [{ proposal, choice: "accept", scope: "program" }],
    now,
  );
  expect(state).toEqual(before);
  expect(next.sessions).toEqual(before.sessions);
  expect(next.draft).toBeNull();
  expect(next.programs[0].workouts[0].exercises[0].coachingProposalId).toBe(
    proposal.id,
  );
  const pending = reviewProgram(next, p.id, now)[0];
  expect(pending.status).toBe("pending");
  expect(pendingProgramTarget(next, pending.session, pending.entry, now)).toBe(
    true,
  );
  expect(() =>
    applyProgramReview(
      next,
      row.session,
      [{ proposal, choice: "accept", scope: "program" }],
      now,
    ),
  ).toThrow(/Assess approved/);
  const completed = structuredClone(pending.session);
  completed.id = D.uid();
  completed.startedAt = now + DAY;
  completed.date = new Date(completed.startedAt).toISOString().slice(0, 10);
  completed.duration = 3600;
  completed.exercises[0].sets.forEach((t) => {
    t.done = true;
    t.effortReported = true;
  });
  completed.exercises[0].coachingContext = {
    execution: "consistent",
    rest: "usual",
    recordedAt: now + DAY + 3600000,
  };
  next.sessions = [...next.sessions, completed];
  expect(
    pendingProgramTarget(next, pending.session, pending.entry, now + 2 * DAY),
  ).toBe(false);
});
const DAY = 86400000;
it("rejects stale approval context when another workout starts or the program is archived", () => {
  const { state, p } = fixture([9, 10, 11]),
    row = reviewProgram(state, p.id, now)[0];
  row.session.readiness = syntheticReadiness(now);
  const proposal = evaluateCoaching(state, row.session, now).find(
    (p) => !["hold", "recover"].includes(p.action),
  )!;
  state.draft = D.startSession("Active", []);
  expect(() =>
    applyProgramReview(
      state,
      row.session,
      [{ proposal, choice: "accept", scope: "program" }],
      now,
    ),
  ).toThrow(/active workout/);
  state.draft = null;
  p.archived = true;
  expect(() =>
    applyProgramReview(
      state,
      row.session,
      [{ proposal, choice: "accept", scope: "program" }],
      now,
    ),
  ).toThrow(/active program/);
});
