import { useState } from "react";
import * as D from "./domain";
import * as T from "./techniques";
import { Button, Field, Num } from "./ui";

const instructions: Record<
  T.Technique,
  { title: string; text: string; pages: string }
> = {
  straight: {
    title: "Straight sets",
    text: "Perform the planned reps at your chosen RIR. Rest until the target muscle, assisting muscles, breathing and concentration are ready for another controlled set.",
    pages: "67–71",
  },
  "down-set": {
    title: "Down sets",
    text: "Keep the earlier straight sets. Add a separately logged, lighter set when the original load no longer fits your rep range. Take normal readiness-based rest; this is not a short-rest drop sequence.",
    pages: "71–72, 100–103",
  },
  superset: {
    title: "Non-overlapping superset",
    text: "Choose a different-muscle partner. Alternate one set of each exercise, then recover before the next round. Transition promptly only if breathing and technique allow it. Each exercise keeps its own load and reps.",
    pages: "74–75, 105",
  },
  "pre-exhaust": {
    title: "Pre-exhaust pair",
    text: "Select the isolation movement first, then a compound using the same muscle. Perform an isolation set, transition to the compound, then recover before another round. Lower the compound load deliberately as needed; do not force failure.",
    pages: "75–77, 104–105",
  },
  myoreps: {
    title: "Myoreps: activation + mini bouts",
    text: "Use a controlled activation bout (the book describes about 10–20 reps), followed by same-load mini bouts (about 5–10 reps) with a few breaths between them. The book describes 0–2 RIR; this logger never requires failure or changes your RIR. Prefer stable isolation work and use sparingly late in a session. If breathing or assisting muscles limit you, rest longer or stop.",
    pages: "77–79, 105–106",
  },
  "drop-set": {
    title: "Drop sequence",
    text: "Begin with an activation bout, then enter each lower load and its actual reps separately. The book describes roughly 10–20 initial reps and 5–10 later reps, with brief recovery as the local burn eases. Preserve a repeatable sequence; no automatic percentage or machine-weight conversion is inferred. Stop when control deteriorates.",
    pages: "79–80, 106",
  },
  "giant-set": {
    title: "Giant set: total rep goal",
    text: "Keep one load and accumulate the chosen total over as many controlled bouts as needed. Here giant set means a same-exercise rep goal, not a circuit. Stop each bout before technique breaks down; the final bout need only cover the remaining reps. Do not automatically increase the goal: check recovery and comparable straight-set performance first.",
    pages: "72–74, 103–104",
  },
  tempo: {
    title: "Controlled tempo",
    text: "Record seconds for lowering, pause and lifting. Keep the movement controlled and repeat the same range and cadence for meaningful comparisons. These editable timings are app defaults, not a book-mandated cadence.",
    pages: "255–257",
  },
};
export function TechniqueSheet({
  session,
  entry,
  exercises,
  unit,
  onChange,
  history = false,
  addOnly = false,
}: {
  session: D.Session;
  entry: D.Entry;
  exercises: D.Exercise[];
  unit: "kg" | "lb";
  onChange: (s: D.Session) => void;
  history?: boolean;
  addOnly?: boolean;
}) {
  const [technique, setTechnique] = useState<T.Technique>(
    entry.technique || "straight",
  );
  const [partner, setPartner] = useState("");
  const [error, setError] = useState("");
  const last = entry.sets.filter((s) => s.kind !== "warmup").at(-1);
  const ex = exercises.find((x) => x.id === entry.exerciseId)!;
  const convention = entry.convention || ex.convention;
  const [weight, setWeight] = useState(
    D.displayLoad(last?.weight || 0, convention, unit),
  );
  const [reps, setReps] = useState(
    ["myoreps", "drop-set"].includes(entry.technique || "")
      ? 5
      : last?.reps || 8,
  );
  const [rir, setRir] = useState(last?.rir ?? 2);
  const [rest, setRest] = useState(entry.target?.rest ?? 90);
  const locked =
    history || entry.sets.some((s) => s.done && s.kind !== "warmup");
  const apply = (fn: () => D.Session) => {
    try {
      onChange(fn());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const update = (next: D.Entry) => ({
    ...session,
    exercises: session.exercises.map((e) => (e.id === entry.id ? next : e)),
  });
  const guide = instructions[entry.technique || "straight"];
  return (
    <div className="technique-controls">
      {!addOnly && (
        <>
          <Field label="Training technique">
            <select
              value={technique}
              onChange={(ev) => setTechnique(ev.target.value as T.Technique)}
            >
              {Object.entries(instructions).map(([value, g]) => (
                <option key={value} value={value}>
                  {g.title}
                </option>
              ))}
            </select>
          </Field>
          <p>{instructions[technique].text}</p>
          <p className="caption">
            Source: Scientific Principles of Hypertrophy Training (2020),
            physical PDF pp. {instructions[technique].pages}. Original app
            paraphrase, not a validated personal dose.
          </p>
          <p className="caption">
            Beginner caution: straight sets and technique practice come first.
            Keep at least 2 RIR if new; advanced short-rest methods are
            optional. Pain is a reason to stop, not a target.
          </p>
          {(technique === "superset" || technique === "pre-exhaust") && (
            <Field label="Partner exercise">
              <select
                value={partner}
                onChange={(ev) => setPartner(ev.target.value)}
              >
                <option value="">Choose an exercise</option>
                {session.exercises
                  .filter((e) => e.id !== entry.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {exercises.find((x) => x.id === e.exerciseId)?.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <p className="caption">
            Applies only to this unlogged exercise, not your saved program or
            history. Myorep/drop/giant configuration replaces unlogged working
            rows with one initial bout; append each later bout explicitly.
            Pairing orders the first exercise before its partner.
          </p>
          <Button
            disabled={
              locked ||
              (!!entry.techniqueGroup &&
                (entry.technique === "superset" ||
                  entry.technique === "pre-exhaust"))
            }
            onClick={() =>
              apply(() =>
                technique === "superset" || technique === "pre-exhaust"
                  ? T.pairTechnique(
                      session,
                      entry.id,
                      partner,
                      technique,
                      exercises,
                    )
                  : update(T.configureTechnique(entry, technique)),
              )
            }
          >
            Apply technique to unlogged exercise
          </Button>
          {locked && (
            <p className="caption">
              Technique context is locked after logging; existing work stays
              unchanged.
            </p>
          )}
          {entry.techniqueGroup &&
            (entry.technique === "superset" ||
              entry.technique === "pre-exhaust") && (
              <Button
                disabled={
                  history ||
                  session.exercises.some(
                    (e) =>
                      e.techniqueGroup === entry.techniqueGroup &&
                      e.sets.some((s) => s.done),
                  )
                }
                onClick={() =>
                  apply(() => T.unpairTechnique(session, entry.id))
                }
              >
                Unpair unlogged exercises
              </Button>
            )}
          <h3>{guide.title}</h3>
          {entry.technique === "giant-set" && (
            <Field label="Total rep goal">
              <Num
                label="Total rep goal"
                value={entry.repGoal || 30}
                min={1}
                max={300}
                onChange={(n) =>
                  !history && onChange(update({ ...entry, repGoal: n }))
                }
              />
            </Field>
          )}
          {entry.technique === "tempo" && (
            <div className="form-grid">
              {(["eccentric", "pause", "concentric"] as const).map((part) => (
                <Field key={part} label={`${part} seconds`}>
                  <Num
                    label={`${part} seconds`}
                    value={entry.tempo?.[part] ?? 1}
                    max={10}
                    onChange={(n) =>
                      !locked &&
                      onChange(
                        update({
                          ...entry,
                          tempo: {
                            eccentric: 2,
                            pause: 1,
                            concentric: 1,
                            ...entry.tempo,
                            [part]: n,
                          },
                        }),
                      )
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          {entry.techniqueGroup && (
            <p className="caption">
              Shared group recorded · raw bouts remain distinct; no automatic
              straight-set equivalence.
            </p>
          )}
        </>
      )}
      {addOnly && (
        <>
          <p>{guide.text}</p>
          <p className="caption">
            Rest until breathing, supporting muscles and concentration allow
            controlled target-muscle work. This rest field records the actual
            pause before this bout; a timer is not an instruction to start.
          </p>
          <div className="form-grid">
            <Field label="Bout load">
              <Num
                label="Bout load"
                value={weight}
                step={0.01}
                max={unit === "kg" ? 2000 : 4409}
                onChange={setWeight}
              />
            </Field>
            <p className="caption">
              {convention === "machine-label"
                ? "Raw machine label (not kg or lb)"
                : `${D.conventionLabels[convention]} · ${unit}`}
              . Enter the actual equipment value; reductions are never guessed.
            </p>
            <Field label="Bout reps">
              <Num
                label="Bout reps"
                value={reps}
                min={1}
                max={100}
                onChange={setReps}
              />
            </Field>
            <Field label="Bout RIR">
              <Num
                label="Bout RIR"
                value={rir}
                max={10}
                step={0.5}
                onChange={setRir}
              />
            </Field>
            <Field label="Rest before bout (seconds)">
              <Num
                label="Rest before bout (seconds)"
                value={rest}
                max={900}
                onChange={setRest}
              />
            </Field>
          </div>
          <Button
            disabled={history || entry.sets.length >= 40}
            onClick={() =>
              apply(() =>
                update(
                  T.appendBout(entry, {
                    weight: D.canonicalLoad(weight, convention, unit),
                    reps,
                    rir,
                    rest,
                  }),
                ),
              )
            }
          >
            Append raw bout
          </Button>
          <p className="caption">
            Source: physical PDF pp. {guide.pages}. Keep every bout's actual
            reps, load, effort and rest; not a growth-equivalence score.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
