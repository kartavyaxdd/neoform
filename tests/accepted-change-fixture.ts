import * as D from "../src/domain";
import {
  applyCoaching,
  evaluateCoaching,
  classifyCoachingOutcomes,
} from "../src/coaching";
import { syntheticReadiness } from "./readiness-fixture";

// Synthetic ledger, deliberately unrelated to any installed account or history.
export function acceptedChangeFixture(
  now = Date.now(),
  results = ["met", "met"],
  action: "reps" | "load" | "add-volume" = "reps",
) {
  const day = 86400000,
    acceptedAt = now - 10 * day;
  let state = D.emptyState();
  const program = D.starterProgram("balanced"),
    workout = program.workouts[0];
  workout.name = "Response QA";
  workout.exercises = [{ ...D.target("bench"), startingLoad: 50 }];
  program.workouts = [workout];
  if (action !== "reps") {
    workout.exercises[0].setup = {
      label: "QA rack",
      execution: "Usual ROM",
      availableLoads: action === "load" ? [50, 51, 55] : [50, 60],
    };
  }
  if (action === "add-volume") {
    state.coaching = {
      enabled: true,
      minutes: 75,
      diet: "gain",
      earlyTrials: true,
      priorities: ["Chest"],
    };
    program.workouts.push(
      ...[1, 2, 3].map((i) => ({
        ...structuredClone(workout),
        id: `other-${i}`,
      })),
    );
  }
  state.programs = [program];
  const make = (at: number) => {
    const p = state.programs[0],
      w = p.workouts[0];
    const s = D.startSession(
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
  const count = action === "add-volume" ? 4 : action === "load" ? 2 : 1;
  for (let n = 0; n < count; n++) {
    const baseline = make(
      acceptedAt - (count - n) * (action === "add-volume" ? 7 : 3) * day,
    );
    baseline.duration = 3600;
    baseline.exercises[0].sets.forEach((t, i) =>
      Object.assign(t, {
        weight: 50,
        prescription: { ...t.prescription!, weight: 50 },
        reps: action === "reps" ? [10, 9, 8][i] : 12,
        done: true,
        effortReported: true,
        rir: action === "add-volume" ? 3 : 2,
      }),
    );
    baseline.exercises[0].coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: baseline.startedAt + 3600000,
    };
    state.sessions = [...state.sessions, baseline];
  }
  const preview = make(acceptedAt);
  const proposal = evaluateCoaching(state, preview, acceptedAt).find(
    (p) => p.action === action,
  );
  if (!proposal) throw Error(`Missing synthetic ${action} proposal.`);
  state = applyCoaching(
    state,
    preview,
    [{ proposal, choice: "accept", scope: "program" }],
    acceptedAt,
  );
  for (const [i, result] of results.entries()) {
    const s = make(acceptedAt + (i + 1) * 3 * day),
      e = s.exercises[0];
    s.duration = 3600;
    e.coachingContext = {
      execution: "consistent",
      rest: "usual",
      recordedAt: s.startedAt + 3600000,
    };
    e.sets.forEach((t, n) =>
      Object.assign(t, {
        done: true,
        effortReported: result !== "unknown",
        rir: 2,
        reps: t.reps - (result === "miss" && n === 2 ? 1 : 0),
      }),
    );
    state.coachingEvents!.push(
      ...classifyCoachingOutcomes(state, s, s.startedAt + 3600000),
    );
    state.sessions = [...state.sessions, s];
  }
  return { state, proposal, upcoming: make(now), now, acceptedAt };
}
