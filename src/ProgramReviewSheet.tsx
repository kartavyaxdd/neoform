import { useMemo } from "react";
import * as D from "./domain";
import { useStore } from "./store";
import { reviewProgram } from "./programReview";
import { Button } from "./ui";
export function ProgramReviewSheet({
  programId,
  openTargets,
}: {
  programId: string;
  openTargets: (session: D.Session, entryId: string) => void;
}) {
  const state = useStore().box.data;
  const rows = useMemo(
    () => reviewProgram(state, programId),
    [state, programId],
  );
  const labels = {
    keep: "Keep lift",
    review: "Review targets",
    context: "Gather context",
    recovery: "Recovery review",
    pending: "Targets approved",
  };
  return (
    <div className="training-coaching">
      <p>
        Keep productive lifts. Review repeated comparable performance before
        changing targets. Nothing changes without Apply.
      </p>
      {state.draft && (
        <p role="status">
          Finish your active workout before applying future program changes.
        </p>
      )}
      {rows.map((r) => (
        <section className="panel" key={r.entry.sourceTargetId}>
          <small>{r.workout.name}</small>
          <h3>
            {r.exercise.name} · {labels[r.status]}
          </h3>
          <p>{r.reason}</p>
          <details>
            <summary>
              Evidence · {r.sourceIds.length} comparable workouts
            </summary>
            <p>
              {r.dates.join(" · ") || "No eligible comparable history yet."}
            </p>
            {r.excluded.map((s, i) => (
              <p className="caption" key={i}>
                {s}
              </p>
            ))}
            <p className="caption">
              Review uses the existing coaching eligibility rules. Three
              observations, a 21-day freshness limit and a two-week
              flat-performance flag are conservative app policies, not measured
              growth thresholds.
            </p>
          </details>
          <Button
            disabled={!!state.draft || r.status === "pending"}
            onClick={() => openTargets(r.session, r.entry.id)}
          >
            Review next targets
          </Button>
        </section>
      ))}
      {!rows.length && (
        <p>
          {state.programs.some(
            (p) => p.id === programId && D.programPhase(p) === "active-rest",
          )
            ? "This program is in active rest. Working-set target review resumes after that phase."
            : "No exercises in this program to review."}
        </p>
      )}
    </div>
  );
}
