import * as D from "./domain";
import type { NextSetReview } from "./useNextSetReview";
import { Button } from "./ui";

export function NextSetSheet({
  state,
  session,
  entryId,
  review,
  reviewTargets,
  reviewWorkout,
}: {
  state: D.State;
  session: D.Session;
  entryId: string;
  review: NextSetReview;
  reviewTargets: () => void;
  reviewWorkout: () => void;
}) {
  if (state.draft?.id !== session.id)
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
  const { advice, checked } = review;
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
            onChange={(e) => review.confirm(e.target.checked)}
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
