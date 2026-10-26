import { useMemo, useState } from "react";
import * as D from "./domain";
import { useStore } from "./store";
import { Field } from "./ui";
import { liftSegments, liftPoints, type LiftSegment } from "./liftProgress";
import { MetricChart, TrendRange } from "./MetricChart";
import type { TrendWeeks } from "./visualData";

export function LiftProgress({ exerciseId }: { exerciseId: string }) {
  const state = useStore().box.data;
  const segments = useMemo(
    () => liftSegments(state, exerciseId),
    [state, exerciseId],
  );
  const [chosen, setChosen] = useState("");
  const segment = segments.find((s) => s.id === chosen) ?? segments.at(-1);
  return (
    <div className="lift-progress training-coaching">
      <p>
        Saved load, reps and reported effort together. Each context keeps its
        own history.
      </p>
      {segment ? (
        <>
          <Field label="Lift comparison context">
            <select
              value={segment.id}
              onChange={(e) => setChosen(e.target.value)}
            >
              {[...segments].reverse().map((s, i) => (
                <option key={s.id} value={s.id}>
                  Context {segments.length - i} · {s.exposures[0].date}–
                  {s.exposures.at(-1)!.date} · {s.setup?.label ?? s.equipment} ·{" "}
                  {s.phase ?? "Unknown phase"} · {s.planned ?? "?"} sets
                </option>
              ))}
            </select>
          </Field>
          <SegmentView
            key={segment.id}
            segment={segment}
            unit={state.settings.unit}
          />
        </>
      ) : (
        <p>Complete working sets to see this lift’s saved observations.</p>
      )}
    </div>
  );
}

