import { useState } from "react";
import * as D from "./domain";
import { Button, Field, Num } from "./ui";

type Feedback = D.Session["feedback"];
type MuscleFeedback = NonNullable<D.Session["muscleFeedback"]>[number];
const unknownFeedback = (): Feedback => ({
  pump: null,
  soreness: null,
  fatigue: null,
  pain: null,
  reported: false,
});
const ratingText = (value: number | null | undefined) =>
  value == null ? "Unknown" : `${value}/5`;
const painText = (value: boolean | null | undefined) =>
  value == null
    ? "Unknown"
    : value
      ? "Yes · pain recorded"
      : "No pain reported";

export function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value ?? "unknown"}
        onChange={(e) =>
          onChange(e.target.value === "unknown" ? null : Number(e.target.value))
        }
      >
        <option value="unknown">Unknown / not reported</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} · {["Minimal", "Mild", "Moderate", "High", "Very high"][n - 1]}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Pain({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value == null ? "unknown" : value ? "yes" : "no"}
        onChange={(e) =>
          onChange(
            e.target.value === "unknown" ? null : e.target.value === "yes",
          )
        }
      >
        <option value="unknown">Unknown / not reported</option>
        <option value="no">No pain</option>
        <option value="yes">Pain present</option>
      </select>
    </Field>
  );
}

export function SessionFeedbackFields({
  value,
  onChange,
}: {
  value: Feedback;
  onChange: (f: Feedback) => void;
}) {
  function update(patch: Partial<Feedback>) {
    // Historical defaults are not retroactively attested by editing one field.
    const next = {
      ...(value.reported === true ? value : {...unknownFeedback(), pain: value.pain === true ? true : null}),
      ...patch,
    };
    next.reported = [next.pump, next.soreness, next.fatigue, next.pain].some(
      (v) => v != null,
    );
    onChange(next);
  }
  const shown =
    value.reported === true
      ? value
      : { ...unknownFeedback(), pain: value.pain === true ? true : null };
  return (
    <div className="training-coaching">
      <p className="caption">
        Optional. Unknown is not neutral or evidence of good recovery. Use
        muscle-specific feedback for local soreness and pain. Session fatigue
        describes broader/systemic tiredness; unscoped pain is a broader safety
        signal.
      </p>
      <div className="feedback-grid">
        <Rating
          label="Systemic fatigue"
          value={shown.fatigue}
          onChange={(fatigue) => update({ fatigue })}
        />
        <Pain
          label="Unscoped pain"
          value={shown.pain}
          onChange={(pain) => update({ pain })}
        />
      </div>
      <details>
        <summary>Other unscoped observations</summary>
        <div className="feedback-grid">
          <Rating
            label="Unscoped pump"
            value={shown.pump}
            onChange={(pump) => update({ pump })}
          />
          <Rating
            label="Unscoped soreness"
            value={shown.soreness}
            onChange={(soreness) => update({ soreness })}
          />
        </div>
      </details>
    </div>
  );
}

