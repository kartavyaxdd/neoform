import * as D from "./domain";
import {
  applyCoaching,
  canonical,
  evidenceFor,
  type CoachingChoice,
} from "./coaching";
import { recoveryTime } from "./readiness";
const DAY = 86400000;
export function applyProgramReview(
  state: D.State,
  session: D.Session,
  choices: CoachingChoice[],
  now = Date.now(),
) {
  if (state.draft)
    throw Error("Finish your active workout before changing future targets.");
  if (!state.programs.some((p) => p.id === session.programId && !p.archived))
    throw Error("Open a current active program review.");
  for (const choice of choices) {
    const entry = session.exercises.find(
      (e) => e.id === choice.proposal.entryId,
    );
    if (!entry || choice.scope !== "program")
      throw Error("Program review requires explicit future-program scope.");
    if (pendingProgramTarget(state, session, entry, now))
      throw Error(
        "Assess approved targets after a confirmed workout before another program change.",
      );
  }
  return applyCoaching(state, session, choices, now);
}
export function pendingProgramTarget(
  state: D.State,
  session: D.Session,
  entry: D.Entry,
  now = Date.now(),
) {
  const target = state.programs
    .find((p) => p.id === session.programId)
    ?.workouts.find((w) => w.id === session.workoutId)
    ?.exercises.find((t) => t.id === entry.sourceTargetId);
  const decision = (state.coachingEvents ?? []).find(
    (e) =>
      e.proposalId === target?.coachingProposalId &&
      e.kind === "decision" &&
      ["accept", "edit"].includes(e.choice ?? ""),
  );
  const exercise = [...D.catalog, ...state.customExercises].find(
    (x) => x.id === entry.exerciseId,
  );
  return !!(
    decision &&
    exercise &&
    decision.at <= now &&
    !evidenceFor(state, session, entry, exercise, now).valid.some(
      (r) =>
        r.session.startedAt > decision.at &&
        r.entry.sets
          .filter((t) => t.kind === "working")
          .every((t) => t.prescription?.proposalId === decision.proposalId),
    )
  );
}
export function reviewProgram(
  state: D.State,
  programId: string,
  now = Date.now(),
) {
  const program = state.programs.find((p) => p.id === programId),
    exercises = [...D.catalog, ...state.customExercises];
  if (!program) return [];
  return program.workouts.flatMap((workout) => {
    const session = D.startSession(
      workout.name,
      D.prepareWorkout(
        workout,
        program,
        exercises,
        state.sessions,
        state.profile?.experience,
      ),
      program,
      workout,
    );
    return session.exercises.flatMap((entry) => {
      const exercise = exercises.find((x) => x.id === entry.exerciseId);
      if (!exercise) return [];
      const evidence = evidenceFor(state, session, entry, exercise, now),
        recent = evidence.valid.slice(-3);
      let status: "keep" | "review" | "context" | "recovery" | "pending" =
          "context",
        reason =
          "Gather three recent comparable workouts with complete working sets, prescriptions, reported effort and confirmed execution/rest.";
      const recovery = D.recoveryStatus(
        exercise.muscle,
        state.sessions,
        exercises,
        now,
        state.draft?.readiness,
      );
      if (recovery.blocked) {
        status = "recovery";
        reason = recovery.evidence[0];
      } else if (pendingProgramTarget(state, session, entry, now)) {
        status = "pending";
        reason = "Assess approved targets after a confirmed workout.";
      } else if (
        session.phase === "accumulation" &&
        evidence.latestEligible &&
        recent.length === 3 &&
        now - recoveryTime(recent[2].session) <= 21 * DAY
      ) {
        const rows = recent.map((r) =>
          r.entry.sets.filter((t) => t.kind === "working" && t.done),
        );
        const misses = rows
          .slice(-2)
          .every((sets) =>
            sets.some(
              (t) =>
                t.reps < t.prescription!.min || t.rir < t.prescription!.rir,
            ),
          );
        const same = rows.every(
          (sets) =>
            canonical(sets.map((t) => [t.weight, t.rir])) ===
            canonical(rows[0].map((t) => [t.weight, t.rir])),
        );
        const totals = rows.map((sets) => sets.reduce((n, t) => n + t.reps, 0));
        const flat =
          same &&
          totals.every((n) => n === totals[0]) &&
          recoveryTime(recent[2].session) - recoveryTime(recent[0].session) >=
            14 * DAY;
        const decline = same && totals[1] < totals[0] && totals[2] <= totals[1];
        if (misses || flat || decline) {
          status = "review";
          reason = misses
            ? "Repeated confirmed target misses. Review execution, recovery and next targets."
            : flat
              ? "Comparable performance is flat across at least two weeks. Review progression before changing the lift."
              : "Comparable reps declined repeatedly. Review context and next targets.";
        } else if (
          rows.every((sets) =>
            sets.every(
              (t) =>
                t.reps >= t.prescription!.min && t.rir >= t.prescription!.rir,
            ),
          )
        ) {
          status = "keep";
          reason =
            "Repeated comparable work meets the prescribed range and reserve. Keep this lift; review next-session targets when needed.";
        }
      }
      return [
        {
          status,
          reason,
          exercise,
          workout,
          session,
          entry,
          sourceIds: recent.map((r) => r.session.id),
          dates: recent.map((r) => r.session.date),
          excluded: evidence.excluded,
        },
      ];
    });
  });
}
