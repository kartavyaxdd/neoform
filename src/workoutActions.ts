import * as D from "./domain";
export function exerciseGroups(session: D.Session) {
  const groups: D.Entry[][] = [];
  for (const e of session.exercises) {
    const key = e.techniqueGroup || e.superset;
    const existing = key
      ? groups.find((g) => (g[0].techniqueGroup || g[0].superset) === key)
      : undefined;
    if (existing) existing.push(e);
    else groups.push([e]);
  }
  return groups;
}
export function moveGroup(s: D.Session, from: string, to: string) {
  const groups = exerciseGroups(s),
    a = groups.findIndex((g) => g.some((e) => e.id === from)),
    b = groups.findIndex((g) => g.some((e) => e.id === to));
  if (a < 0 || b < 0 || a === b) return s;
  const [group] = groups.splice(a, 1);
  groups.splice(b, 0, group);
  return { ...s, exercises: groups.flat() };
}
export type Removal = {
  sessionId: string;
  entryId?: string;
  rows: (D.Entry | D.SetLog)[];
  before?: string;
  after?: string;
};
export function removeEntry(s: D.Session, id: string) {
  const group = exerciseGroups(s).find((g) => g.some((e) => e.id === id));
  if (!group) throw Error("Exercise changed.");
  const ids = new Set(group.map((e) => e.id)),
    index = s.exercises.findIndex((e) => ids.has(e.id));
  return {
    session: { ...s, exercises: s.exercises.filter((e) => !ids.has(e.id)) },
    undo: {
      sessionId: s.id,
      rows: structuredClone(group),
      before: s.exercises[index - 1]?.id,
      after: s.exercises.find((e, i) => i > index && !ids.has(e.id))?.id,
    } satisfies Removal,
  };
}
export function removeSet(s: D.Session, entryId: string, id: string) {
  const e = s.exercises.find((e) => e.id === entryId),
    index = e?.sets.findIndex((t) => t.id === id) ?? -1;
  if (!e || index < 0) throw Error("Set changed.");
  if (
    (e.technique && e.technique !== "straight") ||
    e.techniqueGroup ||
    e.superset ||
    (e.sets[index].bout && e.sets[index].bout !== "straight")
  )
    throw Error("Edit advanced sequences together.");
  return {
    session: {
      ...s,
      exercises: s.exercises.map((x) =>
        x.id === entryId
          ? { ...x, sets: x.sets.filter((t) => t.id !== id) }
          : x,
      ),
    },
    undo: {
      sessionId: s.id,
      entryId,
      rows: structuredClone([e.sets[index]]),
      before: e.sets[index - 1]?.id,
      after: e.sets[index + 1]?.id,
    } satisfies Removal,
  };
}
function insert<T extends { id: string }>(
  items: T[],
  rows: T[],
  undo: Removal,
) {
  if (rows.some((r) => items.some((x) => x.id === r.id)))
    throw Error("This removal was already restored.");
  let index = undo.after ? items.findIndex((x) => x.id === undo.after) : -1;
  if (index < 0)
    index = undo.before ? items.findIndex((x) => x.id === undo.before) + 1 : 0;
  if (index < 0) index = items.length;
  return [
    ...items.slice(0, index),
    ...structuredClone(rows),
    ...items.slice(index),
  ];
}
export function restoreRemoval(s: D.Session, undo: Removal) {
  if (s.id !== undo.sessionId)
    throw Error("Workout changed. Cannot restore another draft.");
  if (!undo.entryId)
    return {
      ...s,
      exercises: insert(s.exercises, undo.rows as D.Entry[], undo),
    };
  if (!s.exercises.some((e) => e.id === undo.entryId))
    throw Error("Exercise was removed.");
  return {
    ...s,
    exercises: s.exercises.map((e) =>
      e.id === undo.entryId
        ? { ...e, sets: insert(e.sets, undo.rows as D.SetLog[], undo) }
        : e,
    ),
  };
}
export function saveSessionOrder(state: D.State, session: D.Session) {
  const next = structuredClone(state),
    program = next.programs.find(
      (p) => p.id === session.programId && !p.archived,
    ),
    workout = program?.workouts.find((w) => w.id === session.workoutId);
  if (!workout) throw Error("The saved workout is unavailable.");
  const ids = session.exercises.map((e) => e.sourceTargetId);
  if (
    ids.length !== workout.exercises.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !workout.exercises.some((t) => t.id === id))
  )
    throw Error(
      "Save order only when the session contains every original program target exactly once.",
    );
  workout.exercises = ids.map((id) =>
    workout.exercises.find((t) => t.id === id)!,
  );
  return next;
}
