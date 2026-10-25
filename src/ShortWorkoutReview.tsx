import { useMemo, useState } from "react";
import * as D from "./domain";
import { Button } from "./ui";
import { shorterAlternative } from "./workoutTiming";
export function ShortWorkoutReview({
  state,
  session,
  apply,
}: {
  state: D.State;
  session: D.Session;
  apply: (s: D.Session) => void;
}) {
  const [minutes, setMinutes] = useState<30 | 45 | 60>(45);
  const full = useMemo(
    () => ({
      ...session,
      shortPlan: undefined,
      exercises: session.shortPlan?.originalEntries ?? session.exercises,
    }),
    [session],
  );
  const result = useMemo(
    () => shorterAlternative(state, full, minutes),
    [state, full, minutes],
  );
  const exercises = [...D.catalog, ...state.customExercises];
  const names = (ids: string[]) =>
    ids
      .map((id) => {
        const e = full.exercises.find((e) => e.id === id);
        return (
          exercises.find((x) => x.id === e?.exerciseId)?.name ?? "Exercise"
        );
      })
      .join(", ");
  return (
    <section aria-label="Shorter workout review">
      <p>
        Today only. Keep the first complete exercise groups; review every
        omission before accepting.
      </p>
      <div className="actions wrap">
        {([30, 45, 60] as const).map((n) => (
          <button
            key={n}
            className={"btn " + (minutes === n ? "primary" : "")}
            aria-pressed={minutes === n}
            onClick={() => setMinutes(n)}
          >
            {n} min
          </button>
        ))}
      </div>
      <h3>
        {result.estimate.low}–{result.estimate.high} min estimated
      </h3>
      <p>
        <b>Keep</b> · {names(result.session.exercises.map((e) => e.id))}
      </p>
      <p>
        <b>Omit today</b> ·{" "}
        {result.omitted.length ? names(result.omitted) : "Nothing"}
      </p>
      <p className="caption">
        Targets, warmup sets, rests and linked groups stay intact. Omitted work
        is not moved to another day.
      </p>
      {!result.feasible && (
        <p role="alert">
          Even the first complete group exceeds this budget. Choose more time or
          review your routine manually.
        </p>
      )}
      <details>
        <summary>Estimate assumptions</summary>
        <p className="caption">
          Includes 5–7 minutes for general warmup, 1.5–2 minutes per exercise
          change, assigned rests and 3 seconds per rep unless a tempo is
          assigned. The upper estimate allows 25% extra rest. Gym queues and
          extra preparation can take longer. This is a planning estimate, not a
          deadline to rush.
        </p>
        <p className="caption">
          {result.estimate.sources.length
            ? `Calibrated against ${result.estimate.sources.length} recent matching completed workouts; faster logs never shorten assigned rest.`
            : "Not yet calibrated: at least three recent matching complete workouts with reported usual rest and consistent execution are needed."}
        </p>
      </details>
      <Button
        variant="primary wide"
        disabled={!result.feasible}
        onClick={() =>
          apply({
            ...result.session,
            shortPlan: {
              minutes,
              acceptedAt: Date.now(),
              originalEntries: result.originalEntries,
              keptEntryIds: result.session.exercises.map((e) => e.id),
              estimatedLow: result.estimate.low,
              estimatedHigh: result.estimate.high,
              timingSourceIds: result.estimate.sources,
            },
          })
        }
      >
        Use reviewed plan
      </Button>
    </section>
  );
}
