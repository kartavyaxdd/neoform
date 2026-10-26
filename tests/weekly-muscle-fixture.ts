import * as D from "../src/domain";
import { localDate, weekMonday } from "../src/workoutPresentation";
export function weeklyBrowserFixture(
  now = Date.parse("2026-10-26T12:00:00+05:30"),
) {
  const state = D.emptyState();
  state.profile = {
    name: "Synthetic weekly review",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 4,
  };
  const program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  program.workouts = [workout];
  workout.name = "Weekly QA";
  workout.exercises = ["row", "bench"].map((id) => ({
    ...D.target(id),
    startingLoad: 50,
  }));
  state.programs = [program];
  const monday = weekMonday(localDate(new Date(now))),
    oldAt = new Date(monday + "T10:00:00").getTime() - 86400000;
  state.sessions = [oldAt, now - 3600000].map((at, i) => {
    const s = D.startSession(
      workout.name,
      D.prepareWorkout(workout, program, D.catalog, []),
      program,
      workout,
    );
    s.startedAt = at;
    s.date = localDate(new Date(at));
    s.duration = 600;
    s.exercises.forEach((e) => {
      e.sets.forEach((t) =>
        Object.assign(t, { done: true, effortReported: true, reps: i ? 9 : 8 }),
      );
      e.coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: at + 600000,
      };
    });
    if (i) {
      s.exercises[1].sets[0].effortReported = false;
      s.exercises[1].sets[2].done = false;
      s.muscleFeedback = [
        {
          muscle: "Chest",
          recovered: "yes",
          pain: false,
          soreness: 1,
          recordedAt: at + 600000,
        },
      ];
    }
    return D.completeSession(s);
  });
  return state;
}
