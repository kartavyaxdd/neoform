import { describe, it, expect } from "vitest";
import * as D from "../src/domain";
import {
  evaluateCoaching,
  applyCoaching,
  classifyCoachingOutcomes,
  validOutcome,
} from "../src/coaching";
import { DEFAULT_COACH_SETTINGS } from "../src/coachingTypes";
import { syntheticReadiness } from "./readiness-fixture";

const now = Date.parse("2026-10-20T12:00:00Z");
function scenario(reps = [10, 9, 8], count = 1) {
  const state = D.emptyState();
  state.coaching = { ...DEFAULT_COACH_SETTINGS, diet: "cut" };
  const program = D.starterProgram("balanced");
  program.workouts[0].exercises = [
    {
      ...D.target("bench"),
      startingLoad: 50,
      setup: {
        label: "QA rack",
        execution: "Same ROM",
        availableLoads: [50, 51, 55, 60],
      },
    },
  ];
  state.programs = [program];
  const workout = program.workouts[0];
  const entry = () => {
    const e = D.createEntry(D.catalog[0], workout.exercises[0]);
    e.sets = e.sets.map((s, i) => ({
      ...s,
      weight: 50,
      reps: reps[i],
      prescription: { ...s.prescription!, weight: 50 },
    }));
    e.coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: now - 86400000,
    };
    return e;
  };
  state.sessions = Array.from({ length: count }, (_, i) => {
    const s = D.startSession("QA", [entry()], program, workout);
    s.startedAt = now - (count - i) * 3 * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.duration = 3600;
    s.exercises[0].coachingContext!.recordedAt = s.startedAt + 3600000;
    s.exercises[0].sets = s.exercises[0].sets.map((t) => ({
      ...t,
      done: true,
      rir: 2,
      effortReported: true,
    }));
    return s;
  });
  const draft = D.startSession("QA", [entry()], program, workout);
  draft.startedAt = now;
  draft.date = "2026-10-20";
  draft.readiness = syntheticReadiness(now);
  state.draft = draft;
  return { state, draft, entry: draft.exercises[0] };
}
describe("confirmed coaching policy", () => {
  it.each([
    "missing effort",
    "unfinished dose",
    "new equipment",
    "changed readiness",
    "unknown readiness",
    "changed rest",
    "manual load",
    "future context",
  ])("longitudinal replay cannot escalate through %s", (issue) => {
    const { state, draft } = scenario([12, 12, 12], 6),
      latest = state.sessions.at(-1)!,
      entry = latest.exercises[0];
    state.sessions.forEach((s) =>
      s.exercises[0].sets.forEach((t) => (t.rir = 3)),
    );
    if (issue === "missing effort") entry.sets[1].effortReported = false;
    if (issue === "unfinished dose") entry.sets[1].done = false;
    if (issue === "new equipment") entry.setup!.execution = "Changed ROM";
    if (issue === "changed readiness") draft.readiness!.context = "changed";
    if (issue === "unknown readiness") draft.readiness = undefined;
    if (issue === "changed rest") entry.coachingContext!.rest = "shorter";
    if (issue === "manual load") entry.sets[1].weight = 55;
    if (issue === "future context")
      entry.coachingContext!.recordedAt = now + 1000;
    const before = structuredClone(state),
      proposals = evaluateCoaching(state, draft, now);
    expect(proposals[0].action).toBe("hold");
    expect(
      proposals.some((p) =>
        ["load", "trial", "reps", "add-volume"].includes(p.action),
      ),
    ).toBe(false);
    expect(state).toEqual(before);
  });
  it("an extended cut plateau does not justify extra volume or invented loads", () => {
    const { state, draft } = scenario([10, 9, 8], 8);
    draft.exercises[0].setup!.availableLoads = [50, 60];
    const before = structuredClone(state),
      proposals = evaluateCoaching(state, draft, now);
    expect(
      proposals.some(
        (p) =>
          p.action === "add-volume" ||
          p.action === "load" ||
          p.action === "trial",
      ),
    ).toBe(false);
    expect(proposals[0].rows.every((r) => r.weight === 50)).toBe(true);
    expect(state).toEqual(before);
  });
  it("replaying repeated confirmed misses proposes only a supported lower load", () => {
    const { state, draft } = scenario([6, 6, 6], 3);
    draft.exercises[0].setup!.availableLoads = [45, 50, 51];
    const before = structuredClone(state),
      proposals = evaluateCoaching(state, draft, now);
    expect(proposals[0].action).toBe("reduce-load");
    expect(proposals[0].rows.every((r) => r.weight === 45)).toBe(true);
    expect(state).toEqual(before);
  });
  it("warmup outliers do not change working-set progression", () => {
    const { state, draft } = scenario([10, 9, 8], 2);
    state.sessions[1].exercises[0].sets.unshift({
      ...state.sessions[1].exercises[0].sets[0],
      id: D.uid(),
      kind: "warmup",
      weight: 900,
      reps: 50,
    });
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action, p.reason).toBe("reps");
    expect(p.rows.map((r) => r.weight)).toEqual([50, 50, 50]);
  });
  it("future workouts cannot manufacture eligible performance", () => {
    const { state, draft } = scenario([10, 9, 8], 1),
      future = structuredClone(state.sessions[0]);
    future.id = "future-replay";
    future.startedAt = now + 86400000;
    future.date = "2026-10-21";
    future.exercises[0].sets.forEach((t) => {
      t.weight = 500;
      t.reps = 30;
    });
    state.sessions = [future];
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("hold");
    expect(p.sourceIds).toEqual([]);
    expect(p.rows.every((r) => r.weight <= 50)).toBe(true);
  });
  it("offers one total rep after one confirmed exposure without equalizing mixed rows", () => {
    const { state, draft } = scenario();
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("reps");
    expect(p.rows.map((r) => r.reps)).toEqual([10, 9, 9]);
  });
  it("cannot manufacture confirmation from imported or missing effort", () => {
    const { state, draft } = scenario();
    state.sessions[0].exercises[0].sets.forEach(
      (t) => (t.effortReported = false),
    );
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
  });
  it("offers only one exploratory row after a strong first ceiling exposure", () => {
    const { state, draft } = scenario([12, 12, 12]);
    state.sessions[0].exercises[0].sets.forEach((t) => (t.rir = 3));
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("trial");
    expect(p.rows.map((r) => r.weight)).toEqual([51, 50, 50]);
  });
  it("uses normal bounded load progression after two ceiling exposures", () => {
    const { state, draft } = scenario([12, 12, 12], 2);
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("load");
    expect(p.rows.every((r) => r.weight === 51)).toBe(true);
  });
  it("rejects stale acceptance, writes decisions with targets atomically and preserves observations", () => {
    const { state, draft } = scenario();
    const p = evaluateCoaching(state, draft, now)[0];
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "session" }],
      now,
    );
    expect(next.draft!.exercises[0].sets.map((s) => s.reps)).toEqual([
      10, 9, 9,
    ]);
    expect(next.coachingEvents).toHaveLength(1);
    expect(next.sessions).toEqual(state.sessions);
    expect(() =>
      applyCoaching(
        { ...state, draft: { ...draft, readiness: undefined } },
        draft,
        [{ proposal: p, choice: "accept", scope: "session" }],
        now,
      ),
    ).toThrow();
  });
  it("classifies actual outcomes only after confirmation, without rewriting the accepted plan", () => {
    const { state, draft } = scenario();
    const p = evaluateCoaching(state, draft, now)[0];
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "session" }],
      now,
    );
    const completed = D.completeSession({
      ...next.draft!,
      exercises: next.draft!.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((t) => ({ ...t, done: true, effortReported: true })),
      })),
    });
    expect(
      classifyCoachingOutcomes(next, completed, now).map((e) => e.outcome),
    ).toEqual(["met"]);
  });
});

