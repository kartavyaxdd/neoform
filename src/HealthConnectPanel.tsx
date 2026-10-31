import { useMemo } from "react";
import { Button, Field } from "./ui";
import { useHealthState, healthOperation } from "./healthConnect";
import {
  healthContext,
  HEALTH_KINDS,
  type HealthContext,
  type HealthKind,
} from "./healthConnectPolicy";
import { isAndroid } from "./native";
import { useStore } from "./store";

const labels: Record<HealthKind, string> = {
  steps: "Steps",
  sleep: "Sleep session time",
  weight: "Body weight",
  nutrition: "Logged calories",
  "resting-heart-rate": "Resting heart rate",
};
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
        </p>
      ))}
      <p className="caption">
        Descriptive observations, not a recovery score. Sleep session time may
        include awake time. Nutrition may omit unlogged meals. Baselines need
        seven prior days within 21 days from the same source.
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
        Read-only access to steps, sleep, weight, nutrition and resting heart
        rate. Imported records stay encrypted on this phone, outside cloud sync,
        backups and Gemini.
      </p>
      <p role="status">{v.message}</p>
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
              ? " · partial import; narrow your source data before using trends"
              : ""}
          </p>
          <HealthSummary />
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
