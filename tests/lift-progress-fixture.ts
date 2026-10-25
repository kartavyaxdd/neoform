import * as D from "../src/domain";
export function liftProgressFixture(now = Date.now(), boundary = false) {
  const state = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  w.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
  p.workouts = [w];
  state.programs = [p];
  state.sessions = (boundary ? [8, 9, 10, 11, 12] : [8, 9, 10]).map(
    (reps, i) => {
      const s = D.startSession(
        w.name,
        D.prepareWorkout(w, p, D.catalog, []),
        p,
        w,
      );
      s.startedAt = now - [9, 6, 3, 2, 1][i] * 86400000;
      s.date = new Date(s.startedAt).toISOString().slice(0, 10);
      s.duration = 3600;
      if (i === 3)
        s.exercises[0].setup = {
          label: "Other rack",
          execution: "New setup",
          availableLoads: [],
        };
      s.exercises[0].sets.forEach((t) => {
        t.done = true;
        t.reps = reps;
        t.rir = 2;
        t.effortReported = true;
      });
      s.exercises[0].coachingContext = {
        execution: "consistent",
        rest: "usual",
        recordedAt: s.startedAt + 3600000,
      };
      return s;
    },
  );
  return state;
}