export function MuscleFeedbackFields({
  value,
  onChange,
  muscles,
}: {
  value: MuscleFeedback[];
  onChange: (v: MuscleFeedback[]) => void;
  muscles: D.Exercise["muscle"][];
}) {
  const available = muscles.filter((m) => !value.some((f) => f.muscle === m));
  const [selected, setSelected] = useState<D.Exercise["muscle"] | "">(
    available[0] ?? "",
  );
  function update(index: number, patch: Partial<MuscleFeedback>) {
    onChange(
      value.map((f, i) =>
        i === index ? { ...f, ...patch, recordedAt: Date.now() } : f,
      ),
    );
  }
  return (
    <details className="training-coaching muscle-feedback">
      <summary>Muscle-specific feedback</summary>
      <p className="caption">
        Only report what you know. Recovery is relative to the next same-muscle
        exposure, not a growth timer. Pump and soreness are context, not
        measures of growth. Pain is separate from normal muscle soreness; do not
        train through it.
      </p>
      {value.map((f, i) => (
        <fieldset key={f.muscle}>
          <legend>{f.muscle}</legend>
          <div className="feedback-grid">
            <Rating
              label={`${f.muscle} soreness`}
              value={f.soreness}
              onChange={(soreness) => update(i, { soreness })}
            />
            <Rating
              label={`${f.muscle} fatigue`}
              value={f.fatigue}
              onChange={(fatigue) => update(i, { fatigue })}
            />
            <Pain
              label={`${f.muscle} pain`}
              value={f.pain}
              onChange={(pain) => update(i, { pain })}
            />
            <Field label={`${f.muscle} recovery`}>
              <select
                value={f.recovered ?? "unknown"}
                onChange={(e) =>
                  update(i, {
                    recovered: e.target.value as MuscleFeedback["recovered"],
                  })
                }
              >
                <option value="unknown">Unknown / too early to tell</option>
                <option value="yes">Recovered ahead of next exposure</option>
                <option value="just">Recovered just in time</option>
                <option value="no">Not recovered</option>
              </select>
            </Field>
            <Rating
              label={`${f.muscle} pump`}
              value={f.pump}
              onChange={(pump) => update(i, { pump })}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => onChange(value.filter((_, index) => i !== index))}
          >
            Remove {f.muscle} report
          </Button>
        </fieldset>
      ))}
      {!!available.length && (
        <div className="actions wrap">
          <Field label="Feedback muscle">
            <select
              value={
                available.includes(selected as D.Exercise["muscle"])
                  ? selected
                  : available[0]
              }
              onChange={(e) =>
                setSelected(e.target.value as D.Exercise["muscle"])
              }
            >
              {available.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Button
            onClick={() =>
              onChange([
                ...value,
                {
                  muscle: available.includes(selected as D.Exercise["muscle"])
                    ? (selected as D.Exercise["muscle"])
                    : available[0],
                  pump: null,
                  soreness: null,
                  fatigue: null,
                  pain: null,
                  recovered: "unknown",
                  recordedAt: Date.now(),
                },
              ])
            }
          >
            Add muscle feedback
          </Button>
        </div>
      )}
    </details>
  );
}

export function FinishSessionFeedback({
  draft,
  exercises,
  finish,
}: {
  draft: D.Session;
  exercises: D.Exercise[];
  finish: (f: Feedback, m: MuscleFeedback[], confirmEffort: boolean) => void;
}) {
  const [feedback, setFeedback] = useState<Feedback>(() =>
    draft.feedback.reported === true
      ? draft.feedback
      : {
          ...unknownFeedback(),
          pain: draft.feedback.pain === true ? true : null,
        },
  );
  const [muscleFeedback, setMuscleFeedback] = useState<MuscleFeedback[]>(
    draft.muscleFeedback ?? [],
  );
  const [confirmEffort, setConfirmEffort] = useState(false);
  const muscles = [
    ...new Set(
      draft.exercises
        .filter((e) => e.sets.some((s) => s.done && s.kind !== "warmup"))
        .flatMap((e) => {
          const ex = exercises.find((x) => x.id === e.exerciseId);
          return ex ? [ex.muscle, ...ex.secondary] : [];
        }),
    ),
  ];
  return (
    <div className="training-coaching finish-feedback">
      <p>
        Save completed sets only. Feedback is optional; skipped observations
        stay unknown.
      </p>
      <p className="caption">
        {
          draft.exercises
            .flatMap((e) => e.sets)
            .filter((t) => t.done && t.kind !== "warmup").length
        }{" "}
        completed working / drop sets.
      </p>
      <SessionFeedbackFields value={feedback} onChange={setFeedback} />
      <label className="check-line">
        <input type="checkbox" checked={confirmEffort} onChange={e => setConfirmEffort(e.target.checked)} />
        I confirm the recorded RIR values describe my actual completed sets.
      </label>
      <p className="caption">Leave unchecked if unsure. Unconfirmed effort is saved but cannot justify progression. Edit inaccurate values before confirming.</p>
      <MuscleFeedbackFields
        value={muscleFeedback}
        onChange={setMuscleFeedback}
        muscles={muscles}
      />
      <p className="caption">
        Pain is not training stimulus. Persistent or concerning pain needs
        qualified support. No automatic program changes.
      </p>
      <Button
        variant="primary wide"
        onClick={() => finish(feedback, muscleFeedback, confirmEffort)}
      >
        Save completed workout
      </Button>
    </div>
  );
}

