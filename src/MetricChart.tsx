import { useId, useState } from "react";
import type { TrendWeeks, VisualPoint } from "./visualData";
const format = (v: number | null) =>
  v === null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
export function TrendRange({
  value,
  onChange,
}: {
  value: TrendWeeks;
  onChange: (v: TrendWeeks) => void;
}) {
  return (
    <div className="trend-range" role="group" aria-label="Chart time range">
      {([4, 8, 12] as const).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          {n}W
        </button>
      ))}
    </div>
  );
}
export function MetricChart({
  title,
  unit,
  points,
  kind = "bar",
  caption,
}: {
  title: string;
  unit: string;
  points: VisualPoint[];
  kind?: "bar" | "line";
  caption?: string;
}) {
  const id = useId(),
    [choice, setChoice] = useState("");
  const selected = Math.max(
      0,
      points.findIndex((p) => p.id === choice),
    ),
    index =
      choice && points.some((p) => p.id === choice)
        ? selected
        : Math.max(0, points.length - 1);
  const current = points[index],
    known = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const high = unit === "RIR" ? 10 : Math.max(...known, 1),
    low =
      kind === "bar" || unit === "RIR"
        ? 0
        : Math.max(
            0,
            Math.min(...known, high) -
              Math.max(0.5, (high - Math.min(...known, high)) * 0.12),
          );
  const top =
      kind === "bar" || unit === "RIR" ? high : Math.max(high + 0.5, low + 1),
    width = 270;
  const x = (i: number) =>
    points.length === 1 ? 174 : 40 + (i * width) / (points.length - 1);
  const y = (v: number) => 132 - ((v - low) / (top - low)) * 106;
  const pick = (i: number) => {
    if (points.length)
      setChoice(points[Math.max(0, Math.min(points.length - 1, i))].id);
  };
  return (
    <section className="metric-chart" aria-labelledby={id}>
      <div className="chart-heading">
        <h3 id={id}>{title}</h3>
        <span>{unit}</span>
      </div>
      {!points.length ? (
        <p className="chart-empty">No saved observations yet.</p>
      ) : (
        <>
          <div
            className="chart-plot"
            role="group"
            aria-label={`${title} graph; use left and right arrows to inspect values`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                pick(index + (e.key === "ArrowRight" ? 1 : -1));
              } else if (e.key === "Home" || e.key === "End") {
                e.preventDefault();
                pick(e.key === "Home" ? 0 : points.length - 1);
              }
            }}
          >
            <svg
              viewBox="0 0 340 160"
              role="img"
              aria-label={`${title}. ${points.length} observations. ${unit}.`}
              onPointerDown={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                pick(
                  points.length === 1
                    ? 0
                    : Math.round(
                        ((((e.clientX - b.left) / b.width) * 340 - 40) /
                          width) *
                          (points.length - 1),
                      ),
                );
              }}
            >
              {[low, (low + top) / 2, top].map((v, i) => (
                <g key={i}>
                  <line
                    x1="36"
                    x2="320"
                    y1={y(v)}
                    y2={y(v)}
                    className="chart-grid"
                  />
                  <text x="30" y={y(v) + 4} textAnchor="end">
                    {format(v)}
                  </text>
                </g>
              ))}
              {points.map((p, i) => {
                if (p.value === null) return null;
                const prev = points[i - 1];
                return (
                  <g key={p.id} className={i === index ? "chart-selected" : ""}>
                    {kind === "bar" ? (
                      <rect
                        className="chart-bar"
                        x={
                          x(i) - Math.min(11, 100 / Math.max(1, points.length))
                        }
                        y={y(p.value)}
                        width={Math.min(22, 200 / Math.max(1, points.length))}
                        height={Math.max(0, 132 - y(p.value))}
                        rx="3"
                      />
                    ) : (
                      <>
                        {prev?.value !== null &&
                          prev?.value !== undefined &&
                          prev.group === p.group && (
                            <path
                              className="chart-line"
                              d={`M${x(i - 1)} ${y(prev.value)}L${x(i)} ${y(p.value)}`}
                            />
                          )}
                        <circle
                          className="chart-point"
                          cx={x(i)}
                          cy={y(p.value)}
                          r={i === index ? 5 : 3.5}
                        />
                      </>
                    )}
                    <title>
                      {p.label}: {format(p.value)} {unit}
                    </title>
                  </g>
                );
              })}
              <text x="40" y="154">
                {points[0].label.slice(5)}
              </text>
              {points.length > 1 && (
                <text x="310" y="154" textAnchor="end">
                  {points.at(-1)!.label.slice(5)}
                </text>
              )}
            </svg>
          </div>
          <div className="chart-inspect">
            <button
              type="button"
              aria-label={`Previous ${title} value`}
              disabled={index === 0}
              onClick={() => pick(index - 1)}
            >
              ‹
            </button>
            <span className="chart-value" aria-live="polite">
              {current.label} ·{" "}
              <b>
                {format(current.value)} {unit}
              </b>
            </span>
            <button
              type="button"
              aria-label={`Next ${title} value`}
              disabled={index === points.length - 1}
              onClick={() => pick(index + 1)}
            >
              ›
            </button>
          </div>
          {known.length === 1 && (
            <p className="caption">One observation · baseline only.</p>
          )}
          <details className="chart-data">
            <summary>{title} data</summary>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  {title}, exact saved values
                </caption>
                <thead>
                  <tr>
                    <th>Date / label</th>
                    <th>{unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>{format(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {caption && <p className="caption">{caption}</p>}
    </section>
  );
}
export function ComparisonBars({
  title,
  rows,
  unit = "sets",
}: {
  title: string;
  rows: {
    label: string;
    value: number | null;
    secondary?: number | null;
    secondaryLabel?: string;
  }[];
  unit?: string;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [r.value ?? 0, r.secondary ?? 0]),
  );
  return (
    <section className="comparison-bars" aria-label={title}>
      <h3>{title}</h3>
      {rows.length ? (
        rows.map((r, i) => (
          <div className="comparison-item" key={i}>
            <div className="comparison-label">
              <span>{r.label}</span>
              <b>
                {format(r.value)} {unit}
              </b>
            </div>
            <div
              className={`comparison-track ${r.value === null ? "unknown" : ""}`}
            >
              <i style={{ width: `${((r.value ?? 0) / max) * 100}%` }} />
            </div>
            {r.secondary !== undefined && (
              <>
                <div className="comparison-label secondary">
                  <span>{r.secondaryLabel ?? "Assigned"}</span>
                  <span>
                    {format(r.secondary)} {unit}
                  </span>
                </div>
                <div
                  className={`comparison-track secondary ${r.secondary === null ? "unknown" : ""}`}
                >
                  <i
                    style={{ width: `${((r.secondary ?? 0) / max) * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        ))
      ) : (
        <p className="caption">No work to show yet.</p>
      )}
      <p className="chart-scale caption">
        Shared scale · 0–{format(max)} {unit}
      </p>
    </section>
  );
}
