import * as D from "./domain";
import { canonical, coachContextKey } from "./coachingEvidence";
import { recoveryTime } from "./readiness";
import { exerciseGroups } from "./workoutActions";

export type WorkoutEstimate = {
  low: number;
  point: number;
  high: number;
  sources: string[];
  basis: string;
};
function plannedMinutes(entries: D.Entry[]) {
  let rest = 0,
    finalRest = 0,
    lowWork = 0,
    work = 0,
    highWork = 0;
  for (const e of entries) {
    const cadence = e.tempo
      ? e.tempo.eccentric + e.tempo.pause + e.tempo.concentric || 3
      : 3;
    let lo = 0,
      mid = 0,
      hi = 0;
    for (const t of e.sets) {
      const p = t.prescription,
        reps = p?.reps ?? t.reps;
      lo += (p?.min ?? reps) * cadence;
      mid += reps * cadence;
      hi += (p?.max ?? e.target?.max ?? reps) * cadence;
      finalRest = t.rest ?? p?.rest ?? e.target?.rest ?? 120;
      rest += finalRest;
    }
    if (e.repGoal) {
      lo = Math.max(lo, e.repGoal * cadence);
      mid = Math.max(mid, e.repGoal * cadence);
      hi = Math.max(hi, e.repGoal * cadence);
    }
    lowWork += lo;
    work += mid;
    highWork += hi;
  }
  // Keep assigned rests, including between exercises. Changeovers and general
  // warmup are additional assumptions; the final bout needs no following rest.
  rest = Math.max(0, rest - finalRest);
  const changes = Math.max(0, entries.length - 1);
  return {
    low: 5 + changes * 1.5 + (lowWork + rest) / 60,
    point: 5 + changes * 1.5 + (work + rest) / 60,
    high: 7 + changes * 2 + (highWork + rest * 1.25) / 60,
  };
}
function timingReference(state: D.State, original: D.Session, now: number) {
  const exercises = [...D.catalog, ...state.customExercises];
  const dose = (e: D.Entry) =>
    canonical(
      e.sets.map((t) => [
        t.kind,
        t.bout ?? null,
        t.rest ?? null,
        t.prescription
          ? [
              t.prescription.weight,
              t.prescription.reps,
              t.prescription.min,
              t.prescription.max,
              t.prescription.rir,
              t.prescription.rest,
            ]
          : [t.weight, t.reps],
      ]),
    );
  const keys = original.exercises.map((e) => {
    const x = exercises.find((x) => x.id === e.exerciseId);
    return x ? coachContextKey(original, e, x) : null;
  });
  const theoretical = plannedMinutes(original.exercises).point;
  const rows = state.sessions
    .filter(
      (s) =>
        s.id !== original.id &&
        !!s.phase &&
        !!original.phase &&
        s.startedAt <= now &&
        recoveryTime(s) <= now &&
        now - recoveryTime(s) <= 56 * 86400000 &&
        s.duration > 0 &&
        s.duration <= 14400 &&
        s.exercises.length === keys.length &&
        s.exercises.every((e, i) => {
          const x = exercises.find((x) => x.id === e.exerciseId),
            working = e.sets.filter((t) => t.kind === "working"),
            c = e.coachingContext;
          return (
            x &&
            coachContextKey(s, e, x) === keys[i] &&
            dose(e) === dose(original.exercises[i]) &&
            e.plannedWorkingSets &&
            working.length === e.plannedWorkingSets &&
            e.sets.every((t) => t.done) &&
            c?.execution === "consistent" &&
            !c.skipReason &&
            c.rest === "usual" &&
            c.recordedAt >= s.startedAt &&
            c.recordedAt <= s.startedAt + 2 * 86400000 &&
            c.recordedAt <= now
          );
        }),
    )
    .sort((a, b) => recoveryTime(a) - recoveryTime(b))
    .slice(-5)
    .filter(
      (s) =>
        s.duration / 60 / theoretical >= 0.5 &&
        s.duration / 60 / theoretical <= 2,
    );
  if (rows.length < 3) return { scale: 1, sources: [] as D.Session[] };
  const ratios = rows
    .map((s) => s.duration / 60 / theoretical)
    .sort((a, b) => a - b);
  const middle = Math.floor(ratios.length / 2),
    median =
      ratios.length % 2
        ? ratios[middle]
        : (ratios[middle - 1] + ratios[middle]) / 2;
  return { scale: Math.max(1, median), sources: rows };
}
function estimateWith(
  entries: D.Entry[],
  reference: ReturnType<typeof timingReference>,
): WorkoutEstimate {
  const t = plannedMinutes(entries);
  return {
    low: Math.ceil(t.low * reference.scale),
    point: Math.ceil(t.point * reference.scale),
    high: Math.ceil(t.high * reference.scale),
    sources: reference.sources.map((s) => s.id),
    basis: canonical([
      entries,
      reference.sources.map((s) => [s.id, s.duration, s.exercises]),
    ]),
  };
}
export function estimateWorkout(
  state: D.State,
  session: D.Session,
  now = Date.now(),
): WorkoutEstimate {
  return estimateWith(session.exercises, timingReference(state, session, now));
}
export function shorterAlternative(
  state: D.State,
  original: D.Session,
  budget: 30 | 45 | 60,
  now = Date.now(),
) {
  if (original.exercises.some((e) => e.sets.some((t) => t.done)))
    throw Error("Choose a shorter plan before logging any sets.");
  if (![30, 45, 60].includes(budget))
    throw Error("Choose a reviewed 30, 45 or 60 minute budget.");
  const groups = exerciseGroups(original),
    reference = timingReference(state, original, now);
  if (!groups.length)
    throw Error("Add an exercise before reviewing a shorter plan.");
  let kept = groups.length,
    entries = original.exercises,
    estimate = estimateWith(entries, reference);
  while (estimate.high > budget && kept > 1) {
    kept--;
    const ids = new Set(
      groups
        .slice(0, kept)
        .flat()
        .map((e) => e.id),
    );
    entries = original.exercises.filter((e) => ids.has(e.id));
    estimate = estimateWith(entries, reference);
  }
  return {
    budget,
    feasible: estimate.high <= budget,
    estimate,
    originalEntries: structuredClone(original.exercises),
    session: { ...original, exercises: structuredClone(entries) },
    omitted: original.exercises
      .filter((e) => !entries.some((v) => v.id === e.id))
      .map((e) => e.id),
  };
}