export function FeedbackSummary({ session: s }: { session: D.Session }) {
  const f = s.feedback;
  const reported = f.reported === true;
  return (
    <div className="training-coaching feedback-summary">
      <p className="caption">
        {reported
          ? "Explicit session observations"
          : f.reported === undefined
            ? "Legacy / unreported feedback · old defaults are not verified observations"
            : "Session feedback not reported"}
      </p>
      <div className="tag-row">
        <span className="tag">
          Systemic fatigue: {ratingText(reported ? f.fatigue : null)}
        </span>
        <span className="tag">
          Unscoped pain:{" "}
          {painText(f.pain === true ? true : reported ? f.pain : null)}
        </span>
        <span className="tag">
          Unscoped soreness: {ratingText(reported ? f.soreness : null)}
        </span>
        <span className="tag">
          Pump: {ratingText(reported ? f.pump : null)}
        </span>
      </div>
      {(s.muscleFeedback ?? []).map((f) => (
        <div key={f.muscle} className="muscle-report">
          <b>{f.muscle}</b>
          <p>
            Soreness: {ratingText(f.soreness)} · Local fatigue:{" "}
            {ratingText(f.fatigue)} · Pain: {painText(f.pain)}
          </p>
          <p>
            Recovery:{" "}
            {
              {
                yes: "Ahead of next exposure",
                just: "Just in time",
                no: "Not recovered",
                unknown: "Unknown",
              }[f.recovered ?? "unknown"]
            }{" "}
            · Pump: {ratingText(f.pump)}
          </p>
        </div>
      ))}
      <p className="caption">
        Pump and soreness are contextual observations, not proof of growth.
      </p>
    </div>
  );
}

