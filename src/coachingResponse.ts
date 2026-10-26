import * as D from "./domain";
import {
  canonical,
  coachContextKey,
  eligible,
  outcomeFingerprint,
  precedingDoseIssue,
} from "./coachingEvidence";
import { recoveryTime, readinessFresh } from "./readiness";
import type { CoachingEvent, CoachingProposal } from "./coachingTypes";

const DAY = 86400000;
export type ChangeReview = {
  decision: CoachingEvent;
  status: "keep" | "reverse" | "observe" | "reassess";
  reason: string;
  followups: { sessionId: string; date: string; result: "met" | "miss" }[];
  excluded: string[];
  edited: boolean;
  bundled: boolean;
  blocked: boolean;
  contextMatches: boolean;
  restore?: {
    action: CoachingProposal["action"];
    rows: CoachingProposal["rows"];
    target?: CoachingProposal["afterTarget"];
  };
};

// Context v1 includes phase, setup/convention/method, dose and the preceding
// exercise sequence. Keep the original snapshot, changing only reviewed dose.
function expectedContext(p: CoachingProposal) {
  try {
    const key = JSON.parse(p.contextKey ?? "null");
    if (!Array.isArray(key) || key.length !== 8 || !key[5]) return null;
    if (p.afterTarget) {
      key[5] = {
        ...key[5],
        min: p.afterTarget.min,
        max: p.afterTarget.max,
        rest: p.afterTarget.rest,
      };
      key[6] = p.afterTarget.sets;
    }
    return canonical(key);
  } catch {
    return null;
  }
}

