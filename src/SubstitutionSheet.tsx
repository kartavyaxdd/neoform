import { useState } from "react";
import * as D from "./domain";
import { useStore, saveChange } from "./store";
import { Button, Field } from "./ui";
import {
  substitutionOptions,
  substitutionFingerprint,
  substituteExercise,
} from "./substitutions";

export function SubstitutionSheet({
  session,
  entry,
  onDone,
}: {
  session: D.Session;
  entry: D.Entry;
  onDone: (id: string) => void;
}) {
  const state = useStore().box.data;
  const original = [...D.catalog, ...state.customExercises].find(
    (x) => x.id === entry.exerciseId,
  )!;
  const [fingerprint] = useState(() => substitutionFingerprint(session));
  const [available, setAvailable] = useState<D.Exercise["equipment"][]>(
    (state.profile?.equipment ?? D.equipment).filter(
      (x) => x !== original.equipment,
    ),
  );
  const [reason, setReason] = useState<"busy" | "unavailable" | "preference">(
      "busy",
    ),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const options = substitutionOptions(state, entry, available),
    option = options.find((x) => x.exercise.id === selected);
  async function apply() {
    setBusy(true);
    setError("");
    try {
      let id = "";
      const saved = await saveChange((data) => {
        const result = substituteExercise(data, {
          fingerprint,
          entryId: entry.id,
          exerciseId: selected,
          available,
          reason,
        });
        id = result.entryId;
        return result.state;
      });
      if (saved) onDone(id);
      else
        setError(
          "The swap could not be saved. Check sync status before retrying.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="training-coaching">
      <p>
        Replace unfinished working sets. Completed sets stay in your log; your
        program stays unchanged.
      </p>
      <Field label="Reason">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          <option value="busy">Equipment busy</option>
          <option value="unavailable">Equipment unavailable</option>
          <option value="preference">Personal preference</option>
        </select>
      </Field>
      <details open={!options.length}>
        <summary>Available equipment</summary>
        <div className="actions wrap">
          {D.equipment.map((e) => (
            <label className="check-line" key={e}>
              <input
                type="checkbox"
                checked={available.includes(e)}
                onChange={() => {
                  setAvailable((old) =>
                    old.includes(e) ? old.filter((x) => x !== e) : [...old, e],
                  );
                  setSelected("");
                }}
              />
              {e}
            </label>
          ))}
        </div>
      </details>
      <Field label="Substitute exercise">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose an alternative</option>
          {options.map((o) => (
            <option key={o.exercise.id} value={o.exercise.id}>
              {o.exercise.name}
            </option>
          ))}
        </select>
      </Field>
      {!options.length && (
        <p>No matching alternatives for the selected equipment.</p>
      )}
      {option && (
        <section className="panel">
          <h3>{option.exercise.name}</h3>
          <p>
            {entry.sets.filter((t) => !t.done && t.kind === "working").length}{" "}
            remaining sets · {entry.target?.min}–{entry.target?.max} reps ·{" "}
            {entry.target?.rir} RIR · {entry.target?.rest}s rest
          </p>
          <p>
            Load starts unset. Choose a load for this exercise; no conversion
            from {original.name}.
          </p>
          <p className="caption">
            {option.reference
              ? `Own logged reference: ${option.reference.session.date}. Previous performance in the logger uses matching setup and method.`
              : "No logged reference for this exercise."}
          </p>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void apply()}
          >
            Use substitute for this workout
          </Button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="caption">
        Matching muscle and movement does not guarantee equivalent difficulty or
        pain-free training. Advanced and linked sequences require a separate
        edit.
      </p>
    </div>
  );
}
