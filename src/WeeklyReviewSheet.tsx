import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as D from "./domain";
import { useStore } from "./store";
import { weeklyReview } from "./weeklyReview";
import { WeeklyMuscleCards } from "./WeeklyMuscleCards";
import { localDate, weekMonday } from "./workoutPresentation";

export function WeeklyReview({
  openTargets,
}: { openTargets?: (session: D.Session, entryId: string) => void } = {}) {
  const state = useStore().box.data,
    [monday, setMonday] = useState(() => weekMonday());
  const exercises = useMemo(
    () => [...D.catalog, ...state.customExercises],
    [state.customExercises],
  );
  const review = useMemo(
    () => weeklyReview(state, exercises, monday),
    [state, exercises, monday],
  );
  function move(n: number) {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() + n * 7);
    setMonday(localDate(d));
  }
  const outcomes = Object.entries(review.coaching).reduce(
    (n, [, count]) => n + count,
    0,
  );
  const labels = {
    met: "Met",
    below: "Below target",
    easier: "Easier than assigned",
    changed: "Changed load",
    unknown: "Needs context",
  };
  const outcomeLabels = {
    met: "Targets met",
    "too-demanding": "Too demanding",
    easier: "Easier than assigned",
    changed: "Plan changed",
    unknown: "Unknown",
    recheck: "History edited · reassess",
  };
  return (
    <div className="weekly-review">
      <div className="week-selector">
        <button
          className="icon-button"
          aria-label="Review previous week"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span>
          Week of{" "}
          {new Date(monday + "T12:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <button
          className="icon-button"
          aria-label="Review next week"
          onClick={() => move(1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <p>
        {review.sessions.length} completed{" "}
        {review.sessions.length === 1 ? "workout" : "workouts"} ·{" "}
        {Math.round(review.sessions.reduce((n, s) => n + s.duration, 0) / 60)}{" "}
        min
      </p>
      <WeeklyMuscleCards
        review={review.muscle}
        active={!!state.draft}
        openTargets={openTargets}
      />
      <details className="weekly-extra">
        <summary>Workout and coaching details</summary>
        <section>
          <h3>Assigned working sets</h3>
          <div className="review-totals">
            {Object.entries(review.targets).map(([key, count]) => (
              <div key={key}>
                <b>{count}</b>
                <span>{labels[key as keyof typeof labels]}</span>
              </div>
            ))}
          </div>
          <p className="caption">
            Confirmed completed straight sets. Missing context stays unknown.
          </p>
          {review.unfinished > 0 && (
            <p className="caption">
              {review.unfinished}{" "}
              {review.unfinished === 1 ? "exercise" : "exercises"} ended below
              their recorded planned set count. This is not a recommendation to
              make up sets.
            </p>
          )}
        </section>
        <section>
          <h3>Comparable lift changes</h3>
          <p className="caption">
            Same loads, set count, reported RIR and execution context. Observed
            reps, not a growth score.
          </p>
          <div className="grouped">
            {review.comparisons.map((row) => (
              <div className="group-row" key={row.sessionId + row.entryId}>
                <span>
                  <b>{row.name}</b>
                  <small>
                    {row.previousDate} → {row.date}
                  </small>
                </span>
                <strong className="rep-change">
                  {row.repDelta > 0 ? "+" : ""}
                  {row.repDelta} {Math.abs(row.repDelta) === 1 ? "rep" : "reps"}
                </strong>
              </div>
            ))}
            {!review.comparisons.length && (
              <p className="empty-caption">
                No matching confirmed exposures for this week yet.
              </p>
            )}
          </div>
          {review.unavailable > 0 && (
            <p className="caption">
              {review.unavailable} exercise exposures have no eligible
              comparison. Missing observations and intervening changes are not
              skipped.
            </p>
          )}
        </section>
        <section>
          <h3>Coaching follow-through</h3>
          {outcomes ? (
            <>
              <div className="grouped">
                {Object.entries(review.coaching)
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => (
                    <div className="group-row" key={key}>
                      <span>
                        {outcomeLabels[key as keyof typeof outcomeLabels]}
                      </span>
                      <b>{count}</b>
                    </div>
                  ))}
              </div>
              <p className="caption">
                Latest recorded outcomes for accepted or edited recommendations
                in these workouts. History edits require reassessment. Outcomes
                do not prove that coaching caused a change.
              </p>
            </>
          ) : (
            <p className="caption">
              No recorded outcomes from accepted recommendations in this week’s
              workouts.
            </p>
          )}
        </section>
        <details className="review-method">
          <summary>How this review works</summary>
          <p className="caption">
            Assigned rows use saved load/reps and confirmed RIR. Reserve more
            than one RIR below target is below; more than one above is easier.
            Changed execution/rest or missing prescriptions cannot establish
            attainment.
          </p>
          <p className="caption">
            Lift changes compare the immediately preceding exposure in the same
            workout/target stream. Assigned load, range, effort and rest must
            also match. Intervening incomplete or changed exposures are not
            skipped. Observed reps do not establish strength or muscle growth.
          </p>
        </details>
      </details>
    </div>
  );
}
