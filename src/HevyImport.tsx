import { useRef, useState } from "react";
import * as D from "./domain";
import { Button, Field } from "./ui";
import { change, useStore } from "./store";
import {
  MAX_HEVY_BYTES,
  parseHevyCsv,
  mergeHevyImport,
  type HevyPreview,
  type HevyChoices,
} from "./hevyImport";

type Choice = string | Partial<D.Exercise>;
export function HevyImport() {
  const store = useStore(),
    state = store.box.data;
  const [file, setFile] = useState<File | null>(null),
    [offset, setOffset] = useState("");
  const [preview, setPreview] = useState<HevyPreview | null>(null),
    [choices, setChoices] = useState<Record<string, Choice>>({});
  const [ack, setAck] = useState(false),
    [rpe, setRpe] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  const generation = useRef(0);
  const reset = () => {
    generation.current++;
    setPreview(null);
    setChoices({});
    setAck(false);
    setRpe(false);
    setResult("");
    setError("");
    setBusy(false);
  };
  const exercises = [...D.catalog, ...state.customExercises];
  const names = [
    ...new Set(
      preview?.workouts
        .filter((w) => !state.sessions.some((s) => s.id === w.id))
        .flatMap((w) => w.rows.map((r) => r.exercise_title)) || [],
    ),
  ];
  let candidate: ReturnType<typeof mergeHevyImport> | undefined,
    problem = "";
  if (preview) {
    try {
      candidate = mergeHevyImport(
        state,
        preview,
        choices as HevyChoices,
        true,
        rpe,
      );
    } catch (e) {
      problem = (e as Error).message;
    }
  }
  const imported =
    candidate?.state.sessions.filter(
      (s) => !state.sessions.some((old) => old.id === s.id),
    ) || [];
  const logged = imported
    .flatMap((s) => s.exercises)
    .flatMap((e) => e.sets).length;
  const sourceOnly = preview
    ? preview.workouts
        .filter((w) => !state.sessions.some((s) => s.id === w.id))
        .reduce((n, w) => n + w.rows.length, 0) - logged
    : 0;
  return (
    <div
      className="hevy-import"
      style={{ overflowWrap: "anywhere", minWidth: 0 }}
    >
      <p>
        In Hevy: Profile → Settings → Export &amp; Import Data → Export Data →
        Export Workouts. Choose the English CSV (kg/km or lbs/miles), up to 2
        MB. Processing stays in this browser until you confirm; the merged data
        then follows normal account sync.
      </p>
      <p>
        Export a NEOFORM JSON backup first. This is add-only: your program,
        existing history, settings and active draft stay unchanged.
      </p>
      <Field label="Hevy CSV file">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            reset();
            const f = e.target.files?.[0] || null;
            if (f && f.size > MAX_HEVY_BYTES) {
              setFile(null);
              setError("CSV exceeds 2 MB.");
            } else setFile(f);
          }}
        />
      </Field>
      <Field label="Original workout UTC offset">
        <input
          placeholder="e.g. +05:30 or -04:00"
          value={offset}
          maxLength={6}
          onChange={(e) => {
            reset();
            setOffset(e.target.value);
          }}
        />
      </Field>
      <p className="caption">
        Hevy dates have no timezone. Enter the offset where these workouts
        happened, not necessarily your current location. Split exports spanning
        daylight-saving changes. Only English dates such as 18 Oct 2026, 09:00
        are supported.
      </p>
      <Button
        disabled={!file || !offset || busy}
        onClick={() => {
          const token = ++generation.current;
          setBusy(true);
          setError("");
          setPreview(null);
          setChoices({});
          setAck(false);
          setResult("");
          void (async () => {
            try {
              let text: string;
              try {
                text = new TextDecoder("utf-8", { fatal: true }).decode(
                  await file!.arrayBuffer(),
                );
              } catch {
                throw Error("CSV must be valid UTF-8 text (optional BOM).");
              }
              const p = await parseHevyCsv(text, offset);
              if (generation.current === token) setPreview(p);
            } catch (e) {
              if (generation.current === token) setError((e as Error).message);
            } finally {
              if (generation.current === token) setBusy(false);
            }
          })();
        }}
      >
        {" "}
        {busy ? "Reading CSV…" : "Preview import"}{" "}
      </Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <section role="region" aria-label="Hevy preview">
            <h3>
              {preview.workouts.length}{" "}
              {preview.workouts.length === 1 ? "workout" : "workouts"} ·{" "}
              {preview.sourceSets} source rows · {preview.unit}/
              {preview.distanceUnit}
            </h3>
            <ul>
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="caption">
              Duplicates use source title + start time. Repeated exports are
              skipped, not overwritten or upgraded. Changed exports of an
              already imported workout are blocked. Hevy supplies no workout
              IDs, so two same-title workouts at the exact same source start
              time cannot be safely distinguished. Keep your CSV.
            </p>
            {preview.workouts.map((w) => (
              <details key={w.id}>
                <summary>
                  {w.title} · {w.date} · {w.rows.length} source rows
                </summary>
                <p>
                  UTC{w.offset} · {w.rows[0].start_time} → {w.rows[0].end_time}
                </p>
                <p>{w.description || "No workout notes."}</p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontSize: "0.75rem",
                  }}
                >
                  {w.rows.map((r) => JSON.stringify(r, null, 2)).join("\n")}
                </pre>
              </details>
            ))}
          </section>
          {!!names.length && <h3>Explicit exercise choices</h3>}
          <p className="caption">
            No automatic name/equipment matching. Confirm the exact setup and
            load convention, or preserve the original name as a new custom
            exercise. Imported source notes always retain the Hevy exercise name
            and unit. Machine/band labels stay raw numbers in their original
            source unit; they are not converted to kg.
          </p>
          {names.map((name) => {
            const choice = choices[name],
              custom = typeof choice === "object" ? choice : undefined;
            return (
              <section className="panel" key={name}>
                <Field label={`Map ${name}`}>
                  <select
                    value={
                      custom
                        ? "custom"
                        : typeof choice === "string"
                          ? choice
                          : ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setChoices((old) => ({
                        ...old,
                        [name]:
                          value === "custom"
                            ? {
                                id: "custom-hevy-" + D.uid(),
                                name,
                                secondary: [],
                                e1rm: false,
                                instructions:
                                  "Imported from Hevy. Confirm the original equipment and load convention before logging future sessions.",
                              }
                            : value,
                      }));
                      setAck(false);
                    }}
                  >
                    <option value="">Choose explicitly…</option>
                    <option value="custom">
                      Keep source name as new custom exercise
                    </option>
                    {exercises.map((ex) => (
                      <option value={ex.id} key={ex.id}>
                        {ex.name} · {ex.equipment} ·{" "}
                        {D.conventionLabels[ex.convention]}
                      </option>
                    ))}
                  </select>
                </Field>
                {custom && (
                  <>
                    {(
                      ["muscle", "equipment", "pattern", "convention"] as const
                    ).map((key, i) => (
                      <Field
                        key={key}
                        label={`${name} · ${["Direct muscle", "Equipment", "Movement pattern", "Load convention"][i]}`}
                      >
                        <select
                          value={custom[key] || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setChoices((old) => ({
                              ...old,
                              [name]: {
                                ...(old[name] as Partial<D.Exercise>),
                                [key]: value,
                              },
                            }));
                            setAck(false);
                          }}
                        >
                          <option value="">Choose explicitly…</option>
                          {[D.muscles, D.equipment, D.patterns, D.conventions][
                            i
                          ].map((value) => (
                            <option key={value} value={value}>
                              {D.conventionLabels[value] || value}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </>
                )}
              </section>
            );
          })}
          <label className="check-line">
            <input
              type="checkbox"
              aria-label="Use exported RPE for supported sets"
              checked={rpe}
              onChange={(e) => {
                setRpe(e.target.checked);
                setAck(false);
              }}
            />
            Use exported RPE for supported sets (NEOFORM RIR = 10 − exported
            RPE). This is an explicit conversion, not an exported RIR
            measurement. Only rows with weight, 1–100 reps, known set type, and
            RPE become logged sets; missing effort, timed/distance and
            unsupported rows remain source notes. No targets are created.
          </label>
          <p className="caption">
            Leave unchecked for source-notes only. Standardized kg/lb weights
            are converted to canonical kg only for logged sets; source fields
            remain verbatim. No imported session is linked to your program or
            treated as meeting a missing prescription.
          </p>
          {problem && <p role="status">{problem}</p>}
          {candidate && (
            <p role="status" aria-label="Hevy merge summary">
              {candidate.added} new workouts · {candidate.duplicates} duplicate
              {candidate.duplicates === 1 ? "" : "s"} skipped · {logged} logged
              sets · {sourceOnly} source-only rows. All original rows also
              retained in notes.
            </p>
          )}
          <label className="check-line">
            <input
              type="checkbox"
              aria-label="I reviewed mappings, units, timezone and source-only limitations"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I reviewed mappings, units, timezone and source-only limitations.
          </label>
          <Button
            variant="primary"
            disabled={!ack || !candidate || busy}
            onClick={() => {
              try {
                let saved: ReturnType<typeof mergeHevyImport> | undefined;
                const ok = change((s) => {
                  saved = mergeHevyImport(
                    s,
                    preview,
                    choices as HevyChoices,
                    ack,
                    rpe,
                  );
                  return saved.state;
                });
                if (ok && saved) {
                  setResult(
                    `${saved.added} workout${saved.added === 1 ? "" : "s"} added on this device; ${saved.duplicates} duplicates skipped. Check sync status for server persistence.`,
                  );
                  setPreview(null);
                  setError("");
                } else
                  setError(
                    "Merge was not saved. Review account, storage or sync errors before retrying.",
                  );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Confirm Hevy merge
          </Button>
        </>
      )}
      {result && (
        <p role="status" aria-label="Hevy import result">
          {result}
        </p>
      )}
    </div>
  );
}
