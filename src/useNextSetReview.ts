import { useEffect, useMemo, useState } from "react";
import type { State, Session } from "./domain";
import { nextSetAdvice } from "./nextSetAdvice";

// Ephemeral confirmation belongs to this exact review, never to a later set or
// saved workout. One shared review powers both the live cue and its detail sheet.
export function useNextSetReview(
  state: State,
  session: Session,
  entryId?: string,
) {
  const [checkedBasis, setCheckedBasis] = useState<string | null>(null);
  const [timerTick, refresh] = useState(0);
  const timer = state.timer;
  useEffect(() => {
    if (!timer || timer.paused || timer.endAt <= Date.now()) return;
    const id = setTimeout(
      () => refresh((n) => n + 1),
      Math.min(3600000, timer.endAt - Date.now() + 30),
    );
    return () => clearTimeout(id);
  }, [timer?.id, timer?.endAt, timer?.paused, timerTick]);
  const unconfirmed = useMemo(
    () => (entryId ? nextSetAdvice(state, session, entryId) : null),
    [state, session, entryId, timerTick],
  );
  const basis = unconfirmed?.basis;
  useEffect(() => setCheckedBasis(null), [basis]);
  const checked = !!unconfirmed && checkedBasis === unconfirmed.basis;
  const advice = useMemo(() => {
    if (!unconfirmed || !entryId) return null;
    return checked
      ? nextSetAdvice(state, session, entryId, {
          execution: "consistent",
          rest: "usual",
        })
      : unconfirmed;
  }, [state, session, entryId, timerTick, unconfirmed, checked]);
  if (!unconfirmed || !advice) return null;
  return {
    advice,
    checked,
    confirm: (value: boolean) =>
      setCheckedBasis(value ? unconfirmed.basis : null),
  };
}
export type NextSetReview = NonNullable<ReturnType<typeof useNextSetReview>>;