function SegmentView({
  segment,
  unit,
}: {
  segment: LiftSegment;
  unit: D.State["settings"]["unit"];
}) {
  const [weeks, setWeeks] = useState<TrendWeeks>(8);
  const all = segment.exposures.flatMap((e) => e.rows);
  const ordinals = [...new Set(all.map((r) => r.ordinal))].sort(
    (a, b) => a - b,
  );
  const [rowChoice, setRow] = useState(ordinals[0] ?? 0);
  const ordinal = ordinals.includes(rowChoice) ? rowChoice : ordinals[0];
  const rowValues = all.filter((r) => r.ordinal === ordinal);
  const loads = [...new Set(rowValues.map((r) => r.weight))].sort(
    (a, b) => a - b,
  );
  const [loadChoice, setLoad] = useState(rowValues.at(-1)?.weight ?? 0);
  const load = loads.includes(loadChoice)
    ? loadChoice
    : rowValues.at(-1)!.weight;
  const efforts = [
    ...new Set(
      rowValues
        .filter((r) => r.weight === load && r.rir !== null)
        .map((r) => r.rir!),
    ),
  ].sort((a, b) => a - b);
  const latestEffort = rowValues
    .filter((r) => r.weight === load && r.rir !== null)
    .at(-1)?.rir;
  const [effortChoice, setEffort] = useState(String(latestEffort ?? "unknown"));
  const effort =
    effortChoice === "unknown"
      ? null
      : efforts.includes(Number(effortChoice))
        ? Number(effortChoice)
        : (latestEffort ?? null);
  const cutoff = Date.now() - weeks * 7 * 86400000;
  const points = liftPoints(segment, ordinal, load, effort)
    .filter((p) => p.at >= cutoff)
    .slice(-12);
  const [chosenPoint, setPoint] = useState("");
  const selected =
    points.find((p) => `${p.sessionId}:${p.entryId}` === chosenPoint) ??
    points.at(-1);
  const loadText = (n: number) =>
    `${Number(D.displayLoad(n, segment.convention, unit).toFixed(2))} ${segment.convention === "machine-label" ? "label" : unit}`;
  const lo = Math.max(0, Math.min(...points.map((p) => p.reps), 100) - 1),
    hi = Math.max(...points.map((p) => p.reps), lo + 2) + 1;
  const xy = (i: number) => ({
    x: points.length < 2 ? 160 : 36 + (i * 258) / (points.length - 1),
    y: 130 - ((points[i].reps - lo) / (hi - lo)) * 108,
  });
  return (
    <>
      <p className="caption">
        {segment.equipment} · {D.conventionLabels[segment.convention]} ·{" "}
        {segment.setup?.label ?? "No named setup"} ·{" "}
        {segment.phase ?? "Phase unreported"}
      </p>
      <details>
        <summary>Comparison boundaries</summary>
        <p className="caption">
          {segment.method}. Planned dose: {segment.planned ?? "unknown"} sets.{" "}
          {segment.setup?.execution} Changed setup, method, phase, dose or
          preceding exercise order starts a separate segment—even when you later
          return to an earlier setup. These are declared contexts, not proof of
          identical technique.
        </p>
        <p className="caption">
          Workout: {segment.workout}. Preceding exercises:{" "}
          {segment.preceding.join(" → ") || "None; this exercise was first."}
        </p>
      </details>
      <details className="lift-filter-details">
        <summary>Compare set, load and effort</summary>
        <div className="form-grid lift-filters">
          <Field label="Compared set">
            <select
              value={ordinal}
              onChange={(e) => setRow(Number(e.target.value))}
            >
              {ordinals.map((n) => (
                <option value={n} key={n}>
                  Set {n + 1}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Compared load">
            <select
              value={load}
              onChange={(e) => setLoad(Number(e.target.value))}
            >
              {loads.map((n) => (
                <option value={n} key={n}>
                  {loadText(n)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reported RIR">
            <select
              value={effort === null ? "unknown" : effort}
              onChange={(e) => setEffort(e.target.value)}
            >
              <option value="unknown">Unreported —</option>
              {efforts.map((n) => (
                <option value={n} key={n}>
                  {n} RIR
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>
      <TrendRange value={weeks} onChange={setWeeks} />
      <div className="lift-observed-charts">
        <MetricChart
          title="Observed load"
          unit={segment.convention === "machine-label" ? "label" : unit}
          kind="line"
          points={segment.exposures
            .filter((e) => e.at >= cutoff)
            .map((e) => ({
              id: e.sessionId + e.entryId,
              label: e.date,
              value: e.rows.find((r) => r.ordinal === ordinal)
                ? D.displayLoad(
                    e.rows.find((r) => r.ordinal === ordinal)!.weight,
                    segment.convention,
                    unit,
                  )
                : null,
              group: e.comparable ? "confirmed" : e.sessionId + e.entryId,
            }))}
          caption="Actual saved load at this set position, within this context. It is not a strength estimate."
        />
        <MetricChart
          title="Reported effort"
          unit="RIR"
          kind="line"
          points={segment.exposures
            .filter((e) => e.at >= cutoff)
            .map((e) => ({
              id: e.sessionId + e.entryId,
              label: e.date,
              value: e.rows.find((r) => r.ordinal === ordinal)?.rir ?? null,
              group: e.comparable ? "confirmed" : e.sessionId + e.entryId,
            }))}
          caption="Unreported effort stays —. Lines stop across excluded observations."
        />
      </div>
      {points.length ? (
        <section className="lift-match" aria-label="Matching lift observations">
          <h3>
            {loadText(load)} · {effort} RIR · Set {ordinal + 1}
          </h3>
          <p>
            {points.length >= 2
              ? `${points[0].reps} → ${points.at(-1)!.reps} reps across ${points.length} matching observations.`
              : "One matching observation. Establish this baseline before describing a trend."}
          </p>
          <svg
            viewBox="0 0 320 170"
            role="img"
            aria-label={`Saved repetitions at ${loadText(load)} and reported ${effort} RIR. ${points.map((p) => `${p.date}: ${p.reps} reps`).join(". ")}`}
          >
            <path d="M36 18V130H294" fill="none" stroke="var(--line)" />
            <text x="4" y="24" fontSize="10" fill="currentColor">
              {hi}
            </text>
            <text x="4" y="134" fontSize="10" fill="currentColor">
              {lo}
            </text>
            {points.map((p, i) => {
              const pos = xy(i),
                previous = i ? xy(i - 1) : null;
              const currentIndex = segment.exposures.findIndex(
                  (e) => e.sessionId === p.sessionId && e.entryId === p.entryId,
                ),
                previousIndex = i
                  ? segment.exposures.findIndex(
                      (e) =>
                        e.sessionId === points[i - 1].sessionId &&
                        e.entryId === points[i - 1].entryId,
                    )
                  : -1;
              return (
                <g key={`${p.sessionId}:${p.entryId}`}>
                  {previous && currentIndex === previousIndex + 1 && (
                    <path
                      d={`M${previous.x} ${previous.y}L${pos.x} ${pos.y}`}
                      stroke="var(--accent)"
                      strokeWidth="2"
                      fill="none"
                    />
                  )}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={p === selected ? 5 : 3.5}
                    fill="var(--accent)"
                  >
                    <title>
                      {p.date}: {p.reps} reps, {loadText(p.weight)}, reported{" "}
                      {p.rir} RIR
                    </title>
                  </circle>
                </g>
              );
            })}
            <text x="36" y="156" fontSize="10" fill="currentColor">
              {points[0].date}
            </text>
            {points.length > 1 && (
              <text
                x="294"
                y="156"
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
              >
                {points.at(-1)!.date}
              </text>
            )}
          </svg>
          <div
            className="lift-point-picks"
            aria-label="Select saved observation"
          >
            {points.map((p) => (
              <button
                type="button"
                className="btn"
                key={`${p.sessionId}:${p.entryId}`}
                aria-pressed={p === selected}
                onClick={() => setPoint(`${p.sessionId}:${p.entryId}`)}
              >
                {p.date.slice(5)} · {p.reps} reps
              </button>
            ))}
          </div>
          {selected && (
            <p role="status">
              {selected.date} · {loadText(selected.weight)} × {selected.reps} ·
              Reported {selected.rir} RIR
            </p>
          )}
          <p className="caption">
            Up to 12 recent observations at the same actual load, set position
            and reported RIR. Lines stop across missing or excluded
            observations. This is observed performance, not estimated strength
            or measured muscle growth.
          </p>
        </section>
      ) : (
        <p className="banner">
          {effort === null
            ? "Effort is unreported. It stays —; review the saved observations below."
            : "No fully comparable observations for this selection yet. Changed or unconfirmed execution, incomplete dose and advanced methods remain visible below."}
        </p>
      )}
      <details className="lift-raw">
        <summary>
          All saved observations · {segment.exposures.length} workouts
        </summary>
        {segment.exposures.map((e) => (
          <section
            key={`${e.sessionId}:${e.entryId}`}
            className="change-review"
          >
            <h4>{e.date}</h4>
            <p className="caption">{e.note}</p>
            {e.changes.map((c) => (
              <p className="caption" key={c.id}>
                Accepted change: {c.label}
                {c.edited ? " · User-edited" : ""}
              </p>
            ))}
            <div className="table-wrap">
              <table aria-label={`${e.date} saved lift observations`}>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Load</th>
                    <th>Reps</th>
                    <th>RIR</th>
                    <th>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {e.rows.map((r) => (
                    <tr key={r.setId}>
                      <td>{r.ordinal + 1}</td>
                      <td>{loadText(r.weight)}</td>
                      <td>{r.reps}</td>
                      <td>{r.rir ?? "—"}</td>
                      <td>
                        {r.prescription
                          ? `${loadText(r.prescription.weight)} × ${r.prescription.reps} · ${r.prescription.rir} RIR`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Method details</summary>
              <p className="caption">
                {e.rows
                  .map((r) => r.method)
                  .filter((v, i, all) => all.indexOf(v) === i)
                  .join(" / ")}
              </p>
            </details>
          </section>
        ))}
      </details>
    </>
  );
}
