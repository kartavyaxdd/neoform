import * as D from "./domain";
import { Button } from "./ui";
export function WorkoutPreview({
  workout,
  program,
  state,
  exercises,
  start,
}: {
  workout: D.Workout;
  program: D.Program;
  state: D.State;
  exercises: D.Exercise[];
  start: () => void;
}) {
  const rows = D.prepareWorkout(
    workout,
    program,
    exercises,
    state.sessions,
    state.profile?.experience,
  );
  const minutes = Math.round(
    5 +
      rows.reduce(
        (n, e) =>
          n +
          1.5 +
          (e.sets.length * (e.target?.max ?? 12) * 3) / 60 +
          (Math.max(0, e.sets.length - 1) * (e.target?.rest ?? 120)) / 60,
        0,
      ),
  );
  return (
    <div className="workout-preview">
      <p className="caption">
        {program.name} &middot; Week {program.currentWeek}
      </p>
      <h3>{workout.name}</h3>
      <div className="preview-stats">
        <span>{rows.length} exercises</span>
        <span>About {minutes} min</span>
        <span>{D.programPhase(program)}</span>
      </div>
      <div className="muscle-chips">
        {[
          ...new Set(
            rows.map(
              (e) => exercises.find((x) => x.id === e.exerciseId)?.muscle,
            ),
          ),
        ]
          .filter(Boolean)
          .map((m) => (
            <span key={m}>{m}</span>
          ))}
      </div>
      <div className="grouped">
        {rows.map((e) => (
          <div className="group-row" key={e.id}>
            <span>
              <b>{exercises.find((x) => x.id === e.exerciseId)?.name}</b>
              <small>
                {e.plannedWorkingSets} sets &middot; {e.target?.min}&ndash;
                {e.target?.max} reps &middot; {e.target?.rir} RIR
              </small>
            </span>
          </div>
        ))}
      </div>
      {D.programPhase(program) === "active-rest" ? (
        <p>
          No lifting is scheduled in active rest. Review your program phase to
          resume.
        </p>
      ) : (
        <Button variant="primary wide" onClick={start}>
          Start workout
        </Button>
      )}
    </div>
  );
}
