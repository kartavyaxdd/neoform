import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  previousWorkingRows,
  resumeExerciseId,
  nextExerciseId,
  weeklyPrimarySets,
  dashboardActivity,
  dashboardWeights,
  programPrescriptionRows,
  plannedMuscleCards,
  programSchedule,
  sessionSetProgress,
  changeSimpleSetType,
} from "../src/workoutPresentation";
it("counts actual rows across the whole workout, including warmups and advanced bouts", () => {
  const s = D.startSession("Progress", [
    D.createEntry(D.catalog[0]),
    D.createEntry(D.catalog[1]),
  ]);
  s.exercises[0].sets[0].kind = "warmup";
  s.exercises[0].sets[0].done = true;
  s.exercises[1].sets[0].bout = "mini";
  s.exercises[1].sets[0].done = true;
  expect(sessionSetProgress(s)).toEqual({ completed: 2, total: 6 });
  s.exercises[0].sets.splice(1, 1);
  expect(sessionSetProgress(s)).toEqual({ completed: 2, total: 5 });
  expect(sessionSetProgress(D.startSession("Empty", []))).toEqual({
    completed: 0,
    total: 0,
  });
});
it("quick type changes preserve observations and prescriptions and reject linked sequences", () => {
  const e = D.createEntry(D.catalog[0]),
    original = structuredClone(e);
  e.sets[0].done = true;
  const next = changeSimpleSetType(e, e.sets[0].id, "warmup");
  expect(next.sets[0]).toEqual({ ...e.sets[0], kind: "warmup" });
  expect(next.plannedWorkingSets).toBe(original.plannedWorkingSets);
  expect(e.sets[0].kind).toBe("working");
  e.technique = "myoreps";
  expect(() => changeSimpleSetType(e, e.sets[0].id, "working")).toThrow(
    /advanced/i,
  );
});
it("program schedule inserts rest days only for unambiguous saved weekday assignments", () => {
  const p = D.starterProgram("balanced");
  p.workouts = p.workouts.slice(0, 2);
  expect(
    programSchedule(p).map((d) => (d.kind === "rest" ? d.day : d.workout.name)),
  ).toEqual([
    "Full body A",
    "Tuesday",
    "Full body B",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]);
  p.workouts[1].day = "Monday";
  expect(programSchedule(p).map((d) => d.kind)).toEqual(["workout", "workout"]);
  p.workouts[1].day = "";
  expect(programSchedule(p).map((d) => d.kind)).toEqual(["workout", "workout"]);
});

it("program week cards match prepared row prescriptions without changing the routine", () => {
  const p = D.starterProgram("balanced"),
    w = p.workouts[0];
  const t = w.exercises[0];
  t.nextRows = Array.from({ length: t.sets }, (_, ordinal) => ({
    ordinal,
    weight: 50,
    reps: 10 + ordinal,
    rir: 2,
  }));
  const before = JSON.stringify(p);
  for (const currentWeek of [1, p.deloadWeek]) {
    const selected = { ...p, currentWeek };
    const expected = D.prepareWorkout(
      w,
      selected,
      D.catalog,
      [],
      "Intermediate",
    )[0].sets;
    const actual = programPrescriptionRows(t, p, currentWeek, "Intermediate");
    expect(actual.map((r) => [r.min, r.max, r.reps, r.rir])).toEqual(
      expected.map((s) => [
        s.prescription!.min,
        s.prescription!.max,
        s.prescription!.reps,
        s.prescription!.rir,
      ]),
    );
  }
  expect(JSON.stringify(p)).toBe(before);
  expect(programPrescriptionRows(t, { ...p, phase: "active-rest" }, 1)).toEqual(
    [],
  );
});

