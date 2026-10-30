import * as D from "./domain";
import { canonical } from "./coaching";
import { recoveryTime } from "./readiness";

export const substitutionFingerprint = (session: D.Session) =>
  canonical(session);
// A manual substitution is not a recovery clearance. Bind acknowledgement to
// the selected movement and actual reports, so a later concern needs review.
export function substitutionRecoveryWarning(
  state: D.State,
  session: D.Session,
  entry: D.Entry,
  alternative: D.Exercise,
  now = Date.now(),
) {
  const exercises = [...D.catalog, ...state.customExercises];
  const concerns = [alternative.muscle, ...alternative.secondary].flatMap(
    (muscle) => {
      const status = D.recoveryStatus(
        muscle,
        state.sessions,
        exercises,
        now,
        session.readiness,
      );
      return status.blocked ? status.evidence : [];
    },
  );
  if (
    entry.coachingContext?.skipReason === "pain" ||
    session.feedback.pain === true ||
    session.muscleFeedback?.some(
      (m) =>
        [alternative.muscle, ...alternative.secondary].includes(m.muscle) &&
        m.pain === true,
    )
  )
    concerns.push("This workout includes an applicable pain report.");
  if (!concerns.length) return null;
  return {
    concerns: [...new Set(concerns)],
    basis: canonical([
      session.id,
      entry.id,
      alternative.id,
      entry.coachingContext,
      session.readiness,
      session.feedback,
      session.muscleFeedback,
      state.sessions.map((s) => [
        s.id,
        s.date,
        s.startedAt,
        s.duration,
        s.readiness,
        s.feedback,
        s.muscleFeedback,
      ]),
    ]),
  };
}
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
    reviewedRecovery?: string;
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
  const warning = substitutionRecoveryWarning(
    state,
    session,
    entry,
    option.exercise,
    now,
  );
  if (warning && input.reviewedRecovery !== warning.basis)
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
    `Substituted for ${original.name}. ${reason}. This workout only; establish a separate load reference.${warning ? " Manual choice after recovery-warning review; the warning is not cleared." : ""}`.slice(
      0,
      2000,
    );
  if (entry.coachingContext?.skipReason === "pain")
    replacement.coachingContext = {
      execution: "unknown",
      rest: "unknown",
      recordedAt: now,
      skipReason: "pain",
    };
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
