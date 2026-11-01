import { setSchema, type State, type Session, type SetLog } from "./domain";
import { canonical } from "./coachingEvidence";
import { nextSetAdvice } from "./nextSetAdvice";
import type { RecoveryEstimate } from "./healthRecovery";
export type AutoReduction = {
  sessionId: string;
  entryId: string;
  setId: string;
  basis: string;
  from: SetLog;
  to: SetLog;
};
export function automaticReduction(
  state: State,
  session: Session,
  entryId: string,
  recovery: RecoveryEstimate,
  checked: boolean,
  now = Date.now(),
): AutoReduction | null {
  if (
    state.draft?.id !== session.id ||
    !checked ||
    recovery.score === null ||
    recovery.score >= 50 ||
    recovery.at > now ||
    now - recovery.at > 86400000 ||
    recovery.confidence === "insufficient"
  )
    return null;
  const r = session.readiness;
  if (
    !r ||
    r.recordedAt > now ||
    now - r.recordedAt > 12 * 3600000 ||
    r.pain !== false ||
    r.fatigue === null ||
    r.fatigue < 3
  )
    return null;
  const advice = nextSetAdvice(
    state,
    session,
    entryId,
    { rest: "usual", execution: "consistent" },
    now,
  );
  if (advice.kind !== "load" || advice.load === undefined) return null;
  const entry = session.exercises.find((e) => e.id === entryId)!,
    row = entry.sets.find((t) => t.id === advice.nextSetId),
    p = row?.prescription;
  if (
    !row ||
    !p ||
    row.done ||
    !!row.groupId ||
    entry.sets.some((t) => !!t.groupId) ||
    row.effortReported === true ||
    row.weight !== p.weight ||
    row.reps !== p.reps ||
    row.rir !== p.rir ||
    (row.rest !== undefined && row.rest !== p.rest)
  )
    return null;
  return {
    sessionId: session.id,
    entryId,
    setId: row.id,
    basis: advice.basis,
    from: setSchema.parse(row),
    to: {
      ...row,
      weight: advice.load,
      prescription: {
        ...p,
        weight: advice.load,
        proposalId: "next-set-load-v1",
      },
    },
  };
}
export function applyAutomaticReduction(state: State, p: AutoReduction): State {
  const session = state.draft;
  if (session?.id !== p.sessionId) return state;
  const advice = nextSetAdvice(state, session, p.entryId, {
    rest: "usual",
    execution: "consistent",
  });
  // The complete evidence basis fences corrections, swaps, reordered work and intervening edits.
  if (advice.basis !== p.basis) return state;
  return replace(state, p, p.from, p.to);
}
export function undoAutomaticReduction(state: State, p: AutoReduction): State {
  return replace(state, p, p.to, p.from);
}
function replace(
  state: State,
  p: AutoReduction,
  from: SetLog,
  to: SetLog,
): State {
  const session = state.draft,
    entry = session?.exercises.find((e) => e.id === p.entryId),
    row = entry?.sets.find((t) => t.id === p.setId);
  if (
    session?.id !== p.sessionId ||
    !entry ||
    !row ||
    row.done ||
    canonical(row) !== canonical(from)
  )
    return state;
  return {
    ...state,
    draft: {
      ...session,
      exercises: session.exercises.map((e) =>
        e.id !== entry.id
          ? e
          : {
              ...e,
              sets: e.sets.map((t) =>
                t.id !== row.id ? t : structuredClone(to),
              ),
            },
      ),
    },
  };
}
