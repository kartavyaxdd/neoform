import * as D from "./domain";
import { current as currentDraft, isDraft } from "immer";
import { recoveryTime, readinessFresh } from "./readiness";
import {
  coachingEventSchema,
  coachingProposalSchema,
  DEFAULT_COACH_SETTINGS,
  type CoachingEvent,
  type CoachingProposal,
  type CoachSettings,
} from "./coachingTypes";

export const COACH_VERSION = "coach-v1" as const;
const DAY = 86400000;
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
// IDs are only a UI identity. Acceptance also compares the full canonical basis.
function identity(value: string) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16);
}
const working = (e: D.Entry) => e.sets.filter((t) => t.kind === "working");
const targetValue = (t: D.Target) => ({
  exerciseId: t.exerciseId,
  sets: t.sets,
  min: t.min,
  max: t.max,
  rir: t.rir,
  rest: t.rest,
  ...(t.startingLoad === undefined ? {} : { startingLoad: t.startingLoad }),
});
const rowValues = (e: D.Entry) =>
  working(e).map((t, ordinal) => ({
    ordinal,
    weight: t.weight,
    reps: t.reps,
    rir: e.target?.rir ?? 2,
  }));
type Exposure = { session: D.Session; entry: D.Entry };
const exposureIndexes = new WeakMap<D.Session[], Map<string, Exposure[]>>();
const streamKey = (s: D.Session, e: D.Entry) =>
  canonical([
    e.exerciseId,
    s.programId ?? null,
    s.workoutId ?? null,
    e.sourceTargetId ?? null,
  ]);
