import { useMemo, useState } from "react";
import * as D from "./domain";
import { useStore, saveChange } from "./store";
import {
  applyCoaching,
  evaluateCoaching,
  validOutcome,
  type CoachingChoice,
} from "./coaching";
import { DEFAULT_COACH_SETTINGS, type CoachingProposal } from "./coachingTypes";
import { ReadinessSheet } from "./ReadinessSheet";
import { Button, Field, Num } from "./ui";
import { applyProgramReview, pendingProgramTarget } from "./programReview";
import { ChangeReviews } from "./ChangeReviews";
import { reviewAcceptedChanges } from "./coachingResponse";

export function CoachSheet({
  session: initial,
  entryId,
  onOpenWorkout,
  programOnly = false,
}: {
  session: D.Session;
  entryId?: string;
  onOpenWorkout?: () => void;
  programOnly?: boolean;
}) {
  const state = useStore().box.data;
  const [preview, setPreview] = useState({
      ...initial,
      bodyweight: initial.bodyweight ?? state.coaching?.bodyweight,
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({}),
    [scope, setScope] = useState<Record<string, "session" | "program">>({});
  const [edits, setEdits] = useState<Record<string, CoachingProposal["rows"]>>(
      {},
    ),
    [alternatives, setAlternatives] = useState<Record<string, string>>({});
  const [clock, setClock] = useState(Date.now());
  const session = state.draft?.id === initial.id ? state.draft : preview;
  const exercises = useMemo(
    () => [...D.catalog, ...state.customExercises],
    [state.customExercises],
  );
  const proposals = useMemo(
    () => evaluateCoaching(state, session, Date.now()),
    [state, session, clock],
  );
  const responses = useMemo(
    () =>
      reviewAcceptedChanges(state, Date.now(), session).filter(
        (r) =>
          !entryId ||
          r.decision.proposal?.targetId ===
            session.exercises.find((e) => e.id === entryId)?.sourceTargetId,
      ),
    [state, session, entryId, clock],
  );
  const muscles = [
    ...new Set(
      session.exercises.flatMap((e) => {
        const x = exercises.find((x) => x.id === e.exerciseId);
        return x ? [x.muscle, ...x.secondary] : [];
      }),
    ),
  ];
  const outcomes = (state.coachingEvents ?? []).filter(
    (e) => e.kind === "outcome" && validOutcome(state, e),
  );
  async function choose(choices: CoachingChoice[]) {
    setError("");
    setBusy(true);
    try {
      if (
        programOnly &&
        (state.draft ||
          choices.some((c) => {
            const e = session.exercises.find(
              (e) => e.id === c.proposal.entryId,
            );
            return e && pendingProgramTarget(state, session, e);
          }))
      )
        throw Error(
          "Finish the active workout or assess previously approved targets before another program change.",
        );
      if (
        await saveChange((data) =>
          programOnly
            ? applyProgramReview(data, session, choices)
            : applyCoaching(data, session, choices),
        )
      ) {
        setNotice(
          "Coaching choice saved on this device. Check sync status for cloud persistence.",
        );
        setSelected({});
        setEdits({});
        if (
          choices.some(
            (c) =>
              c.scope === "session" && ["accept", "edit"].includes(c.choice),
          )
        )
          onOpenWorkout?.();
      } else
        setError(
          "The choice is not yet durable. Check device or sync errors before retrying.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setError("");
    setBusy(true);
    try {
      if (
        await saveChange((data) => {
          if (data.draft) {
            if (data.draft.id !== initial.id)
              throw Error("Another workout is active.");
            return data;
          }
          const p = data.programs.find((p) => p.id === initial.programId),
            w = p?.workouts.find((w) => w.id === initial.workoutId);
          if (!p || !w)
            throw Error("This program changed. Open a fresh workout preview.");
          const prepared = D.startSession(
            w.name,
            D.prepareWorkout(
              w,
              p,
              [...D.catalog, ...data.customExercises],
              data.sessions,
              data.profile?.experience,
            ),
            p,
            w,
          );
          return {
            ...data,
            draft: {
              ...prepared,
              readiness: preview.readiness,
              bodyweight: data.coaching?.bodyweight,
            },
            timer: null,
          };
        })
      )
        onOpenWorkout?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const choice = (
    p: CoachingProposal,
    action: CoachingChoice["choice"],
  ): CoachingChoice => ({
    proposal: p,
    choice: action,
    scope: programOnly
      ? "program"
      : (scope[p.id] ??
        ([
          "rep-range",
          "add-volume",
          "reduce-volume",
          "substitute",
          "deload",
        ].includes(p.action)
          ? "program"
          : "session")),
    rows: edits[p.id],
    alternative: alternatives[p.id],
  });
  return (
    <div className="training-coaching coach-sheet">
      <h3>{session.name}</h3>
      <p>Review targets from confirmed performance. Coaching works offline.</p>
      <ChangeReviews reviews={responses} state={state} />
      {proposals
        .filter((p) => !entryId || p.entryId === entryId)
        .map((p, index) => {
          const x = exercises.find((x) => x.id === p.exerciseId)!;
          const canApply =
            !["hold", "recover"].includes(p.action) &&
            !(
              programOnly &&
              (state.draft ||
                session.exercises.some(
                  (e) =>
                    e.id === p.entryId &&
                    pendingProgramTarget(state, session, e),
                ))
            );
          const recorded = (state.coachingEvents ?? [])
            .filter((e) => e.proposalId === p.id && e.kind === "decision")
            .at(-1);
          const applied =
            !!recorded && ["accept", "edit"].includes(recorded.choice ?? "");
          const card = (
            <section className="panel" key={p.id}>
              <h3>
                {x.name} · {p.action.replaceAll("-", " ")}
              </h3>
              <p>
                {p.reason.split(". ")[0]}
                {p.reason.includes(". ") ? "." : ""}
              </p>
              {canApply && p.rows.length > 0 && (
                <div className="table-wrap">
                  <table aria-label={`${x.name} proposed working sets`}>
                    <thead>
                      <tr>
                        <th>Set</th>
                        <th>Load</th>
                        <th>Reps</th>
                        <th>RIR target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(edits[p.id] ?? p.rows).map((r, i) => (
                        <tr key={r.ordinal}>
                          <td>{r.ordinal + 1}</td>
                          <td>
                            {D.displayLoad(
                              r.weight,
                              x.convention,
                              state.settings.unit,
                            ).toFixed(2)}{" "}
                            {x.convention === "machine-label"
                              ? "label"
                              : state.settings.unit}
                          </td>
                          <td>{r.reps}</td>
                          <td>{r.rir}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details className="coach-options">
                <summary>Options and evidence</summary>
                {canApply && p.rows.length > 0 && !p.afterTarget && (
                  <details>
                    <summary>Edit proposed set targets</summary>
                    {(edits[p.id] ?? p.rows).map((r, i) => (
                      <div className="form-grid" key={r.ordinal}>
                        <Field label={`${x.name} proposed set ${i + 1} load`}>
                          <Num
                            label={`${x.name} proposed set ${i + 1} load`}
                            value={D.displayLoad(
                              r.weight,
                              x.convention,
                              state.settings.unit,
                            )}
                            step={0.25}
                            min={0}
                            max={2000}
                            onChange={(value) =>
                              setEdits((old) => ({
                                ...old,
                                [p.id]: (old[p.id] ?? p.rows).map((row, j) =>
                                  j === i
                                    ? {
                                        ...row,
                                        weight: D.canonicalLoad(
                                          value,
                                          x.convention,
                                          state.settings.unit,
                                        ),
                                      }
                                    : row,
                                ),
                              }))
                            }
                          />
                        </Field>
                        <Field label={`${x.name} proposed set ${i + 1} reps`}>
                          <Num
                            label={`${x.name} proposed set ${i + 1} reps`}
                            value={r.reps}
                            min={p.beforeTarget?.min ?? 1}
                            max={p.beforeTarget?.max ?? 100}
                            onChange={(value) =>
                              setEdits((old) => ({
                                ...old,
                                [p.id]: (old[p.id] ?? p.rows).map((row, j) =>
                                  j === i ? { ...row, reps: value } : row,
                                ),
                              }))
                            }
                          />
                        </Field>
                      </div>
                    ))}
                  </details>
                )}
                {p.action === "substitute" && (
                  <Field label={`${x.name} alternative`}>
                    <select
                      value={alternatives[p.id] ?? ""}
                      onChange={(e) =>
                        setAlternatives((old) => ({
                          ...old,
                          [p.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Choose an alternative</option>
                      {p.alternatives?.map((id) => (
                        <option key={id} value={id}>
                          {exercises.find((x) => x.id === id)?.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {p.afterTarget && (
                  <p>
                    Future target: {p.beforeTarget?.sets} → {p.afterTarget.sets}{" "}
                    working sets; {p.beforeTarget?.min}–{p.beforeTarget?.max} →{" "}
                    {p.afterTarget.min}–{p.afterTarget.max} reps. Apply to the
                    future program only; completed work and the current draft
                    stay unchanged.
                  </p>
                )}
                {p.action === "deload" && (
                  <>
                    <p>
                      Future program deload: fewer working sets and reps, with
                      at least 5 RIR using the existing phase rules. Review
                      after one planned week; no automatic return to escalation.
                    </p>
                    <PhaseDosePreview state={state} programId={p.programId} />
                  </>
                )}
                {canApply &&
                  !programOnly &&
                  !p.afterTarget &&
                  !["substitute", "deload"].includes(p.action) && (
                    <details>
                      <summary>Change scope</summary>
                      <Field label={`${x.name} change scope`}>
                        <select
                          value={scope[p.id] ?? "session"}
                          onChange={(e) =>
                            setScope((old) => ({
                              ...old,
                              [p.id]: e.target.value as "session" | "program",
                            }))
                          }
                        >
                          <option value="session">This workout only</option>
                          <option value="program">
                            Future program targets
                          </option>
                        </select>
                      </Field>
                    </details>
                  )}
                <p className="caption">{p.review}</p>
                <details>
                  <summary>Evidence and exclusions</summary>
                  <p>{p.reason}</p>
                  <p className="caption">
                    {p.sourceIds.length} eligible exposures ·{" "}
                    {p.uncertain
                      ? "uncertain / exploratory"
                      : "repeated evidence"}{" "}
                    · {p.version}
                  </p>

                  <p className="caption">
                    Informed by Scientific Principles of Hypertrophy Training
                    (2020). Increment caps and review windows are app policies.
                    This is not live Gemini advice or measured growth.
                  </p>
                  {p.evidence.map((v, i) => (
                    <p className="caption" key={i}>
                      {v}
                    </p>
                  ))}
                  {p.excluded.map((v, i) => (
                    <p className="caption" key={"x" + i}>
                      Excluded: {v}
                    </p>
                  ))}
                </details>
              </details>
              {recorded && (
                <p role="status">Recorded choice: {recorded.choice}.</p>
              )}
              <p className="caption">
                {choice(p, "accept").scope === "program"
                  ? "Changes future program targets only."
                  : "Changes this workout only."}
              </p>
              <div className="actions wrap">
                {canApply && (
                  <Button
                    disabled={
                      busy ||
                      applied ||
                      (p.action === "substitute" && !alternatives[p.id])
                    }
                    onClick={() =>
                      void choose([choice(p, edits[p.id] ? "edit" : "accept")])
                    }
                  >
                    {programOnly ||
                    p.afterTarget ||
                    ["substitute", "deload"].includes(p.action)
                      ? "Apply to program"
                      : "Apply"}
                  </Button>
                )}
                <details className="coach-other">
                  <summary>Other choices</summary>{" "}
                  <Button
                    disabled={busy || applied}
                    onClick={() => void choose([choice(p, "defer")])}
                  >
                    Defer
                  </Button>
                  <Button
                    disabled={busy || applied}
                    onClick={() => void choose([choice(p, "decline")])}
                  >
                    Decline
                  </Button>
                </details>{" "}
              </div>
              {canApply && !applied && (
                <details>
                  <summary>Coordinate changes</summary>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={!!selected[p.id]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((old) => ({
                          ...Object.fromEntries(
                            Object.entries(old).filter(
                              ([id]) =>
                                !checked ||
                                proposals.find((v) => v.id === id)?.entryId !==
                                  p.entryId,
                            ),
                          ),
                          [p.id]: checked,
                        }));
                      }}
                    />
                    Include in reviewed bundle (one alternative per exercise)
                  </label>
                </details>
              )}
            </section>
          );
          return index === 0 ? (
            card
          ) : (
            <details className="coach-alternative" key={p.id}>
              <summary>
                {exercises.find((x) => x.id === p.exerciseId)?.name}:{" "}
                {p.action.replaceAll("-", " ")}
              </summary>
              {card}
            </details>
          );
        })}
      <details className="coach-settings">
        <summary>Readiness and coaching settings</summary>
        <details>
          <summary>Current readiness and recovery</summary>
          <ReadinessSheet
            key={session.id}
            value={session.readiness}
            muscles={muscles}
            readOnly={session.exercises.some((e) =>
              e.sets.some((t) => t.done && t.kind !== "warmup"),
            )}
            onSave={async (readiness) => {
              if (state.draft?.id === session.id) {
                if (
                  !(await saveChange((s) => ({
                    ...s,
                    draft: { ...s.draft!, readiness },
                  })))
                )
                  setError("Readiness is not yet saved.");
              } else setPreview((s) => ({ ...s, readiness }));
            }}
          />
        </details>
        <details>
          <summary>Coaching preferences</summary>
          <CoachSettingsPanel />
        </details>
        <Button
          onClick={() => {
            setClock(Date.now());
            setSelected({});
            setEdits({});
            setError("");
          }}
        >
          Refresh evidence
        </Button>
        <details>
          <summary>Outcome history</summary>{" "}
          <p className="caption">
            Observed outcomes:{" "}
            {outcomes.filter((e) => e.outcome === "met").length} targets met ·{" "}
            {outcomes.filter((e) => e.outcome === "too-demanding").length} too
            demanding · {outcomes.filter((e) => e.outcome === "easier").length}{" "}
            easier ·{" "}
            {
              outcomes.filter((e) =>
                ["unknown", "changed"].includes(e.outcome ?? ""),
              ).length
            }{" "}
            unknown or changed. Counts describe reported target attainment, not
            muscle growth. Small samples remain uncertain.
          </p>
        </details>{" "}
      </details>
      {Object.values(selected).some(Boolean) && (
        <>
          <p>
            Apply the selected changes together. Outcomes cannot identify which
            component caused an improvement or decline.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void choose(
                proposals
                  .filter((p) => selected[p.id])
                  .map((p) => choice(p, edits[p.id] ? "edit" : "accept")),
              )
            }
          >
            Accept reviewed bundle
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {onOpenWorkout && !state.draft && (
        <Button disabled={busy} onClick={() => void start()}>
          {state.draft
            ? "Open current workout"
            : "Start workout without coaching changes"}
        </Button>
      )}
    </div>
  );
}

function PhaseDosePreview({
  state,
  programId,
}: {
  state: D.State;
  programId?: string;
}) {
  const program = state.programs.find((p) => p.id === programId);
  if (!program) return null;
  const exercises = [...D.catalog, ...state.customExercises];
  return (
    <details>
      <summary>Preview actual deload doses</summary>
      <div className="table-wrap">
        <table aria-label="Deload dose preview">
          <thead>
            <tr>
              <th>Workout / exercise</th>
              <th>Sets</th>
              <th>Reps</th>
              <th>RIR</th>
              <th>Loads</th>
            </tr>
          </thead>
          <tbody>
            {program.workouts.flatMap((w) =>
              D.prepareWorkout(
                w,
                { ...program, phase: "deload" },
                exercises,
                state.sessions,
                state.profile?.experience,
              ).map((e) => {
                const x = exercises.find((x) => x.id === e.exerciseId)!;
                return (
                  <tr key={w.id + e.sourceTargetId}>
                    <td>
                      {w.name} / {x.name}
                    </td>
                    <td>{e.plannedWorkingSets}</td>
                    <td>
                      {e.target?.min}–{e.target?.max}
                    </td>
                    <td>{e.target?.rir}</td>
                    <td>
                      {e.sets
                        .map((t) =>
                          D.displayLoad(
                            t.weight,
                            x.convention,
                            state.settings.unit,
                          ).toFixed(2),
                        )
                        .join(" / ")}{" "}
                      {x.convention === "machine-label"
                        ? "label"
                        : state.settings.unit}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Reference loads remain manual when history cannot establish a comparable
        baseline. Confirm comfortable execution; the timer is not an order to
        begin the next set.
      </p>
    </details>
  );
}

export function CoachSettingsPanel() {
  const state = useStore().box.data;
  const [settings, setSettings] = useState(() => ({
      ...DEFAULT_COACH_SETTINGS,
      ...state.coaching,
    })),
    [notice, setNotice] = useState("");
  return (
    <section className="training-coaching">
      <label className="check-line">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) =>
            setSettings((s) => ({ ...s, enabled: e.target.checked }))
          }
        />
        Enable reviewed coaching proposals
      </label>
      <div className="form-grid">
        <Field label="Coaching session budget (minutes)">
          <Num
            label="Coaching session budget (minutes)"
            value={settings.minutes}
            min={30}
            max={120}
            onChange={(minutes) => setSettings((s) => ({ ...s, minutes }))}
          />
        </Field>
        <Field label="Reported diet phase">
          <select
            value={settings.diet}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                diet: e.target.value as typeof settings.diet,
              }))
            }
          >
            <option value="unknown">Unknown / not reported</option>
            <option value="cut">Cut</option>
            <option value="maintenance">Maintenance</option>
            <option value="gain">Gain</option>
          </select>
        </Field>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={settings.earlyTrials}
          onChange={(e) =>
            setSettings((s) => ({ ...s, earlyTrials: e.target.checked }))
          }
        />
        Offer eligible first-set progression trials
      </label>
      <Field label="Optional reported bodyweight (kg)">
        <input
          type="number"
          min="20"
          max="400"
          step="0.1"
          value={settings.bodyweight?.kg ?? ""}
          onChange={(e) => {
            const kg = e.target.valueAsNumber;
            setSettings((s) => ({
              ...s,
              bodyweight: Number.isFinite(kg)
                ? { kg, at: Date.now() }
                : undefined,
            }));
          }}
        />
      </Field>
      <details>
        <summary>Explicit muscle priorities for volume review</summary>
        {D.muscles.map((m) => (
          <label className="check-line" key={m}>
            <input
              type="checkbox"
              checked={settings.priorities.includes(m)}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  priorities: e.target.checked
                    ? [...s.priorities, m]
                    : s.priorities.filter((v) => v !== m),
                }))
              }
            />
            {m}
          </label>
        ))}
      </details>
      <p className="caption">
        No automatic set additions or nutrition prescriptions. A cut plateau
        alone does not justify more volume. These preferences do not rewrite
        programs.
      </p>
      <Button
        onClick={async () => {
          try {
            setNotice(
              (await saveChange((s) => ({ ...s, coaching: settings })))
                ? "Coaching preferences saved."
                : "Preferences are not yet durable; check device and sync status.",
            );
          } catch (e) {
            setNotice((e as Error).message);
          }
        }}
      >
        Save coaching preferences
      </Button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
