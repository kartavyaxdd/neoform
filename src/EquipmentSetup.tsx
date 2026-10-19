import { useState } from "react";
import * as D from "./domain";
import { Button, Field } from "./ui";

export function EquipmentSetup({
  entry,
  exercise,
  unit,
  onSave,
  onUseForProgram,
}: {
  entry: D.Entry;
  exercise: D.Exercise;
  unit: "kg" | "lb";
  onSave: (setup: D.EquipmentSetup | undefined) => void;
  onUseForProgram?: () => void;
}) {
  const convention = entry.convention ?? exercise.convention;
  const raw = convention === "machine-label";
  const [label, setLabel] = useState(entry.setup?.label ?? "");
  const [execution, setExecution] = useState(entry.setup?.execution ?? "");
  const [loads, setLoads] = useState(
    (entry.setup?.availableLoads ?? [])
      .map((n) => Number(D.displayLoad(n, convention, unit).toFixed(2)))
      .join(", "),
  );
  const [error, setError] = useState("");
  const [loadsEdited, setLoadsEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = () => {
    setSaved(false);
    setError("");
  };
  return (
    <section className="training-coaching">
      <p>
        Keep the machine, grip, seat settings and range of motion repeatable. A
        different setup starts a separate comparison; earlier logs stay as
        recorded. Check the prefilled set loads when changing equipment; saving
        a setup does not change them.
      </p>
      <Field label="Setup name">
        <input
          value={label}
          maxLength={120}
          placeholder="e.g. Gym A rack / machine 2"
          onChange={(ev) => {
            setLabel(ev.target.value);
            dirty();
          }}
        />
      </Field>
      <Field label="Execution notes">
        <textarea
          value={execution}
          maxLength={300}
          placeholder="Seat, grip, comfortable depth / ROM"
          onChange={(ev) => {
            setExecution(ev.target.value);
            dirty();
          }}
        />
      </Field>
      <Field label={`Available loads (${raw ? "raw labels" : unit})`}>
        <input
          value={loads}
          maxLength={1600}
          placeholder="e.g. 60, 61.25, 62.5, 65"
          onChange={(ev) => {
            setLoads(ev.target.value);
            setLoadsEdited(true);
            dirty();
          }}
        />
      </Field>
      <p className="caption">
        Comma-separated loads you can actually select. Include the current load
        and nearby options; an empty list leaves availability unknown.{" "}
        {D.conventionLabels[convention]}:{" "}
        {raw
          ? "labels are never converted or automatically progressed."
          : "enter the load as shown in your set rows, including the bar for total load. The app uses the smallest available increase within its conservative cap."}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="actions wrap">
        <Button
          onClick={() => {
            const parts = loads.trim()
              ? loads.split(",").map((s) => s.trim())
              : [];
            if (
              parts.some((p) => !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(p))
            ) {
              setError(
                "Enter non-negative numbers separated by commas, with at most two decimal places.",
              );
              return;
            }
            const parsed = D.equipmentSetupSchema.safeParse({
              label,
              execution,
              availableLoads: !loadsEdited
                ? (entry.setup?.availableLoads ?? [])
                : [
                    ...new Set(
                      parts.map((p) =>
                        D.canonicalLoad(Number(p), convention, unit),
                      ),
                    ),
                  ].sort((a, b) => a - b),
            });
            if (!parsed.success) {
              setError(
                "Give this setup a name and use at most 100 loads between 0 and 2000 kg (or raw labels).",
              );
              return;
            }
            onSave(parsed.data);
            setError("");
            setSaved(true);
          }}
        >
          Save session setup
        </Button>
        {entry.setup && (
          <Button
            onClick={() => {
              onSave(undefined);
              setLabel("");
              setExecution("");
              setLoads("");
              setLoadsEdited(false);
              setError("");
              setSaved(true);
            }}
          >
            Clear session setup
          </Button>
        )}
      </div>
      {saved && (
        <p role="status">
          {entry.setup ? "Session setup saved." : "Session setup cleared."}
        </p>
      )}
      {onUseForProgram && saved && (
        <Button onClick={onUseForProgram}>
          {entry.setup
            ? "Use saved setup for this workout in the program"
            : "Clear setup from this workout in the program"}
        </Button>
      )}
    </section>
  );
}
