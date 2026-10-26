import type { CSSProperties } from "react";
import * as D from "./domain";
import { back, front, bodySilhouette } from "./TrainingBodyMap";
import { plannedMuscleCards } from "./workoutPresentation";
import { rirColour } from "./rewards";
import { ComparisonBars } from "./MetricChart";

const crop: Partial<Record<D.Exercise["muscle"], string>> = {
  Chest: "48 40 104 90",
  Back: "48 40 104 100",
  Shoulders: "42 30 116 90",
  Core: "58 74 84 100",
  Biceps: "30 55 140 90",
  Triceps: "30 55 140 90",
  Forearms: "20 85 160 110",
  Glutes: "48 130 104 90",
  Quads: "56 143 88 100",
  Hamstrings: "56 155 88 100",
  Calves: "56 207 88 85",
  Neck: "50 0 100 85",
};
export function MuscleArtwork({
  muscle,
  full = false,
}: {
  muscle: D.Exercise["muscle"];
  full?: boolean;
}) {
  const shapes = front[muscle] ? front : back;
  return (
    <svg
      className="muscle-artwork"
      viewBox={full ? "20 0 160 300" : (crop[muscle] ?? "20 0 160 300")}
      aria-hidden="true"
    >
      <path className="anatomy-base" d={bodySilhouette} />
      {Object.entries(shapes).flatMap(([name, paths]) =>
        paths!.map((d, i) => (
          <path
            key={`${name}-${i}`}
            d={d}
            className={name === muscle ? "anatomy-target" : "anatomy-muted"}
          />
        )),
      )}
    </svg>
  );
}
export function TargetMuscleCards({
  entries,
  exercises,
}: {
  entries: D.Entry[];
  exercises: D.Exercise[];
}) {
  const cards = plannedMuscleCards(entries, exercises);
  return (
    <section className="target-muscles">
      <ComparisonBars
        title="Assigned primary work"
        rows={cards.map((c) => ({ label: c.muscle, value: c.sets }))}
      />
      <details>
        <summary>Target Muscles · exercise and advanced details</summary>
        <div
          className="target-muscle-rail"
          tabIndex={0}
          role="group"
          aria-label="Planned primary muscles"
        >
          {cards.map((c) => (
            <div className="target-muscle-card" key={c.muscle}>
              <MuscleArtwork muscle={c.muscle} />
              <span>
                <b>{c.muscle}</b>
                <small>
                  {c.exercises} {c.exercises === 1 ? "exercise" : "exercises"}
                </small>
                {c.sets > 0 && (
                  <small>
                    {c.sets} {c.sets === 1 ? "set" : "sets"}
                  </small>
                )}
                {c.advancedRows > 0 && (
                  <small>{c.advancedRows} advanced rows</small>
                )}
              </span>
            </div>
          ))}
          {!cards.length && (
            <p className="empty-caption">No working sets scheduled.</p>
          )}
        </div>
      </details>
    </section>
  );
}
export function MuscleTags({ exercise }: { exercise: D.Exercise }) {
  return (
    <div className="program-muscle-chips" data-horizontal-scroll>
      <span>{exercise.muscle}</span>
      {exercise.secondary.map((m) => (
        <span className="secondary" key={m}>
          {m}
        </span>
      ))}
    </div>
  );
}
export function AssignedRows({
  rows,
}: {
  rows: {
    ordinal: number;
    min: number;
    max: number;
    reps: number;
    rir: number;
    kind: string;
    assignedReps?: boolean;
  }[];
}) {
  return (
    <div className="planned-rows" aria-label="Assigned set targets">
      {rows.map((row) => (
        <div className="planned-row" key={row.ordinal}>
          <span className="planned-number">
            {row.kind === "warmup"
              ? "W"
              : row.kind === "drop"
                ? "D"
                : row.ordinal + 1}
          </span>
          <span>
            {row.assignedReps
              ? row.reps
              : row.min === row.max
                ? row.min
                : `${row.min}–${row.max}`}{" "}
            reps
          </span>
          <span
            className="planned-rir"
            title="Assigned RIR"
            aria-label={`Target ${row.rir} RIR`}
            style={{ "--rir-color": rirColour(row.rir, true) } as CSSProperties}
          >
            {row.rir}
          </span>
        </div>
      ))}
    </div>
  );
}
export function EntryPrescription({
  entry,
  exercise,
  exact = false,
}: {
  entry: D.Entry;
  exercise: D.Exercise;
  exact?: boolean;
}) {
  return (
    <div className="preview-prescription">
      <div className="exercise-art">
        <MuscleArtwork muscle={exercise.muscle} full />
      </div>
      <div>
        <AssignedRows
          rows={entry.sets.map((t, ordinal) => ({
            ordinal,
            kind: t.kind,
            min: t.prescription?.min ?? entry.target?.min ?? t.reps,
            max: t.prescription?.max ?? entry.target?.max ?? t.reps,
            reps: t.prescription?.reps ?? t.reps,
            rir: t.prescription?.rir ?? entry.target?.rir ?? t.rir,
            assignedReps: exact || !!t.prescription?.proposalId,
          }))}
        />
        <MuscleTags exercise={exercise} />
      </div>
    </div>
  );
}
