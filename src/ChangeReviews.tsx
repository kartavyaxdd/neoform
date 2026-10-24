import * as D from "./domain";
import type { ChangeReview } from "./coachingResponse";

const labels = {
  keep: "Keep change",
  reverse: "Review reversal",
  observe: "Observe longer",
  reassess: "Reassess context",
};
export function ChangeReviews({
  reviews,
  state,
}: {
  reviews: ChangeReview[];
  state: D.State;
}) {
  if (!reviews.length) return null;
  const exercises = [...D.catalog, ...state.customExercises];
  return (
    <details className="change-reviews">
      <summary>Accepted changes · {reviews.length}</summary>
      <p className="caption">
        Confirmed target attainment, not proof of growth. Targets change only
        after explicit review and acceptance.
      </p>
      {reviews.slice(0, 30).map((r) => {
        const p = r.decision.proposal!,
          x = exercises.find((x) => x.id === p.exerciseId);
        return (
          <section className="change-review" key={r.decision.id}>
            <small>
              {new Date(r.decision.at).toLocaleDateString()} ·{" "}
              {p.action.replaceAll("-", " ")} ·{" "}
              {r.decision.scope === "program"
                ? "Future targets"
                : "One workout"}
            </small>
            <h4>
              {x?.name ?? "Exercise"} · {labels[r.status]}
            </h4>
            <p>{r.reason}</p>
            <p className="caption">
              {r.followups.length} confirmed follow-ups
              {r.edited
                ? " · User-edited targets; separate from policy performance"
                : ""}
              {r.bundled
                ? " · Coordinated changes; individual effects unknown"
                : ""}
            </p>
            <details>
              <summary>Targets and follow-up evidence</summary>
              <div className="table-wrap">
                <table aria-label={`${x?.name ?? "Exercise"} accepted change`}>
                  <thead>
                    <tr>
                      <th>Set</th>
                      <th>Accepted load</th>
                      <th>Reps</th>
                      <th>RIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((v) => (
                      <tr key={v.ordinal}>
                        <td>{v.ordinal + 1}</td>
                        <td>
                          {D.displayLoad(
                            v.weight,
                            x?.convention ?? "total",
                            state.settings.unit,
                          )}{" "}
                          {x?.convention === "machine-label"
                            ? "label"
                            : state.settings.unit}
                        </td>
                        <td>{v.reps}</td>
                        <td>{v.rir}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.followups.map((f) => (
                <p className="caption" key={f.sessionId}>
                  {f.date} ·{" "}
                  {f.result === "met"
                    ? "Targets and intended reserve met"
                    : "Accepted reps or intended reserve missed"}
                </p>
              ))}
              {r.excluded.map((v, i) => (
                <p className="caption" key={i}>
                  Excluded: {v}
                </p>
              ))}
              <p className="caption">
                Two follow-ups and the 21-day review window are conservative app
                policies. A favorable review does not authorize extra volume.{" "}
                {r.restore
                  ? "Prior targets are available in Review targets; nothing has been applied."
                  : r.status === "reverse"
                    ? "Review manually; a safe automatic restoration is not available for this experiment."
                    : ""}
              </p>
            </details>
          </section>
        );
      })}
      {reviews.length > 30 && (
        <p className="caption">Showing the 30 most recent accepted changes.</p>
      )}
    </details>
  );
}