type Decision = {
  evidence?: string[];
  assumptions?: string[];
  sourcePages?: number[];
  policyVersion?: string;
};
export function DecisionEvidence({ decision }: { decision: Decision }) {
  return (
    <details className="training-coaching decision-evidence">
      <summary>Evidence and uncertainty</summary>
      <h4>Evidence</h4>
      {decision.evidence?.length ? (
        <ul>
          {decision.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : (
        <p>No supporting observations yet.</p>
      )}
      <h4>Assumptions / limits</h4>
      {decision.assumptions?.length ? (
        <ul>
          {decision.assumptions.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : (
        <p>No additional assumptions supplied.</p>
      )}
      <p className="caption">
        Policy: {decision.policyVersion ?? "Not supplied"} ·{" "}
        {decision.sourcePages?.length
          ? `Training Principles, physical PDF pp. ${decision.sourcePages.join(", ")}`
          : "Source pages not supplied"}
        . Original deterministic app policy, not a measured growth score or
        medical diagnosis.
      </p>
    </details>
  );
}

export function MuscleReview({
  sessions,
  exercises,
  experience,
  program,
  readiness,
  onReviewProgram,
}: {
  sessions: D.Session[];
  exercises: D.Exercise[];
  experience?: D.Experience;
  program?: D.Program;
  readiness?: D.Readiness;
  onReviewProgram?: (p: D.Program) => void;
}) {
  const [muscle, setMuscle] = useState<D.Exercise["muscle"]>("Quads");
  const decision = D.muscleReview(muscle, sessions, exercises, {
    experience,
    readiness,
    phase: program ? D.programPhase(program) : undefined,
  });
  return (
    <section className="panel training-coaching muscle-review">
      <div className="section-heading">
        <h2>Muscle review</h2>
        <Field label="Review muscle">
          <select
            value={muscle}
            onChange={(e) => setMuscle(e.target.value as D.Exercise["muscle"])}
          >
            {D.muscles.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <h3>
        {
          {
            hold: "Hold and observe",
            recover: "Review local recovery",
            "volume-review": "Review a small volume change",
            "deload-review": "Review broader fatigue",
          }[decision.action]
        }
      </h3>
      <p>{decision.reason}</p>
      <DecisionEvidence decision={decision} />
      <p className="caption">
        No automatic set additions or history edits. Local muscle soreness/pain
        is distinct from unscoped pain and systemic fatigue. Review supporting
        muscles and repeatable performance before changing dose.
      </p>
      {program && onReviewProgram && (
        <Button onClick={() => onReviewProgram(program)}>
          Review future program targets
        </Button>
      )}
    </section>
  );
}

export function PhasePreview({
  program,
  exercises,
  sessions,
  experience,
}: {
  program: D.Program;
  exercises: D.Exercise[];
  sessions: D.Session[];
  experience?: D.Experience;
}) {
  const phase = D.programPhase(program);
  return (
    <details className="training-coaching phase-preview">
      <summary>Actual next-workout targets</summary>
      <p>
        Phase: <b>{phase}</b> · Week {program.currentWeek}. Preview uses the
        same preparation policy as Start workout, including your training
        experience.
      </p>
      {phase === "active-rest" ? (
        <p>
          No hard-set targets. Starting this program opens the rest explanation
          without creating a lifting draft.
        </p>
      ) : (
        program.workouts.map((w) => (
          <section key={w.id}>
            <h4>{w.name}</h4>
            <ul>
              {D.prepareWorkout(
                w,
                program,
                exercises,
                sessions,
                experience,
              ).map((entry) => {
                const ex = exercises.find((ex) => ex.id === entry.exerciseId)!;
                return (
                  <li key={entry.exerciseId}>
                    {ex.name}: {entry.sets.length} sets × {entry.target?.min}–
                    {entry.target?.max} reps · {entry.target?.rir} RIR
                    {entry.sets.length
                      ? ` · starting load ${entry.sets[0].weight} ${ex.convention === "machine-label" ? "machine label" : "kg (stored)"}`
                      : ""}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="caption">
        Starting loads are suggestions from comparable logs, not a required safe
        load. Review equipment, pain and readiness. Deload uses half sets/reps
        (rounded), easier effort, and lower loads for later scheduled workouts;
        maintenance/resensitization use lower volume without claiming measured
        MV. Save mesocycle explicitly to accept.
      </p>
    </details>
  );
}

const phaseDescriptions = {
  accumulation:
    "Build repeatable training. Your exercise targets stay intact unless you explicitly select an effort policy.",
  deload:
    "Reduce fatigue with fewer sets and reps, and easier effort. The preview shows the actual conservative dose; it is not a diagnosis of your recovery capacity.",
  maintenance:
    "Lower-volume practice and retention. This editable app policy is not a measurement of your maintenance volume.",
  resensitization:
    "Extended lower-volume practice, distinct from a short deload. No promise of a biological reset on a fixed schedule.",
  "active-rest":
    "No hard workout will be started from this program. Keep room for time off; change phase explicitly before resuming programmed lifting.",
};

export function PhaseControls({
  program: p,
  onChange,
}: {
  program: D.Program;
  onChange: (p: D.Program) => void;
}) {
  return (
    <fieldset className="training-coaching phase-controls">
      <legend>Future workouts only</legend>
      <p className="caption">
        Preview changes here, then use Save mesocycle to accept. Existing drafts
        and completed history are never rewritten.
      </p>
      <div className="form-grid">
        <Field label="Training phase">
          <select
            value={p.phase ?? "scheduled"}
            onChange={(e) =>
              onChange({
                ...p,
                phase:
                  e.target.value === "scheduled"
                    ? undefined
                    : (e.target.value as D.Program["phase"]),
              })
            }
          >
            <option value="scheduled">
              Scheduled · accumulation / deload week
            </option>
            {Object.keys(phaseDescriptions).map((phase) => (
              <option value={phase} key={phase}>
                {phase.charAt(0).toUpperCase() + phase.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effort policy">
          <select
            value={p.effort?.mode ?? "exercise"}
            onChange={(e) =>
              onChange({
                ...p,
                effort:
                  e.target.value === "exercise"
                    ? undefined
                    : {
                        mode: e.target.value as "fixed" | "ramp",
                        startRir: p.effort?.startRir ?? 3,
                        endRir: p.effort?.endRir ?? 3,
                      },
              })
            }
          >
            <option value="exercise">Keep per-exercise RIR</option>
            <option value="fixed">Fixed RIR</option>
            <option value="ramp">Explicit RIR ramp</option>
          </select>
        </Field>
      </div>
      {p.effort && (
        <div className="form-grid">
          <Field label="Starting RIR">
            <Num
              label="Starting RIR"
              value={p.effort.startRir}
              min={0}
              max={5}
              onChange={(startRir) =>
                onChange({
                  ...p,
                  effort: {
                    ...p.effort!,
                    startRir,
                    ...(p.effort!.mode === "fixed" ? { endRir: startRir } : {}),
                  },
                })
              }
            />
          </Field>
          {p.effort.mode === "ramp" && (
            <Field label="Ending RIR">
              <Num
                label="Ending RIR"
                value={p.effort.endRir}
                min={0}
                max={5}
                onChange={(endRir) =>
                  onChange({ ...p, effort: { ...p.effort!, endRir } })
                }
              />
            </Field>
          )}
        </div>
      )}
      <p>
        {
          phaseDescriptions[
            p.phase ??
              (p.currentWeek === p.deloadWeek ? "deload" : "accumulation")
          ]
        }
      </p>
      <p className="caption">
        Original editable NEOFORM policies, informed by Training Principles (PDF
        pp. 165–174, 269–295). Beginners retain at least 2 RIR. Phase reductions
        can override effort settings.
      </p>
    </fieldset>
  );
}
