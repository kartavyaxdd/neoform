import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  previousWorkingRows,
  resumeExerciseId,
  nextExerciseId,
  weeklyPrimarySets,
  dashboardActivity,
  dashboardWeights,
} from "../src/workoutPresentation";
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
