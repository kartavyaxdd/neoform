import { WorkoutPlanDetails } from "./WorkoutPlanDetails";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Download,
  Share2,
  Trophy,
  Dumbbell,
  ChevronDown,
} from "lucide-react";
import * as D from "./domain";
import { useStore } from "./store";
import { workoutRecap } from "./workoutRecap";
import { TrainingBodyMap } from "./TrainingBodyMap";
import { weeklyPrimarySets, weekMonday } from "./workoutPresentation";
import { rirColour } from "./rewards";
import { drawWorkoutPoster } from "./workoutPoster";
import { ComparisonBars } from "./MetricChart";
import { primaryWork } from "./visualData";
export function WorkoutRecap({
  session: suppliedSession,
  exercises,
  unit,
}: {
  session: D.Session;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
}) {
  const state = useStore().box.data;
  const session =
    state.sessions.find((x) => x.id === suppliedSession.id) ?? suppliedSession;
  const model = useMemo(
    () =>
      workoutRecap(
        session,
        state.sessions,
        exercises,
        unit,
        state.coaching?.bodyweight?.kg,
      ),
    [session, state.sessions, exercises, unit, state.coaching?.bodyweight?.kg],
  );
  const [poster, setPoster] = useState(false),
    [includeEnergy, setIncludeEnergy] = useState(true),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!poster || !canvas.current) return;
    let active = true;
    setFile(null);
    setMessage("");
    try {
      drawWorkoutPoster(canvas.current, model, includeEnergy);
      canvas.current.toBlob((blob) => {
        if (!active) return;
        if (blob)
          setFile(
            new File(
              [blob],
              `neoform-${session.date}-${session.id.slice(0, 8)}.png`,
              { type: "image/png" },
            ),
          );
        else
          setMessage("Could not prepare the image. Try reopening the poster.");
      }, "image/png");
    } catch (e) {
      setMessage((e as Error).message);
    }
    return () => {
      active = false;
    };
  }, [poster, model, includeEnergy, session.date, session.id]);
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("PNG saved. Add it to your Instagram Story.");
  }
  function share() {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        void navigator.share({ files: [file] }).catch((e) => {
          if (e.name !== "AbortError")
            setMessage("Sharing was unavailable. Use Save PNG instead.");
        });
      } else download();
    } catch {
      setMessage("Use Save PNG to share this image.");
    }
  }
  return (
    <section className="workout-recap" aria-label="Workout recap">
      <ComparisonBars
        title="Completed primary work"
        rows={D.muscles
          .map((m) => ({
            label: m,
            value: primaryWork([session], exercises, m),
          }))
          .filter((r) => r.value > 0)}
      />
      <details className="recap-body">
        <summary>Muscle map</summary>
        <TrainingBodyMap
          counts={weeklyPrimarySets(
            [session],
            exercises,
            weekMonday(session.date),
          )}
        />
        <p className="recap-muscle-caption">
          {model.muscles.join(" · ") || "No completed primary-muscle work"}
        </p>
      </details>
      <section className="recap-records" aria-label="Personal records">
        <h3>
          Personal records <span>{model.records.length}</span>
        </h3>
        {model.records.length ? (
          <ul>
            {model.records.map((r) => (
              <li key={`${r.entryId}:${r.kind}:${r.weight}:${r.reps}`}>
                <div className="record-card-top">
                  {r.kind === "reps" ? (
                    <Award size={26} />
                  ) : (
                    <Trophy size={26} />
                  )}
                  <span>
                    <b>
                      {r.kind === "reps"
                        ? `${r.after} reps`
                        : `${D.displayLoad(r.after, r.convention, unit)} ${r.convention === "machine-label" ? "label" : unit}`}
                    </b>
                    <small>New</small>
                  </span>
                </div>
                <b>{r.name}</b>
                <span>{r.label}</span>
                <ComparisonBars
                  title={`${r.name} ${r.kind} PR`}
                  unit={
                    r.kind === "reps"
                      ? "reps"
                      : r.convention === "machine-label"
                        ? "label"
                        : unit
                  }
                  rows={[
                    {
                      label: "Previous",
                      value:
                        r.kind === "reps"
                          ? r.before
                          : D.displayLoad(r.before, r.convention, unit),
                    },
                    {
                      label: "New record",
                      value:
                        r.kind === "reps"
                          ? r.after
                          : D.displayLoad(r.after, r.convention, unit),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">
            {model.baselines
              ? "Baseline established. Your next comparable workouts can set new records."
              : "No new comparable records in this workout."}
          </p>
        )}
      </section>
      <WorkoutPlanDetails session={session} exercises={exercises} />
      <section className="recap-overview">
        <h3>Workout Details</h3>
        <h2>{session.name}</h2>
        <dl className="recap-facts">
          <div>
            <dt>Date</dt>
            <dd>
              {new Date(session.date + "T12:00:00").toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" },
              )}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{model.minutes == null ? "—" : `${model.minutes} min`}</dd>
          </div>
          <div>
            <dt>Completed work</dt>
            <dd>
              {model.work} bouts · {model.reps} reps
            </dd>
          </div>
          <div className="recap-score">
            <dt>Training progress</dt>
            <dd>
              +{model.xp} XP · Level {model.level}
            </dd>
          </div>
        </dl>
      </section>
      <section className="recap-exercises" aria-label="Completed exercises">
        {session.exercises.map((e) => {
          const x = exercises.find((x) => x.id === e.exerciseId),
            done = e.sets.filter((t) => t.done),
            work = done.filter((t) => t.kind !== "warmup"),
            records = model.records.filter((r) => r.entryId === e.id),
            convention = e.convention || x?.convention || "total";
          return (
            <details key={e.id}>
              <summary>
                <span className="exercise-thumbnail">
                  <Dumbbell size={24} />
                </span>
                <span>
                  <b>{x?.name ?? "Exercise"}</b>
                  <small>
                    {work.length} completed work bouts ·{" "}
                    {work.reduce((n, t) => n + t.reps, 0)} reps
                  </small>
                  {records.length > 0 && (
                    <span className="recap-inline-record">
                      <Trophy size={13} /> {records.length}{" "}
                      {records.length === 1 ? "record" : "records"}
                    </span>
                  )}
                </span>
                <ChevronDown size={18} />
              </summary>
              <table>
                <caption className="sr-only">
                  Completed sets for {x?.name ?? "exercise"}
                </caption>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>{convention === "machine-label" ? "Label" : unit}</th>
                    <th>Reps</th>
                    <th>RIR</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((t, i) => (
                    <tr key={t.id}>
                      <td>{t.kind === "warmup" ? "W" : i + 1}</td>
                      <td>
                        {D.displayLoad(
                          t.weight,
                          convention,
                          unit,
                        ).toLocaleString()}
                      </td>
                      <td>{t.reps}</td>
                      <td
                        style={{
                          color: rirColour(t.rir, t.effortReported === true),
                        }}
                      >
                        {t.effortReported === true ? t.rir : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </section>
      {model.energy ? (
        <details className="recap-energy">
          <summary>
            ~{model.energy.low}–{model.energy.high} kcal{" "}
            <small>rough estimate</small>
          </summary>
          <p>
            Generic 3.5–6 MET scenarios × bodyweight × hours. Total session
            energy includes resting energy; this is not a measured burn or a
            confidence interval. Adult reference values are not calibrated to
            your age or metabolism. Long rests or a timer left running can
            overestimate it.
          </p>
          <p>
            {model.energy.source === "current"
              ? "Uses your current profile weight, not a weight measured on this workout date."
              : "Uses the bodyweight recorded with this workout."}{" "}
            No effort or calorie bonus affects XP.
          </p>
          <a
            href="https://pacompendium.com/conditioning-exercise/"
            target="_blank"
            rel="noreferrer"
          >
            Activity model and limitations
          </a>
        </details>
      ) : (
        <p className="caption">
          Calories not estimated: a usable duration, completed work and recorded
          bodyweight are needed.
        </p>
      )}
      <button className="btn primary wide" onClick={() => setPoster((v) => !v)}>
        <Share2 size={18} />
        {poster ? "Hide poster" : "Create share poster"}
      </button>
      {poster && (
        <div className="recap-poster">
          <p className="caption">
            Instagram Story · 1080 × 1920 PNG. Includes workout stats and up to
            three PR highlights. Your name, bodyweight, notes and recovery
            feedback stay off the image.
          </p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={includeEnergy && !!model.energy}
              disabled={!model.energy}
              onChange={(e) => {
                setFile(null);
                setIncludeEnergy(e.target.checked);
              }}
            />
            Include estimated calories
          </label>
          <canvas
            ref={canvas}
            aria-label="Workout Story poster preview"
            role="img"
          />
          <div className="actions wrap">
            <button className="btn primary" disabled={!file} onClick={share}>
              <Share2 size={18} />
              Share poster
            </button>
            <button className="btn" disabled={!file} onClick={download}>
              <Download size={18} />
              Save PNG
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
