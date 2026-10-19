import { it, expect } from "vitest";
import * as D from "../src/domain";
const bench = D.catalog[0];
const history = (n = 2) =>
  Array.from({ length: n }, (_, i) => {
    const e = D.createEntry(bench);
    e.sets.forEach((s) =>
      Object.assign(s, { done: true, effortReported: true, weight: 60, reps: 12 }),
    );
    const s = D.startSession("QA", [e]);
    s.startedAt = Date.parse("2026-10-10T12:00:00Z") + i * 86400000;
    s.date = new Date(s.startedAt).toISOString().slice(0, 10);
    return s;
  });
it("prepares actual fixed/ramped effort, conservative beginners and executable phases without mutating history", () => {
  const p = D.starterProgram("balanced");
  p.currentWeek = 3;
  const w = p.workouts[0];
  w.exercises[0].rir = 1;
  expect(D.programPhase(p)).toBe("accumulation");
  expect(D.prepareWorkout(w, p, D.catalog, [])[0].target?.rir).toBe(1);
  expect(D.prepareWorkout(w, p, D.catalog, [], "New")[0].target?.rir).toBe(2);
  p.effort = { mode: "ramp", startRir: 4, endRir: 0 };
  expect(D.prepareWorkout(w, p, D.catalog, [])[0].target?.rir).toBe(2);
  const entries = p.workouts.flatMap((w) =>
    D.prepareWorkout(w, p, D.catalog, []),
  );
  expect(D.weeklyTarget(p, 3).rir).toBe(entries[0].target?.rir);
  p.effort = { mode: "fixed", startRir: 3, endRir: 0 };
  expect(D.prepareWorkout(w, p, D.catalog, [])[0].target?.rir).toBe(3);
  p.currentWeek = 6;
  const h = history();
  const before = structuredClone({ p, h });
  const early = D.prepareWorkout(w, p, D.catalog, h).find(
    (e) => e.exerciseId === "bench",
  )!;
  expect(early.sets).toHaveLength(2);
  expect(early.sets[0]).toMatchObject({
    weight: 60,
    reps: 4,
    rir: 5,
    done: false,
  });
  expect(early.target).toMatchObject({ min: 4, max: 6, rir: 5 });
  const late = D.prepareWorkout(p.workouts[2], p, D.catalog, h);
  expect(late.every((e) => e.sets.every((s) => s.rir >= 5))).toBe(true);
  expect({ p, h }).toEqual(before);
  p.phase = "maintenance";
  expect(D.programPhase(p)).toBe("maintenance");
  expect(D.prepareWorkout(w, p, D.catalog, h)[0].sets).toHaveLength(2);
  p.phase = "resensitization";
  expect(
    D.prepareWorkout(w, p, D.catalog, h)[0].target?.rir,
  ).toBeGreaterThanOrEqual(3);
  p.phase = "active-rest";
  expect(D.prepareWorkout(w, p, D.catalog, h)).toEqual([]);
  expect(D.weeklyTarget(p, 6).sets).toBe(0);
});
const now = Date.parse("2026-10-12T12:00:00Z");
const report = (
  sessions: D.Session[],
  muscle: D.Exercise["muscle"] = "Chest",
) =>
  sessions.forEach((s) => {
    s.exercises[0].setup = { label: "Synthetic rack", execution: "", availableLoads: [60, 61.5] };
    s.muscleFeedback = [
      { muscle, recovered: "yes", soreness: 1, fatigue: 1, pain: false },
    ];
  });
