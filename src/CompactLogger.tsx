import { useRef, useState } from "react";
import {
  Plus,
  Check,
  X,
  TrendingUp,
  ChevronRight,
  Dumbbell,
} from "lucide-react";
import * as D from "./domain";
import { useStore, change } from "./store";
import { Button, Field, Num, Modal } from "./ui";
import { VideoInfo } from "./VideoInfo";
import { TechniqueSheet } from "./TechniqueSheet";
import {
  canApplyStraightProgression,
  giantProgress,
  reviewRecommendation,
} from "./techniques";
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString();
export function SessionLogger({
  session: s,
  exercises,
  unit,
  previous = [],
  setSession,
  remove,
  swap,
  onDone,
  history = false,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
  previous?: D.Session[];
  setSession: (s: D.Session) => void;
  remove: (title: string, fn: () => void) => void;
  swap?: (e: D.Entry) => void;
  onDone?: (id: string, e: D.Entry) => void;
  history?: boolean;
}) {
  const [selected, setSelected] = useState(s.exercises[0]?.id),
    [sheet, setSheet] = useState<string | null>(null),
    [effort, setEffort] = useState<"RIR" | "RPE">("RIR");
  const data = useStore().box.data;
  const decisions = data.decisions;
  const program = data.programs.find((p) => p.id === s.programId);
  const tabs = useRef<HTMLDivElement>(null);
  const current = s.exercises.find((x) => x.id === selected) || s.exercises[0];
  const updateEntry = (e: D.Entry) =>
    setSession({
      ...s,
      exercises: s.exercises.map((x) => (x.id === e.id ? e : x)),
    });
  const updateSet = (e: D.Entry, set: D.SetLog) =>
    updateEntry({ ...e, sets: e.sets.map((x) => (x.id === set.id ? set : x)) });
  return (
    <div className="logger compact-logger">
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
              <i className={e.sets.every((t) => t.done) ? "finished" : ""} />
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
          const rec = reviewRecommendation(
              e,
              D.recommend(
                e.exerciseId,
                previous,
                exercises,
                e.target || { min: 8, max: 12 },
                {
                  experience: data.profile?.experience,
                  entry: e,
                  phase: s.phase ?? (program ? D.programPhase(program) : undefined),
                },
              ),
            ),
            recKey = `${e.id}:${previous.length}`;
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
                <small>
                  Set{" "}
                  {Math.min(
                    e.sets.length,
                    e.sets.filter((t) => t.done).length + 1,
                  )}{" "}
                  of {e.sets.length}
                </small>
              </div>
              <div className="logger-actions">
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
                  <span>Target</span>
                  <span>
                    {(e.convention || ex.convention) === "machine-label"
                      ? "LABEL"
                      : unit}
                  </span>
                  <span>Reps</span>
                  <span>✓</span>
                </div>
                {e.sets.map((set, i) => (
                  <div
                    className={"set-row " + (set.done ? "completed" : "")}
                    key={set.id}
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
                    <div className="set-target">
                      <span>
                        {set.bout === "mini" || set.bout === "drop"
                          ? "5–10"
                          : set.bout === "giant"
                            ? "Goal"
                            : e.target
                              ? `${e.target.min}–${e.target.max}`
                              : "8–12"}{" "}
                        reps
                      </span>
                      <label>
                        <Num
                          label={`${ex.name} set ${i + 1} ${effort}`}
                          value={effort === "RIR" ? set.rir : 10 - set.rir}
                          max={10}
                          step={0.5}
                          onChange={(n) =>
                            updateSet(e, {
                              ...set,
                              rir: effort === "RIR" ? n : 10 - n,
                              effortReported: true,
                            })
                          }
                        />
                        <small title={set.effortReported ? "Reported effort" : "Unconfirmed effort; report it or confirm at finish"}>{effort}{set.effortReported ? "" : " ?"}</small>
                      </label>
                    </div>
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
                    <Num
                      label={`${ex.name} set ${i + 1} reps`}
                      value={set.reps}
                      min={1}
                      max={100}
                      onChange={(n) => updateSet(e, { ...set, reps: n })}
                    />
                    <button
                      className={"complete-set " + (set.done ? "checked" : "")}
                      disabled={setupRequired && set.kind !== "warmup"}
                      aria-label={`${set.done ? "Undo" : "Complete"} ${ex.name} set ${i + 1}`}
                      aria-pressed={set.done}
                      onClick={() =>
                        onDone
                          ? onDone(set.id, e)
                          : updateSet(e, { ...set, done: !set.done })
                      }
                    >
                      <Check size={19} />
                    </button>
                  </div>
                ))}
              </div>
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
                  title={sheet === "Info" ? ex.name : sheet}
                  close={() => setSheet(null)}
                >
                  {sheet === "Info" ? (
                    <VideoInfo exercise={ex} />
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
                        {swap && (
                          <Button
                            onClick={() => {
                              setSheet(null);
                              swap(e);
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
                      {!history && (
                        <details className="coach">
                          <summary>
                            <TrendingUp size={16} />
                            Progression note <ChevronRight size={14} />
                          </summary>
                          <p>{rec.reason}</p>
                          {!canApplyStraightProgression(e) && (
                            <p className="caption">
                              Technique context differs from straight sets.
                              Review the whole sequence manually; automatic
                              straight-set progression is unavailable.
                            </p>
                          )}
                          {rec.evidence?.map((text, i) => (
                            <p className="caption" key={"evidence" + i}>
                              Evidence: {text}
                            </p>
                          ))}
                          {rec.assumptions?.map((text, i) => (
                            <p className="caption" key={"assumption" + i}>
                              Assumption: {text}
                            </p>
                          ))}
                          {!!rec.sourcePages?.length && (
                            <p className="caption">
                              Source: physical PDF pp.{" "}
                              {rec.sourcePages.join(", ")} · {rec.policyVersion}
                            </p>
                          )}
                          {rec.weight !== undefined && !rec.setTargets && (
                            <p>
                              <b>
                                {fmt(
                                  D.displayLoad(
                                    rec.weight,
                                    e.convention || ex.convention,
                                    unit,
                                  ),
                                )}{" "}
                                {(e.convention || ex.convention) ===
                                "machine-label"
                                  ? "label"
                                  : unit}{" "}
                                × {rec.reps} reps
                              </b>{" "}
                              · optional next target
                            </p>
                          )}
                          {rec.setTargets && <p className="caption">
                            Working-set targets: {rec.setTargets.map(t =>
                              `${fmt(D.displayLoad(t.weight, e.convention || ex.convention, unit))} × ${t.reps}`).join(" / ")}
                            {" "}{(e.convention || ex.convention) === "machine-label" ? "label" : unit}.
                            Preserve the prescribed effort; stop short if technique or reserve would be lost.
                          </p>}
                          <div className="actions wrap">
                            <Button
                              disabled={
                                !canApplyStraightProgression(e) ||
                                !["load", "reps"].includes(rec.action)
                              }
                              onClick={() => {
                                if (!canApplyStraightProgression(e)) return;
                                let workingIndex = -1;
                                updateEntry({
                                  ...e,
                                  sets: e.sets.map((t) => {
                                    if (t.kind === "working") workingIndex++;
                                    const row = rec.setTargets?.[workingIndex];
                                    return !t.done && t.kind === "working"
                                      ? {
                                          ...t,
                                          weight: row?.weight ?? rec.weight ?? t.weight,
                                          reps: row?.reps ?? rec.reps ?? t.reps,
                                        }
                                      : t;
                                  }),
                                });
                                change((s) => ({
                                  ...s,
                                  decisions: [
                                    ...s.decisions.slice(-999),
                                    {
                                      key: recKey,
                                      choice: "accept",
                                      at: Date.now(),
                                    },
                                  ],
                                }));
                              }}
                            >
                              Accept for unlogged sets
                            </Button>
                            <Button
                              onClick={() =>
                                change((s) => ({
                                  ...s,
                                  decisions: [
                                    ...s.decisions.slice(-999),
                                    {
                                      key: recKey,
                                      choice: "defer",
                                      at: Date.now(),
                                    },
                                  ],
                                }))
                              }
                            >
                              Defer
                            </Button>
                            <Button
                              onClick={() =>
                                change((s) => ({
                                  ...s,
                                  decisions: [
                                    ...s.decisions.slice(-999),
                                    {
                                      key: recKey,
                                      choice: "decline",
                                      at: Date.now(),
                                    },
                                  ],
                                }))
                              }
                            >
                              Decline
                            </Button>
                          </div>
                          {decisions.some((d) => d.key === recKey) && (
                            <p className="caption" role="status">
                              Choice recorded:{" "}
                              {
                                decisions
                                  .filter((d) => d.key === recKey)
                                  .at(-1)!.choice
                              }
                              .
                            </p>
                          )}
                          <p className="caption">
                            Deterministic guidance, not a diagnosis. Review
                            targets against your program. Decline/defer records
                            your choice without changing sets.
                          </p>
                        </details>
                      )}
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
                      {sheet === "Targets" && e.plannedWorkingSets !== e.sets.filter(t => t.kind === "working").length && (
                        <div className="training-coaching">
                          <p>Added or removed sets do not silently change the prescription. Confirm a deliberate dose change; skipped work should stay incomplete.</p>
                          <Button onClick={() => updateEntry({ ...e,
                            plannedWorkingSets: e.sets.filter(t => t.kind === "working").length })}>
                            Confirm planned dose: {e.sets.filter(t => t.kind === "working").length} working sets
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
