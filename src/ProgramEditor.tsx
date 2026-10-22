import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  SlidersHorizontal,
  Pencil,
  ListOrdered,
  Plus,
  MoreVertical,
} from "lucide-react";
import * as D from "./domain";
import { Button, Field, Num, Modal } from "./ui";
import { PhaseControls, PhasePreview } from "./TrainingFeedback";
import { ExercisePicker } from "./ExercisePicker";
import { ExerciseQueue } from "./WorkoutInteractions";
import { removeEntry } from "./workoutActions";
import {
  TargetMuscleCards,
  MuscleArtwork,
  MuscleTags,
  AssignedRows,
} from "./ProgramPresentation";
import {
  programPrescriptionRows,
  programSchedule,
} from "./workoutPresentation";
type DraftSetter = Dispatch<SetStateAction<D.Program>>;
type EditorSheet =
  | { kind: "settings" | "rename" | "order" | "add" }
  | { kind: "target"; id: string };
export function ProgramEditor({
  program,
  exercises,
  sessions,
  experience,
  save,
}: {
  program: D.Program;
  exercises: D.Exercise[];
  sessions: D.Session[];
  experience?: D.Experience;
  save: (p: D.Program) => void | Promise<void>;
}) {
  const [p, setP] = useState(() => structuredClone(program));
  const [day, setDay] = useState(program.workouts[0].id);
  const [rest, setRest] = useState<string | null>(null);
  const days = programSchedule(p);
  const [sheet, setSheet] = useState<EditorSheet | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const wi = Math.max(
      0,
      p.workouts.findIndex((w) => w.id === day),
    ),
    w = p.workouts[wi];
  const prepared = useMemo(
    () => D.prepareWorkout(w, p, exercises, sessions, experience),
    [w, p, exercises, sessions, experience],
  );
  const queue = useMemo(() => {
    const entries = w.exercises.flatMap((t) => {
      const x = exercises.find((x) => x.id === t.exerciseId);
      return x ? [{ ...D.createEntry(x, t), id: t.id }] : [];
    });
    return { ...D.startSession(w.name, entries, p, w), id: `${p.id}:${w.id}` };
  }, [w, p, exercises]);
  const updateWorkout = (next: D.Workout) =>
    setP((current) => ({
      ...current,
      workouts: current.workouts.map((x) => (x.id === next.id ? next : x)),
    }));
  const targetIndex = w.exercises.findIndex(
    (t) => sheet?.kind === "target" && t.id === sheet.id,
  );
  async function persist() {
    const parsed = D.programSchema.safeParse(p);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save(parsed.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="program-editor">
      <div
        className="program-day-tabs"
        role="tablist"
        aria-label="Program workout days"
      >
        {days.map((item, index) => {
          const selected =
            item.kind === "rest"
              ? rest === item.day
              : !rest && w.id === item.workout.id;
          return (
            <button
              key={item.kind === "rest" ? `rest-${item.day}` : item.workout.id}
              role="tab"
              id={`program-day-${index}`}
              aria-label={
                item.kind === "rest" ? `${item.day} — Rest` : item.workout.name
              }
              aria-selected={selected}
              aria-controls="selected-program-day"
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (item.kind === "rest") setRest(item.day);
                else {
                  setDay(item.workout.id);
                  setRest(null);
                }
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % days.length
                    : event.key === "ArrowLeft"
                      ? (index + days.length - 1) % days.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? days.length - 1
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                const value = days[next];
                if (value.kind === "rest") setRest(value.day);
                else {
                  setDay(value.workout.id);
                  setRest(null);
                }
                document.getElementById(`program-day-${next}`)?.focus();
              }}
            >
              {item.kind === "rest" ? "Rest" : item.workout.name}
            </button>
          );
        })}
        <button
          className="add-day"
          aria-label="Add workout day"
          onClick={() => {
            if (p.workouts.length >= 14) return;
            const added = {
              id: D.uid(),
              name: `Workout ${p.workouts.length + 1}`,
              day: "",
              exercises: [],
            };
            setP((current) => ({
              ...current,
              workouts: [...current.workouts, added],
            }));
            setDay(added.id);
            setRest(null);
          }}
          disabled={p.workouts.length >= 14}
        >
          <Plus size={19} />
        </button>
      </div>
      <div className="program-tools">
        <Button onClick={() => setSheet({ kind: "settings" })}>
          <SlidersHorizontal size={17} /> Program settings
        </Button>
        <Button disabled={!!rest} onClick={() => setSheet({ kind: "rename" })}>
          <Pencil size={16} /> Rename
        </Button>
        <Button disabled={!!rest} onClick={() => setSheet({ kind: "order" })}>
          <ListOrdered size={17} /> Re-order
        </Button>
      </div>
      <section
        id="selected-program-day"
        role="tabpanel"
        aria-labelledby={`program-day-${days.findIndex((item) => (item.kind === "rest" ? rest === item.day : !rest && item.workout.id === w.id))}`}
      >
        {rest ? (
          <div className="program-rest-day">
            <h3>Rest</h3>
            <p>No workout is assigned for {rest} in this program.</p>
            <small>
              Use Add workout day to plan another day. Nothing changes until you
              save.
            </small>
          </div>
        ) : (
          <>
            <TargetMuscleCards entries={prepared} exercises={exercises} />
            <div className="program-exercise-count">
              <h3>{w.exercises.length} Exercises</h3>
              <button
                className="text-button"
                onClick={() => setSheet({ kind: "add" })}
              >
                Add Exercises
              </button>
            </div>
            <div className="program-exercises">
              {w.exercises.map((t) => {
                const x = exercises.find((x) => x.id === t.exerciseId);
                if (!x) return null;
                return (
                  <article className="program-exercise" key={t.id}>
                    <div className="program-exercise-heading">
                      <div className="exercise-art">
                        <MuscleArtwork muscle={x.muscle} full />
                      </div>
                      <div>
                        <h3>{x.name}</h3>
                        <MuscleTags exercise={x} />
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${x.name} targets`}
                        onClick={() => setSheet({ kind: "target", id: t.id })}
                      >
                        <MoreVertical size={22} />
                      </button>
                    </div>
                    <div
                      className="program-week-rail"
                      role="group"
                      aria-label={`${x.name} assigned weeks`}
                      tabIndex={0}
                    >
                      {Array.from({ length: p.weeks }, (_, i) => (
                        <div
                          className={`program-week-card ${p.currentWeek === i + 1 ? "current-week-card" : ""}`}
                          key={i}
                        >
                          <b>Week {i + 1}</b>
                          <small>
                            {D.programPhase({
                              ...p,
                              currentWeek: i + 1,
                            }).replaceAll("-", " ")}
                          </small>
                          <AssignedRows
                            rows={programPrescriptionRows(
                              t,
                              p,
                              i + 1,
                              experience,
                            )}
                          />
                          {D.programPhase({ ...p, currentWeek: i + 1 }) ===
                            "active-rest" && (
                            <span className="caption">No lifting</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
            {!w.exercises.length && (
              <p className="empty-caption">
                Add exercises to build this workout.
              </p>
            )}
          </>
        )}
      </section>
      <p className="program-draft-note">
        Preview only · Save program to apply changes to future workouts.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="program-save">
        <Button
          variant="primary wide"
          disabled={busy}
          onClick={() => void persist()}
        >
          {busy ? "Saving…" : "Save program"}
        </Button>
      </div>
      {sheet && (
        <Modal
          title={
            sheet.kind === "settings"
              ? "Program settings"
              : sheet.kind === "rename"
                ? "Workout settings"
                : sheet.kind === "order"
                  ? "Re-order exercises"
                  : sheet.kind === "add"
                    ? "Add Exercises"
                    : "Edit base targets"
          }
          close={() => setSheet(null)}
          footer={
            <Button variant="primary wide" onClick={() => setSheet(null)}>
              Done
            </Button>
          }
        >
          {sheet.kind === "settings" ? (
            <ProgramSettings
              p={p}
              setP={setP}
              exercises={exercises}
              sessions={sessions}
              experience={experience}
            />
          ) : sheet.kind === "rename" ? (
            <>
              <Field label={`Workout ${wi + 1} name`}>
                <input
                  required
                  maxLength={120}
                  value={w.name}
                  onChange={(e) =>
                    updateWorkout({ ...w, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Preferred day">
                <input
                  maxLength={30}
                  value={w.day}
                  onChange={(e) => updateWorkout({ ...w, day: e.target.value })}
                />
              </Field>
              <Button
                variant="danger-text"
                disabled={p.workouts.length === 1}
                onClick={() => {
                  setP((current) => ({
                    ...current,
                    workouts: current.workouts.filter((x) => x.id !== w.id),
                  }));
                  setDay(p.workouts.find((x) => x.id !== w.id)!.id);
                  setSheet(null);
                }}
              >
                Remove workout
              </Button>
            </>
          ) : sheet.kind === "order" ? (
            <ExerciseQueue
              session={queue}
              exercises={exercises}
              onChange={(s) => {
                const ids = s.exercises.map((e) => e.sourceTargetId);
                updateWorkout({
                  ...w,
                  exercises: ids.map((id) =>
                    w.exercises.find((t) => t.id === id)!,
                  ),
                });
              }}
            />
          ) : sheet.kind === "add" ? (
            <ExercisePicker
              exercises={exercises}
              disabled={w.exercises.length >= 60}
              onPick={(x) => {
                if (w.exercises.length < 60)
                  updateWorkout({
                    ...w,
                    exercises: [...w.exercises, D.target(x.id)],
                  });
              }}
            />
          ) : targetIndex >= 0 ? (
            <>
              <p className="caption">
                Edit the routine’s base targets. The week cards show the
                existing phase and effort adjustments. These changes remain a
                preview until Save program.
              </p>
              <TargetSettings
                p={p}
                setP={setP}
                exercises={exercises}
                wi={wi}
                ti={targetIndex}
              />
              <Button
                variant="danger-text"
                onClick={() => {
                  const removed = removeEntry(
                    queue,
                    w.exercises[targetIndex].id,
                  );
                  const ids = new Set(
                    removed.session.exercises.map((e) => e.sourceTargetId),
                  );
                  updateWorkout({
                    ...w,
                    exercises: w.exercises.filter((t) => ids.has(t.id)),
                  });
                  setSheet(null);
                }}
              >
                Remove from workout
                {w.exercises[targetIndex].superset ||
                w.exercises[targetIndex].techniqueGroup
                  ? " (linked group)"
                  : ""}
              </Button>
            </>
          ) : null}
        </Modal>
      )}
    </div>
  );
}
function ProgramSettings({
  p,
  setP,
  exercises,
  sessions,
  experience,
}: {
  p: D.Program;
  setP: DraftSetter;
  exercises: D.Exercise[];
  sessions: D.Session[];
  experience?: D.Experience;
}) {
  return (
    <div className="program-settings-fields">
      {" "}
      <Field label="Program name">
        <input
          required
          value={p.name}
          maxLength={120}
          onChange={(e) => setP({ ...p, name: e.target.value })}
        />
      </Field>
      <Field label="Program notes">
        <textarea
          value={p.description}
          maxLength={2000}
          onChange={(e) => setP({ ...p, description: e.target.value })}
        />
      </Field>
      <div className="form-grid three">
        <Field label="Cycle weeks">
          <Num
            label="Cycle weeks"
            min={2}
            max={16}
            value={p.weeks}
            onChange={(n) =>
              setP({
                ...p,
                weeks: n,
                deloadWeek: Math.min(p.deloadWeek, n),
                currentWeek: Math.min(p.currentWeek, n),
              })
            }
          />
        </Field>
        <Field label="Deload week">
          <Num
            label="Deload week"
            min={1}
            max={p.weeks}
            value={p.deloadWeek}
            onChange={(n) => setP({ ...p, deloadWeek: n })}
          />
        </Field>
        <Field label="Current week">
          <Num
            label="Current week"
            min={1}
            max={p.weeks}
            value={p.currentWeek}
            onChange={(n) => setP({ ...p, currentWeek: n })}
          />
        </Field>
      </div>
      <PhaseControls program={p} onChange={setP} />
      <PhasePreview
        program={p}
        exercises={exercises}
        sessions={sessions}
        experience={experience}
      />
    </div>
  );
}
function TargetSettings({
  p,
  setP,
  exercises,
  wi,
  ti,
}: {
  p: D.Program;
  setP: DraftSetter;
  exercises: D.Exercise[];
  wi: number;
  ti: number;
}) {
  const w = p.workouts[wi],
    t = w.exercises[ti];
  const updateWorkout = (i: number, next: D.Workout) =>
    setP((current) => ({
      ...current,
      workouts: current.workouts.map((x, j) => (i === j ? next : x)),
    }));
  const updateTarget = (
    workoutIndex: number,
    targetIndex: number,
    next: D.Target,
  ) =>
    updateWorkout(workoutIndex, {
      ...w,
      exercises: w.exercises.map((x, j) =>
        j === targetIndex
          ? { ...next, nextRows: undefined, coachingProposalId: undefined }
          : x,
      ),
    });
  return (
    <div className="builder-target" key={t.id}>
      <div className="target-top">
        <Field label={`Exercise ${ti + 1}`}>
          <select
            value={t.exerciseId}
            onChange={(e) =>
              updateTarget(wi, ti, {
                ...t,
                exerciseId: e.target.value,
                setup: e.target.value === t.exerciseId ? t.setup : undefined,
                startingLoad:
                  e.target.value === t.exerciseId ? t.startingLoad : undefined,
              })
            }
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label={
          exercises.find((e) => e.id === t.exerciseId)?.convention ===
          "machine-label"
            ? "First-session machine label"
            : "First-session load (kg)"
        }
      >
        <Num
          label={
            exercises.find((e) => e.id === t.exerciseId)?.convention ===
            "machine-label"
              ? "First-session machine label"
              : "First-session load (kg)"
          }
          min={0}
          max={2000}
          step={0.25}
          value={t.startingLoad ?? 0}
          onChange={(startingLoad) =>
            updateTarget(wi, ti, { ...t, startingLoad })
          }
        />
      </Field>
      <p className="caption">
        An editable starting reference, not a progression recommendation.
        Comparable logged loads take precedence. A saved equipment setup
        requires a fresh load choice.
      </p>
      <div className="target-fields">
        {(["sets", "min", "max", "rir", "rest"] as const).map((key, i) => (
          <Field
            key={key}
            label={["Sets", "Min reps", "Max reps", "RIR", "Rest (s)"][i]}
          >
            <Num
              label={`${w.name} ${ti + 1} ${key}`}
              value={t[key]}
              min={key === "rir" || key === "rest" ? 0 : 1}
              max={
                key === "sets" || key === "rir"
                  ? 10
                  : key === "rest"
                    ? 900
                    : 100
              }
              onChange={(n) => updateTarget(wi, ti, { ...t, [key]: n })}
            />
          </Field>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Set type">
          <select
            value={t.kind}
            onChange={(e) =>
              updateTarget(wi, ti, {
                ...t,
                kind: e.target.value as D.Target["kind"],
              })
            }
          >
            <option value="working">Working</option>
            <option value="warmup">Warmup</option>
            <option value="drop">Drop</option>
          </select>
        </Field>
        <Field label="Superset group (optional)">
          <input
            placeholder="e.g. A"
            maxLength={20}
            value={t.superset}
            onChange={(e) =>
              updateTarget(wi, ti, { ...t, superset: e.target.value })
            }
          />
        </Field>
      </div>
    </div>
  );
}
