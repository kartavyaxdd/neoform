import * as D from "./domain";
export function previousWorkingRows(
  sessions: D.Session[],
  entry: D.Entry,
  exercise: D.Exercise,
) {
  const prior = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)
    .flatMap((s) => s.exercises)
    .find(
      (e) =>
        e.exerciseId === entry.exerciseId &&
        D.comparableKey(e, exercise) === D.comparableKey(entry, exercise) &&
        e.sets.some((t) => t.done && t.kind === "working"),
    );
  return prior?.sets.filter((t) => t.done && t.kind === "working") ?? [];
}
export function resumeExerciseId(session: D.Session) {
  return (
    session.exercises.find((e) =>
      e.sets.some((t) => t.kind !== "warmup" && !t.done),
    )?.id ?? session.exercises[0]?.id
  );
}
export function nextExerciseId(session: D.Session, current: string) {
  const i = session.exercises.findIndex((e) => e.id === current),
    entry = session.exercises[i];
  if (!entry || entry.sets.some((t) => t.kind !== "warmup" && !t.done))
    return current;
  return (
    session.exercises
      .slice(i + 1)
      .find((e) => e.sets.some((t) => t.kind !== "warmup" && !t.done))?.id ??
    current
  );
}
export function weekMonday(date = D.today()) {
  const day = new Date(date + "T12:00:00");
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return localDate(day);
}
export function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function weekSessions(sessions: D.Session[], monday: string) {
  const end = new Date(monday + "T12:00:00");
  end.setDate(end.getDate() + 7);
  const until = localDate(end);
  return sessions.filter((s) => s.date >= monday && s.date < until);
}
// UI totals count completed primary working sets, not inferred hard sets or growth.
export function weeklyPrimarySets(
  sessions: D.Session[],
  exercises: D.Exercise[],
  monday: string,
) {
  const counts = Object.fromEntries(D.muscles.map((m) => [m, 0])) as Record<
    D.Exercise["muscle"],
    number
  >;
  const index = new Map(exercises.map((e) => [e.id, e]));
  for (const s of weekSessions(sessions, monday))
    for (const e of s.exercises) {
      const x = index.get(e.exerciseId);
      if (x)
        counts[x.muscle] += e.sets.filter(
          (t) =>
            t.done &&
            t.kind === "working" &&
            (!t.bout || ["straight", "down"].includes(t.bout)),
        ).length;
    }
  return counts;
}