describe("coaching guardrails and correction history", () => {
  it.each([
    "effort",
    "execution",
    "rest",
    "dose",
    "load",
    "stale",
    "phase",
    "order",
  ])("holds escalation for %s changes", (reason) => {
    const { state, draft } = scenario();
    const prior = state.sessions[0],
      e = prior.exercises[0];
    if (reason === "effort") e.sets[0].effortReported = false;
    if (reason === "execution") e.coachingContext!.execution = "changed";
    if (reason === "rest") e.coachingContext!.rest = "shorter";
    if (reason === "dose") e.sets.pop();
    if (reason === "load") e.sets[0].weight = 55;
    if (reason === "stale") {
      prior.startedAt = now - 22 * 86400000;
      prior.date = new Date(prior.startedAt).toISOString().slice(0, 10);
      e.coachingContext!.recordedAt = prior.startedAt + 3600000;
    }
    if (reason === "phase") prior.phase = "deload";
    if (reason === "order")
      prior.exercises.unshift(
        D.createEntry(D.catalog[1], D.target(D.catalog[1].id)),
      );
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
  });
  it("does not cross a changed setup segment to reuse old evidence", () => {
    const { state, draft } = scenario([12, 12, 12], 3);
    state.sessions[1].exercises[0].setup!.label = "Changed rack";
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
  });
  it("offers a future rep-range review when selected load steps are too coarse", () => {
    const { state, draft } = scenario([12, 12, 12], 2);
    draft.exercises[0].setup!.availableLoads = [50, 60];
    const proposals = evaluateCoaching(state, draft, now);
    expect(proposals[0].action).toBe("hold");
    const p = proposals.find((p) => p.action === "rep-range")!;
    expect(p.afterTarget!.max).toBe(14);
    expect(() =>
      applyCoaching(
        state,
        draft,
        [{ proposal: p, choice: "accept", scope: "session" }],
        now,
      ),
    ).toThrow("future-program");
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "program" }],
      now,
    );
    expect(next.programs[0].workouts[0].exercises[0].max).toBe(14);
    expect(next.draft).toEqual(draft);
  });
  it("requires selected baseline loads and never overwrites logged sets", () => {
    const { state, draft } = scenario();
    draft.exercises[0].setup!.availableLoads = [51, 55];
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
    draft.exercises[0].setup!.availableLoads = [50, 51];
    const p = evaluateCoaching(state, draft, now)[0];
    draft.exercises[0].sets[0].done = true;
    expect(() =>
      applyCoaching(
        state,
        draft,
        [{ proposal: p, choice: "accept", scope: "session" }],
        now,
      ),
    ).toThrow();
  });
  it("vetoes pain, future readiness and stale readiness", () => {
    for (const issue of ["pain", "future", "stale"]) {
      const { state, draft } = scenario();
      if (issue === "pain") draft.readiness!.pain = true;
      else
        draft.readiness!.recordedAt =
          now + (issue === "future" ? 86400000 : -86400000);
      expect(["hold", "recover"]).toContain(
        evaluateCoaching(state, draft, now)[0].action,
      );
    }
  });
  it("records an omitted exercise as changed rather than losing its outcome", () => {
    const { state, draft } = scenario();
    const p = evaluateCoaching(state, draft, now)[0];
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "session" }],
      now,
    );
    const omitted = { ...next.draft!, exercises: [] };
    expect(classifyCoachingOutcomes(next, omitted, now)[0].outcome).toBe(
      "changed",
    );
  });
  it.each(["met", "too-demanding", "easier", "changed", "unknown"] as const)(
    "classifies %s and invalidates an edited observation",
    (outcome) => {
      const { state, draft } = scenario();
      const p = evaluateCoaching(state, draft, now)[0];
      const next = applyCoaching(
        state,
        draft,
        [{ proposal: p, choice: "accept", scope: "session" }],
        now,
      );
      const completed = structuredClone(next.draft!);
      completed.exercises[0].sets.forEach((t) => {
        t.done = true;
        t.effortReported = true;
      });
      const t = completed.exercises[0].sets[0];
      if (outcome === "too-demanding") t.reps = 1;
      if (outcome === "easier")
        completed.exercises[0].sets.forEach((t) => (t.rir = 5));
      if (outcome === "changed") t.weight = 55;
      if (outcome === "unknown") t.effortReported = false;
      const event = classifyCoachingOutcomes(next, completed, now)[0];
      expect(event.outcome).toBe(outcome);
      next.sessions = [completed];
      next.coachingEvents!.push(event);
      expect(validOutcome(next, event)).toBe(true);
      completed.feedback.pain = true;
      expect(validOutcome(next, event)).toBe(false);
      expect(classifyCoachingOutcomes(next, completed, now + 1)).toHaveLength(
        1,
      );
    },
  );
  it("preserves row-specific load references when preparing a future session", () => {
    const { state } = scenario();
    state.sessions[0].exercises[0].sets[1].weight = 45;
    const p = state.programs[0],
      rows = D.prepareWorkout(p.workouts[0], p, D.catalog, state.sessions);
    expect(rows[0].sets.map((s) => s.weight)).toEqual([50, 45, 50]);
  });
});

