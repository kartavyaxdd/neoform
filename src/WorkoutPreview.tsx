import * as D from "./domain";
import { estimateWorkout } from "./workoutTiming";
import { ShortWorkoutReview } from "./ShortWorkoutReview";
import { TargetMuscleCards, EntryPrescription } from "./ProgramPresentation";
import { ExercisePicker } from "./ExercisePicker";
import { VideoInfo } from "./VideoInfo";
import { Plus } from "lucide-react";
import { Button, Modal } from "./ui";
import { useMemo, useState } from "react";
import { ExerciseQueue, UndoRemoval } from "./WorkoutInteractions";
import {
  removeEntry,
  restoreRemoval,
  saveSessionOrder,
  type Removal,
} from "./workoutActions";
import { saveChange, useStore } from "./store";
import { ReadinessSheet } from "./ReadinessSheet";
import {
  createGuidancePreview,
  guidanceView,
  stageGuidance,
  type GuidancePreview,
} from "./workoutGuidance";
import type { CoachingProposal } from "./coachingTypes";
import { ChangeReviews } from "./ChangeReviews";
import { reviewAcceptedChanges } from "./coachingResponse";
import { GeminiCoach } from "./GeminiCoach";
import { canUseGemini, type CoachFocus } from "./aiCoach";
import { SubstitutionSheet } from "./SubstitutionSheet";
export function WorkoutPreview({
  workout,
  program,
  state,
  exercises,
  start,
  scheduleOccurrenceId,
}: {
  scheduleOccurrenceId?: string;
  workout: D.Workout;
  program: D.Program;
  state: D.State;
  exercises: D.Exercise[];
  start: (rows?: D.Entry[], preview?: GuidancePreview) => void | Promise<void>;
}) {
  const snapshot = useStore(),
    live = snapshot.box.data;
  const currentProgram =
      live.programs.find((p) => p.id === program.id) ?? program,
    currentWorkout =
      currentProgram.workouts.find((w) => w.id === workout.id) ?? workout;
  const [starting, setStarting] = useState(false);
  const [swapId, setSwapId] = useState<string | null>(null);
  const [geminiFocus, setGeminiFocus] = useState<CoachFocus | null>(null);
  const [shortReview, setShortReview] = useState(false);
  const [preview, setPreview] = useState(() =>
    createGuidancePreview(
      state,
      program.id,
      workout.id,
      Date.now(),
      scheduleOccurrenceId,
    ),
  );
  const [review, setReview] = useState<CoachingProposal | null>(null),
    [reviewError, setReviewError] = useState(""),
    [scope, setScope] = useState<"session" | "program">("session"),
    [readiness, setReadiness] = useState(false);
  const { session, advice, stale } = useMemo(() => {
    try {
      const view = guidanceView(live, preview);
      return { session: view.session, advice: view.rows, stale: "" };
    } catch (e) {
      return { session: preview.seed, advice: [], stale: (e as Error).message };
    }
  }, [live, preview]);
  const responses = useMemo(
    () => reviewAcceptedChanges(live, Date.now(), session),
    [live, session],
  );
  function setSession(next: D.Session) {
    // Queue changes invalidate staged advice; retain the original unaccepted rows.
    const seed = {
      ...next,
      shortPlan: undefined,
      exercises: next.exercises.map(
        (e) => preview.seed.exercises.find((old) => old.id === e.id) ?? e,
      ),
    };
    setPreview({ ...preview, seed, choices: [], records: [] });
    if (preview.seed.shortPlan)
      setNotice(
        "Queue changed. The reviewed time budget was cleared; review a shorter plan again if needed.",
      );
    else if (preview.choices.length)
      setNotice(
        "Exercises changed. Review the updated advice before applying targets.",
      );
  }
  const rows = session.exercises;
  const [picker, setPicker] = useState(false),
    [info, setInfo] = useState<D.Exercise | null>(null);
  const [undo, setUndo] = useState<{ item: Removal; until: number } | null>(
      null,
    ),
    [notice, setNotice] = useState("");
  const estimate = useMemo(
    () =>
      session.shortPlan
        ? {
            low: session.shortPlan.estimatedLow,
            high: session.shortPlan.estimatedHigh,
          }
        : estimateWorkout(live, session),
    [live, session],
  );
  return (
    <div className="workout-preview">
      <span className="sr-only">Workout preview</span>
      <TargetMuscleCards entries={rows} exercises={exercises} />
      <div className="program-exercise-count">
        <div>
          <h3>
            {rows.length} {rows.length === 1 ? "Exercise" : "Exercises"}
          </h3>
          <p className="caption">
            Estimated workout time is {estimate.low}–{estimate.high} min
          </p>
        </div>
        <button
          className="icon-button preview-add"
          disabled={
            rows.length >= 60 ||
            D.programPhase(currentProgram) === "active-rest"
          }
          aria-label="Add Exercises"
          onClick={() => setPicker(true)}
        >
          <Plus size={23} />
        </button>
      </div>
      <p className="preview-phase caption">
        {currentProgram.name} · Week {currentProgram.currentWeek} ·{" "}
        {D.programPhase(currentProgram)}
      </p>
      {session.scheduledDate && (
        <p className="caption">
          Planned for {session.scheduledDate}. Starting now records today’s
          actual date.
        </p>
      )}
      <div className="actions wrap">
        <Button
          disabled={!!stale || !!preview.choices.length || !rows.length}
          onClick={() => setShortReview(true)}
        >
          Review shorter workout
        </Button>
        {session.shortPlan && (
          <Button
            onClick={() => {
              setPreview({
                ...preview,
                seed: {
                  ...preview.seed,
                  exercises: session.shortPlan!.originalEntries,
                  shortPlan: undefined,
                },
                choices: [],
                records: [],
              });
              setNotice(
                "Full workout restored. Nothing was added to another day.",
              );
            }}
          >
            Restore full workout
          </Button>
        )}
      </div>
      {session.shortPlan && (
        <p role="status">
          Reviewed {session.shortPlan.minutes}-minute plan · omitted work stays
          omitted today.
        </p>
      )}
      {!!preview.choices.length && (
        <p className="caption">
          Clear queued targets before reviewing a shorter workout.
        </p>
      )}
      {shortReview && (
        <Modal title="Shorter workout" close={() => setShortReview(false)}>
          <ShortWorkoutReview
            state={live}
            session={session}
            apply={(next) => {
              setPreview({ ...preview, seed: next, choices: [], records: [] });
              setShortReview(false);
              setNotice(
                "Shorter plan accepted for today. Your routine is unchanged.",
              );
            }}
          />
        </Modal>
      )}
      <div className="preview-guidance-heading">
        <span>Next-workout guidance</span>
        <Button onClick={() => setReadiness(true)}>Readiness</Button>
      </div>
      <ChangeReviews reviews={responses} state={live} />
      {stale && (
        <div role="alert" className="banner">
          <p>{stale}</p>
          {live.draft ? (
            <Button onClick={() => start()}>Resume active workout</Button>
          ) : (
            <Button
              onClick={() => {
                try {
                  setPreview(
                    createGuidancePreview(
                      live,
                      program.id,
                      workout.id,
                      Date.now(),
                      scheduleOccurrenceId,
                    ),
                  );
                  setNotice("Preview refreshed. Review targets again.");
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              Refresh preview
            </Button>
          )}
        </div>
      )}
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
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
                  <button
                    type="button"
                    className="btn preview-swap"
                    aria-label={`Swap ${x.name}`}
                    disabled={!!stale || group.length > 1}
                    onClick={() => setSwapId(entry.id)}
                  >
                    Swap
                  </button>
                  {group.length > 1 && <h4>{x.name}</h4>}
                  <EntryPrescription
                    entry={entry}
                    exercise={x}
                    exact={
                      D.programPhase(program) === "accumulation" &&
                      !!currentWorkout.exercises.find(
                        (t) => t.id === entry.sourceTargetId,
                      )?.nextRows
                    }
                  />
                  {(() => {
                    const queued = preview.choices.find(
                        (c) => c.proposal.entryId === entry.id,
                      ),
                      row = advice.find((r) => r.proposal.entryId === entry.id),
                      p = queued?.proposal ?? row?.proposal;
                    return p ? (
                      <div className="preview-guidance-row">
                        <b>
                          {queued
                            ? `Queued for ${queued.scope === "session" ? "today" : "future workouts"}`
                            : row?.label}
                        </b>
                        <p className="guidance-reason">{p.reason}</p>
                        <Button
                          disabled={!!stale && !queued}
                          onClick={() => {
                            if (queued) {
                              setPreview({
                                ...preview,
                                choices: [],
                                records: [],
                              });
                              setNotice(
                                "All queued targets cleared. Your original preview targets are restored.",
                              );
                              return;
                            }
                            setReview(p);
                            setReviewError("");
                            setScope(
                              [
                                "rep-range",
                                "reduce-volume",
                                "add-volume",
                                "substitute",
                                "deload",
                              ].includes(p.action)
                                ? "program"
                                : "session",
                            );
                          }}
                        >
                          {queued
                            ? "Clear queued targets"
                            : ["hold", "recover"].includes(p.action)
                              ? "Why?"
                              : "Review targets"}
                        </Button>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : null;
            })}
          </div>
        )}
        onRemove={(id) => {
          const r = removeEntry(preview.seed, id);
          setSession(r.session);
          setUndo({ item: r.undo, until: Date.now() + 10000 });
        }}
        onSaveOrder={() =>
          saveChange((state) => saveSessionOrder(state, session))
        }
      />
      <UndoRemoval
        undo={undo}
        restore={() => {
          if (undo && Date.now() < undo.until)
            setSession(restoreRemoval(preview.seed, undo.item));
          setUndo(null);
        }}
      />
      {notice && <p role="status">{notice}</p>}
      <div className="preview-start">
        {D.programPhase(currentProgram) === "active-rest" ? (
          <p>
            No lifting is scheduled in active rest. Review your program phase to
            resume.
          </p>
        ) : (
          <Button
            variant="primary wide"
            disabled={!rows.length || !!stale || starting}
            onClick={async () => {
              setStarting(true);
              try {
                await start(rows, preview);
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setStarting(false);
              }
            }}
          >
            {starting ? "Saving workout…" : "Start workout"}
          </Button>
        )}
      </div>
      {readiness && (
        <Modal title="Current readiness" close={() => setReadiness(false)}>
          <ReadinessSheet
            value={preview.seed.readiness}
            muscles={[
              ...new Set(
                rows.flatMap((e) => {
                  const x = exercises.find((x) => x.id === e.exerciseId);
                  return x ? [x.muscle, ...x.secondary] : [];
                }),
              ),
            ]}
            readOnly={false}
            onSave={(value) => {
              setPreview({
                ...preview,
                seed: { ...preview.seed, readiness: value },
                choices: [],
                records: [],
              });
              setReadiness(false);
              setNotice(
                "Readiness updated. Review advice with this new context.",
              );
            }}
          />
        </Modal>
      )}
      {swapId && preview.seed.exercises.some((e) => e.id === swapId) && (
        <Modal title="Swap exercise" close={() => setSwapId(null)}>
          <SubstitutionSheet
            key={swapId}
            session={preview.seed}
            entry={preview.seed.exercises.find((e) => e.id === swapId)!}
            onDone={() => setSwapId(null)}
            onPreview={(next) => {
              setPreview({
                ...preview,
                seed: { ...next, shortPlan: undefined },
                choices: [],
                records: [],
              });
              setSwapId(null);
              setNotice(
                "Exercise swapped for this workout preview. Your routine is unchanged; review any shorter plan again.",
              );
            }}
          />
        </Modal>
      )}
      {review && (
        <Modal title="Review next targets" close={() => setReview(null)}>
          {reviewError && (
            <div role="alert">
              <p>{reviewError}</p>
              <Button
                onClick={() => {
                  try {
                    setPreview(
                      createGuidancePreview(
                        live,
                        program.id,
                        workout.id,
                        Date.now(),
                        scheduleOccurrenceId,
                      ),
                    );
                    setReview(null);
                  } catch (e) {
                    setReviewError((e as Error).message);
                  }
                }}
              >
                Refresh preview and clear choices
              </Button>
            </div>
          )}
          <p>{review.reason}</p>
          {canUseGemini(snapshot.user) && (
            <Button
              onClick={() =>
                setGeminiFocus({
                  title:
                    exercises.find((e) => e.id === review.exerciseId)?.name ??
                    "Recommendation",
                  action: review.action,
                  reason: review.reason.slice(0, 1000),
                  sourceIds: review.sourceIds,
                  evidence: review.evidence.slice(0, 8),
                  excluded: review.excluded.slice(0, 8),
                  targets: review.rows,
                })
              }
            >
              Explain with Gemini
            </Button>
          )}
          {geminiFocus && (
            <Modal
              title="Explain with Gemini"
              close={() => setGeminiFocus(null)}
            >
              <GeminiCoach focus={geminiFocus} />
            </Modal>
          )}
          {!["hold", "recover"].includes(review.action) && (
            <>
              <div className="table-wrap">
                <table aria-label="Current and proposed targets">
                  <thead>
                    <tr>
                      <th>Set</th>
                      <th>Current → proposed load</th>
                      <th>Reps</th>
                      <th>RIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.rows.map((r, i) => {
                      const entry = rows.find((e) => e.id === review.entryId),
                        ex = exercises.find((x) => x.id === review.exerciseId)!;
                      const convention = entry?.convention ?? ex.convention;
                      const load = (value: number) =>
                        D.displayLoad(
                          value,
                          convention,
                          live.settings.unit,
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        });
                      const before = review.beforeRows[i];
                      return (
                        <tr key={r.ordinal}>
                          <td>{r.ordinal + 1}</td>
                          <td>
                            {before ? load(before.weight) : "—"} →{" "}
                            {load(r.weight)}{" "}
                            {convention === "machine-label"
                              ? "label"
                              : live.settings.unit}
                          </td>
                          <td>
                            {before?.reps ?? "—"} → {r.reps}
                          </td>
                          <td>{r.rir}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <label>
                Apply to
                <select
                  aria-label="Guidance scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  {![
                    "rep-range",
                    "reduce-volume",
                    "add-volume",
                    "substitute",
                    "deload",
                  ].includes(review.action) && (
                    <option value="session">Today’s workout</option>
                  )}
                  <option value="program">Future workouts only</option>
                </select>
              </label>
              <p className="caption">
                {scope === "session"
                  ? "Updates today’s unfinished targets."
                  : "Updates the routine; today keeps its original targets."}{" "}
                Nothing is saved until Start workout.
              </p>
              <Button
                variant="primary wide"
                disabled={
                  !!stale || ["substitute", "deload"].includes(review.action)
                }
                onClick={() => {
                  try {
                    const staged = stageGuidance(live, preview, {
                      proposal: review,
                      choice: "accept",
                      scope,
                    });
                    if (staged.preview.seed.shortPlan) {
                      setPreview({
                        ...staged.preview,
                        seed: { ...staged.preview.seed, shortPlan: undefined },
                      });
                      setNotice(
                        "Targets queued. The reviewed time budget was cleared because targets changed.",
                      );
                    } else setPreview(staged.preview);
                    setReview(null);
                    if (!staged.preview.seed.shortPlan)
                      setNotice(
                        "Targets queued. Start workout to save your choice.",
                      );
                  } catch (e) {
                    setReviewError((e as Error).message);
                  }
                }}
              >
                Queue targets
              </Button>
            </>
          )}
          <details>
            <summary>Evidence and limits</summary>
            <p>
              {review.sourceIds.length} eligible exposures · {review.version} ·{" "}
              {review.review}
            </p>
            {[...review.evidence, ...review.excluded].map((line, i) => (
              <p key={i} className="caption">
                {line}
              </p>
            ))}
          </details>
        </Modal>
      )}
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
              setSession({
                ...preview.seed,
                exercises:
                  preview.seed.exercises.length < 60
                    ? [...preview.seed.exercises, D.createEntry(x)]
                    : preview.seed.exercises,
              })
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