it("muscle cards separate primary planned sets from advanced sequence rows and warmups", () => {
  const a = D.createEntry(D.catalog.find((x) => x.id === "bench")!),
    b = D.createEntry(D.catalog.find((x) => x.id === "incline-db")!);
  a.sets[0].kind = "warmup";
  b.technique = "myoreps";
  expect(plannedMuscleCards([a, b], D.catalog)).toEqual([
    { muscle: "Chest", exercises: 2, sets: 2, advancedRows: 3 },
  ]);
});
it("previous rows exclude warmups, unfinished bouts and different execution contexts", () => {
  const e = D.createEntry(D.catalog[0], D.target(D.catalog[0].id));
  e.sets[0].done = true;
  e.sets[0].weight = 50;
  const later = structuredClone(e);
  later.id = D.uid();
  later.setup = {
    label: "Other rack",
    execution: "Different",
    availableLoads: [],
  };
  later.sets[0].weight = 90;
  const first = D.startSession("Prior", [e]),
    second = D.startSession("Other setup", [later]);
  first.startedAt = 1;
  second.startedAt = 2;
  expect(
    previousWorkingRows([first, second], e, D.catalog[0]).map((s) => s.weight),
  ).toEqual([50]);
  e.sets[0].kind = "warmup";
  expect(previousWorkingRows([first], e, D.catalog[0])).toEqual([]);
});
it("resumes unfinished work and never advances over incomplete advanced bouts", () => {
  const a = D.createEntry(D.catalog[0]),
    b = D.createEntry(D.catalog[1]);
  a.sets.forEach((t) => (t.done = true));
  const s = D.startSession("QA", [a, b]);
  expect(resumeExerciseId(s)).toBe(b.id);
  a.sets.push({ ...a.sets[0], id: D.uid(), kind: "drop", done: false });
  expect(nextExerciseId(s, a.id)).toBe(a.id);
  a.sets.at(-1)!.done = true;
  expect(nextExerciseId(s, a.id)).toBe(b.id);
});
it("weekly body-map counts primary completed working sets without inventing hard-set qualification", () => {
  const e = D.createEntry(D.catalog[0]);
  e.sets[0].done = true;
  e.sets[0].effortReported = false;
  e.sets[1].done = true;
  e.sets[1].kind = "warmup";
  e.sets[2].done = true;
  e.sets[2].kind = "drop";
  const s = D.startSession("QA", [e]);
  s.date = "2026-10-19";
  expect(
    weeklyPrimarySets([s], D.catalog, "2026-10-19")[D.catalog[0].muscle],
  ).toBe(1);
  expect(
    weeklyPrimarySets([s], D.catalog, "2026-10-26")[D.catalog[0].muscle],
  ).toBe(0);
});

it("dashboard rings use current phase prescriptions, explicit program scope and unique exercise identities", () => {
  const state = D.emptyState(),
    p = D.starterProgram("balanced");
  p.workouts = [p.workouts[0]];
  p.workouts[0].exercises = [D.target("bench"), D.target("bench")];
  state.programs = [p];
  const e = D.createEntry(D.catalog.find((x) => x.id === "bench")!);
  e.sets[0].done = true;
  e.sets[1].done = true;
  e.sets[1].kind = "warmup";
  const s = D.startSession("Other program", [e]);
  s.date = "2026-10-19";
  state.sessions = [s];
  const before = JSON.stringify(state);
  const all = dashboardActivity(state, D.catalog, "2026-10-19", "all");
  expect(all.completed).toEqual({ muscles: 1, sets: 1, exercises: 1 });
  expect(all.planned).toEqual({ muscles: 1, sets: 6, exercises: 1 });
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "program").completed.sets,
  ).toBe(0);
  expect(JSON.stringify(state)).toBe(before);
  p.currentWeek = p.deloadWeek;
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "all").planned?.sets,
  ).toBe(4);
  p.phase = "active-rest";
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "all").planned?.sets,
  ).toBe(0);
  state.programs = [];
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "all").planned,
  ).toBeNull();
});

it("weight charts retain only real dated observations, latest per day, without extending or inventing a trend", () => {
  const state = D.emptyState(),
    at = new Date("2026-10-22T12:00:00").getTime();
  const make = (kg: number, time: number) => ({
    ...D.startSession("QA", []),
    bodyweight: { kg, at: time },
  });
  state.sessions = [
    make(61, at - 86400000),
    make(60, at),
    make(62, at - 3600000),
    make(80, at - 8 * 86400000),
    make(70, at + 86400000),
  ];
  state.coaching = {
    enabled: false,
    minutes: 60,
    diet: "unknown",
    earlyTrials: false,
    priorities: [],
    bodyweight: { kg: 60, at },
  };
  expect(dashboardWeights(state, "2026-10-22").map((x) => x.kg)).toEqual([
    61, 60,
  ]);
  state.sessions = [];
  state.coaching = undefined;
  expect(dashboardWeights(state, "2026-10-22")).toEqual([]);
});

it("dashboard targets keep unsupported advanced sequences out of ordinary set equivalents", () => {
  const state = D.emptyState(),
    p = D.starterProgram("balanced");
  p.workouts = [p.workouts[0]];
  p.workouts[0].exercises = [
    { ...D.target("bench"), technique: "myoreps" },
    { ...D.target("row"), technique: "drop-set" },
    { ...D.target("squat"), technique: "giant-set" },
  ];
  state.programs = [p];
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "all").planned,
  ).toEqual({ muscles: 0, sets: 0, exercises: 0 });
  p.workouts[0].exercises.push({ ...D.target("bench"), technique: "down-set" });
  expect(
    dashboardActivity(state, D.catalog, "2026-10-19", "all").planned?.sets,
  ).toBe(3);
});
