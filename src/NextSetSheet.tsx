import { useEffect, useState } from "react";
import * as D from "./domain";
import { useStore } from "./store";
import { nextSetAdvice } from "./nextSetAdvice";
import { Button } from "./ui";

export function NextSetSheet({
  sessionId,
  entryId,
  reviewTargets,
  reviewWorkout,
}: {
  sessionId: string;
  entryId: string;
  reviewTargets: () => void;
  reviewWorkout: () => void;
}) {
  const state = useStore().box.data,
    session = state.draft?.id === sessionId ? state.draft : null;
  const [checkedBasis, setCheckedBasis] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const timer = state.timer;
  useEffect(() => {
    if (!timer || timer.paused || timer.endAt <= Date.now()) return;
    const id = setTimeout(
      () => refresh((n) => n + 1),
      Math.min(3600000, timer.endAt - Date.now() + 30),
    );
    return () => clearTimeout(id);
  }, [timer?.id, timer?.endAt, timer?.paused]);
  if (!session)
    return (
      <p role="status">
        The active workout changed. Close this sheet and open its current
        exercise.
      </p>
    );
  const entry = session.exercises.find((e) => e.id === entryId),
    ex = [...D.catalog, ...state.customExercises].find(
      (x) => x.id === entry?.exerciseId,
    );
  if (!entry || !ex) return <p>This exercise is no longer in the workout.</p>;
  const unconfirmed = nextSetAdvice(state, session, entryId),
    checked = checkedBasis === unconfirmed.basis;
  const advice = checked
    ? nextSetAdvice(state, session, entryId, {
        execution: "consistent",
        rest: "usual",
      })
    : unconfirmed;
  const next = entry.sets.find((t) => t.id === advice.nextSetId),
    plan = next?.prescription;
  const convention = entry.convention ?? ex.convention;
  const loadText = (n: number) =>
    `${Number(D.displayLoad(n, convention, state.settings.unit).toFixed(2))} ${convention === "machine-label" ? "label" : state.settings.unit}`;
  return (
    <div className="next-set-sheet training-coaching">
      <h3>{ex.name}</h3>
      {plan && (
        <p className="caption">
          Next assigned row: {loadText(plan.weight)} × {plan.reps} · {plan.rir}{" "}
          RIR
        </p>
      )}
      <section className="panel" aria-label="Next-set advice">
        <h3>
          {advice.kind === "load"
            ? `Review ${loadText(advice.load!)} for the next set`
            : advice.kind === "pause"
              ? "Pause and review"
              : advice.kind === "rest"
                ? "Rest first"
                : advice.kind === "keep"
                  ? "Keep the assigned row"
                  : advice.kind === "effort"
                    ? "Effort is unknown"
                    : "Review the next set"}
        </h3>
        <p>{advice.reason}</p>
      </section>
      {(checked ||
        ["context", "rest", "keep", "load"].includes(advice.kind)) && (
        <label className="check-line">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) =>
              setCheckedBasis(e.target.checked ? unconfirmed.basis : null)
            }
          />
          The last completed set used usual rest and the same execution.
        </label>
      )}
      <p className="caption">
        This check describes this review only. It does not confirm the rest of
        your workout or fill in effort. Advice changes no rows, assigned targets
        or set counts.
      </p>
      <div className="actions wrap">
        <Button onClick={reviewTargets}>Review Targets</Button>
        <Button onClick={reviewWorkout}>Next-workout review</Button>
      </div>
    </div>
  );
}