export function reviewAcceptedChanges(
  state: D.State,
  now = Date.now(),
  current?: D.Session,
): ChangeReview[] {
  const events = state.coachingEvents ?? [],
    exercises = [...D.catalog, ...state.customExercises];
  const savedSessions = new Map(state.sessions.map((s) => [s.id, s]));
  const outcomes = new Map<string, CoachingEvent>();
  for (const e of events) {
    if (e.kind !== "outcome" || e.at > now) continue;
    const key = canonical([e.proposalId, e.sessionId]),
      previous = outcomes.get(key);
    if (!previous || e.at >= previous.at) outcomes.set(key, e);
  }
  const recoveryCache = new Map<
    D.Exercise["muscle"],
    ReturnType<typeof D.recoveryStatus>
  >();
  const previewCache = new Map<string, D.Session>();
  const decisions = [
    ...new Map(
      events
        .filter(
          (e) =>
            e.kind === "decision" &&
            e.proposal &&
            ["accept", "edit"].includes(e.choice ?? "") &&
            e.at <= now,
        )
        .map((e) => [e.proposalId, e]),
    ).values(),
  ];
  const relevant = current
    ? decisions.filter(
        (d) =>
          d.proposal?.programId === current.programId &&
          d.proposal?.workoutId === current.workoutId,
      )
    : decisions;
  return relevant
    .map((decision) => {
      const p = decision.proposal!,
        ex = exercises.find((x) => x.id === p.exerciseId);
      const program = state.programs.find((x) => x.id === p.programId),
        workout = program?.workouts.find((x) => x.id === p.workoutId),
        target = workout?.exercises.find((x) => x.id === p.targetId);
      const expected = expectedContext(p),
        followups: ChangeReview["followups"] = [],
        excluded: string[] = [];
      let originalBodyweight: D.Session["bodyweight"];
      try {
        originalBodyweight = JSON.parse(p.fingerprint).bodyweight;
      } catch {
        /* Unknown legacy context. */
      }
      let boundary = !ex || !expected,
        latestKnown = false;
      const sessions = state.sessions
        .filter(
          (s) =>
            s.programId === p.programId &&
            s.workoutId === p.workoutId &&
            (s.id === p.sessionId || s.startedAt >= decision.at) &&
            s.startedAt <= now &&
            recoveryTime(s) <= now,
        )
        .sort(
          (a, b) =>
            recoveryTime(a) - recoveryTime(b) || a.id.localeCompare(b.id),
        );
      for (const s of sessions) {
        const entries = s.exercises.filter(
          (e) =>
            e.sourceTargetId === p.targetId ||
            (decision.scope === "session" &&
              s.id === p.sessionId &&
              e.id === p.entryId),
        );
        if (!entries.length) continue;
        const entry = entries[0],
          rows = entry.sets.filter((t) => t.kind === "working");
        const assigned =
          rows.some((t) => t.prescription?.proposalId === p.id) ||
          s.coachingAssignments?.some((a) => a.proposalId === p.id);
        // Today's original plan is not a follow-up to a future-only decision.
        if (!assigned && s.id === p.sessionId && decision.scope === "program")
          continue;
        if (
          entries.length !== 1 ||
          !ex ||
          coachContextKey(s, entry, ex) !== expected ||
          entry.exerciseId !== p.exerciseId
        ) {
          boundary = true;
          excluded.push(
            `${s.date}: phase, dose, setup, method or exercise order changed.`,
          );
          continue;
        }
        if (!assigned) {
          latestKnown = false;
          excluded.push(`${s.date}: accepted targets were not assigned.`);
          continue;
        }
        const outcome = outcomes.get(canonical([p.id, s.id]));
        const reason =
          eligible(entry, s.startedAt) ||
          precedingDoseIssue(s, entry, now) ||
          ((entry.coachingContext?.recordedAt ?? 0) > now
            ? "future confirmation"
            : null) ||
          (ex?.convention === "added-bodyweight" &&
          (!originalBodyweight ||
            !s.bodyweight ||
            s.bodyweight.at > s.startedAt ||
            s.startedAt - s.bodyweight.at > 7 * DAY ||
            Math.abs(s.bodyweight.kg - originalBodyweight.kg) /
              originalBodyweight.kg >
              0.01)
            ? "bodyweight reference unknown or changed"
            : null);
        latestKnown = false;
        if (
          reason ||
          !outcome ||
          outcome.at < s.startedAt ||
          outcome.sessionFingerprint !== outcomeFingerprint(s, p.id) ||
          rows.length !== p.rows.length ||
          rows.some((t, i) => {
            const r = p.rows[i],
              v = t.prescription;
            return (
              !v ||
              v.proposalId !== p.id ||
              canonical({
                ordinal: v.ordinal,
                weight: v.weight,
                reps: v.reps,
                rir: v.rir,
              }) !== canonical(r)
            );
          })
        ) {
          excluded.push(
            `${s.date}: ${reason ?? "accepted targets or saved outcome no longer match"}.`,
          );
          continue;
        }
        latestKnown = true;
        followups.push({
          sessionId: s.id,
          date: s.date,
          result: rows.some(
            (t) => t.reps < t.prescription!.reps || t.rir < t.prescription!.rir,
          )
            ? "miss"
            : "met",
        });
      }
      let currentSession = current,
        currentEntry = current?.exercises.find(
          (e) => e.sourceTargetId === p.targetId,
        );
      if (!current && program && workout) {
        const cacheKey = canonical([program.id, workout.id]);
        currentSession =
          previewCache.get(cacheKey) ??
          D.startSession(
            workout.name,
            D.prepareWorkout(
              workout,
              program,
              exercises,
              state.sessions,
              state.profile?.experience,
            ),
            program,
            workout,
          );
        previewCache.set(cacheKey, currentSession);
        currentEntry = currentSession.exercises.find(
          (e) => e.sourceTargetId === p.targetId,
        );
      }
      const contextMatches = !!(
        ex &&
        currentSession &&
        currentEntry &&
        coachContextKey(currentSession, currentEntry, ex) === expected
      );
      let expectedTarget: D.Target | undefined;
      try {
        const original = D.targetSchema.parse(
          JSON.parse(p.fingerprint).program?.target,
        );
        expectedTarget = D.targetSchema.parse({
          ...original,
          ...p.afterTarget,
          nextRows: p.rows,
          coachingProposalId: p.id,
        });
      } catch {
        /* An unreadable legacy basis is a review, never permission to restore. */
      }
      const changed =
        decision.scope === "program" &&
        (!target ||
          !expectedTarget ||
          canonical(target) !== canonical(expectedTarget) ||
          !contextMatches ||
          program?.archived);
      const recovery = ex
        ? [ex.muscle, ...ex.secondary].map((m) => {
            const cached = recoveryCache.get(m);
            if (cached) return cached;
            const value = D.recoveryStatus(
              m,
              state.sessions,
              exercises,
              now,
              current?.readiness ?? state.draft?.readiness,
            );
            recoveryCache.set(m, value);
            return value;
          })
        : [];
      const blocked = recovery.some((r) => r.blocked);
      const recent = followups.slice(-2),
        last = followups.at(-1),
        lastSession = last && savedSessions.get(last.sessionId);
      let status: ChangeReview["status"] = "observe",
        reason = `${followups.length} confirmed follow-up${followups.length === 1 ? "" : "s"}. Repeat the accepted targets; two comparable follow-ups are needed before another increase.`;
      if (blocked) {
        status = "reassess";
        reason =
          "Reported pain or incomplete recovery needs review before continuing the experiment or increasing targets.";
      } else if (
        boundary ||
        changed ||
        (lastSession && now - recoveryTime(lastSession) > 21 * DAY)
      ) {
        status = "reassess";
        reason =
          "The plan, execution context or freshness changed. Re-establish a current baseline; earlier results do not justify restoring or escalating targets.";
      } else if (
        latestKnown &&
        recent.length === 2 &&
        recent.every((r) => r.result === "miss")
      ) {
        status = "reverse";
        reason =
          "Two confirmed follow-ups missed accepted reps or intended reserve. Review the prior targets and recovery before repeating this change.";
      } else if (
        latestKnown &&
        recent.length === 2 &&
        recent.every((r) => r.result === "met")
      ) {
        status = "keep";
        reason =
          "Two confirmed follow-ups met accepted targets at the intended reserve. Keep the change; this describes target attainment, not measured growth.";
      } else if (recent.length === 2 || (!latestKnown && followups.length)) {
        reason =
          "Follow-ups are mixed or the latest attempt is unconfirmed. Observe longer; missing effort, changed work and skipped sets are not successes.";
      }
      // A volume experiment also needs distinct, timely recovery observations
      // AFTER each assessed exposure; same-day finish feeling is insufficient.
      if (
        status === "keep" &&
        ["add-volume", "reduce-volume"].includes(p.action)
      ) {
        const used = new Set<string>();
        const reports = [
          ...state.sessions.map((s) => ({
            readiness: s.readiness,
            at: s.startedAt,
          })),
          ...(current ? [{ readiness: current.readiness, at: now }] : []),
        ];
        const recovered = recent.every((r) => {
          const at = recoveryTime(savedSessions.get(r.sessionId)!);
          const report = reports.find(({ readiness: v, at: check }) => {
            const m = v?.muscles.find((m) => m.muscle === ex?.muscle),
              key = `${v?.recordedAt}:${m?.recordedAt ?? v?.recordedAt}`;
            return (
              v &&
              m &&
              check <= now &&
              readinessFresh(v, check) &&
              readinessFresh(
                { recordedAt: m.recordedAt ?? v.recordedAt },
                check,
              ) &&
              Math.min(v.recordedAt, m.recordedAt ?? v.recordedAt) > at &&
              v.recordedAt - at <= 7 * DAY &&
              !used.has(key) &&
              v.context === "usual" &&
              v.pain === false &&
              v.fatigue != null &&
              v.fatigue <= 2 &&
              m.recovered === "yes" &&
              m.pain === false &&
              m.soreness != null &&
              m.soreness <= 2
            );
          });
          if (report?.readiness) {
            const m = report.readiness.muscles.find(
              (m) => m.muscle === ex?.muscle,
            )!;
            used.add(
              `${report.readiness.recordedAt}:${m.recordedAt ?? report.readiness.recordedAt}`,
            );
          }
          return !!report;
        });
        if (!recovered) {
          status = "observe";
          reason =
            "Performance targets were met. Gather distinct timely recovery follow-ups after both exposures before keeping this volume experiment or considering more sets.";
        }
      }
      const bundle = decision.note?.match(/^Bundle ([^.]+)\./)?.[1];
      const review: ChangeReview = {
        decision,
        status,
        reason,
        followups,
        excluded: excluded.slice(-16),
        edited: decision.choice === "edit",
        bundled:
          !!bundle &&
          decisions.some(
            (d) =>
              d.proposalId !== p.id && d.note?.startsWith(`Bundle ${bundle}.`),
          ),
        blocked,
        contextMatches,
      };
      // Only a still-current, unedited isolated escalation can restore its exact
      // reviewed prior rows. Reductions never reverse into an increase on misses.
      if (
        status === "reverse" &&
        decision.scope === "program" &&
        !review.edited &&
        !review.bundled &&
        contextMatches &&
        target &&
        ["reps", "load", "trial", "add-volume"].includes(p.action) &&
        p.beforeRows.length &&
        p.beforeRows.every(
          (r) =>
            r.weight > 0 &&
            r.reps >= (p.beforeTarget?.min ?? 1) &&
            r.reps <= (p.beforeTarget?.max ?? 100),
        ) &&
        p.beforeRows.every(
          (r, i) =>
            r.weight <= (p.rows[i]?.weight ?? -1) &&
            r.reps <= (p.rows[i]?.reps ?? -1) &&
            r.rir === p.rows[i]?.rir,
        )
      ) {
        const lowerLoad = p.beforeRows.some(
          (r, i) => r.weight < p.rows[i].weight,
        );
        const inventory = target.setup?.availableLoads ?? [];
        if (
          !lowerLoad ||
          (ex &&
            !["machine-label", "added-bodyweight"].includes(ex.convention) &&
            inventory.length > 0 &&
            p.beforeRows.every((r) => inventory.includes(r.weight)))
        ) {
          review.restore = {
            action:
              p.action === "add-volume"
                ? "reduce-volume"
                : lowerLoad
                  ? "reduce-load"
                  : "reps",
            rows: p.beforeRows,
            ...(p.action === "add-volume" && p.beforeTarget
              ? { target: p.beforeTarget }
              : {}),
          };
        }
      }
      return review;
    })
    .sort(
      (a, b) =>
        b.decision.at - a.decision.at ||
        a.decision.id.localeCompare(b.decision.id),
    );
}