describe("dose review and preference boundaries", () => {
  function volumeScenario() {
    const x = scenario([12, 12, 12], 4),
      { state, draft } = x;
    state.coaching = {
      ...state.coaching!,
      diet: "gain",
      priorities: ["Chest"],
    };
    const p = state.programs[0];
    p.workouts.push(
      ...[1, 2, 3].map((i) => ({
        ...structuredClone(p.workouts[0]),
        id: "other-" + i,
      })),
    );
    state.sessions.forEach((s, i) => {
      s.startedAt = now - (4 - i) * 7 * 86400000;
      s.date = new Date(s.startedAt).toISOString().slice(0, 10);
      s.exercises[0].coachingContext!.recordedAt = s.startedAt + 3600000;
      s.exercises[0].sets.forEach((t) => (t.rir = 3));
      s.readiness = syntheticReadiness(s.startedAt);
    });
    draft.exercises[0].setup!.availableLoads = [50, 60];
    return x;
  }
  it("offers one bounded set experiment only with repeated evidence, explicit priority and diet context", () => {
    const { state, draft } = volumeScenario();
    expect(
      evaluateCoaching(state, draft, now).some(
        (p) => p.action === "add-volume",
      ),
    ).toBe(true);
    for (const diet of ["cut", "unknown"] as const) {
      state.coaching!.diet = diet;
      expect(
        evaluateCoaching(state, draft, now).some(
          (p) => p.action === "add-volume",
        ),
      ).toBe(false);
    }
  });
  it("limits a volume experiment to one additional set and protects the 75-minute budget", () => {
    const { state, draft } = volumeScenario();
    const p = evaluateCoaching(state, draft, now).find(
      (p) => p.action === "add-volume",
    )!;
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "program" }],
      now,
    );
    expect(next.programs[0].workouts[0].exercises[0].sets).toBe(4);
    expect(next.draft).toEqual(draft);
    state.coaching!.minutes = 30;
    state.programs[0].workouts[0].exercises.push(
      ...Array.from({ length: 7 }, () => ({
        ...D.target("bench"),
        id: D.uid(),
      })),
    );
    expect(
      evaluateCoaching(state, draft, now).some(
        (p) => p.action === "add-volume",
      ),
    ).toBe(false);
  });
  it("uses a small selected lower load after two comparable misses", () => {
    const { state, draft } = scenario([5, 5, 5], 2);
    draft.exercises[0].setup!.availableLoads = [45, 50, 60];
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("reduce-load");
    expect(p.rows.map((r) => r.weight)).toEqual([45, 45, 45]);
  });
  it("offers local dose review with repeated misses and a local recovery flag", () => {
    const { state, draft } = scenario([5, 5, 5], 2);
    draft.readiness!.muscles[0].recovered = "no";
    const p = evaluateCoaching(state, draft, now);
    expect(p[0].action).toBe("recover");
    expect(p.find((p) => p.action === "reduce-volume")!.afterTarget!.sets).toBe(
      2,
    );
  });
  it("keeps a disabled coach from changing targets", () => {
    const { state, draft } = scenario();
    state.coaching!.enabled = false;
    expect(
      evaluateCoaching(state, draft, now).every((p) => p.action === "hold"),
    ).toBe(true);
  });
});

