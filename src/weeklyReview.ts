import * as D from "./domain";
import { liftSegments } from "./liftProgress";
import { weeklyMuscles, weeklyObservationWindow } from "./weeklyMuscles";
import { validOutcome } from "./coaching";
import { recoveryTime } from "./readiness";
import { weekSessions } from "./workoutPresentation";

const working = (entry: D.Entry) =>
  entry.sets.filter((t) => t.kind === "working");
function straight(entry: D.Entry) {
  return (
    (!entry.technique || entry.technique === "straight") &&
    !entry.tempo &&
    !entry.techniqueGroup &&
    !entry.repGoal &&
    !entry.superset &&
    !entry.sets.some(
      (t) =>
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  );
}
function knownContext(
  entry: D.Entry,
  session: D.Session,
  now: number,
  exercise?: D.Exercise,
) {
  const context = entry.coachingContext;
  return (
    straight(entry) &&
    !!session.phase &&
    session.feedback.pain !== true &&
    !session.muscleFeedback?.some(
      (m) =>
        m.pain === true &&
        [exercise?.muscle, ...(exercise?.secondary ?? [])].includes(m.muscle),
    ) &&
    context?.skipReason !== "pain" &&
    context?.execution === "consistent" &&
    context.rest === "usual" &&
    context.recordedAt >= session.startedAt &&
    context.recordedAt <= now &&
    context.recordedAt <= session.startedAt + 2 * 86400000
  );
}
export function weeklyReview(
  state: D.State,
  exercises: D.Exercise[],
  monday: string,
  now = Date.now(),
) {
  const window = weeklyObservationWindow(state, monday, now),
    cutoff = window.asOf;
  const ordered = window.history
    .slice()
    .sort(
      (a, b) => recoveryTime(a) - recoveryTime(b) || a.id.localeCompare(b.id),
    );
  const sessions = weekSessions(ordered, monday),
    weekIds = new Set(sessions.map((s) => s.id)),
    index = new Map(exercises.map((x) => [x.id, x]));
  const comparisons: {
    sessionId: string;
    entryId: string;
    exerciseId: string;
    name: string;
    repDelta: number;
    previousDate: string;
    date: string;
  }[] = [];
  const targets = { met: 0, below: 0, easier: 0, changed: 0, unknown: 0 };
  let unfinished = 0,
    unavailable = 0;
  for (const session of ordered)
    for (const entry of session.exercises) {
      const ex = index.get(entry.exerciseId),
        rows = working(entry),
        inWeek = weekIds.has(session.id);
      if (inWeek && straight(entry)) {
        if (
          entry.plannedWorkingSets != null &&
          rows.filter((t) => t.done).length < entry.plannedWorkingSets
        )
          unfinished++;
        for (const row of rows.filter((t) => t.done)) {
          const p = row.prescription;
          if (
            !p ||
            row.effortReported !== true ||
            !knownContext(entry, session, cutoff, ex)
          )
            targets.unknown++;
          else if (row.weight !== p.weight) targets.changed++;
          else if (row.reps < p.reps || row.rir < p.rir - 1) targets.below++;
          else if (row.rir > p.rir + 1) targets.easier++;
          else targets.met++;
        }
      }
      if (!ex) continue;
    }
  for (const exerciseId of new Set(
    sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)),
  )) {
    const ex = index.get(exerciseId);
    if (!ex) continue;
    const comparableIds = new Set<string>();
    for (const segment of liftSegments(
      { ...state, sessions: window.history, draft: null },
      exerciseId,
      cutoff,
    ))
      for (let i = 1; i < segment.exposures.length; i++) {
        const previous = segment.exposures[i - 1],
          current = segment.exposures[i];
        if (
          !weekIds.has(current.sessionId) ||
          !previous.comparable ||
          !current.comparable ||
          current.rows.length !== previous.rows.length
        )
          continue;
        if (
          !current.rows.every((t, n) => {
            const p = previous.rows[n];
            return (
              t.rir !== null &&
              t.rir === p.rir &&
              t.weight === p.weight &&
              t.prescription &&
              p.prescription &&
              t.weight === t.prescription.weight &&
              p.weight === p.prescription.weight &&
              (["weight", "min", "max", "rir", "rest"] as const).every(
                (key) => t.prescription![key] === p.prescription![key],
              )
            );
          })
        )
          continue;
        comparisons.push({
          sessionId: current.sessionId,
          entryId: current.entryId,
          exerciseId,
          name: ex.name,
          repDelta:
            current.rows.reduce((n, t) => n + t.reps, 0) -
            previous.rows.reduce((n, t) => n + t.reps, 0),
          previousDate: previous.date,
          date: current.date,
        });
        comparableIds.add(current.sessionId + current.entryId);
      }
    unavailable += sessions.reduce(
      (n, s) =>
        n +
        s.exercises.filter(
          (e) =>
            e.exerciseId === exerciseId &&
            e.sets.some((t) => t.done && t.kind !== "warmup") &&
            !comparableIds.has(s.id + e.id),
        ).length,
      0,
    );
  }
  const coaching = {
    met: 0,
    "too-demanding": 0,
    easier: 0,
    changed: 0,
    unknown: 0,
    recheck: 0,
  };
  const accepted = new Set(
    (state.coachingEvents ?? [])
      .filter(
        (e) =>
          e.kind === "decision" &&
          e.at <= cutoff &&
          ["accept", "edit"].includes(e.choice ?? ""),
      )
      .map((e) => e.proposalId),
  );
  const outcomes = new Map<
    string,
    NonNullable<D.State["coachingEvents"]>[number]
  >();
  for (const e of state.coachingEvents ?? [])
    if (
      e.kind === "outcome" &&
      e.at <= cutoff &&
      e.sessionId &&
      weekIds.has(e.sessionId) &&
      accepted.has(e.proposalId)
    ) {
      const key = JSON.stringify([e.proposalId, e.sessionId]),
        previous = outcomes.get(key);
      if (!previous || previous.at <= e.at) outcomes.set(key, e);
    }
  const sessionIndex = new Map(sessions.map((s) => [s.id, s]));
  for (const e of outcomes.values()) {
    if (
      !validOutcome(
        { ...state, sessions: [sessionIndex.get(e.sessionId!)!] },
        e,
      )
    )
      coaching.recheck++;
    else if (e.outcome) coaching[e.outcome]++;
  }
  return {
    sessions,
    comparisons,
    targets,
    unfinished,
    unavailable,
    coaching,
    muscle: weeklyMuscles(state, exercises, monday, comparisons, now, window),
  };
}
