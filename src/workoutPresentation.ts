import * as D from "./domain";
export function sessionSetProgress(session: D.Session) {
  const rows = session.exercises.flatMap((entry) => entry.sets);
  return {
    completed: rows.filter((set) => set.done).length,
    total: rows.length,
  };
}
export function changeSimpleSetType(
  entry: D.Entry,
  id: string,
  kind: D.SetLog["kind"],
) {
  if (
    (entry.technique && entry.technique !== "straight") ||
    entry.techniqueGroup ||
    entry.superset ||
    entry.sets.some((s) => s.bout && s.bout !== "straight")
  )
    throw Error("Use the advanced editor for linked or advanced sequences.");
  return {
    ...entry,
    sets: entry.sets.map((set) => (set.id === id ? { ...set, kind } : set)),
  };
}
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
          (t) => t.done && t.kind === "working" && !D.advancedVolumeBout(e, t),
        ).length;
    }
  return counts;
}

export type DashboardScope = "all" | "program";
export function programSchedule(
  program: D.Program,
): ({ kind: "workout"; workout: D.Workout } | { kind: "rest"; day: string })[] {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const assigned = program.workouts.map((w) =>
    days.findIndex((day) => day.toLowerCase() === w.day.trim().toLowerCase()),
  );
  if (assigned.some((i) => i < 0) || new Set(assigned).size !== assigned.length)
    return program.workouts.map((workout) => ({ kind: "workout", workout }));
  return days.map((day, i) => {
    const index = assigned.indexOf(i);
    return index < 0
      ? { kind: "rest", day }
      : { kind: "workout", workout: program.workouts[index] };
  });
}
// Presentation of the existing phase recipe; these cards do not assign a new
// program week or predict future loads. Reviewed row reps follow prepareWorkout.
export function programPrescriptionRows(
  target: D.Target,
  program: D.Program,
  week: number,
  experience?: D.Experience,
) {
  const p = { ...program, currentWeek: week },
    phase = D.programPhase(p);
  if (phase === "active-rest") return [];
  const t = D.phaseTarget(target, p, experience);
  return Array.from({ length: t.sets }, (_, ordinal) => ({
    ordinal,
    min: t.min,
    max: t.max,
    rir: t.rir,
    kind: t.kind,
    reps:
      phase === "accumulation"
        ? (target.nextRows?.[ordinal]?.reps ?? t.min)
        : t.min,
    assignedReps:
      phase === "accumulation" && target.nextRows?.[ordinal] !== undefined,
  }));
}

export function plannedMuscleCards(
  entries: D.Entry[],
  exercises: D.Exercise[],
) {
  const index = new Map(exercises.map((x) => [x.id, x]));
  const cards = new Map<
    D.Exercise["muscle"],
    {
      muscle: D.Exercise["muscle"];
      exercises: number;
      sets: number;
      advancedRows: number;
    }
  >();
  for (const e of entries) {
    const x = index.get(e.exerciseId),
      rows = e.sets.filter((t) => t.kind !== "warmup");
    if (!x || !rows.length) continue;
    const card = cards.get(x.muscle) ?? {
      muscle: x.muscle,
      exercises: 0,
      sets: 0,
      advancedRows: 0,
    };
    card.exercises++;
    for (const row of rows) {
      if (
        ["myoreps", "drop-set", "giant-set"].includes(e.technique ?? "") ||
        row.kind === "drop" ||
        (row.bout && !["straight", "down"].includes(row.bout))
      )
        card.advancedRows++;
      else card.sets++;
    }
    cards.set(x.muscle, card);
  }
  return [...cards.values()];
}
// Descriptive activity only. Planned totals are one cycle of the active
// program's current phase, not a new dose recommendation or a growth score.
export function dashboardActivity(
  state: D.State,
  exercises: D.Exercise[],
  monday: string,
  scope: DashboardScope,
) {
  const program = state.programs.find((p) => !p.archived);
  const index = new Map(exercises.map((x) => [x.id, x]));
  const sessions = weekSessions(state.sessions, monday).filter(
    (s) => scope === "all" || (program && s.programId === program.id),
  );
  const muscles = new Set<string>(),
    ids = new Set<string>();
  let sets = 0;
  for (const s of sessions)
    for (const e of s.exercises) {
      const n = e.sets.filter(
        (t) =>
          t.done &&
          t.kind === "working" &&
          (!t.bout || ["straight", "down"].includes(t.bout)),
      ).length;
      if (n) {
        sets += n;
        ids.add(e.exerciseId);
        const x = index.get(e.exerciseId);
        if (x) muscles.add(x.muscle);
      }
    }
  const plannedMuscles = new Set<string>(),
    plannedIds = new Set<string>();
  let plannedSets = 0;
  if (program && D.programPhase(program) !== "active-rest")
    for (const w of program.workouts)
      for (const target of w.exercises) {
        const x = index.get(target.exerciseId);
        if (
          !x ||
          target.kind !== "working" ||
          ["myoreps", "drop-set", "giant-set"].includes(target.technique ?? "")
        )
          continue;
        plannedSets += D.phaseTarget(
          target,
          program,
          state.profile?.experience,
        ).sets;
        plannedMuscles.add(x.muscle);
        plannedIds.add(x.id);
      }
  return {
    completed: { muscles: muscles.size, sets, exercises: ids.size },
    planned: program
      ? {
          muscles: plannedMuscles.size,
          sets: plannedSets,
          exercises: plannedIds.size,
        }
      : null,
    program,
  };
}

export function dashboardWeights(state: D.State, today = D.today()) {
  const start = new Date(today + "T00:00:00");
  start.setDate(start.getDate() - 6);
  const end = new Date(today + "T00:00:00");
  end.setDate(end.getDate() + 1);
  const byDay = new Map<string, { kg: number; at: number; date: string }>();
  const reports = [
    state.coaching?.bodyweight,
    ...state.sessions.map((s) => s.bodyweight),
  ];
  for (const r of reports) {
    if (!r || r.at < start.getTime() || r.at >= end.getTime()) continue;
    const date = localDate(new Date(r.at)),
      old = byDay.get(date);
    if (!old || old.at < r.at) byDay.set(date, { ...r, date });
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at);
}
