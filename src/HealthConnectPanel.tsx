import { useMemo, useState } from "react";
import { Button, Field } from "./ui";
import {
  useHealthState,
  healthOperation,
  cancelHealthOperation,
} from "./healthConnect";
import {
  healthContext,
  HEALTH_KINDS,
  type HealthContext,
} from "./healthConnectPolicy";
import { isAndroid } from "./native";
import { useStore } from "./store";
import {
  selectedHealthRows,
  healthLabels,
  recoveryEstimate,
  recoveryTrend,
} from "./healthRecovery";
const labels = healthLabels;
const metricValue = (value: number, unit: string) =>
  `${Math.round(value * 10) / 10} ${unit}`;
export function HealthSummary({
  onConfirm,
}: {
  onConfirm?: (factor: HealthContext["reviews"][number]) => void;
}) {
  const view = useHealthState();
  const context = useMemo(() => healthContext(view.snapshot), [view.snapshot]);
  if (!isAndroid() || !view.snapshot?.enabled) return null;
  return (
    <details className="health-context">
      <summary>
        Health context ·{" "}
        {context.metrics.length
          ? `${context.metrics.length} signals`
          : "No recent data"}
        {context.stale ? " · needs sync" : ""}
      </summary>
      {context.metrics.map((m) => (
        <p key={m.kind}>
          <strong>
            {labels[m.kind]}: {metricValue(m.value, m.unit)}
          </strong>
          <br />
          <span className="caption">
            {m.day} · {m.sourceName}
            {m.partial ? " · may be incomplete" : ""}
            {m.baseline !== undefined
              ? ` · prior median ${metricValue(m.baseline, m.unit)} (${m.observations} days)`
              : " · building your baseline"}
          </span>
          {m.kind === "sleep" && (
            <SleepStages snapshot={view.snapshot!} day={m.day} />
          )}
        </p>
      ))}
      <p className="caption">
        Descriptive observations. Sleep session time may include awake time.
        Nutrition may omit unlogged meals. Baselines need seven prior days
        within 21 days from the same source.
      </p>
      {!context.stale &&
        context.reviews.map((f) => (
          <div key={f}>
            <p>
              {f === "poor-sleep"
                ? "Recorded sleep-session time is shorter than your recent median. Did you actually sleep poorly?"
                : "Recorded activity is above your recent pattern. Was activity unusually high?"}
            </p>
            {onConfirm ? (
              <Button onClick={() => onConfirm(f)}>
                {f === "poor-sleep"
                  ? "Confirm poor sleep"
                  : "Confirm unusual activity"}
              </Button>
            ) : (
              <p className="caption">
                Review this in the optional Readiness check before working sets.
              </p>
            )}
          </div>
        ))}
    </details>
  );
}
export function HealthConnectPanel() {
  const user = useStore().user;
  const v = useHealthState();
  const sharma =
    user?.accessMode === "workspace-profiles" &&
    user.profileId === "sharma" &&
    user.aiAccess === true;
  if (!isAndroid())
    return (
      <div className="preference-content">
        <p>
          Health Connect is available in NEOFORM for Android. Health records
          stay on your phone.
        </p>
        <a className="btn" href="/downloads/neoform.apk" download>
          Download Android APK
        </a>
        <p className="caption">
          Sync or export pending browser workouts before switching. Android has
          separate device storage.
        </p>
      </div>
    );
  if (!sharma)
    return (
      <p>Health Connect is available only in the locked Sharma profile.</p>
    );
  return (
    <div className="preference-content" aria-busy={v.busy}>
      <p>
        Read-only health signals, including optional HRV (RMSSD), breathing rate
        and supported skin-temperature trends. Imported records stay encrypted
        on this phone, outside cloud sync, backups and Gemini.
      </p>
      <p role="status">{v.message}</p>
      {v.busy && (
        <Button onClick={cancelHealthOperation}>Cancel connection</Button>
      )}
      {v.availability === "unsupported" && (
        <p>
          Health Connect is unavailable on this device. Workout logging still
          works.
        </p>
      )}
      {v.availability === "install-required" && (
        <p>
          Install or update Health Connect. On Android 13 and earlier it is a
          separate app.
        </p>
      )}
      <div className="actions wrap">
        <Button
          disabled={v.busy || v.availability !== "available"}
          onClick={() => void healthOperation("connect")}
        >
          {v.snapshot?.enabled
            ? "Review permissions"
            : "Connect Health Connect"}
        </Button>
        <Button
          disabled={v.busy || !v.snapshot?.enabled}
          onClick={() => void healthOperation("sync")}
        >
          Sync now
        </Button>
        <Button
          disabled={v.busy || v.availability === "unsupported"}
          onClick={() => void healthOperation("settings")}
        >
          Health Connect settings
        </Button>
      </div>
      <p className="caption">
        Permissions:{" "}
        {v.permissions.length
          ? v.permissions.map((k) => labels[k]).join(", ")
          : "None granted"}
        . Allow only what you want to share.
      </p>
      {v.snapshot && (
        <>
          <p className="caption">
            Last sync:{" "}
            {v.snapshot.syncedAt
              ? new Date(v.snapshot.syncedAt).toLocaleString()
              : "Not yet synced"}
            {v.snapshot.clipped
              ? " · import reached its safety limit; recovery guidance is unavailable"
              : ""}
          </p>
          <RecoveryCard />
          <HealthSummary />
          <details>
            <summary>Data quality &amp; source freshness</summary>
            {HEALTH_KINDS.map((kind) => {
              const rows = selectedHealthRows(v.snapshot!, kind);
              const latest = rows.reduce((at, r) => Math.max(at, r.endAt), 0);
              return (
                <p className="caption" key={kind}>
                  <strong>{labels[kind]}</strong> ·{" "}
                  {v.snapshot!.metricStatus?.[kind] ??
                    (!v.permissions.includes(kind)
                      ? "denied"
                      : rows.length
                        ? "imported"
                        : "empty")}
                  <br />
                  {latest
                    ? `Latest source observation: ${new Date(latest).toLocaleString()}${Date.now() - latest > 86400000 ? " · stale for recovery scoring" : ""}`
                    : "No records from the selected source"}
                </p>
              );
            })}
          </details>
          <section
            className="health-sync-status"
            aria-label="Health sync status"
          >
            <h3>Automatic imports</h3>
            <p>
              {v.controls?.backgroundEnabled
                ? "Every 12 hours · Android may delay delivery"
                : "Foreground sync only"}
            </p>
            <p className="caption">
              Background:{" "}
              {!v.backgroundSupported
                ? "Unavailable on this provider; update Health Connect"
                : !v.backgroundGranted
                  ? "Permission required"
                  : v.controls?.backgroundEnabled
                    ? "Enabled, including while Sharma is locked"
                    : "Available · disabled"}
            </p>
            <p className="caption">
              Last attempt:{" "}
              {v.controls?.lastAttemptAt
                ? new Date(v.controls.lastAttemptAt).toLocaleString()
                : "Not recorded"}
              <br />
              Last successful import:{" "}
              {(v.controls?.lastSuccessAt ?? v.snapshot.syncedAt)
                ? new Date(
                    v.controls?.lastSuccessAt ?? v.snapshot.syncedAt,
                  ).toLocaleString()
                : "Not yet"}
              <br />
              Status: {v.controls?.status ?? "Foreground only"}
            </p>
            <p className="caption">
              Importing successfully does not mean your ring or source app has
              uploaded new readings. Source observation dates are shown below.
              Imports stay private even while locked.
            </p>
            <Button
              disabled={
                v.busy ||
                (!v.backgroundSupported && !v.controls?.backgroundEnabled)
              }
              onClick={() =>
                void healthOperation(
                  v.controls?.backgroundEnabled
                    ? "stop-background"
                    : "background",
                )
              }
            >
              {v.controls?.backgroundEnabled
                ? "Disable background imports"
                : "Enable private background imports"}
            </Button>
            <label className="check-line">
              <input
                type="checkbox"
                disabled={v.busy}
                checked={v.controls?.autoReduce === true}
                onChange={(e) =>
                  void healthOperation(
                    e.target.checked ? "auto-on" : "auto-off",
                  )
                }
              />
              Automatic next-set load reductions
            </label>
            <p className="caption">
              Requires lower recovery signals, your current check-in, reported
              effort and confirmed usual rest/execution. At most once per
              exercise. Never changes your routine or adds sets.
            </p>
          </section>
          <details>
            <summary>Data sources</summary>
            {HEALTH_KINDS.filter((k) => k !== "steps").map((k) => {
              const sources = [
                ...new Map(
                  v
                    .snapshot!.records.filter((r) => r.kind === k)
                    .map((r) => [r.source, r.sourceName]),
                ).entries(),
              ];
              return (
                <Field label={`${labels[k]} source`} key={k}>
                  <select
                    disabled={v.busy}
                    value={v.snapshot!.sources[k] ?? ""}
                    onChange={(e) => {
                      const next = { ...v.snapshot!.sources };
                      if (e.target.value) next[k] = e.target.value;
                      else delete next[k];
                      void healthOperation("sync", next);
                    }}
                  >
                    <option value="">Automatic · most records</option>
                    {v.snapshot!.sources[k] &&
                      !sources.some(
                        ([id]) => id === v.snapshot!.sources[k],
                      ) && (
                        <option value={v.snapshot!.sources[k]}>
                          Selected source · no records
                        </option>
                      )}
                    {sources.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
            <p className="caption">
              Steps use Health Connect’s prioritized aggregate. Other metrics
              use one source at a time. No data in Health Connect means no data
              to import; boAt/Welltory scores are not assumed available.
            </p>
          </details>
          <div className="actions wrap">
            <Button
              disabled={v.busy}
              onClick={() => void healthOperation("disconnect")}
            >
              Disconnect
            </Button>
            <Button
              disabled={v.busy}
              onClick={() => void healthOperation("delete")}
            >
              Delete imported data
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
export function RecoveryCard() {
  const [trendOpen, setTrendOpen] = useState(false);
  const v = useHealthState();
  const estimate = useMemo(() => recoveryEstimate(v.snapshot), [v.snapshot]);
  if (!isAndroid() || !v.snapshot?.enabled) return null;
  return (
    <section
      className="recovery-card"
      aria-label="Recovery estimate"
      data-band={estimate.band}
    >
      <div className="recovery-heading">
        <strong>Recovery estimate</strong>
        <b>{estimate.score === null ? "—" : `${estimate.score}/100`}</b>
      </div>
      <p>
        {estimate.score === null
          ? estimate.reason
          : `${{ usual: "Usual signals", caution: "Caution", lower: "Lower signals", unknown: "Unknown" }[estimate.band]} · ${estimate.confidence} data confidence`}
      </p>
      {estimate.band === "lower" && (
        <p className="caption">
          Check how you actually feel in Readiness. Health readings alone cannot
          change a set.
        </p>
      )}
      <details>
        <summary>Why this estimate?</summary>
        <p className="caption">
          Experimental NEOFORM index, not a percentage of muscle recovery or
          Welltory’s score. A usual baseline is not proof of good health. Sleep
          needs recorded stages; at least 14 prior days and two eligible signals
          are required. Missing data stays unknown.
        </p>
        {estimate.components.map((c) => (
          <p className="caption" key={c.kind}>
            {c.kind === "sleep" ? "Recorded asleep time" : healthLabels[c.kind]}{" "}
            · {c.sourceName} · {c.days} baseline days · component{" "}
            {Math.round(c.score)}/100
            <br />
            {c.kind === "hrv-rmssd" ? "log-RMSSD" : "Observed"}:{" "}
            {c.value.toFixed(2)}{" "}
            {c.kind === "sleep"
              ? "min"
              : c.kind === "resting-heart-rate"
                ? "bpm"
                : "log(ms)"}{" "}
            · median {c.baseline.toFixed(2)} · scale {c.scale.toFixed(2)}
            <br />
            Observed {new Date(c.at).toLocaleString()}
          </p>
        ))}
        <p className="caption">
          Adverse deviations use median/MAD with minimum scales of 45 min sleep,
          3 bpm resting HR and 0.10 log-RMSSD. Weights: sleep 40%, HRV 35%,
          resting HR 25%, renormalized for available signals. Scores below 50
          indicate lower signals; 50–74 caution; 75–100 usual. Coverage
          confidence is not predictive validation.
        </p>
        <details onToggle={(e) => setTrendOpen(e.currentTarget.open)}>
          <summary>Private seven-day trend</summary>
          {trendOpen && <RecoveryHistory />}
        </details>
      </details>
    </section>
  );
}
function RecoveryHistory() {
  const v = useHealthState();
  const trend = useMemo(() => recoveryTrend(v.snapshot), [v.snapshot]);
  return (
    <div className="recovery-trend">
      {trend.length ? (
        trend.map((r) => (
          <p key={r.at}>
            <span>{new Date(r.at).toLocaleDateString()}</span>
            <meter
              min="0"
              max="100"
              value={r.score!}
              aria-label={`Recovery estimate ${r.score}`}
            />
            <b>{r.score}</b>
          </p>
        ))
      ) : (
        <p className="caption">Not enough historical data yet.</p>
      )}
    </div>
  );
}

function SleepStages({
  snapshot,
  day,
}: {
  snapshot: import("./healthConnectPolicy").HealthSnapshot;
  day: string;
}) {
  const row = selectedHealthRows(snapshot, "sleep")
    .filter((r) => r.day === day)
    .sort((a, b) => b.endAt - a.endAt)[0];
  if (
    !row ||
    !Number.isFinite(row.asleepMinutes) ||
    !Number.isFinite(row.awakeMinutes) ||
    !row.stageCoverage
  )
    return (
      <>
        <br />
        <span className="caption">
          Stages unavailable · session time is not confirmed asleep time.
        </span>
      </>
    );
  return (
    <>
      <br />
      <span className="caption">
        Latest session stages: asleep {Math.round(row.asleepMinutes!)} min ·
        awake {Math.round(row.awakeMinutes!)} min ·{" "}
        {Math.round(row.stageCoverage * 100)}% stage coverage
      </span>
    </>
  );
}
