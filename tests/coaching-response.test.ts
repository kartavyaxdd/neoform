import { it, expect } from "vitest";
import * as D from "../src/domain";
import { reviewAcceptedChanges } from "../src/coachingResponse";
import {
  applyCoaching,
  evaluateCoaching,
  classifyCoachingOutcomes,
} from "../src/coaching";
import { acceptedChangeFixture } from "./accepted-change-fixture";
import { syntheticReadiness } from "./readiness-fixture";

const now = Date.parse("2026-10-25T12:00:00Z");
it("requires two confirmed follow-ups and never treats unknown as success", () => {
  for (const results of [
    [],
    ["met"],
    ["met", "unknown"],
    ["unknown", "unknown"],
  ]) {
    const { state } = acceptedChangeFixture(now, results),
      before = structuredClone(state);
    const review = reviewAcceptedChanges(state, now)[0];
    expect(review.status).toBe("observe");
    expect(review.followups).toHaveLength(
      results.filter((r) => r === "met").length,
    );
    expect(state).toEqual(before);
  }
});
it("keeps targets after repeated confirmed attainment without claiming growth", () => {
  const { state } = acceptedChangeFixture(now);
  const review = reviewAcceptedChanges(state, now)[0];
  expect(review.status).toBe("keep");
  expect(review.followups).toHaveLength(2);
  expect(review.reason).toMatch(/targets/i);
});
it("reviews a reversal for repeated misses against accepted reps even above the range floor", () => {
  const { state } = acceptedChangeFixture(now, ["miss", "miss"]);
  const review = reviewAcceptedChanges(state, now)[0];
  expect(review.status).toBe("reverse");
  expect(review.followups.every((r) => r.result === "miss")).toBe(true);
});
it("does not immediately stack another increase onto one successful program experiment", () => {
  const { state, upcoming } = acceptedChangeFixture(now, ["met"]);
  expect(evaluateCoaching(state, upcoming, now)[0].action).toBe("hold");
  expect(evaluateCoaching(state, upcoming, now)[0].reason).toMatch(
    /follow-up/i,
  );
});
it("offers an explicit prior-rep review after two misses and preserves today/future scope", () => {
  const { state, upcoming, proposal } = acceptedChangeFixture(now, [
    "miss",
    "miss",
  ]);
  const p = evaluateCoaching(state, upcoming, now)[0];
  expect(p.action).toBe("reps");
  expect(p.reason).toMatch(/prior.*target/i);
  expect(p.rows).toEqual(proposal.beforeRows);
  const next = applyCoaching(
    state,
    upcoming,
    [{ proposal: p, choice: "accept", scope: "program" }],
    now,
  );
  expect(next.programs[0].workouts[0].exercises[0].nextRows).toEqual(
    proposal.beforeRows,
  );
  expect(next.sessions).toEqual(state.sessions);
  expect(next.draft).toBeNull();
});
it.each(["effort", "undo", "load", "prescription", "deleted session"])(
  "invalidates a stored outcome after %s",
  (issue) => {
    const { state } = acceptedChangeFixture(now),
      s = state.sessions.at(-1)!,
      t = s.exercises[0].sets[0];
    if (issue === "effort") t.effortReported = false;
    if (issue === "undo") t.done = false;
    if (issue === "load") t.weight++;
    if (issue === "prescription") t.prescription!.reps++;
    if (issue === "deleted session") state.sessions.pop();
    expect(reviewAcceptedChanges(state, now)[0].status).toBe("observe");
  },
);
it.each(["phase", "setup", "order", "method", "time"])(
  "a changed %s cannot count as a comparable outcome",
  (issue) => {
    const { state } = acceptedChangeFixture(now),
      s = state.sessions.at(-1)!,
      e = s.exercises[0];
    if (issue === "phase") s.phase = "deload";
    if (issue === "setup")
      e.setup = { label: "Different rack", execution: "", availableLoads: [] };
    if (issue === "order")
      s.exercises.unshift(
        D.createEntry(D.catalog.find((x) => x.id === "squat")!),
      );
    if (issue === "method") e.technique = "drop-set";
    if (issue === "time") s.startedAt = now + 86400000;
    expect(reviewAcceptedChanges(state, now)[0].status).not.toBe("keep");
  },
);
it("uses corrected latest evidence once per session rather than counting ledger events", () => {
  const { state } = acceptedChangeFixture(now),
    s = state.sessions.at(-1)!;
  s.exercises[0].sets[2].reps--;
  state.coachingEvents!.push(...classifyCoachingOutcomes(state, s, now - 1000));
  state.coachingEvents!.push({
    ...state.coachingEvents!.at(-1)!,
    id: "coach-duplicate",
  });
  const r = reviewAcceptedChanges(state, now)[0];
  expect(r.followups).toHaveLength(2);
  expect(r.status).toBe("observe");
});
it("pain vetoes a favorable review immediately, including a separately scoped report", () => {
  const { state, upcoming } = acceptedChangeFixture(now);
  upcoming.readiness!.muscles[0].pain = true;
  const r = reviewAcceptedChanges(state, now, upcoming)[0];
  expect(r.status).toBe("reassess");
  expect(r.blocked).toBe(true);
});
it("edited and coordinated decisions remain visibly distinct from policy success", () => {
  const { state } = acceptedChangeFixture(now);
  state.coachingEvents![0].choice = "edit";
  state.coachingEvents!.push({
    ...state.coachingEvents![0],
    id: "coach-other",
    proposalId: "coach-other",
    proposal: { ...state.coachingEvents![0].proposal!, id: "coach-other" },
  });
  const r = reviewAcceptedChanges(state, now).find(
    (r) => r.decision.proposalId !== "coach-other",
  )!;
  expect(r.edited).toBe(true);
  expect(r.bundled).toBe(true);
});
it("stale, superseded or manually changed targets cannot restore an old plan", () => {
  for (const change of ["stale", "manual", "superseded"]) {
    const { state } = acceptedChangeFixture(now, ["miss", "miss"]);
    if (change === "manual")
      state.programs[0].workouts[0].exercises[0].nextRows![0].weight++;
    if (change === "superseded")
      state.programs[0].workouts[0].exercises[0].coachingProposalId =
        "coach-other";
    const r = reviewAcceptedChanges(
      state,
      change === "stale" ? now + 30 * 86400000 : now,
    )[0];
    expect(r.status).toBe("reassess");
    expect(r.restore).toBeUndefined();
  }
});
it("restores a reviewed available prior load rather than pre-filling the failed heavier load", () => {
  const { state, upcoming, proposal } = acceptedChangeFixture(
    now,
    ["miss", "miss"],
    "load",
  );
  const p = evaluateCoaching(state, upcoming, now)[0];
  expect(p.action).toBe("reduce-load");
  expect(p.rows).toEqual(proposal.beforeRows);
  const next = applyCoaching(
    state,
    upcoming,
    [{ proposal: p, choice: "accept", scope: "program" }],
    now,
  );
  const program = next.programs[0],
    workout = program.workouts[0];
  expect(
    D.prepareWorkout(workout, program, D.catalog, next.sessions)[0].sets.map(
      (t) => t.weight,
    ),
  ).toEqual([50, 50, 50]);
});
it("volume attainment needs distinct timely recovery after both follow-ups", () => {
  const { state, upcoming } = acceptedChangeFixture(
    now,
    ["met", "met"],
    "add-volume",
  );
  expect(reviewAcceptedChanges(state, now)[0].status).toBe("observe");
  expect(reviewAcceptedChanges(state, now, upcoming)[0].status).toBe("keep");
  upcoming.readiness!.muscles[0].recordedAt =
    state.sessions.at(-1)!.startedAt - 86400000;
  expect(reviewAcceptedChanges(state, now, upcoming)[0].status).toBe("observe");
});
it("volume misses can review removing the accepted set, never restore higher stress after a reduction", () => {
  const { state, upcoming, proposal } = acceptedChangeFixture(
    now,
    ["miss", "miss"],
    "add-volume",
  );
  const review = reviewAcceptedChanges(state, now, upcoming)[0];
  expect(review.restore?.target?.sets).toBe(3);
  const p = evaluateCoaching(state, upcoming, now)[0];
  expect(p.action).toBe("reduce-volume");
  expect(p.rows).toEqual(proposal.beforeRows);
  const next = applyCoaching(
    state,
    upcoming,
    [{ proposal: p, choice: "accept", scope: "program" }],
    now,
  );
  expect(next.programs[0].workouts[0].exercises[0].sets).toBe(3);
  expect(next.sessions).toEqual(state.sessions);
});
it("edited or bundled misses require manual review without attributing a component or restoring targets", () => {
  for (const kind of ["edit", "bundle"]) {
    const { state } = acceptedChangeFixture(now, ["miss", "miss"]);
    if (kind === "edit") state.coachingEvents![0].choice = "edit";
    else
      state.coachingEvents!.push({
        ...state.coachingEvents![0],
        id: "coach-second",
        proposalId: "coach-second",
        proposal: { ...state.coachingEvents![0].proposal!, id: "coach-second" },
      });
    expect(
      reviewAcceptedChanges(state, now).find(
        (r) => r.decision.id !== "coach-second",
      )!.restore,
    ).toBeUndefined();
  }
});
it("learns conservatively from repeated one-workout misses and clears the guard only with new attainment", () => {
  let { state } = acceptedChangeFixture(now, []);
  state.programs[0].workouts[0].exercises[0] = D.targetSchema.parse(
    JSON.parse(state.coachingEvents![0].proposal!.fingerprint).program.target,
  );
  state.coachingEvents = [];
  const make = (at: number) => {
    const p = state.programs[0],
      w = p.workouts[0],
      s = D.startSession(
        w.name,
        D.prepareWorkout(w, p, D.catalog, state.sessions),
        p,
        w,
      );
    s.startedAt = at;
    s.date = new Date(at).toISOString().slice(0, 10);
    s.readiness = syntheticReadiness(at);
    return s;
  };
  for (const at of [now - 7 * 86400000, now - 4 * 86400000]) {
    const s = make(at),
      p = evaluateCoaching(state, s, at)[0];
    expect(p.action).toBe("reps");
    state = applyCoaching(
      state,
      s,
      [{ proposal: p, choice: "accept", scope: "session" }],
      at,
    );
    const completed = structuredClone(state.draft!);
    completed.duration = 3600;
    completed.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: at + 3600000,
    };
    completed.exercises[0].sets.forEach((t, i) => {
      t.done = true;
      t.effortReported = true;
      t.rir = 2;
      if (i === 2) t.reps--;
    });
    state.coachingEvents!.push(
      ...classifyCoachingOutcomes(state, completed, at + 3600000),
    );
    state.sessions = [...state.sessions, completed];
    state.draft = null;
  }
  expect(evaluateCoaching(state, make(now), now)[0].reason).toMatch(
    /Two accepted one-workout increases/,
  );
  const lastProposal = state
    .coachingEvents!.filter((e) => e.kind === "decision")
    .at(-1)!.proposal!;
  for (const at of [now + 86400000, now + 4 * 86400000]) {
    const s = make(at);
    s.duration = 3600;
    s.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: at + 3600000,
    };
    s.exercises[0].sets.forEach((t, i) => {
      t.done = true;
      t.effortReported = true;
      t.rir = 2;
      t.reps = lastProposal.rows[i].reps;
    });
    state.sessions = [...state.sessions, s];
    if (at === now + 86400000)
      expect(
        evaluateCoaching(state, make(at + 3 * 3600000), at + 3 * 3600000)[0]
          .action,
      ).toBe("hold");
  }
  const at = now + 7 * 86400000;
  const final = evaluateCoaching(state, make(at), at)[0];
  expect(final.action, final.reason).toBe("reps");
});
