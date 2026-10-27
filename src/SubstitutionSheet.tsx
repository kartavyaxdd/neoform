import { useState } from "react";
import * as D from "./domain";
import { useStore, saveChange } from "./store";
import { Button, Field } from "./ui";
import { ExerciseThumbnail } from "./ExerciseThumbnail";
import {
  substitutionOptions,
  substitutionFingerprint,
  substituteExercise,
  defaultSwapEquipment,
  substitutePreview,
} from "./substitutions";

export function SubstitutionSheet({
  session,
  entry,
  onDone,
  onEditAdvanced,
  onPreview,
}: {
  session: D.Session;
  entry: D.Entry;
  onDone: (id: string) => void;
  onEditAdvanced?: () => void;
  onPreview?: (session: D.Session, id: string) => void;
}) {
  const state = useStore().box.data;
  const original = [...D.catalog, ...state.customExercises].find(
    (x) => x.id === entry.exerciseId,
  )!;
  const [fingerprint] = useState(() => substitutionFingerprint(session));
  const [available, setAvailable] = useState<D.Exercise["equipment"][]>(
    defaultSwapEquipment(state, entry),
  );
  const [scope, setScope] = useState<"similar" | "all">("similar");
  const [reason, setReason] = useState<"busy" | "unavailable" | "preference">(
      "busy",
    ),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const options = substitutionOptions(
      state,
      entry,
      available,
      Date.now(),
      scope,
    ),
    option = options.find((x) => x.exercise.id === selected);
  async function apply() {
    setBusy(true);
    setError("");
    try {
      if (onPreview) {
        const result = substitutePreview(state, session, {
          fingerprint,
          entryId: entry.id,
          exerciseId: selected,
          available,
          reason,
          scope,
        });
        onPreview(result.session, result.entryId);
        return;
      }
      let id = "";
      const saved = await saveChange((data) => {
        const result = substituteExercise(data, {
          fingerprint,
          entryId: entry.id,
          exerciseId: selected,
          available,
          reason,
          scope,
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
      <Field label="Alternatives">
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as typeof scope);
            setSelected("");
          }}
        >
          <option value="similar">Similar muscle &amp; movement</option>
          <option value="all">Browse all available exercises</option>
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
        <p>
          No similar alternatives for this equipment. Choose “Browse all
          available exercises” or change the equipment filter.
        </p>
      )}
      {option && (
        <section className="panel">
          <h3 className="tutorial-heading">
            <ExerciseThumbnail exercise={option.exercise} />
            {option.exercise.name}
          </h3>
          {(option.exercise.muscle !== original.muscle ||
            option.exercise.pattern !== original.pattern) && (
            <p className="caption">
              Different muscle or movement: review the retained set count and
              rep/effort targets below before accepting. This is your manual
              choice, not a coaching recommendation.
            </p>
          )}
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
      {onEditAdvanced && (
        <Button onClick={onEditAdvanced}>
          Edit advanced or linked exercise
        </Button>
      )}
      <p className="caption">
        Matching muscle and movement does not guarantee equivalent difficulty or
        pain-free training. Advanced and linked sequences require a separate
        edit.
      </p>
    </div>
  );
}
