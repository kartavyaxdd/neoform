import { useState } from "react";
import * as D from "./domain";
import { Rating, Pain } from "./TrainingFeedback";
import { Button, Field } from "./ui";
import { readinessFresh } from "./readiness";

const factorLabels: Record<(typeof D.readinessFactors)[number], string> = {
  "poor-sleep": "Poor sleep",
  illness: "Illness",
  travel: "Travel",
  "unusual-activity": "Unusual activity",
  other: "Other change",
};
export function ReadinessSheet({
  value,
  muscles,
  readOnly,
  onSave,
}: {
  value?: D.Readiness;
  muscles: D.Exercise["muscle"][];
  readOnly: boolean;
  onSave: (value: D.Readiness) => void;
}) {
  const [report, setReport] = useState<D.Readiness>(() =>
    value
      ? structuredClone(value)
      : {
          recordedAt: 0,
          pain: null,
          fatigue: null,
          context: "unknown",
          factors: [],
          muscles: [],
        },
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  function muscleRow(muscle: D.Exercise["muscle"]) {
    const row = report.muscles.find((r) => r.muscle === muscle) ?? {
      muscle,
      recovered: "unknown" as const,
      pain: null,
      soreness: null,
    };
    const update = (patch: Partial<D.Readiness["muscles"][number]>) =>
      setReport((r) => ({
        ...r,
        muscles: [
          ...r.muscles.filter((x) => x.muscle !== muscle),
          { ...row, ...patch },
        ],
      }));
    return (
      <fieldset key={muscle}>
        <legend>{muscle}</legend>
        <div className="feedback-grid">
          <Field label={`${muscle} readiness`}>
            <select
              value={row.recovered}
              onChange={(ev) =>
                update({ recovered: ev.target.value as typeof row.recovered })
              }
            >
              <option value="unknown">Unknown / not reported</option>
              <option value="yes">Recovered enough for today</option>
              <option value="no">Not recovered</option>
            </select>
          </Field>
          <Pain
            label={`${muscle} pain now`}
            value={row.pain}
            onChange={(pain) => update({ pain })}
          />
          <Rating
            label={`${muscle} soreness now`}
            value={row.soreness}
            onChange={(soreness) => update({ soreness })}
          />
          <Rating
            label={`${muscle} muscle fatigue now`}
            value={row.fatigue}
            onChange={(fatigue) => update({ fatigue })}
          />
        </div>
      </fieldset>
    );
  }
  if (readOnly)
    return (
      <section className="training-coaching">
        <p>
          Pre-session observations stay as recorded after working sets begin.
          Finish feedback is separate.
        </p>
        {value ? (
          <>
            <p>
              General context reported{" "}
              {new Date(value.recordedAt).toLocaleString()} ·{" "}
              {readinessFresh(value, Date.now())
                ? "within the app's 12-hour check-in window"
                : "outside the app's check-in window"}
              .
            </p>
            <p>
              Systemic fatigue: {value.fatigue ?? "unknown"}/5 · Unscoped pain:{" "}
              {value.pain == null ? "unknown" : value.pain ? "yes" : "no"} ·
              Context: {value.context}
              {value.factors.length
                ? ` (${value.factors.map((f) => factorLabels[f]).join(", ")})`
                : ""}
              .
            </p>
            {value.muscles.map((row) => (
              <p key={row.muscle}>
                {row.muscle}: recovery {row.recovered}, pain{" "}
                {row.pain == null ? "unknown" : row.pain ? "yes" : "no"},
                soreness {row.soreness ?? "unknown"}/5. Muscle fatigue{" "}
                {row.fatigue ?? "unknown"}/5. Reported{" "}
                {new Date(row.recordedAt ?? value.recordedAt).toLocaleString()}{" "}
                ·{" "}
                {readinessFresh(
                  { recordedAt: row.recordedAt ?? value.recordedAt },
                  Date.now(),
                )
                  ? "within the app's 12-hour check-in window"
                  : "outside the app's check-in window"}
                .
              </p>
            ))}
          </>
        ) : (
          <p>No pre-session readiness was recorded.</p>
        )}
      </section>
    );
  return (
    <section className="training-coaching">
      <p>
        Optional. Report how you feel before working sets. Unknown stays
        unknown; this is separate from finish feedback. You can log without a
        check-in.
      </p>
      {value && (
        <p className="caption">
          Last reported {new Date(value.recordedAt).toLocaleString()}. Saving
          requires confirming these answers describe you now.
        </p>
      )}
      <div className="feedback-grid">
        <Rating
          label="Systemic fatigue now"
          value={report.fatigue}
          onChange={(fatigue) => setReport((r) => ({ ...r, fatigue }))}
        />
        <Pain
          label="Unscoped pain now"
          value={report.pain}
          onChange={(pain) => setReport((r) => ({ ...r, pain }))}
        />
        <Field label="Broader context today">
          <select
            value={report.context}
            onChange={(ev) =>
              setReport((r) => ({
                ...r,
                context: ev.target.value as D.Readiness["context"],
                factors: ev.target.value === "changed" ? r.factors : [],
              }))
            }
          >
            <option value="unknown">Unknown / not reported</option>
            <option value="usual">Usual for me</option>
            <option value="changed">Changed / disrupted</option>
          </select>
        </Field>
      </div>
      {report.context === "changed" && (
        <fieldset>
          <legend>Optional context factors</legend>
          {D.readinessFactors.map((f) => (
            <label className="check-row" key={f}>
              <input
                type="checkbox"
                checked={report.factors.includes(f)}
                onChange={(ev) =>
                  setReport((r) => ({
                    ...r,
                    factors: ev.target.checked
                      ? [...r.factors, f]
                      : r.factors.filter((x) => x !== f),
                  }))
                }
              />
              {factorLabels[f]}
            </label>
          ))}
        </fieldset>
      )}
      {muscles[0] && muscleRow(muscles[0])}
      {!!muscles.slice(1).length && (
        <details>
          <summary>Other workout muscles</summary>
          <p className="caption">
            Include assisting muscles and later exercises here before the first
            working set. Readiness stays as recorded once working sets begin.
          </p>
          {muscles.slice(1).map(muscleRow)}
        </details>
      )}
      {!!report.muscles.filter((row) => !muscles.includes(row.muscle))
        .length && (
        <details>
          <summary>Other saved muscle observations</summary>
          <p className="caption">
            These keep their original observation time. Open that exercise's
            readiness check to update them.
          </p>
          {report.muscles
            .filter((row) => !muscles.includes(row.muscle))
            .map((row) => (
              <p key={row.muscle}>
                {row.muscle}: recovery {row.recovered}, reported{" "}
                {new Date(row.recordedAt ?? report.recordedAt).toLocaleString()}
                .
              </p>
            ))}
        </details>
      )}
      <p className="caption">
        Check-in freshness is an app policy, not a recovery countdown or growth
        score. Changed context holds escalation for review; it does not prove
        what caused performance changes. Stop painful work.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(ev) => setConfirmed(ev.target.checked)}
        />
        These answers describe how I feel now.
      </label>
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={!confirmed}
        onClick={() => {
          const at = Date.now();
          const parsed = D.readinessSchema.safeParse({
            ...report,
            recordedAt: at,
            muscles: report.muscles.map((row) => ({
              ...row,
              recordedAt: muscles.includes(row.muscle)
                ? at
                : (row.recordedAt ?? report.recordedAt),
            })),
          });
          if (!parsed.success) {
            setError("Review these observations before saving.");
            return;
          }
          onSave(parsed.data);
        }}
      >
        Save current readiness
      </Button>
    </section>
  );
}
