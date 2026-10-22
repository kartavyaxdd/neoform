import * as D from "./domain";
import { TargetMuscleCards, EntryPrescription } from "./ProgramPresentation";
import { ExercisePicker } from "./ExercisePicker";
import { VideoInfo } from "./VideoInfo";
import { Plus } from "lucide-react";
import { Button, Modal } from "./ui";
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
  const [picker, setPicker] = useState(false),
    [info, setInfo] = useState<D.Exercise | null>(null);
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
      <span className="sr-only">Workout preview</span>
      <TargetMuscleCards entries={rows} exercises={exercises} />
      <div className="program-exercise-count">
        <div>
          <h3>{rows.length} Exercises</h3>
          <p className="caption">Estimated workout time is {minutes} min</p>
        </div>
        <button
          className="icon-button preview-add"
          disabled={
            rows.length >= 60 || D.programPhase(program) === "active-rest"
          }
          aria-label="Add Exercises"
          onClick={() => setPicker(true)}
        >
          <Plus size={23} />
        </button>
      </div>
      <p className="preview-phase caption">
        {program.name} · Week {program.currentWeek} · {D.programPhase(program)}
      </p>
      <ExerciseQueue
        session={session}
        exercises={exercises}
        onChange={setSession}
        onSelect={(id) => {
          const entry = rows.find((e) => e.id === id);
          const x = exercises.find((x) => x.id === entry?.exerciseId);
          if (x) setInfo(x);
        }}
        renderDetail={(group) => (
          <div className="preview-prescriptions">
            {group.map((entry) => {
              const x = exercises.find((x) => x.id === entry.exerciseId);
              return x ? (
                <div key={entry.id}>
                  {group.length > 1 && <h4>{x.name}</h4>}
                  <EntryPrescription
                    entry={entry}
                    exercise={x}
                    exact={
                      D.programPhase(program) === "accumulation" &&
                      !!workout.exercises.find(
                        (t) => t.id === entry.sourceTargetId,
                      )?.nextRows
                    }
                  />
                </div>
              ) : null;
            })}
          </div>
        )}
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
      <div className="preview-start">
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
      {picker && (
        <Modal
          title="Add Exercises"
          close={() => setPicker(false)}
          footer={
            <Button variant="primary wide" onClick={() => setPicker(false)}>
              Done
            </Button>
          }
        >
          <ExercisePicker
            exercises={exercises}
            disabled={rows.length >= 60}
            onPick={(x) =>
              setSession((current) => ({
                ...current,
                exercises:
                  current.exercises.length < 60
                    ? [...current.exercises, D.createEntry(x)]
                    : current.exercises,
              }))
            }
          />
        </Modal>
      )}
      {info && (
        <Modal title={info.name} close={() => setInfo(null)}>
          <VideoInfo exercise={info} />
        </Modal>
      )}
    </div>
  );
}
