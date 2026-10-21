import { LiveRecordBadge } from "./RewardProgress";
import { unlockFeedbackAudio, feedbackTone } from "./feedbackAudio";
import { SwipeRow, ExerciseQueue, UndoRemoval } from "./WorkoutInteractions";
import {
  removeEntry,
  removeSet,
  restoreRemoval,
  saveSessionOrder,
  type Removal,
} from "./workoutActions";
import { sessionRecords, rirColour } from "./rewards";
import {
  previousWorkingRows,
  resumeExerciseId,
  nextExerciseId,
} from "./workoutPresentation";
import { useRef, useState, useMemo } from "react";
import {
  Plus,
  Check,
  X,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Dumbbell,
} from "lucide-react";
import * as D from "./domain";
import { useStore, change } from "./store";
import { Button, Field, Num, Modal } from "./ui";
import { VideoInfo } from "./VideoInfo";
import { TechniqueSheet } from "./TechniqueSheet";
import { EquipmentSetup } from "./EquipmentSetup";
import { ReadinessSheet } from "./ReadinessSheet";
import { CoachSheet } from "./CoachSheet";
import { SubstitutionSheet } from "./SubstitutionSheet";
import { giantProgress } from "./techniques";
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString();
export function SessionLogger({
  session: s,
  exercises,
  unit,
  previous = [],
  setSession,
  remove,
  onDone,
  history = false,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
  previous?: D.Session[];
  setSession: (s: D.Session) => void;
  remove: (title: string, fn: () => void) => void;
  onDone?: (id: string, e: D.Entry) => void;
  history?: boolean;
}) {
  const [selected, setSelected] = useState(() => resumeExerciseId(s)),
    [sheet, setSheet] = useState<string | null>(null),
    [effort, setEffort] = useState<"RIR" | "RPE">("RIR");
  const data = useStore().box.data;
  const program = data.programs.find((p) => p.id === s.programId);
  const tabs = useRef<HTMLDivElement>(null);
  const current = s.exercises.find((x) => x.id === selected) || s.exercises[0];
  const [undo, setUndo] = useState<{ item: Removal; until: number } | null>(
      null,
    ),
    [actionError, setActionError] = useState("");
  const celebrated = useRef(new Set<string>());
  const records = useMemo(
    () => sessionRecords(s, previous, exercises),
    [s, previous, exercises],
  );
  function erased(result: { session: D.Session; undo: Removal }) {
    setSession(result.session);
    setUndo({ item: result.undo, until: Date.now() + 10000 });
    if (
      data.timer?.setId &&
      result.undo.rows.some(
        (row) =>
          row.id === data.timer?.setId ||
          ("sets" in row && row.sets.some((t) => t.id === data.timer?.setId)),
      )
    )
      change((d) => ({ ...d, timer: null }));
  }
  const updateEntry = (e: D.Entry) =>
    setSession({
      ...s,
      exercises: s.exercises.map((x) => (x.id === e.id ? e : x)),
    });
  const updateSet = (e: D.Entry, set: D.SetLog) =>
    updateEntry({ ...e, sets: e.sets.map((x) => (x.id === set.id ? set : x)) });
  return (
    <div className="logger compact-logger">
      <UndoRemoval
        undo={undo}
        restore={() => {
          try {
            if (undo && Date.now() < undo.until)
              setSession(restoreRemoval(s, undo.item));
            setUndo(null);
          } catch (e) {
            setActionError((e as Error).message);
          }
        }}
      />
      {actionError && <p role="alert">{actionError}</p>}
      <div
        ref={tabs}
        className="exercise-nav"
        role="tablist"
        aria-label="Workout exercises"
      >
        {s.exercises.map((e, i) => {
          const x = exercises.find((x) => x.id === e.exerciseId)!;
          return (
            <button
              key={e.id}
              role="tab"
              aria-label={x.name}
              aria-selected={current?.id === e.id}
              tabIndex={current?.id === e.id ? 0 : -1}
              aria-controls="selected-exercise"
              id={"tab-" + e.id}
              onClick={() => {
                setSelected(e.id);
                setSheet(null);
              }}
              onKeyDown={(event) => {
                const count = s.exercises.length;
                const index =
                  event.key === "ArrowRight"
                    ? (i + 1) % count
                    : event.key === "ArrowLeft"
                      ? (i + count - 1) % count
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? count - 1
                          : null;
                if (index === null) return;
                event.preventDefault();
                setSelected(s.exercises[index].id);
                setSheet(null);
                const tab =
                  tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[
                    index
                  ];
                tab?.focus({ preventScroll: true });
                tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
            >
              <Dumbbell size={22} />
              <small>{i + 1}</small>
              <span>{x.name}</span>
              <i
                className={
                  e.sets.some((t) => t.kind !== "warmup") &&
                  e.sets.filter((t) => t.kind !== "warmup").every((t) => t.done)
                    ? "finished"
                    : ""
                }
              />
            </button>
          );
        })}
      </div>
      {!current && <p className="caption">Add an exercise to begin.</p>}
      {current &&
        [current].map((e) => {
          const ei = s.exercises.indexOf(e),
            ex = exercises.find((x) => x.id === e.exerciseId)!;
          const setupRequired =
            !history &&
            !e.sets.some((t) => t.done && t.kind !== "warmup") &&
            ((["myoreps", "drop-set"].includes(e.technique || "") &&
              !e.sets.some((t) => t.bout === "activation")) ||
              (e.technique === "giant-set" &&
                !e.sets.some((t) => t.bout === "giant")) ||
              (["superset", "pre-exhaust"].includes(e.technique || "") &&
                !e.techniqueGroup));
          const prior = [...previous]
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
            )
            .flatMap((s) => s.exercises)
            .find(
              (x) =>
                D.comparableKey(x, ex) === D.comparableKey(e, ex) &&
                x.exerciseId === e.exerciseId,
            );
          const priorRows = previousWorkingRows(
            previous.filter(
              (p) =>
                p.id !== s.id && p.date <= s.date && p.startedAt <= s.startedAt,
            ),
            e,
            ex,
          );
          return (
            <section
              className="log-exercise"
              key={e.id}
              role="tabpanel"
              id="selected-exercise"
              aria-labelledby={"tab-" + e.id}
            >
              <div className="compact-exercise-title">
                <h2>{ex.name}</h2>
                {!history && (
                  <button
                    className="icon-button queue-open"
                    aria-label="Exercise queue"
                    onClick={() => setSheet("Exercise queue")}
                  >
                    ☷
                  </button>
                )}
                <small>
                  Set{" "}
                  {Math.min(
                    e.sets.length,
                    e.sets.filter((t) => t.done).length + 1,
                  )}{" "}
                  of {e.sets.length}
                </small>
              </div>
              <p className="exercise-prescription">
                {e.plannedWorkingSets ??
                  e.sets.filter((t) => t.kind === "working").length}{" "}
                sets &middot;{" "}
                {e.target ? (
                  <>
                    {e.target.min}&ndash;{e.target.max} reps &middot;{" "}
                    {e.target.rir} RIR target
                  </>
                ) : (
                  "No saved prescription"
                )}
              </p>
              <div className="logger-actions">
                {!history && (
                  <Button
                    title="Progression"
                    onClick={() => setSheet("Next workout coach")}
                  >
                    <Sparkles size={17} />
                  </Button>
                )}
                <Button onClick={() => setSheet("Info")}>Info</Button>
                <Button onClick={() => setSheet("Warm Up")}>Warm Up</Button>
                <Button onClick={() => setSheet("Targets")}>Targets</Button>
                <Button
                  title="Exercise options"
                  onClick={() => setSheet("Exercise options")}
                >
                  •••
                </Button>
              </div>
              <div className="set-table">
                <div className="set-header">
                  <span>Set</span>
                  <span>Previous</span>
                  <span>
                    {(e.convention || ex.convention) === "machine-label"
                      ? "LABEL"
                      : unit}
                  </span>
                  <span>Reps</span>
                  <button
                    className="effort-scale"
                    aria-label="Effort scale"
                    onClick={() => setSheet("Effort scale")}
                  >
                    {effort}
                  </button>
                  <span>✓</span>
                </div>
                {e.sets.map((set, i) => (
                  <SwipeRow
                    key={set.id}
                    label={`Remove ${ex.name} set ${i + 1}`}
                    disabled={
                      history ||
                      (!!e.technique && e.technique !== "straight") ||
                      !!e.techniqueGroup ||
                      !!e.superset ||
                      (!!set.bout && set.bout !== "straight")
                    }
                    remove={() => {
                      try {
                        erased(removeSet(s, e.id, set.id));
                      } catch (err) {
                        setActionError((err as Error).message);
                      }
                    }}
                  >
                    <div
                      className={"set-row " + (set.done ? "completed" : "")}
                      key={set.id}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "Enter" ||
                          !(event.target instanceof HTMLInputElement)
                        )
                          return;
                        event.preventDefault();
                        const controls = Array.from(
                          event.currentTarget.querySelectorAll<HTMLElement>(
                            "input,button.complete-set",
                          ),
                        );
                        const next =
                          controls[controls.indexOf(event.target) + 1];
                        next?.focus();
                      }}
                    >
                      <span className="set-number">
                        {set.kind === "warmup"
                          ? "W"
                          : set.bout === "activation"
                            ? "A"
                            : set.bout === "mini"
                              ? "M"
                              : set.bout === "giant"
                                ? "G"
                                : set.bout === "down"
                                  ? "↓"
                                  : set.kind === "drop"
                                    ? "D"
                                    : i + 1}
                      </span>
                      <div className="previous-set">
                        {set.kind === "working" &&
                        priorRows[
                          e.sets.slice(0, i).filter((t) => t.kind === "working")
                            .length
                        ] ? (
                          <span>
                            {fmt(
                              D.displayLoad(
                                priorRows[
                                  e.sets
                                    .slice(0, i)
                                    .filter((t) => t.kind === "working").length
                                ].weight,
                                e.convention || ex.convention,
                                unit,
                              ),
                            )}
                            <small>
                              &times;{" "}
                              {
                                priorRows[
                                  e.sets
                                    .slice(0, i)
                                    .filter((t) => t.kind === "working").length
                                ].reps
                              }
                            </small>
                          </span>
                        ) : (
                          <span className="muted">&mdash;</span>
                        )}
                      </div>
                      <div className="row-load">
                        {" "}
                        <Num
                          label={`${ex.name} set ${i + 1} weight`}
                          value={D.displayLoad(
                            set.weight,
                            e.convention || ex.convention,
                            unit,
                          )}
                          step={0.01}
                          max={unit === "kg" ? 2000 : 4409}
                          onChange={(n) =>
                            updateSet(e, {
                              ...set,
                              weight: D.canonicalLoad(
                                n,
                                e.convention || ex.convention,
                                unit,
                              ),
                            })
                          }
                        />
                        {set.kind === "working" &&
                          set.prescription &&
                          (set.prescription.proposalId ||
                            set.prescription.weight !== set.weight ||
                            set.prescription.reps !== set.reps) && (
                            <small
                              className="assigned-row"
                              title="Assigned load and reps"
                            >
                              {fmt(
                                D.displayLoad(
                                  set.prescription.weight,
                                  e.convention || ex.convention,
                                  unit,
                                ),
                              )}{" "}
                              &times; {set.prescription.reps}
                            </small>
                          )}
                        {set.prescription &&
                          set.prescription.rest !== e.target?.rest && (
                            <small
                              className="assigned-row"
                              title="Assigned rest"
                            >
                              {set.prescription.rest}s rest
                            </small>
                          )}
                      </div>
                      <div className="row-reps">
                        <Num
                          label={`${ex.name} set ${i + 1} reps`}
                          value={set.reps}
                          min={1}
                          max={100}
                          onChange={(n) => updateSet(e, { ...set, reps: n })}
                        />
                        {set.prescription &&
                          (set.prescription.min !== e.target?.min ||
                            set.prescription.max !== e.target?.max) && (
                            <small
                              className="assigned-row"
                              title="Assigned rep range"
                            >
                              {set.prescription.min}–{set.prescription.max}
                            </small>
                          )}
                      </div>
                      <div className="row-effort-cell">
                        <input
                          className="row-effort"
                          style={{
                            color: rirColour(
                              set.rir,
                              set.effortReported === true,
                            ),
                          }}
                          title="Effort scale: 0 RIR is red; 10 RIR is green. Unknown stays grey."
                          type="number"
                          inputMode="decimal"
                          enterKeyHint="done"
                          onFocus={(event) => event.currentTarget.select()}
                          step="0.5"
                          min="0"
                          max="10"
                          placeholder="—"
                          aria-label={`${ex.name} set ${i + 1} ${effort}`}
                          value={
                            set.effortReported
                              ? effort === "RIR"
                                ? set.rir
                                : 10 - set.rir
                              : ""
                          }
                          onChange={(ev) => {
                            const raw = ev.target.value,
                              value = ev.target.valueAsNumber;
                            if (raw === "") {
                              updateSet(e, { ...set, effortReported: false });
                              return;
                            }
                            if (
                              Number.isFinite(value) &&
                              value >= 0 &&
                              value <= 10
                            )
                              updateSet(e, {
                                ...set,
                                rir: effort === "RIR" ? value : 10 - value,
                                effortReported: true,
                              });
                          }}
                        />
                        {set.prescription &&
                          set.prescription.rir !== e.target?.rir && (
                            <small
                              className="assigned-row"
                              title="Assigned effort target"
                            >
                              {effort === "RIR"
                                ? set.prescription.rir
                                : 10 - set.prescription.rir}{" "}
                              {effort}
                            </small>
                          )}
                      </div>
                      <button
                        className={
                          "complete-set " + (set.done ? "checked" : "")
                        }
                        disabled={setupRequired && set.kind !== "warmup"}
                        aria-label={`${set.done ? "Undo" : "Complete"} ${ex.name} set ${i + 1}`}
                        aria-pressed={set.done}
                        onClick={() => {
                          unlockFeedbackAudio();
                          const toggled = D.toggleSet(s, set.id);
                          if (
                            !history &&
                            !set.done &&
                            data.settings.celebrations !== false &&
                            !celebrated.current.has(e.id) &&
                            sessionRecords(toggled, previous, exercises).some(
                              (r) =>
                                r.entryId === e.id && r.kind !== "baseline",
                            )
                          ) {
                            celebrated.current.add(e.id);
                            if (data.settings.celebrationSound)
                              feedbackTone(true);
                            if (typeof navigator.vibrate === "function")
                              navigator.vibrate(25);
                          }
                          if (onDone) onDone(set.id, e);
                          else updateSet(e, { ...set, done: !set.done });
                          if (
                            !history &&
                            !set.done &&
                            data.settings.autoAdvance !== false
                          ) {
                            const next = nextExerciseId(toggled, e.id);
                            setSelected(next);
                            if (next !== e.id)
                              tabs.current
                                ?.querySelector<HTMLElement>(
                                  `[id="tab-${next}"]`,
                                )
                                ?.focus({ preventScroll: true });
                            tabs.current
                              ?.querySelector<HTMLElement>(`[id="tab-${next}"]`)
                              ?.scrollIntoView({
                                block: "nearest",
                                inline: "nearest",
                              });
                          }
                        }}
                      >
                        <Check size={19} />
                      </button>
                    </div>
                  </SwipeRow>
                ))}
              </div>
              {!history && data.settings.celebrations !== false && (
                <LiveRecordBadge
                  sessionId={s.id}
                  entryId={e.id}
                  records={records}
                  unit={unit}
                  convention={e.convention || ex.convention}
                />
              )}
              {setupRequired && (
                <Button onClick={() => setSheet("Exercise options")}>
                  Confirm technique setup
                </Button>
              )}
              {e.technique === "giant-set" && (
                <p className="caption" role="status">
                  Rep goal: {giantProgress(e).reps} / {giantProgress(e).goal} ·
                  same load, raw bouts
                </p>
              )}
              {e.technique === "tempo" && (
                <p className="caption">
                  Tempo: {e.tempo?.eccentric ?? 2}s lower /{" "}
                  {e.tempo?.pause ?? 1}s pause / {e.tempo?.concentric ?? 1}s
                  lift
                </p>
              )}
              {(e.technique === "superset" || e.technique === "pre-exhaust") &&
                e.techniqueGroup && (
                  <p className="caption">
                    {e.technique === "pre-exhaust" ? "Pre-exhaust" : "Superset"}{" "}
                    ·{" "}
                    {s.exercises
                      .filter((x) => x.techniqueGroup === e.techniqueGroup)
                      .map(
                        (x) =>
                          exercises.find((ex) => ex.id === x.exerciseId)?.name,
                      )
                      .join(" → ")}{" "}
                    · alternate tabs for each round
                  </p>
                )}
              <Button
                variant="ghost add-set"
                disabled={history || e.sets.length >= 40}
                onClick={() => {
                  if (e.technique && e.technique !== "straight") {
                    setSheet("Add bout");
                    return;
                  }
                  const last = e.sets.at(-1);
                  updateEntry({
                    ...e,
                    sets: [
                      ...e.sets,
                      {
                        id: D.uid(),
                        weight: last?.weight || 0,
                        reps: last?.reps || 8,
                        rir: last?.rir ?? 2,
                        effortReported: false,
                        kind: "working",
                        done: history,
                      },
                    ],
                  });
                }}
              >
                <Plus size={18} />
                {e.technique === "myoreps"
                  ? "Add mini bout"
                  : e.technique === "drop-set"
                    ? "Add drop bout"
                    : e.technique === "giant-set"
                      ? "Add giant bout"
                      : e.technique === "down-set"
                        ? "Add down set"
                        : "Add set"}
              </Button>
              {sheet && (
                <Modal
                  title={
                    sheet === "Info"
                      ? ex.name
                      : sheet === "Next workout coach"
                        ? "Progression"
                        : sheet
                  }
                  close={() => setSheet(null)}
                >
                  {sheet === "Effort scale" ? (
                    <p>
                      RIR means reps in reserve. 0 is red and 10 is green, with
                      a continuous scale between. Unknown effort stays grey (—).
                      Colour describes effort, not good or bad, and never
                      changes your rewards.
                    </p>
                  ) : sheet === "Info" ? (
                    <VideoInfo exercise={ex} />
                  ) : sheet === "Next workout coach" ? (
                    <CoachSheet
                      session={s}
                      entryId={e.id}
                      onOpenWorkout={() => setSheet(null)}
                    />
                  ) : sheet === "Substitute exercise" ? (
                    <SubstitutionSheet
                      session={s}
                      entry={e}
                      onDone={(id) => {
                        setSelected(id);
                        setSheet(null);
                      }}
                    />
                  ) : sheet === "Exercise queue" ? (
                    <ExerciseQueue
                      session={s}
                      exercises={exercises}
                      onChange={setSession}
                      onRemove={(id) => erased(removeEntry(s, id))}
                      onSelect={(id) => {
                        setSelected(id);
                        setSheet(null);
                      }}
                      onSaveOrder={() => {
                        try {
                          change((state) => saveSessionOrder(state, s));
                          setActionError("Order saved for future workouts.");
                        } catch (err) {
                          setActionError((err as Error).message);
                        }
                      }}
                    />
                  ) : sheet === "Exercise options" ? (
                    <>
                      <TechniqueSheet
                        key={e.id}
                        session={s}
                        entry={e}
                        exercises={exercises}
                        unit={unit}
                        onChange={setSession}
                        history={history}
                      />
                      <div className="actions wrap">
                        <Button onClick={() => setSheet("Readiness")}>
                          Readiness
                        </Button>
                        {!history && (
                          <Button onClick={() => setSheet("Equipment setup")}>
                            Equipment setup
                          </Button>
                        )}
                        {!history && (
                          <Button
                            onClick={() => {
                              setSheet("Substitute exercise");
                            }}
                          >
                            Swap
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          onClick={() => {
                            setSheet(null);
                            remove("Remove exercise?", () =>
                              setSession({
                                ...s,
                                exercises: s.exercises.filter(
                                  (x) => x.id !== e.id,
                                ),
                              }),
                            );
                          }}
                        >
                          Remove {ex.name}
                        </Button>
                        <Button
                          onClick={() =>
                            setEffort(effort === "RIR" ? "RPE" : "RIR")
                          }
                        >
                          Use {effort === "RIR" ? "RPE" : "RIR"}
                        </Button>
                      </div>
                      <Field label={`${ex.name} notes`}>
                        <textarea
                          maxLength={2000}
                          value={e.notes}
                          onChange={(ev) =>
                            updateEntry({ ...e, notes: ev.target.value })
                          }
                        />
                      </Field>
                      <details>
                        <summary>Previous performance</summary>
                        {prior ? (
                          <p>
                            {prior.sets
                              .filter((t) => t.done && t.kind !== "warmup")
                              .map(
                                (t) =>
                                  `${fmt(D.displayLoad(t.weight, e.convention || ex.convention, unit))} × ${t.reps}`,
                              )
                              .join(" / ") || "Warmups only"}
                          </p>
                        ) : (
                          <p>No previous sets.</p>
                        )}
                      </details>
                    </>
                  ) : sheet === "Add bout" ? (
                    <TechniqueSheet
                      key={e.id + "bout"}
                      session={s}
                      entry={e}
                      exercises={exercises}
                      unit={unit}
                      onChange={setSession}
                      history={history}
                      addOnly
                    />
                  ) : sheet === "Readiness" ? (
                    <ReadinessSheet
                      key={e.id}
                      value={s.readiness}
                      muscles={[
                        ...new Set([
                          ex.muscle,
                          ...ex.secondary,
                          ...s.exercises.flatMap((e) => {
                            const x = exercises.find(
                              (x) => x.id === e.exerciseId,
                            );
                            return x ? [x.muscle, ...x.secondary] : [];
                          }),
                        ]),
                      ]}
                      readOnly={
                        history ||
                        s.exercises.some((e) =>
                          e.sets.some((t) => t.done && t.kind !== "warmup"),
                        )
                      }
                      onSave={(readiness) => {
                        setSession({ ...s, readiness });
                        setSheet(null);
                      }}
                    />
                  ) : sheet === "Equipment setup" ? (
                    e.sets.some((t) => t.done && t.kind !== "warmup") ? (
                      <p>
                        Working sets have already been recorded. Keep their
                        setup intact; select a different setup before working
                        sets in your next session.
                      </p>
                    ) : (
                      <EquipmentSetup
                        key={e.id}
                        entry={e}
                        exercise={ex}
                        unit={unit}
                        onSave={(setup) => updateEntry({ ...e, setup })}
                        onUseForProgram={
                          program &&
                          s.workoutId &&
                          e.sourceTargetId &&
                          program.workouts.some(
                            (w) =>
                              w.id === s.workoutId &&
                              w.exercises.some(
                                (t) =>
                                  t.id === e.sourceTargetId &&
                                  t.exerciseId === e.exerciseId,
                              ),
                          )
                            ? () => {
                                change((d) => {
                                  const p = d.programs.find(
                                    (p) => p.id === s.programId,
                                  );
                                  const t = p?.workouts
                                    .find((w) => w.id === s.workoutId)
                                    ?.exercises.find(
                                      (t) =>
                                        t.id === e.sourceTargetId &&
                                        t.exerciseId === e.exerciseId,
                                    );
                                  if (t) {
                                    t.setup = structuredClone(e.setup);
                                    t.nextRows = undefined;
                                    t.coachingProposalId = undefined;
                                  }
                                  return d;
                                });
                                setSheet(null);
                              }
                            : undefined
                        }
                      />
                    )
                  ) : (
                    <>
                      <p className="target-hint">
                        {e.target
                          ? `Target: ${e.target.min}–${e.target.max} reps · ${e.target.rir} RIR · ${e.target.rest}s rest`
                          : "Free workout targets"}
                        {e.superset ? ` · Superset ${e.superset}` : ""}
                      </p>
                      {sheet === "Targets" && e.target && (
                        <div className="form-grid">
                          <Field label="Minimum reps">
                            <Num
                              label="Minimum reps"
                              value={e.target.min}
                              min={1}
                              max={e.target.max}
                              onChange={(n) =>
                                updateEntry({
                                  ...e,
                                  target: { ...e.target!, min: n },
                                })
                              }
                            />
                          </Field>
                          <Field label="Maximum reps">
                            <Num
                              label="Maximum reps"
                              value={e.target.max}
                              min={e.target.min}
                              max={100}
                              onChange={(n) =>
                                updateEntry({
                                  ...e,
                                  target: { ...e.target!, max: n },
                                })
                              }
                            />
                          </Field>
                          <Field label="Rest seconds">
                            <Num
                              label="Rest seconds"
                              value={e.target.rest}
                              max={900}
                              onChange={(n) =>
                                updateEntry({
                                  ...e,
                                  target: { ...e.target!, rest: n },
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {sheet === "Targets" &&
                        e.target &&
                        !e.sets.some((t) => t.done && t.kind !== "warmup") &&
                        !e.sets.some((t) => t.prescription?.proposalId) && (
                          <Button
                            disabled={e.sets.some(
                              (t) =>
                                t.kind === "working" &&
                                (t.reps < e.target!.min ||
                                  t.reps > e.target!.max),
                            )}
                            onClick={() => {
                              let ordinal = 0;
                              updateEntry({
                                ...e,
                                plannedWorkingSets: e.sets.filter(
                                  (t) => t.kind === "working",
                                ).length,
                                sets: e.sets.map((t) =>
                                  t.kind !== "working"
                                    ? t
                                    : {
                                        ...t,
                                        effortReported: false,
                                        prescription: {
                                          weight: t.weight,
                                          reps: t.reps,
                                          min: e.target!.min,
                                          max: e.target!.max,
                                          rir: e.target!.rir,
                                          rest: e.target!.rest,
                                          ordinal: ordinal++,
                                        },
                                      },
                                ),
                              });
                            }}
                          >
                            Use current unlogged rows as manual plan
                          </Button>
                        )}
                      {sheet === "Targets" &&
                        e.plannedWorkingSets !==
                          e.sets.filter((t) => t.kind === "working").length && (
                          <div className="training-coaching">
                            <p>
                              Added or removed sets do not silently change the
                              prescription. Confirm a deliberate dose change;
                              skipped work should stay incomplete.
                            </p>
                            <Button
                              onClick={() =>
                                updateEntry({
                                  ...e,
                                  plannedWorkingSets: e.sets.filter(
                                    (t) => t.kind === "working",
                                  ).length,
                                })
                              }
                            >
                              Confirm planned dose:{" "}
                              {
                                e.sets.filter((t) => t.kind === "working")
                                  .length
                              }{" "}
                              working sets
                            </Button>
                          </div>
                        )}
                      <p className="caption">
                        Warm-up sets do not count toward working volume.
                      </p>
                      {e.sets.map((set, i) => (
                        <div className="set-options" key={set.id}>
                          <span>Set {i + 1}</span>
                          <select
                            aria-label={`${ex.name} set ${i + 1} type`}
                            value={set.kind}
                            onChange={(ev) =>
                              updateSet(e, {
                                ...set,
                                kind: ev.target.value as D.SetLog["kind"],
                              })
                            }
                          >
                            <option value="working">Working</option>
                            <option value="warmup">Warm-up</option>
                            <option value="drop">Drop</option>
                          </select>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${ex.name} set ${i + 1}`}
                            onClick={() => {
                              setSheet(null);
                              remove("Remove set?", () =>
                                updateEntry({
                                  ...e,
                                  sets: e.sets.filter((x) => x.id !== set.id),
                                }),
                              );
                            }}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </Modal>
              )}
            </section>
          );
        })}
    </div>
  );
}