it("requires affirmative fresh recovery, uses local scope, and attaches evidence to every decision", () => {
  const h = history();
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  h.forEach(
    (s) => (s.feedback = { pump: 3, soreness: 1, fatigue: 1, pain: false }),
  );
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  report(h);
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }),
  ).toMatchObject({
    action: "load",
    weight: 61.5,
    policyVersion: D.trainingPolicyVersion,
  });
  h[1].muscleFeedback!.push({
    muscle: "Quads",
    pain: true,
    recovered: "no",
    fatigue: 5,
  });
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("load");
  h[1].muscleFeedback![0].pain = true;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("recover");
  h[1].muscleFeedback![0].pain = false;
  h[1].feedback.pain = true;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("recover");
  h[1].feedback.pain = false;
  const stale = D.recommend(
    "bench",
    h,
    D.catalog,
    { min: 8, max: 12 },
    { now: now + 40 * 86400000 },
  );
  expect(stale.action).toBe("hold");
  for (const r of [
    stale,
    D.recommend("missing", [], D.catalog, { min: 8, max: 12 }, { now }),
  ]) {
    expect(r.evidence).toBeInstanceOf(Array);
    expect(r.assumptions?.length).toBeGreaterThan(0);
    expect(r.sourcePages?.length).toBeGreaterThan(0);
  }
});
it("vetoes below-prescribed effort, recent technique changes, deloads, advanced bouts and unequal doses", () => {
  const h = history();
  report(h);
  h.forEach((s) => (s.exercises[0].target!.rir = 3));
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  h.forEach((s) => (s.exercises[0].target!.rir = 2));
  h[1].exercises[0].technique = "tempo";
  h[1].exercises[0].tempo = { eccentric: 3, pause: 1, concentric: 1 };
  expect(D.comparableKey(h[0].exercises[0], bench)).not.toBe(
    D.comparableKey(h[1].exercises[0], bench),
  );
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  delete h[1].exercises[0].technique;
  delete h[1].exercises[0].tempo;
  h[1].exercises[0].sets[1].bout = "mini";
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  delete h[1].exercises[0].sets[1].bout;
  h[1].exercises[0].target!.rir = 5;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  h[1].exercises[0].target!.rir = 2;
  h[1].exercises[0].sets.pop();
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
});
it("beginners keep reserve, machine ceilings hold without fake increments, and declining mean performance blocks escalation", () => {
  const h = history();
  report(h);
  h.forEach((s) => s.exercises[0].sets.forEach((t) => (t.rir = 1)));
  expect(
    D.recommend(
      "bench",
      h,
      D.catalog,
      { min: 8, max: 12 },
      { now, experience: "New" },
    ).action,
  ).toBe("hold");
  h.forEach((s) => {
    s.exercises[0].exerciseId = "leg-press";
    s.exercises[0].convention = "machine-label";
    s.exercises[0].equipment = "Machine";
    s.exercises[0].sets.forEach((t) => (t.rir = 2));
  });
  report(h, "Quads");
  expect(
    D.recommend("leg-press", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
  const declining = history();
  report(declining);
  declining[1].exercises[0].sets.forEach((t) => (t.reps = 10));
  expect(
    D.recommend("bench", declining, D.catalog, { min: 8, max: 12 }, { now })
      .action,
  ).toBe("hold");
});
it("reviews muscle dose only with repeated favorable performance and never diagnoses growth from pump", () => {
  const h = history();
  expect(D.muscleReview("Chest", h, D.catalog, { now }).action).toBe("hold");
  report(h);
  expect(D.muscleReview("Chest", h, D.catalog, { now }).action).toBe("hold");
  h.forEach((s) => s.exercises[0].sets.forEach((t) => (t.rir = 3)));
  const review = D.muscleReview("Chest", h, D.catalog, { now });
  expect(review.action).toBe("volume-review");
  expect(review.sourcePages).toContain(99);
  expect(review.evidence.length).toBeGreaterThan(1);
  h[1].muscleFeedback![0].recovered = "just";
  expect(D.muscleReview("Chest", h, D.catalog, { now }).action).toBe("hold");
  h[1].muscleFeedback![0].recovered = "yes";
  h.forEach((s) => s.exercises[0].sets.forEach((t) => (t.rir = 1)));
  expect(D.muscleReview("Chest", h, D.catalog, { now }).action).toBe("recover");
  expect(D.muscleReview("Quads", h, D.catalog, { now }).action).toBe("hold");
});
it("suggests broad deload review only after repeated multi-muscle below-target exposures", () => {
  const h = history();
  report(h);
  h.forEach((s) => {
    const row = D.createEntry(D.catalog.find((x) => x.id === "row")!);
    row.sets.forEach((t) =>
      Object.assign(t, { done: true, effortReported: true, weight: 60, reps: 8, rir: 1 }),
    );
    s.exercises.push(row);
    s.exercises[0].sets.forEach((t) => (t.rir = 1));
    s.muscleFeedback!.push({ muscle: "Back", recovered: "no", pain: false });
  });
  const review = D.muscleReview("Chest", h, D.catalog, { now });
  expect(review.action).toBe("deload-review");
  expect(review.sourcePages).toContain(169);
  expect(
    D.muscleReview("Chest", h, D.catalog, { now, phase: "maintenance" }).action,
  ).not.toBe("volume-review");
});
it("reports direct/indirect exposure and advanced raw bouts without fractional growth credits or warmup inflation", () => {
  const s = history(1)[0];
  s.exercises[0].sets[1].kind = "warmup";
  s.exercises[0].sets[2].bout = "mini";
  const exposure = D.muscleExposure([s], D.catalog);
  expect(exposure.Chest).toMatchObject({
    directHardSets: 1,
    indirectHardSets: 0,
    advancedBouts: 1,
    rawBouts: 2,
    exposures: 1,
  });
  expect(exposure.Triceps).toMatchObject({
    directHardSets: 0,
    indirectHardSets: 1,
    advancedBouts: 1,
    rawBouts: 2,
    exposures: 1,
  });
  expect(exposure.Chest.assumptions.join(" ")).toMatch(/not.*growth/i);
  expect(exposure.Chest.sourcePages).toContain(257);
});
it("does not recycle an older favorable recovery report after a newer unknown exposure", () => {
  const h = history();
  report(h);
  delete h[1].muscleFeedback;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("hold");
});
it("never skips the latest drop-only context to cherry-pick two old straight exposures", () => {
  const h = history(3);
  report(h);
  h[2].exercises[0].sets.forEach((s) => (s.kind = "drop"));
  expect(
    D.recommend(
      "bench",
      h,
      D.catalog,
      { min: 8, max: 12 },
      { now: now + 86400000 },
    ).action,
  ).toBe("hold");
});
it("treats supporting-muscle pain conservatively without blocking unrelated muscles", () => {
  const h = history();
  report(h);
  h[1].muscleFeedback!.push({ muscle: "Triceps", pain: true });
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("recover");
  expect(D.muscleReview("Quads", h, D.catalog, { now }).action).toBe("hold");
});
it("one duplicated session is not two independent comparable exposures", () => {
  const h = history(1);
  report(h);
  expect(
    D.recommend("bench", [h[0], h[0]], D.catalog, { min: 8, max: 12 }, { now })
      .action,
  ).toBe("hold");
});
it("suppresses speculative e1RM for advanced sequence bouts while retaining raw records", () => {
  const s = history(1)[0];
  s.exercises[0].technique = "myoreps";
  s.exercises[0].sets.forEach((t) => (t.bout = "mini"));
  expect(D.records([s], D.catalog)[0].e1rm).toBeNull();
  expect(D.records([s], D.catalog)[0].weight).toBe(60);
});
it("halves late-deload loads from accumulation rather than compounding a previous deload reduction", () => {
  const p = D.starterProgram("minimal");
  p.currentWeek = p.deloadWeek;
  p.workouts = p.workouts.map((w, i) => ({
    ...w,
    exercises: [{ ...D.target("bench"), id: "qa-target-" + i }],
  }));
  const h = history();
  const old = D.startSession("Previous deload", [D.createEntry(bench)]);
  old.date = "2026-10-12";
  old.exercises[0].target!.rir = 5;
  old.exercises[0].sets.forEach((t) =>
    Object.assign(t, { weight: 30, reps: 4, rir: 5, done: true }),
  );
  h.push(old);
  const late = D.prepareWorkout(p.workouts[1], p, D.catalog, h);
  expect(
    late[0].sets.every((s) => s.weight === 30 && s.reps === 4 && s.rir >= 5),
  ).toBe(true);
  expect(D.weeklyTarget(p, p.currentWeek).sets).toBe(
    p.workouts
      .flatMap((w) => D.prepareWorkout(w, p, D.catalog, h))
      .reduce((sum, e) => sum + e.sets.length, 0),
  );
});
it("keeps mixed legacy straight and mini/drop records in distinct execution contexts", () => {
  const s = history(1)[0];
  s.exercises[0].sets[1].bout = "mini";
  s.exercises[0].sets[1].weight = 70;
  s.exercises[0].sets[2].kind = "drop";
  const records = D.records([s], D.catalog);
  expect(records).toHaveLength(3);
  expect(records.find((r) => r.weight === 70)?.e1rm).toBeNull();
});
it("unknown reports never clear an unresolved prior pain flag", () => {
  const h = history();
  report(h);
  h[0].feedback.pain = true;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("recover");
  h[1].feedback = { pain: false, reported: true };
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("load");
  h[0].muscleFeedback![0].pain = true;
  h[1].muscleFeedback![0].pain = null;
  expect(
    D.recommend("bench", h, D.catalog, { min: 8, max: 12 }, { now }).action,
  ).toBe("recover");
});
it("starts feedback unknown and preserves optional technique, phase and muscle reports in strict backups", () => {
  const s = history(1)[0];
  expect(s.feedback).toEqual({
    pump: null,
    soreness: null,
    fatigue: null,
    pain: null,
    reported: false,
  });
  const state = D.emptyState();
  const p = D.starterProgram("minimal");
  Object.assign(p, {
    phase: "maintenance",
    effort: { mode: "ramp", startRir: 4, endRir: 1 },
  });
  Object.assign(p.workouts[0].exercises[0], {
    technique: "tempo",
    tempo: { eccentric: 3, pause: 1, concentric: 1 },
    repGoal: 30,
    techniqueGroup: "qa",
  });
  Object.assign(s.exercises[0], {
    technique: "myoreps",
    techniqueGroup: "qa",
    repGoal: 30,
  });
  Object.assign(s.exercises[0].sets[0], {
    bout: "activation",
    groupId: "qa",
    rest: 20,
  });
  Object.assign(s, {
    muscleFeedback: [
      { muscle: "Chest", recovered: "yes", pump: null, pain: false },
    ],
  });
  state.sessions = [s];
  state.programs = [p];
  expect(D.importBackup(JSON.stringify({ version: 1, data: state }))).toEqual(
    state,
  );
  const duplicate = structuredClone(s);
  Object.assign(duplicate, {
    muscleFeedback: [{ muscle: "Chest" }, { muscle: "Chest" }],
  });
  expect(D.sessionSchema.safeParse(duplicate).success).toBe(false);
});
