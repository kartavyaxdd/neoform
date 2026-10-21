import * as D from "./domain";
import { TrainingBodyMap } from "./TrainingBodyMap";
import { Button } from "./ui";
import { useState } from "react";
import { ExerciseQueue, UndoRemoval } from "./WorkoutInteractions";
import {
  removeEntry,
  restoreRemoval,
  saveSessionOrder,
  type Removal,
} from "./workoutActions";
import { change } from "./store";
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
  start: (rows?: D.Entry[]) => void;
}) {
  const [session, setSession] = useState(() =>
    D.startSession(
      workout.name,
      D.prepareWorkout(
        workout,
        program,
        exercises,
        state.sessions,
        state.profile?.experience,
      ),
      program,
      workout,
    ),
  );
  const rows = session.exercises;
  const [undo, setUndo] = useState<{ item: Removal; until: number } | null>(
      null,
    ),
    [notice, setNotice] = useState("");
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
      <div className="preview-body">
        <TrainingBodyMap
          counts={Object.fromEntries(
            D.muscles.map((m) => [
              m,
              rows
                .filter(
                  (e) =>
                    exercises.find((x) => x.id === e.exerciseId)?.muscle === m,
                )
                .reduce(
                  (n, e) =>
                    n + e.sets.filter((t) => t.kind === "working").length,
                  0,
                ),
            ]),
          )}
          countLabel="planned working sets"
        />
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
      <ExerciseQueue
        session={session}
        exercises={exercises}
        onChange={setSession}
        onRemove={(id) => {
          const r = removeEntry(session, id);
          setSession(r.session);
          setUndo({ item: r.undo, until: Date.now() + 10000 });
        }}
        onSaveOrder={() => {
          try {
            change((state) => saveSessionOrder(state, session));
            setNotice("Order saved for future workouts.");
          } catch (e) {
            setNotice((e as Error).message);
          }
        }}
      />
      <UndoRemoval
        undo={undo}
        restore={() => {
          if (undo && Date.now() < undo.until)
            setSession(restoreRemoval(session, undo.item));
          setUndo(null);
        }}
      />
      {notice && <p role="status">{notice}</p>}
      {D.programPhase(program) === "active-rest" ? (
        <p>
          No lifting is scheduled in active rest. Review your program phase to
          resume.
        </p>
      ) : (
        <Button
          variant="primary wide"
          disabled={!rows.length}
          onClick={() => start(rows)}
        >
          Start workout
        </Button>
      )}
    </div>
  );
}