describe("future-plan provenance and response learning", () => {
  it("snapshots a future accepted row plan and its outcome without changing existing history", () => {
    const { state, draft } = scenario();
    const p = evaluateCoaching(state, draft, now)[0];
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "program" }],
      now,
    );
    const program = next.programs[0],
      workout = program.workouts[0];
    const future = D.startSession(
      "Future",
      D.prepareWorkout(workout, program, D.catalog, next.sessions),
      program,
      workout,
    );
    expect(future.exercises[0].sets.map((t) => t.reps)).toEqual([10, 9, 9]);
    future.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: now,
    };
    future.exercises[0].sets.forEach((t) => {
      t.done = true;
      t.effortReported = true;
    });
    expect(classifyCoachingOutcomes(next, future, now)[0].outcome).toBe("met");
    expect(next.sessions).toEqual(state.sessions);
  });
  it("a failed confirmed trial requires new ceiling evidence before another trial", () => {
    const { state, draft } = scenario([12, 12, 12]);
    state.sessions[0].exercises[0].sets.forEach((t) => (t.rir = 3));
    const p = evaluateCoaching(state, draft, now)[0],
      next = applyCoaching(
        state,
        draft,
        [{ proposal: p, choice: "accept", scope: "session" }],
        now,
      );
    const actual = structuredClone(next.draft!);
    actual.exercises[0].coachingContext!.recordedAt = now;
    actual.exercises[0].sets.forEach((t) => {
      t.done = true;
      t.effortReported = true;
    });
    actual.exercises[0].sets[0].reps = 1;
    const result = classifyCoachingOutcomes(next, actual, now + 1);
    next.coachingEvents!.push(...result);
    next.sessions.push(actual);
    const future = structuredClone(draft);
    future.id = D.uid();
    future.readiness = syntheticReadiness(now + 3600000);
    next.draft = future;
    const q = evaluateCoaching(next, future, now + 3600000)[0];
    expect(q.action).toBe("hold");
    expect(q.reason).toContain("previous trial");
    const manual = {
      ...next,
      coachingEvents: next.coachingEvents!.map((e) =>
        e.kind === "decision" ? { ...e, choice: "edit" as const } : e,
      ),
    };
    expect(
      evaluateCoaching(manual, future, now + 3600000)[0].reason,
    ).not.toContain("previous trial");
  });
  it("requires current evidence rather than future execution confirmation", () => {
    const { state, draft } = scenario();
    state.sessions[0].exercises[0].coachingContext!.recordedAt = now + 3600000;
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
  });
  it("rejects conflicting proposals on one target without applying partial changes", () => {
    const { state, draft } = scenario([12, 12, 12], 2);
    draft.exercises[0].setup!.availableLoads = [50, 60];
    const p = evaluateCoaching(state, draft, now).find(
      (p) => p.action === "rep-range",
    )!;
    expect(() =>
      applyCoaching(
        state,
        draft,
        [
          { proposal: p, choice: "accept", scope: "program" },
          { proposal: p, choice: "accept", scope: "program" },
        ],
        now,
      ),
    ).toThrow();
    expect(state.coachingEvents).toBeUndefined();
    expect(state.programs[0].workouts[0].exercises[0].max).toBe(12);
  });
});

