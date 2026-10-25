import * as D from "./domain";
import { EntryPrescription } from "./ProgramPresentation";
export function WorkoutPlanDetails({
  session,
  exercises,
}: {
  session: D.Session;
  exercises: D.Exercise[];
}) {
  if (!session.shortPlan && !session.scheduledDate) return null;
  const plan = session.shortPlan;
  return (
    <details className="workout-plan-details">
      <summary>Reviewed workout plan</summary>
      {session.scheduledDate && (
        <p className="caption">
          Planned date: {session.scheduledDate}. The workout’s actual date is
          recorded separately.
        </p>
      )}
      {plan && (
        <>
          <p className="caption">
            Accepted a {plan.minutes}-minute alternative, estimated{" "}
            {plan.estimatedLow}–{plan.estimatedHigh} min. Kept{" "}
            {plan.keptEntryIds.length} of {plan.originalEntries.length}{" "}
            exercises at acceptance. Later logged edits remain separate. Omitted
            work was not added to another day.
          </p>
          {plan.originalEntries.map((e) => {
            const x = exercises.find((x) => x.id === e.exerciseId);
            return x ? (
              <div key={e.id}>
                <b>
                  {x.name} ·{" "}
                  {plan.keptEntryIds.includes(e.id) ? "Kept" : "Omitted"}
                </b>
                <EntryPrescription entry={e} exercise={x} />
              </div>
            ) : null;
          })}
        </>
      )}
    </details>
  );
}
