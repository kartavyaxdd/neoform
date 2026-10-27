import * as D from "./domain";
import { canonical } from "./coaching";
import { recoveryTime } from "./readiness";

export const substitutionFingerprint = (session: D.Session) =>
  canonical(session);
export const defaultSwapEquipment = (state: D.State, entry?: D.Entry) => {
  const current =
    entry &&
    (entry.equipment ??
      [...D.catalog, ...state.customExercises].find(
        (e) => e.id === entry.exerciseId,
      )?.equipment);
  return [
    ...new Set([
      ...(state.profile?.equipment.length
        ? state.profile.equipment
        : D.equipment),
      ...(current ? [current] : []),
    ]),
  ];
};
export function substitutionOptions(
  state: D.State,
  entry: D.Entry,
  available: D.Exercise["equipment"][],
  now = Date.now(),
  scope: "similar" | "all" = "similar",
) {
  const exercises = [...D.catalog, ...state.customExercises];
  const original = exercises.find((x) => x.id === entry.exerciseId);
  return exercises
    .filter(
      (x) =>
        original &&
        x.id !== original.id &&
        (scope === "all" ||
          (x.muscle === original.muscle && x.pattern === original.pattern)) &&
        available.includes(x.equipment),
    )
    .map((exercise) => {
      const reference = [...state.sessions]
        .filter((s) => recoveryTime(s) <= now)
        .sort((a, b) => recoveryTime(b) - recoveryTime(a))
        .flatMap((s) =>
          s.exercises
            .filter(
              (e) =>
                e.exerciseId === exercise.id &&
                e.convention === exercise.convention &&
                e.sets.some((t) => t.done && t.kind === "working"),
            )
            .map((entry) => ({ session: s, entry })),
        )
        .at(0);
      return { exercise, reference };
    })
    .sort(
      (a, b) =>
        Number(!!b.reference) - Number(!!a.reference) ||
        a.exercise.name.localeCompare(b.exercise.name),
    );
}
export function substituteExercise(
  state: D.State,
  input: {
    fingerprint: string;
    entryId: string;
    exerciseId: string;
    available: D.Exercise["equipment"][];
    reason: "busy" | "unavailable" | "preference";
    scope?: "similar" | "all";
  },
  now = Date.now(),
) {
  const session = state.draft;
  if (!session || substitutionFingerprint(session) !== input.fingerprint)
    throw Error("Workout changed. Reopen the substitution preview.");
  const entry = session.exercises.find((e) => e.id === input.entryId);
  const option =
    entry &&
    substitutionOptions(state, entry, input.available, now, input.scope).find(
      (x) => x.exercise.id === input.exerciseId,
    );
  if (!entry || !option)
    throw Error(
      "Choose an available alternative with the same primary muscle and movement pattern.",
    );
  if (
    (entry.technique && entry.technique !== "straight") ||
    entry.protocol ||
    entry.tempo ||
    entry.superset ||
    entry.techniqueGroup ||
    entry.sets.some(
      (t) =>
        (t.kind !== "working" && t.kind !== "warmup") ||
        (t.bout && t.bout !== "straight"),
    )
  )
    throw Error(
      "Edit advanced or linked sequences together instead of using a quick substitution.",
    );
  const exercises = [...D.catalog, ...state.customExercises];
  if (
    entry.coachingContext?.skipReason === "pain" ||
    [option.exercise.muscle, ...option.exercise.secondary].some(
      (muscle) =>
        D.recoveryStatus(
          muscle,
          state.sessions,
          exercises,
          now,
          session.readiness,
        ).blocked,
    )
  )
    throw Error(
      "Review reported recovery concerns first. A substitution does not establish pain-free training.",
    );
  const remaining = entry.sets.filter((t) => t.kind === "working" && !t.done);
  if (!remaining.length)
    throw Error("This exercise has no unfinished working sets.");
  const completed = entry.sets.filter((t) => t.done);
  if (completed.length && session.exercises.length >= 40)
    throw Error("The workout has reached its exercise limit.");
  const original = exercises.find((x) => x.id === entry.exerciseId)!;
  const replacement = D.createEntry(option.exercise, {
    ...D.target(option.exercise.id),
    ...entry.target,
    sets: remaining.length,
  });
  replacement.sourceTargetId = entry.sourceTargetId;
  if (!completed.length) replacement.id = entry.id;
  const reason = {
    busy: "Equipment busy",
    unavailable: "Equipment unavailable",
    preference: "Personal preference",
  }[input.reason];
  replacement.notes =
    `Substituted for ${original.name}. ${reason}. This workout only; establish a separate load reference.`.slice(
      0,
      2000,
    );
  const retained = {
    ...entry,
    sets: completed,
    coachingContext: {
      execution: "unknown" as const,
      rest: "unknown" as const,
      recordedAt: now,
      ...entry.coachingContext,
      skipReason:
        input.reason === "preference"
          ? ("other" as const)
          : ("equipment" as const),
    },
  };
  const next = {
    ...state,
    draft: {
      ...session,
      exercises: session.exercises.flatMap((e) =>
        e.id !== entry.id
          ? [e]
          : completed.length
            ? [retained, replacement]
            : [replacement],
      ),
    },
  };
  return { state: D.historyStateSchema.parse(next), entryId: replacement.id };
}
export function substitutePreview(
  state: D.State,
  session: D.Session,
  input: Parameters<typeof substituteExercise>[1],
  now = Date.now(),
) {
  if (state.draft)
    throw Error(
      "Resume the active workout before changing another workout preview.",
    );
  const result = substituteExercise({ ...state, draft: session }, input, now);
  return { session: result.state.draft!, entryId: result.entryId };
}
