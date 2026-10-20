import * as D from "./domain";
import { coachContextKey, validOutcome } from "./coaching";
import { recoveryTime } from "./readiness";
import { weekSessions } from "./workoutPresentation";

const working = (entry: D.Entry) =>
  entry.sets.filter((t) => t.kind === "working");
function straight(entry: D.Entry) {
  return (
    (!entry.technique || entry.technique === "straight") &&
    !entry.tempo &&
    !entry.superset &&
    !entry.sets.some(
      (t) =>
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  );
}
function knownContext(entry: D.Entry, session: D.Session, now: number) {
  const context = entry.coachingContext;
  return (
    straight(entry) &&
    context?.execution === "consistent" &&
    context.rest === "usual" &&
    context.recordedAt >= session.startedAt &&
    context.recordedAt <= now &&
    context.recordedAt <= session.startedAt + 2 * 86400000
  );
}
function confirmed(entry: D.Entry, session: D.Session, now: number) {
  const rows = working(entry);
  return (
    !!entry.target &&
    !!entry.plannedWorkingSets &&
    rows.length === entry.plannedWorkingSets &&
    rows.every(
      (t, i) =>
        t.done && t.effortReported === true && t.prescription?.ordinal === i,
    ) &&
    knownContext(entry, session, now)
  );
}
export function weeklyReview(
  state: D.State,
  exercises: D.Exercise[],
  monday: string,
  now = Date.now(),
) {
  const ordered = state.sessions
    .filter((s) => recoveryTime(s) <= now)
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
  const latest = new Map<string, { entry: D.Entry; session: D.Session }>();
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
            !knownContext(entry, session, now)
          )
            targets.unknown++;
          else if (row.weight !== p.weight) targets.changed++;
          else if (row.reps < p.reps || row.rir < p.rir - 1) targets.below++;
          else if (row.rir > p.rir + 1) targets.easier++;
          else targets.met++;
        }
      }
      if (!ex) continue;
      const stream = JSON.stringify([
          session.programId ?? null,
          session.workoutId ?? null,
          entry.sourceTargetId ?? null,
          entry.exerciseId,
        ]),
        prior = latest.get(stream),
        priorRows = prior ? working(prior.entry) : [];
      if (inWeek && rows.some((t) => t.done)) {
        if (
          prior &&
          prior.session.id !== session.id &&
          confirmed(entry, session, now) &&
          confirmed(prior.entry, prior.session, now) &&
          coachContextKey(session, entry, ex) ===
            coachContextKey(prior.session, prior.entry, ex) &&
          rows.every(
            (t, i) =>
              t.weight === priorRows[i]?.weight &&
              t.rir === priorRows[i]?.rir &&
              (["weight", "min", "max", "rir", "rest"] as const).every(
                (key) =>
                  t.prescription?.[key] === priorRows[i]?.prescription?.[key],
              ),
          )
        ) {
          comparisons.push({
            sessionId: session.id,
            entryId: entry.id,
            exerciseId: ex.id,
            name: ex.name,
            repDelta:
              rows.reduce((n, t) => n + t.reps, 0) -
              working(prior.entry).reduce((n, t) => n + t.reps, 0),
            previousDate: prior.session.date,
            date: session.date,
          });
        } else unavailable++;
      }
      // An unknown/changed intervening exposure breaks the comparison; never skip it.
      latest.set(stream, { entry, session });
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
          e.at <= now &&
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
      e.at <= now &&
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
  return { sessions, comparisons, targets, unfinished, unavailable, coaching };
}
