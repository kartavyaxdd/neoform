import * as D from "./domain";
import type { CoachingEvent } from "./coachingTypes";
const DAY = 86400000;
const working = (e: D.Entry) => e.sets.filter((t) => t.kind === "working");
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
export function precedingDoseIssue(
  session: D.Session,
  entry: D.Entry,
  asOf = Infinity,
) {
  for (const prior of session.exercises.slice(
    0,
    session.exercises.indexOf(entry),
  )) {
    if (prior.sets.length && prior.sets.every((t) => t.kind === "warmup"))
      continue;
    const rows = prior.sets.filter((t) => t.kind === "working"),
      c = prior.coachingContext;
    if (
      !prior.plannedWorkingSets ||
      rows.length !== prior.plannedWorkingSets ||
      prior.sets.some((t) => t.kind !== "warmup" && !t.done)
    )
      return "preceding working dose incomplete or unknown";
    if (
      c?.execution !== "consistent" ||
      c.rest !== "usual" ||
      c.recordedAt < session.startedAt ||
      c.recordedAt > session.startedAt + 2 * 86400000 ||
      c.recordedAt > asOf
    )
      return "preceding execution or rest unconfirmed/changed";
  }
  return null;
}
export function coachContextKey(
  session: D.Session,
  entry: D.Entry,
  ex: D.Exercise,
) {
  const prefix = session.exercises
    .slice(0, session.exercises.indexOf(entry))
    .map((e) => [
      e.exerciseId,
      e.plannedWorkingSets,
      e.target,
      e.setup,
      e.technique,
    ]);
  return canonical([
    session.programId ?? null,
    session.workoutId ?? null,
    entry.sourceTargetId ?? null,
    session.phase ?? null,
    D.comparableKey(entry, ex),
    entry.target,
    entry.plannedWorkingSets,
    prefix,
  ]);
}
export function eligible(e: D.Entry, at: number) {
  if (e.coachingContext?.skipReason === "pain")
    return "reported pain requires review";
  const sets = working(e);
  if (
    !e.target ||
    !e.plannedWorkingSets ||
    sets.length !== e.plannedWorkingSets ||
    sets.some((t) => !t.done)
  )
    return "planned dose incomplete or unknown";
  if (sets.some((t) => t.effortReported !== true))
    return "actual effort unconfirmed";
  if (sets.some((t, i) => !t.prescription || t.prescription.ordinal !== i))
    return "per-set prescription unknown";
  if (
    sets.some(
      (t) =>
        t.prescription!.weight !== t.weight ||
        t.prescription!.min !== e.target!.min ||
        t.prescription!.max !== e.target!.max ||
        t.prescription!.rir !== e.target!.rir ||
        t.prescription!.rest !== e.target!.rest,
    )
  )
    return "recorded loads or prescription context changed";
  if (
    e.sets.some(
      (t) =>
        t.done &&
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  )
    return "advanced or mixed bouts";
  if (e.technique && e.technique !== "straight") return "non-straight sequence";
  if (e.tempo || e.superset || e.techniqueGroup || e.repGoal)
    return "execution sequence differs";
  if (
    e.coachingContext?.execution !== "consistent" ||
    e.coachingContext.rest !== "usual"
  )
    return "execution or rest not confirmed as planned";
  if (
    e.coachingContext.recordedAt < at ||
    e.coachingContext.recordedAt > at + 2 * DAY
  )
    return "execution confirmation time does not describe this session";
  return null;
}
export function outcomeFingerprint(session: D.Session, proposalId: string) {
  return canonical({
    feedback: session.feedback,
    muscleFeedback: session.muscleFeedback,
    bodyweight: session.bodyweight,
    assignments: session.coachingAssignments,
    entries: session.exercises
      .filter((e) =>
        e.sets.some((t) => t.prescription?.proposalId === proposalId),
      )
      .map((e) => ({
        id: e.id,
        target: e.target,
        planned: e.plannedWorkingSets,
        context: e.coachingContext,
        sets: e.sets.map((t) => ({
          id: t.id,
          weight: t.weight,
          reps: t.reps,
          rir: t.rir,
          done: t.done,
          effortReported: t.effortReported,
          prescription: t.prescription,
        })),
      })),
  });
}
export function validOutcome(state: D.State, event: CoachingEvent) {
  const session = state.sessions.find((s) => s.id === event.sessionId);
  return (
    event.kind === "outcome" &&
    !!session &&
    event.sessionFingerprint === outcomeFingerprint(session, event.proposalId)
  );
}