function exposureIndex(sessions: D.Session[]) {
  let index = exposureIndexes.get(sessions);
  if (index) return index;
  index = new Map();
  for (const session of [...sessions].sort(
    (a, b) => recoveryTime(a) - recoveryTime(b) || a.id.localeCompare(b.id),
  ))
    for (const entry of session.exercises) {
      const key = streamKey(session, entry),
        rows = index.get(key) ?? [];
      rows.push({ session, entry });
      index.set(key, rows);
    }
  exposureIndexes.set(sessions, index);
  return index;
}
export function coachContextKey(
  session: D.Session,
  entry: D.Entry,
  ex: D.Exercise,
) {
  const prefix = session.exercises
    .slice(0, session.exercises.indexOf(entry))
    .map((e) => [
      e.exerciseId,
      e.plannedWorkingSets,
      e.target,
      e.setup,
      e.technique,
    ]);
  return canonical([
    session.programId ?? null,
    session.workoutId ?? null,
    entry.sourceTargetId ?? null,
    session.phase ?? null,
    D.comparableKey(entry, ex),
    entry.target,
    entry.plannedWorkingSets,
    prefix,
  ]);
}
function eligible(e: D.Entry, at: number) {
  if (e.coachingContext?.skipReason === "pain")
    return "reported pain requires review";
  const sets = working(e);
  if (
    !e.target ||
    !e.plannedWorkingSets ||
    sets.length !== e.plannedWorkingSets ||
    sets.some((t) => !t.done)
  )
    return "planned dose incomplete or unknown";
  if (sets.some((t) => t.effortReported !== true))
    return "actual effort unconfirmed";
  if (sets.some((t, i) => !t.prescription || t.prescription.ordinal !== i))
    return "per-set prescription unknown";
  if (
    sets.some(
      (t) =>
        t.prescription!.weight !== t.weight ||
        t.prescription!.min !== e.target!.min ||
        t.prescription!.max !== e.target!.max ||
        t.prescription!.rir !== e.target!.rir ||
        t.prescription!.rest !== e.target!.rest,
    )
  )
    return "recorded loads or prescription context changed";
  if (
    e.sets.some(
      (t) =>
        t.done &&
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  )
    return "advanced or mixed bouts";
  if (e.technique && e.technique !== "straight") return "non-straight sequence";
  if (e.tempo || e.superset) return "execution sequence differs";
  if (
    e.coachingContext?.execution !== "consistent" ||
    e.coachingContext.rest !== "usual"
  )
    return "execution or rest not confirmed as planned";
  if (
    e.coachingContext.recordedAt < at ||
    e.coachingContext.recordedAt > at + 2 * DAY
  )
    return "execution confirmation time does not describe this session";
  return null;
}
export function evidenceFor(
  state: D.State,
  session: D.Session,
  entry: D.Entry,
  ex: D.Exercise,
  now: number,
) {
  const key = coachContextKey(session, entry, ex);
  const all = (
    exposureIndex(state.sessions).get(streamKey(session, entry)) ?? []
  ).filter(
    (r) =>
      r.session.id !== session.id &&
      recoveryTime(r.session) <= now &&
      now - recoveryTime(r.session) <= 56 * DAY,
  );
  // An intervening changed phase, dose or setup starts a new evidence segment.
  const boundary = all
    .map((r) => coachContextKey(r.session, r.entry, ex) === key)
    .lastIndexOf(false);
  const segment = all.slice(boundary + 1);
  const excluded: string[] = [];
  const reasonFor = (r: Exposure) =>
    eligible(r.entry, r.session.startedAt) ||
    ((r.entry.coachingContext?.recordedAt ?? 0) > now
      ? "future execution confirmation"
      : null) ||
    (ex.convention === "added-bodyweight" &&
    session.bodyweight &&
    r.session.bodyweight &&
    session.bodyweight.at <= now &&
    now - session.bodyweight.at <= 7 * DAY &&
    r.session.bodyweight.at <= r.session.startedAt &&
    r.session.startedAt - r.session.bodyweight.at <= 7 * DAY &&
    Math.abs(session.bodyweight.kg - r.session.bodyweight.kg) /
      r.session.bodyweight.kg >
      0.01
      ? "reported bodyweight changed; re-establish this reference"
      : null);
  const valid = segment
    .filter((r) => {
      const reason = reasonFor(r);
      if (reason) excluded.push(`${r.session.date}: ${reason}.`);
      return !reason;
    })
    .slice(-8);
  if (boundary >= 0)
    excluded.unshift(
      "Earlier evidence excluded after a changed prescription, exercise order, phase or setup.",
    );
  const latest = segment.at(-1);
  return {
    valid,
    excluded: excluded.slice(-16),
    latest,
    latestEligible: latest && !reasonFor(latest),
  };
}
function plannedMinutes(program: D.Program) {
  return Math.max(
    ...program.workouts.map(
      (w) =>
        5 +
        w.exercises.length * 1.5 +
        w.exercises.reduce(
          (sum, t) =>
            sum +
            (t.sets * t.max * 3) / 60 +
            (Math.max(0, t.sets - 1) * t.rest) / 60,
          0,
        ),
    ),
  );
}
const floorMiss = (e: D.Entry) =>
  working(e).some((s) => s.reps < e.target!.min || s.rir < e.target!.rir);
const ceiling = (e: D.Entry) =>
  working(e).every((s) => s.reps >= e.target!.max && s.rir >= e.target!.rir);
const actualSignature = (e: D.Entry) =>
  working(e).map((t) => [
    t.weight,
    t.reps,
    t.rir,
    t.effortReported,
    t.prescription,
  ]);

export function evaluateCoaching(
  state: D.State,
  session: D.Session,
  now = Date.now(),
): CoachingProposal[] {
  state = isDraft(state) ? currentDraft(state) : state;
  const settings: CoachSettings = {
    ...DEFAULT_COACH_SETTINGS,
    ...state.coaching,
  };
  const exercises = [...D.catalog, ...state.customExercises];
  const program = state.programs.find((p) => p.id === session.programId);
  const proposals: CoachingProposal[] = [];
  for (const entry of session.exercises) {
    const ex = exercises.find((e) => e.id === entry.exerciseId);
    if (!ex) continue;
    const target = program?.workouts
      .find((w) => w.id === session.workoutId)
      ?.exercises.find((t) => t.id === entry.sourceTargetId);
    const history = evidenceFor(state, session, entry, ex, now);
    const latest = history.valid.at(-1),
      latestSets = latest ? working(latest.entry) : [];
    const baseline = latest ? rowValues(latest.entry) : rowValues(entry);
    const context = D.recoveryStatus(
      ex.muscle,
      state.sessions,
      exercises,
      now,
      session.readiness,
    );
    const support = ex.secondary
      .map((m) =>
        D.recoveryStatus(m, state.sessions, exercises, now, session.readiness),
      )
      .find((r) => r.blocked);
    const evidence = [
      ...context.evidence,
      ...history.valid.map(
        (r) =>
          `${r.session.date}: ${working(r.entry).length} confirmed working sets; ${actualSignature(
            r.entry,
          )
            .map((t) => `${t[0]} × ${t[1]}, reported RIR ${t[2]}`)
            .join(" / ")}.`,
      ),
    ];
    const sourceIds = history.valid.map((r) => r.session.id);
    const fingerprint = canonical({
      session: session.id,
      program: program
        ? {
            id: program.id,
            phase: D.programPhase(program),
            week: program.currentWeek,
            target,
          }
        : null,
      entry: { ...entry, notes: undefined },
      readiness: session.readiness,
      settings,
      history: history.valid.map((r) => [
        r.session.id,
        actualSignature(r.entry),
        r.entry.coachingContext,
        r.session.readiness,
      ]),
      latest: history.latest
        ? [
            history.latest.session.id,
            actualSignature(history.latest.entry),
            history.latest.entry.coachingContext,
            history.latest.session.bodyweight,
          ]
        : null,
      bodyweight: session.bodyweight,
      recovery: context,
      support,
      events: (state.coachingEvents ?? [])
        .filter(
          (e) =>
            e.kind === "outcome" ||
            (e.proposal?.action === "add-volume" && e.at >= now - 7 * DAY),
        )
        .slice(-24)
        .map((e) => ({
          id: e.id,
          at: e.at,
          kind: e.kind,
          outcome: e.outcome,
          choice: e.choice,
          proposalId: e.proposalId,
          sessionId: e.sessionId,
          valid: e.kind === "outcome" ? validOutcome(state, e) : undefined,
        })),
    });
    const make = (
      action: CoachingProposal["action"],
      reason: string,
      extra: Partial<CoachingProposal> = {},
    ) => {
      const value = {
        version: COACH_VERSION,
        sessionId: session.id,
        entryId: entry.id,
        exerciseId: ex.id,
        ...(program ? { programId: program.id } : {}),
        ...(session.workoutId ? { workoutId: session.workoutId } : {}),
        ...(target
          ? { targetId: target.id, beforeTarget: targetValue(target) }
          : {}),
        fingerprint,
        contextKey: coachContextKey(session, entry, ex),
        action,
        reason,
        evidence: evidence.slice(0, 24),
        excluded: history.excluded,
        sourceIds,
        rows: baseline,
        beforeRows: rowValues(entry),
        review: "Review after the next confirmed comparable exposure.",
        uncertain: true,
        ...extra,
      };
      const proposal = coachingProposalSchema.parse({
        id: "coach-" + identity(canonical(value)),
        ...value,
      });
      proposals.push(proposal);
      return proposal;
    };
    const hold = (reason: string) => make("hold", reason);
    const offerSubstitute = () => {
      const issue =
        entry.coachingContext ?? history.latest?.entry.coachingContext;
      const needsSwap =
        issue?.execution === "changed" ||
        issue?.skipReason === "equipment" ||
        (history.valid.length >= 3 &&
          history.valid.slice(-3).every((r) => floorMiss(r.entry)));
      if (!needsSwap || !target) return;
      const alternatives = exercises
        .filter(
          (x) =>
            x.id !== ex.id &&
            x.muscle === ex.muscle &&
            x.pattern === ex.pattern &&
            state.profile?.equipment.includes(x.equipment),
        )
        .filter((x) =>
          state.sessions.some(
            (s) =>
              s.exercises.some(
                (e) =>
                  e.exerciseId === x.id &&
                  e.sets.some((t) => t.done && t.effortReported === true),
              ) &&
              s.muscleFeedback?.some(
                (m) => m.muscle === x.muscle && m.pain === false,
              ),
          ),
        )
        .slice(0, 3)
        .map((x) => x.id);
      if (alternatives.length)
        make(
          "substitute",
          "Review a compatible previously tolerated alternative for the reported equipment/fit problem or repeated misses. No load equivalence or pain-relief guarantee.",
          {
            alternatives,
            rows: [],
            review:
              "Select an alternative explicitly and establish a new execution/load baseline.",
          },
        );
    };
    if (!settings.enabled) {
      hold(
        "Coaching is disabled. Your manual workout targets remain available.",
      );
      continue;
    }
    if (
      context.blocked ||
      support ||
      entry.coachingContext?.skipReason === "pain"
    ) {
      make(
        "recover",
        "Defer escalation and review the reported pain or incomplete recovery. No injury diagnosis or assumed pain-free substitute.",
      );
      if (
        target &&
        history.valid.length >= 2 &&
        history.valid.slice(-2).every((r) => floorMiss(r.entry)) &&
        target.sets > 1
      )
        make(
          "reduce-volume",
          "Two confirmed misses and a recovery flag support reviewing one fewer working set on this target, not unrelated muscles.",
          {
            afterTarget: { ...targetValue(target), sets: target.sets - 1 },
            rows: baseline.slice(0, -1),
            review:
              "Review recovery and performance after two comparable exposures; do not automatically restore or add sets.",
          },
        );
      continue;
    }
    if (
      session.phase !== "accumulation" ||
      (program && D.programPhase(program) !== "accumulation")
    ) {
      hold(
        "Establish an accumulation baseline after any recovery phase; recovery-oriented targets do not justify escalation.",
      );
      continue;
    }
    if (
      !entry.target ||
      !working(entry).length ||
      entry.target.rir >= 5 ||
      !target
    ) {
      hold(
        "A saved current working-set prescription is needed for auditable coaching.",
      );
      continue;
    }
    const expected = D.phaseTarget(target, program!, state.profile?.experience);
    if (
      expected.sets !== entry.plannedWorkingSets ||
      expected.min !== entry.target.min ||
      expected.max !== entry.target.max ||
      expected.rest !== entry.target.rest ||
      expected.rir !== entry.target.rir
    ) {
      hold(
        "The saved program prescription changed. Reopen the workout preview or finish the existing draft before using a new baseline.",
      );
      continue;
    }
    if (ex.muscle === "Neck") {
      hold(
        "Neck loading remains a manual decision; this coach does not generate neck-load progression.",
      );
      continue;
    }
    if (
      (entry.technique && entry.technique !== "straight") ||
      entry.tempo ||
      entry.superset ||
      entry.sets.some((t) => t.done && t.kind === "drop")
    ) {
      hold(
        "Review the advanced sequence manually; its bouts are not equivalent to straight working sets.",
      );
      continue;
    }
    if (!latest || !history.latestEligible) {
      hold(
        "Collect a fully confirmed comparable exposure: planned dose, actual effort, execution and rest. Imported unknown effort stays unknown.",
      );
      offerSubstitute();
      continue;
    }
    if (now - recoveryTime(latest.session) > 21 * DAY) {
      hold(
        "The last eligible exposure is over 21 days old. Re-establish a baseline rather than assuming retained performance.",
      );
      continue;
    }
    if (working(entry).some((s) => s.done)) {
      hold(
        "Work has started for this exercise. Keep logged observations intact and review next-session changes after finishing.",
      );
      continue;
    }
    if (!context.positive) {
      hold(
        "Confirm fresh current readiness for this muscle before escalating; missing reports are unknown.",
      );
      continue;
    }
    const already = (state.coachingEvents ?? []).find(
      (e) =>
        e.kind === "decision" &&
        ["accept", "edit"].includes(e.choice ?? "") &&
        e.proposal?.sessionId === session.id &&
        e.proposal.entryId === entry.id &&
        canonical(e.proposal.sourceIds) === canonical(sourceIds),
    );
    if (already) {
      hold(
        "Targets were already reviewed for this workout. Log the outcome before asking for another progression from the same evidence.",
      );
      continue;
    }
    const prior = history.valid.at(-2);
    const sameLoads =
      prior &&
      working(prior.entry).every((s, i) => s.weight === latestSets[i]?.weight);
    const declining = !!(
      prior &&
      sameLoads &&
      latestSets.reduce((n, s) => n + s.reps, 0) <
        working(prior.entry).reduce((n, s) => n + s.reps, 0)
    );
    const lower = optionsForLoads(entry, ex);
    if (lower.length && baseline.some((r) => !lower.includes(r.weight))) {
      hold(
        "The selected equipment inventory excludes a baseline row. Review the available loads before changing targets.",
      );
      continue;
    }
    const failedTrial = (state.coachingEvents ?? [])
      .filter(
        (e) =>
          e.kind === "outcome" &&
          e.outcome === "too-demanding" &&
          validOutcome(state, e),
      )
      .filter((e) =>
        (state.coachingEvents ?? []).some(
          (d) =>
            d.kind === "decision" &&
            d.choice === "accept" &&
            d.proposalId === e.proposalId &&
            d.proposal?.action === "trial" &&
            d.proposal.exerciseId === ex.id &&
            d.proposal.workoutId === session.workoutId &&
            d.proposal.targetId === entry.sourceTargetId &&
            d.proposal.contextKey === coachContextKey(session, entry, ex),
        ),
      )
      .sort((a, b) => b.at - a.at)[0];
    if (
      failedTrial &&
      history.valid.filter(
        (r) => recoveryTime(r.session) > failedTrial.at && ceiling(r.entry),
      ).length < 2
    ) {
      hold(
        "A previous trial was too demanding. Collect two fresh confirmed ceiling exposures before another suggested load trial.",
      );
      continue;
    }
    if (
      history.valid.length >= 2 &&
      history.valid.slice(-2).every((r) => floorMiss(r.entry))
    ) {
      const rows = baseline.map((r, i) => ({
        ...r,
        weight:
          [...lower]
            .reverse()
            .find(
              (w) =>
                w > 0 &&
                w < r.weight &&
                w >= r.weight - Math.min(5, r.weight * 0.1),
            ) ??
          history.valid
            .slice(0, -2)
            .map((v) => working(v.entry)[i])
            .filter(
              (t) =>
                t &&
                t.weight > 0 &&
                t.weight < r.weight &&
                t.reps >= entry.target!.min &&
                t.rir >= entry.target!.rir,
            )
            .sort((a, b) => b.weight - a.weight)[0]?.weight ??
          r.weight,
        reps: entry.target!.min,
      }));
      if (
        rows.some((r, i) => r.weight < baseline[i].weight) &&
        !["machine-label", "added-bodyweight"].includes(ex.convention)
      )
        make(
          "reduce-load",
          "Two comparable confirmed misses support reviewing the next selected lower load. Re-establish target reps and reserve; do not call one off-day regression.",
          { rows },
        );
      else
        hold(
          "Two confirmed misses need a deliberate load/rest/execution review; no supported numeric reduction is available.",
        );
    } else if (
      declining ||
      latestSets.some(
        (s) =>
          s.rir < entry.target!.rir ||
          s.rir < (state.profile?.experience === "New" ? 2 : 1),
      )
    ) {
      hold(
        "Recent performance declined or intended reserve was missed. Repeat and review context before escalating.",
      );
    } else if (ceiling(latest.entry)) {
      const normal = prior && sameLoads && ceiling(prior.entry);
      const canTrial =
        settings.earlyTrials &&
        latestSets.every((s) => s.rir >= entry.target!.rir + 1) &&
        state.profile?.experience !== "New";
      if (["machine-label", "added-bodyweight"].includes(ex.convention)) {
        const transitions = observedTransitions(history.valid);
        const first = baseline[0],
          next = lower.find((w) => w > first.weight);
        const observed =
          next !== undefined &&
          transitions.filter((t) => t.from === first.weight && t.to === next)
            .length >= 3;
        if (
          ex.convention === "machine-label" &&
          observed &&
          (normal || canTrial)
        ) {
          const deltas = transitions
            .filter((t) => t.from === first.weight && t.to === next)
            .map((t) => t.repChange)
            .sort((a, b) => a - b);
          make(
            "trial",
            "Three observed transitions on this exact machine setup support an exploratory first-set step. Raw labels are not kilograms or a predicted maximum.",
            {
              evidence: [
                ...evidence,
                `${deltas.length} observed neighboring-label transitions: median rep change ${deltas[Math.floor(deltas.length / 2)]}, observed range ${deltas[0]} to ${deltas.at(-1)}; this is not a confidence interval.`,
              ].slice(-24),
              rows: baseline.map((r, i) =>
                i === 0 ? { ...r, weight: next!, reps: entry.target!.min } : r,
              ),
              review:
                "Stop at intended reserve. If the lower rep bound is unavailable, use prior back-off loads; confirm the outcome.",
            },
          );
        } else
          hold(
            "Rep ceiling reached. Machine labels and added-bodyweight transitions need manual load selection; no inferred resistance conversion.",
          );
      } else {
        const first = baseline[0],
          cap = normal
            ? Math.min(2.5, first.weight * 0.025)
            : Math.min(5, first.weight * 0.1);
        const next =
          first.weight > 0 && lower.includes(first.weight)
            ? lower.find(
                (w) => w > first.weight && w <= first.weight + cap + 1e-9,
              )
            : undefined;
        if (next !== undefined && (normal || canTrial)) {
          const rows = baseline.map((r, i) =>
            normal
              ? {
                  ...r,
                  weight:
                    lower.find(
                      (w) =>
                        w > r.weight &&
                        w <= r.weight + Math.min(2.5, r.weight * 0.025) + 1e-9,
                    ) ?? r.weight,
                  reps: entry.target!.min,
                }
              : i === 0
                ? { ...r, weight: next, reps: entry.target!.min }
                : r,
          );
          make(
            normal ? "load" : "trial",
            normal
              ? "Two confirmed ceiling exposures support the smallest selected bounded load increase."
              : "One confirmed ceiling exposure with extra reported reserve supports a first-set trial, not an assured prediction. Retain prior back-off rows.",
            {
              rows,
              uncertain: !normal,
              review:
                "Preserve the intended reserve. If the trial cannot meet the lower rep bound, return to prior back-off loads and report the result.",
            },
          );
        } else
          hold(
            "Rep ceiling reached, but no eligible selected load step fits. Continue the baseline or deliberately review the rep range; never invent increments.",
          );
      }
    } else if (latestSets.every((s) => s.reps >= entry.target!.min)) {
      const candidates = baseline.filter((r) => r.reps < entry.target!.max);
      const smallest = Math.min(...candidates.map((r) => r.reps));
      const chosen = candidates
        .filter((r) => r.reps === smallest)
        .at(-1)?.ordinal;
      make(
        "reps",
        "Try one additional total rep on one eligible row. Retain the other loads and rows, and stop at intended reserve.",
        {
          rows: baseline.map((r) => ({
            ...r,
            reps: Math.min(
              entry.target!.max,
              r.reps + (r.ordinal === chosen ? 1 : 0),
            ),
          })),
          uncertain: history.valid.length < 3,
        },
      );
    } else
      hold(
        "An isolated below-range session is a reason to repeat and review context, not automatically add work.",
      );

    const primary = proposals.at(-1)!;
    if (
      primary.action === "hold" &&
      !declining &&
      ceiling(latest.entry) &&
      target.max < 20 &&
      program &&
      plannedMinutes(program) + target.sets * 0.1 <= settings.minutes
    ) {
      const max = Math.min(20, target.max + 2),
        rows = baseline.map((r, i) => ({
          ...r,
          reps: Math.min(max, r.reps + (i === baseline.length - 1 ? 1 : 0)),
        }));
      make(
        "rep-range",
        "A practical load step is unavailable. Review a small rep-range extension instead of inventing increments or forcing a large jump.",
        {
          afterTarget: { ...targetValue(target), max },
          rows,
          review:
            "Confirm the future rep range explicitly. Establish performance under that new prescription before further escalation.",
        },
      );
    }
    const span = history.valid.length
      ? recoveryTime(latest.session) - recoveryTime(history.valid[0].session)
      : 0;
    const recoveryReports = history.valid.filter(
      ({ session: s }) =>
        s.readiness?.pain === false &&
        s.readiness.context === "usual" &&
        (s.readiness.fatigue ?? 5) <= 2 &&
        s.readiness.muscles.some(
          (m) =>
            m.muscle === ex.muscle &&
            m.recovered === "yes" &&
            m.pain === false &&
            m.soreness !== null &&
            m.soreness <= 2,
        ),
    ).length;
    const volumeRecentlyChanged = (state.coachingEvents ?? []).some(
      (e) =>
        e.at >= now - 7 * DAY &&
        e.kind === "decision" &&
        ["accept", "edit"].includes(e.choice ?? "") &&
        e.proposal?.action === "add-volume",
    );
    const weeklySets =
      program?.workouts.reduce(
        (n, w) => n + w.exercises.reduce((n, t) => n + t.sets, 0),
        0,
      ) ?? 0;
    if (
      target &&
      history.valid.length >= 4 &&
      lower.length > 0 &&
      span >= 14 * DAY &&
      ["maintenance", "gain"].includes(settings.diet) &&
      weeklySets >= 10 &&
      !volumeRecentlyChanged &&
      settings.priorities.includes(ex.muscle) &&
      recoveryReports >= 2 &&
      history.valid
        .slice(-3)
        .every((r) =>
          working(r.entry).every(
            (t) =>
              t.reps >= r.entry.target!.min && t.rir >= r.entry.target!.rir + 1,
          ),
        ) &&
      primary.action === "hold" &&
      !declining &&
      target.sets < 10 &&
      program &&
      plannedMinutes(program) + (target.max * 3 + target.rest) / 60 <=
        settings.minutes
    ) {
      const rows = [
        ...baseline,
        { ...baseline.at(-1)!, ordinal: baseline.length, reps: target.min },
      ];
      make(
        "add-volume",
        "A priority muscle has repeated confirmed under-challenge and favorable follow-up reports. Review one additional weekly set as an experiment, not measured growth or a volume-landmark diagnosis.",
        {
          afterTarget: { ...targetValue(target), sets: target.sets + 1 },
          rows,
          review:
            "Review after two comparable exposures. Do not add more sets automatically; assess the whole bundle if other changes were accepted.",
        },
      );
    }
    offerSubstitute();
  }
  if (program && settings.enabled && session.phase === "accumulation") {
    const trained = new Set<string>(),
      declining = new Set<string>();
    for (const w of program.workouts) {
      const candidate = D.startSession(
        w.name,
        D.prepareWorkout(w, program, exercises, [], state.profile?.experience),
        program,
        w,
      );
      for (const e of candidate.exercises) {
        const ex = exercises.find((x) => x.id === e.exerciseId);
        if (!ex) continue;
        const h = evidenceFor(state, candidate, e, ex, now);
        if (h.valid.some((r) => now - recoveryTime(r.session) <= 21 * DAY))
          trained.add(ex.muscle);
        if (
          h.valid.length >= 2 &&
          h.valid.slice(-2).every((r) => floorMiss(r.entry)) &&
          now - recoveryTime(h.valid.at(-1)!.session) <= 21 * DAY
        )
          declining.add(ex.muscle);
      }
    }
    const systemic =
      readinessFresh(session.readiness, now) &&
      session.readiness?.fatigue !== null &&
      session.readiness?.fatigue !== undefined &&
      session.readiness.fatigue >= 4;
    if (systemic && declining.size >= 2 && declining.size > trained.size / 2) {
      const base = proposals.find((p) => p.programId === program.id);
      if (base)
        proposals.push(
          coachingProposalSchema.parse({
            ...base,
            id: base.id + "-deload",
            action: "deload",
            phase: "deload",
            rows: [],
            reason:
              "Repeated declines across multiple trained muscles plus reported systemic fatigue support a whole-program deload review, not a diagnosis of recovery capacity.",
            review:
              "Review after one planned week. Restoring accumulation requires explicit review and acceptance.",
          }),
        );
    }
  }
  return proposals;
}
function optionsForLoads(entry: D.Entry, ex: D.Exercise) {
  return (
    entry.setup?.availableLoads
      .filter(Number.isFinite)
      .slice()
      .sort((a, b) => a - b) ?? []
  );
}
function observedTransitions(rows: Exposure[]) {
  return rows.slice(1).flatMap((r, i) => {
    const a = working(rows[i].entry)[0],
      b = working(r.entry)[0];
    return a &&
      b &&
      b.weight > a.weight &&
      b.reps >= r.entry.target!.min &&
      b.rir >= r.entry.target!.rir
      ? [{ from: a.weight, to: b.weight, repChange: b.reps - a.reps }]
      : [];
  });
}
export type CoachingChoice = {
  proposal: CoachingProposal;
  choice: "accept" | "edit" | "decline" | "defer";
  scope: "session" | "program";
  rows?: CoachingProposal["rows"];
  alternative?: string;
};
export function applyCoaching(
  state: D.State,
  session: D.Session,
  choices: CoachingChoice[],
  now = Date.now(),
): D.State {
  state = isDraft(state) ? currentDraft(state) : state;
  if (state.draft && state.draft.id !== session.id)
    throw Error(
      "Another workout is active. Review its targets before accepting changes.",
    );
  const current = state.draft ?? session;
  const fresh = evaluateCoaching(state, current, now);
  if (
    choices.filter(
      (c) =>
        ["accept", "edit"].includes(c.choice) &&
        c.proposal.action === "add-volume",
    ).length > 1
  )
    throw Error("Review at most one added weekly set per experiment.");
  if (
    choices.some(
      (c) =>
        c.proposal.action === "deload" && ["accept", "edit"].includes(c.choice),
    ) &&
    choices.some(
      (c) =>
        ["add-volume", "reduce-volume"].includes(c.proposal.action) &&
        ["accept", "edit"].includes(c.choice),
    )
  )
    throw Error(
      "A whole-program deload already changes dose; review it separately from local set-count edits.",
    );
  const ids = new Set<string>();
  for (const c of choices) {
    if (ids.has(c.proposal.id)) throw Error("Duplicate coaching choice");
    ids.add(c.proposal.id);
    const p = fresh.find((p) => p.id === c.proposal.id);
    if (!p || canonical(p) !== canonical(c.proposal))
      throw Error(
        "Coaching evidence changed. Refresh the preview before accepting.",
      );
    if (
      (state.coachingEvents ?? []).some(
        (e) =>
          e.kind === "decision" &&
          e.proposalId === p.id &&
          ["accept", "edit"].includes(e.choice ?? ""),
      )
    )
      throw Error("This proposal was already applied.");
    if (
      ["accept", "edit"].includes(c.choice) &&
      ["hold", "recover"].includes(p.action)
    )
      throw Error("This is a review note, not an applicable target change.");
    if (
      [
        "rep-range",
        "reduce-volume",
        "add-volume",
        "substitute",
        "deload",
      ].includes(p.action) &&
      c.scope !== "program"
    )
      throw Error("This change requires explicit future-program scope.");
  }
  const plain = isDraft(state) ? currentDraft(state) : state;
  const next: D.State = {
    ...plain,
    programs: structuredClone(plain.programs),
    coachingEvents: [...(plain.coachingEvents ?? [])],
    decisions: [...plain.decisions],
  };
  const draft = structuredClone(
    isDraft(current) ? currentDraft(current) : current,
  );
  const bundle = "coach-" + D.uid();
  const changedEntries = new Set<string>();
  for (const c of choices) {
    const p = c.proposal;
    if (["accept", "edit"].includes(c.choice)) {
      if (changedEntries.has(p.entryId) && p.action !== "deload")
        throw Error(
          "Two proposals conflict on the same target. Choose one reviewed change per exercise.",
        );
      changedEntries.add(p.entryId);
      const entry = draft.exercises.find((e) => e.id === p.entryId)!;
      if (c.scope === "session") {
        if (working(entry).some((t) => t.done))
          throw Error("Logged sets cannot be overwritten.");
        const rows = c.choice === "edit" ? (c.rows ?? p.rows) : p.rows;
        if (rows.length !== working(entry).length)
          throw Error("Set-row count changed. Refresh the preview.");
        let i = 0;
        entry.sets = entry.sets.map((t) => {
          if (t.kind !== "working") return t;
          const r = rows[i++];
          if (r.ordinal !== i - 1 || r.rir !== entry.target!.rir)
            throw Error("Rows must preserve order and intended reserve.");
          return D.setSchema.parse({
            ...t,
            weight: r.weight,
            reps: r.reps,
            effortReported: false,
            prescription: {
              ...t.prescription,
              min: entry.target!.min,
              max: entry.target!.max,
              rest: entry.target!.rest,
              ...r,
              proposalId: p.id,
            },
          });
        });
      } else {
        const program = next.programs.find((v) => v.id === p.programId),
          workout = program?.workouts.find((w) => w.id === p.workoutId),
          target = workout?.exercises.find((t) => t.id === p.targetId);
        if (
          !program ||
          !target ||
          canonical(targetValue(target)) !== canonical(p.beforeTarget)
        )
          throw Error("Future target changed. Refresh the proposal.");
        if (p.action === "deload") program.phase = "deload";
        else if (p.action === "substitute") {
          if (!c.alternative || !p.alternatives?.includes(c.alternative))
            throw Error("Select a reviewed substitute.");
          target.exerciseId = c.alternative;
          target.setup = undefined;
          target.startingLoad = undefined;
          target.nextRows = undefined;
          target.coachingProposalId = undefined;
        } else {
          if (p.afterTarget) Object.assign(target, p.afterTarget);
          const rows = c.choice === "edit" ? (c.rows ?? p.rows) : p.rows;
          if (rows.length !== target.sets)
            throw Error("Future set count differs from reviewed rows.");
          target.nextRows = rows;
          target.coachingProposalId = p.id;
        }
      }
    }
    const recorded = c.choice === "edit" ? { ...p, rows: c.rows ?? p.rows } : p;
    (next.coachingEvents ??= []).push(
      coachingEventSchema.parse({
        id: "coach-" + D.uid(),
        at: now,
        kind: "decision",
        proposalId: p.id,
        proposal: recorded,
        choice: c.choice,
        scope: c.scope,
        note: `Bundle ${bundle}. Coordinated changes cannot establish each component's causal effect.`,
      }),
    );
    next.decisions = [
      ...next.decisions.slice(-999),
      { key: p.id, choice: c.choice === "edit" ? "accept" : c.choice, at: now },
    ];
    if (c.scope === "session" && ["accept", "edit"].includes(c.choice))
      draft.coachingAssignments = [
        ...(draft.coachingAssignments ?? []).filter(
          (a) => a.entryId !== p.entryId,
        ),
        { entryId: p.entryId, proposalId: p.id },
      ];
  }
  if (
    choices.some(
      (c) => c.scope === "session" && ["accept", "edit"].includes(c.choice),
    )
  )
    next.draft = draft;
  return D.historyStateSchema.parse(next);
}
export function classifyCoachingOutcomes(
  state: D.State,
  session: D.Session,
  now = Date.now(),
): CoachingEvent[] {
  const result: CoachingEvent[] = [];
  const ids = [
    ...new Set([
      ...session.exercises.flatMap((e) =>
        e.sets.map((t) => t.prescription?.proposalId).filter(Boolean),
      ),
      ...(session.coachingAssignments ?? []).map((a) => a.proposalId),
    ]),
  ];
  for (const id of ids) {
    if (
      (state.coachingEvents ?? []).some(
        (e) =>
          e.kind === "outcome" &&
          e.proposalId === id &&
          e.sessionId === session.id &&
          e.sessionFingerprint === outcomeFingerprint(session, id!),
      )
    )
      continue;
    const decision = (state.coachingEvents ?? []).find(
      (e) =>
        e.proposalId === id &&
        e.kind === "decision" &&
        ["accept", "edit"].includes(e.choice ?? ""),
    );
    if (!decision?.proposal) continue;
    const entries = session.exercises.filter((e) =>
      e.sets.some((t) => t.prescription?.proposalId === id),
    );
    const sets = entries.flatMap((e) =>
      working(e).filter((t) => t.prescription?.proposalId === id),
    );
    let outcome: CoachingEvent["outcome"] = "unknown";
    if (
      entries.some(
        (e) => e.plannedWorkingSets !== working(e).filter((t) => t.done).length,
      ) ||
      sets.length !== decision.proposal.rows.length
    )
      outcome = "changed";
    else if (
      sets.some((t) => !t.done || t.effortReported !== true) ||
      entries.some(
        (e) =>
          !e.coachingContext ||
          e.coachingContext.execution !== "consistent" ||
          e.coachingContext.rest !== "usual",
      )
    )
      outcome = "unknown";
    else if (sets.some((t) => t.weight !== t.prescription!.weight))
      outcome = "changed";
    else if (
      sets.some(
        (t, i) =>
          canonical({
            ordinal: i,
            weight: t.prescription!.weight,
            reps: t.prescription!.reps,
            rir: t.prescription!.rir,
          }) !== canonical(decision.proposal!.rows[i]),
      )
    )
      outcome = "changed";
    else if (
      sets.some(
        (t) => t.reps < t.prescription!.reps || t.rir < t.prescription!.rir - 1,
      )
    )
      outcome = "too-demanding";
    else if (
      sets.every(
        (t) =>
          t.reps >= t.prescription!.reps && t.rir > t.prescription!.rir + 1,
      )
    )
      outcome = "easier";
    else if (
      sets.every(
        (t) =>
          t.reps >= t.prescription!.reps &&
          Math.abs(t.rir - t.prescription!.rir) <= 1,
      )
    )
      outcome = "met";
    result.push(
      coachingEventSchema.parse({
        id: "coach-" + D.uid(),
        at: now,
        kind: "outcome",
        proposalId: id!,
        sessionId: session.id,
        outcome,
        sessionFingerprint: outcomeFingerprint(session, id!),
        painReported:
          session.feedback.pain === true ||
          session.muscleFeedback?.some((m) => m.pain === true) ||
          false,
        note: "Reported-effort target attainment, not measured growth or proof of safety. Bundled changes are not individually attributable.",
      }),
    );
  }
  return result;
}
function outcomeFingerprint(session: D.Session, proposalId: string) {
  return canonical({
    feedback: session.feedback,
    muscleFeedback: session.muscleFeedback,
    bodyweight: session.bodyweight,
    assignments: session.coachingAssignments,
    entries: session.exercises
      .filter((e) =>
        e.sets.some((t) => t.prescription?.proposalId === proposalId),
      )
      .map((e) => ({
        id: e.id,
        target: e.target,
        planned: e.plannedWorkingSets,
        context: e.coachingContext,
        sets: e.sets.map((t) => ({
          id: t.id,
          weight: t.weight,
          reps: t.reps,
          rir: t.rir,
          done: t.done,
          effortReported: t.effortReported,
          prescription: t.prescription,
        })),
      })),
  });
}
export function validOutcome(state: D.State, event: CoachingEvent) {
  const session = state.sessions.find((s) => s.id === event.sessionId);
  return (
    event.kind === "outcome" &&
    !!session &&
    event.sessionFingerprint === outcomeFingerprint(session, event.proposalId)
  );
}
export function asRecommendation(
  p: CoachingProposal | undefined,
): D.Recommendation {
  if (!p)
    return {
      action: "hold",
      reason: "Save a working-set prescription to review coaching.",
    };
  return {
    action:
      p.action === "recover"
        ? "recover"
        : ["load", "trial"].includes(p.action)
          ? "load"
          : p.action === "reps"
            ? "reps"
            : "hold",
    reason: p.reason,
    evidence: p.evidence,
    assumptions: [
      "Versioned NEOFORM software policy, not measured growth or a recovery diagnosis.",
      p.review,
    ],
    policyVersion: p.version,
    ...(p.rows.length && ["load", "reps", "trial"].includes(p.action)
      ? { setTargets: p.rows.map((r) => ({ weight: r.weight, reps: r.reps })) }
      : {}),
  };
}