describe("movement and whole-program review", () => {
  it("offers a previously tolerated matching substitute and clears its old load/setup", () => {
    const { state, draft } = scenario();
    state.sessions[0].exercises[0].coachingContext!.execution = "changed";
    draft.exercises[0].coachingContext = undefined;
    const alternative = D.catalog.find(
      (x) => x.id !== "bench" && x.muscle === "Chest" && x.pattern === "Push",
    )!;
    state.profile = {
      name: "Synthetic",
      experience: "Intermediate",
      goal: "Build muscle",
      equipment: [alternative.equipment],
      days: 4,
    };
    const e = D.createEntry(alternative, D.target(alternative.id));
    e.sets[0].done = true;
    e.sets[0].effortReported = true;
    const s = D.startSession("Previously tolerated", [e]);
    s.startedAt = now - 10 * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    s.muscleFeedback = [{ muscle: "Chest", pain: false }];
    state.sessions.push(s);
    const p = evaluateCoaching(state, draft, now).find(
      (p) => p.action === "substitute",
    )!;
    expect(p.alternatives).toContain(alternative.id);
    const next = applyCoaching(
      state,
      draft,
      [
        {
          proposal: p,
          choice: "accept",
          scope: "program",
          alternative: alternative.id,
        },
      ],
      now,
    );
    expect(next.programs[0].workouts[0].exercises[0]).toMatchObject({
      exerciseId: alternative.id,
    });
    expect(next.programs[0].workouts[0].exercises[0].setup).toBeUndefined();
    expect(
      next.programs[0].workouts[0].exercises[0].startingLoad,
    ).toBeUndefined();
  });
  it("reviews a deload only for broad repeated misses plus systemic fatigue", () => {
    const { state, draft } = scenario([5, 5, 5], 2),
      program = state.programs[0];
    const workout = {
      id: "qa-lower",
      name: "QA lower",
      day: "Friday",
      exercises: [D.target("squat")],
    };
    program.workouts = [program.workouts[0], workout];
    for (const days of [6, 3]) {
      const e = D.createEntry(
          D.catalog.find((x) => x.id === "squat")!,
          workout.exercises[0],
        ),
        s = D.startSession("Lower", [e], program, workout);
      s.startedAt = now - days * 86400000;
      s.date = new Date(s.startedAt).toISOString().slice(0, 10);
      s.duration = 3600;
      e.coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt + 3600000,
      };
      e.sets.forEach((t) =>
        Object.assign(t, { reps: 5, done: true, effortReported: true }),
      );
      state.sessions.push(s);
    }
    draft.readiness!.fatigue = 4;
    const p = evaluateCoaching(state, draft, now).find(
      (p) => p.action === "deload",
    )!;
    expect(p).toBeDefined();
    const next = applyCoaching(
      state,
      draft,
      [{ proposal: p, choice: "accept", scope: "program" }],
      now,
    );
    expect(next.programs[0].phase).toBe("deload");
    draft.readiness!.recordedAt = now - 86400000;
    expect(
      evaluateCoaching(state, draft, now).some((p) => p.action === "deload"),
    ).toBe(false);
    draft.readiness!.recordedAt = now;
    expect(next.sessions).toEqual(state.sessions);
    state.coaching!.enabled = false;
    expect(
      evaluateCoaching(state, draft, now).some((p) => p.action === "deload"),
    ).toBe(false);
  });
  it("learns raw machine transitions without treating labels as kilograms", () => {
    const { state, draft } = scenario([12, 12, 12], 8);
    const machine = {
      ...D.catalog.find((x) => x.id === "bench")!,
      id: "qa-machine",
      name: "QA machine",
      convention: "machine-label" as const,
      equipment: "Machine" as const,
    };
    state.customExercises = [machine];
    state.programs[0].workouts[0].exercises[0].exerciseId = machine.id;
    for (const [i, s] of [...state.sessions, draft].entries()) {
      const e = s.exercises[0];
      e.exerciseId = machine.id;
      e.convention = machine.convention;
      e.equipment = machine.equipment;
      e.setup!.availableLoads = [50, 55];
      const weight = [50, 55, 50, 55, 50, 55, 50, 50, 50][i];
      e.sets.forEach((t) => {
        t.weight = weight;
        t.prescription!.weight = weight;
      });
    }
    const p = evaluateCoaching(state, draft, now)[0];
    expect(p.action).toBe("trial");
    expect(p.rows.map((r) => r.weight)).toEqual([55, 50, 50]);
    expect(p.evidence.join(" ")).toContain("observed range");
  });
  it("does not reuse earlier exposures when current reported bodyweight changes", () => {
    const { state, draft } = scenario();
    const ex = {
      ...D.catalog.find((x) => x.id === "bench")!,
      id: "qa-bodyweight",
      convention: "added-bodyweight" as const,
    };
    state.customExercises = [ex];
    state.programs[0].workouts[0].exercises[0].exerciseId = ex.id;
    for (const s of [...state.sessions, draft]) {
      s.exercises[0].exerciseId = ex.id;
      s.exercises[0].convention = ex.convention;
      s.bodyweight = { kg: s === draft ? 60 : 63, at: s.startedAt };
    }
    expect(evaluateCoaching(state, draft, now)[0].action).toBe("hold");
  });
});
