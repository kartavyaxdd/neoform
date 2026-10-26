import * as D from "./domain";
import { recoveryTime, recoveryObservations } from "./readiness";
import { localDate, weekMonday } from "./workoutPresentation";
import { reviewProgram } from "./programReview";
import { occurrenceStatus } from "./workoutSchedule";
import { reviewAcceptedChanges } from "./coachingResponse";
type Muscle = D.Exercise["muscle"];
export type WeeklyLiftChange = {
  exerciseId: string;
  repDelta: number;
  name: string;
  date: string;
  previousDate: string;
};
const advancedVolumeBout = D.advancedVolumeBout;
const advancedEntry = (e: D.Entry) =>
  ["myoreps", "drop-set", "giant-set"].includes(e.technique ?? "") ||
  e.sets.some((t) => t.kind !== "warmup" && advancedVolumeBout(e, t));
export function weeklyObservationWindow(
  state: D.State,
  monday: string,
  now: number,
) {
  const start = new Date(monday + "T00:00:00"),
    end = new Date(start);
  end.setDate(end.getDate() + 7);
  const asOf = Math.min(now, end.getTime() - 1),
    today = localDate(new Date(now)),
    current = weekMonday(today) === monday,
    future = start.getTime() > now;
  const history = state.sessions
    .filter((s) => s.startedAt <= asOf && recoveryTime(s) <= asOf)
    .map((s) => ({
      ...s,
      readiness:
        s.readiness && s.readiness.recordedAt <= asOf
          ? {
              ...s.readiness,
              muscles: s.readiness.muscles.filter(
                (m) => (m.recordedAt ?? s.readiness!.recordedAt) <= asOf,
              ),
            }
          : undefined,
      muscleFeedback: s.muscleFeedback?.filter(
        (m) => (m.recordedAt ?? recoveryTime(s)) <= asOf,
      ),
    }));
  return { start, end, asOf, today, current, future, history };
}
export function weeklyMuscles(
  state: D.State,
  exercises: D.Exercise[],
  monday: string,
  changes: WeeklyLiftChange[],
  now = Date.now(),
  prepared?: ReturnType<typeof weeklyObservationWindow>,
) {
  const window = prepared ?? weeklyObservationWindow(state, monday, now);
  const { end, asOf, today, current, future, history } = window;
  const sessions = history.filter(
      (s) => s.date >= monday && s.date < localDate(end),
    ),
    index = new Map(exercises.map((x) => [x.id, x]));
  const rows = new Map<
    Muscle,
    {
      muscle: Muscle;
      assigned: number | null;
      knownAssigned: number;
      unknownAssignments: number;
      completed: number;
      indirect: number;
      qualified: number;
      indirectQualified: number;
      unknownEffort: number;
      advanced: number;
      indirectAdvanced: number;
      omitted: number;
      upcoming: number;
      unconfirmedContext: number;
      exposures: Set<string>;
    }
  >();
  function row(m: Muscle) {
    let r = rows.get(m);
    if (!r) {
      r = {
        muscle: m,
        assigned: 0,
        knownAssigned: 0,
        unknownAssignments: 0,
        completed: 0,
        indirect: 0,
        qualified: 0,
        indirectQualified: 0,
        unknownEffort: 0,
        advanced: 0,
        indirectAdvanced: 0,
        omitted: 0,
        upcoming: 0,
        unconfirmedContext: 0,
        exposures: new Set(),
      };
      rows.set(m, r);
    }
    return r;
  }
  for (const s of sessions) {
    const actual = new Map(s.exercises.map((e) => [e.id, e]));
    const assigned = new Map(s.exercises.map((e) => [e.id, e]));
    for (const e of s.shortPlan?.originalEntries ?? [])
      if (s.shortPlan!.keptEntryIds.includes(e.id) && !assigned.has(e.id))
        assigned.set(e.id, e);
    for (const e of assigned.values()) {
      const x = index.get(e.exerciseId);
      if (!x) continue;
      const r = row(x.muscle);
      if (!advancedEntry(e)) {
        if (e.plannedWorkingSets === undefined) r.unknownAssignments++;
        else r.knownAssigned += e.plannedWorkingSets;
      } else if (
        e.sets.some((t) => t.kind === "working" && !advancedVolumeBout(e, t))
      )
        r.unknownAssignments++;
      const completed =
        actual.get(e.id)?.sets.filter((t) => t.done && t.kind !== "warmup") ??
        [];
      for (const m of new Set([x.muscle, ...x.secondary])) {
        const r = row(m),
          primary = m === x.muscle;
        if (completed.length) r.exposures.add(s.id);
        for (const t of completed) {
          if (advancedVolumeBout(e, t)) {
            if (primary) r.advanced++;
            else r.indirectAdvanced++;
            continue;
          }
          if (primary) {
            r.completed++;
            if (t.effortReported !== true) r.unknownEffort++;
            if (
              e.coachingContext?.execution !== "consistent" ||
              e.coachingContext.rest !== "usual" ||
              e.coachingContext.recordedAt < s.startedAt ||
              e.coachingContext.recordedAt > asOf ||
              e.coachingContext.recordedAt > s.startedAt + 2 * 86400000
            )
              r.unconfirmedContext++;
          } else r.indirect++;
          if (t.effortReported === true && t.rir <= 4) {
            if (primary) r.qualified++;
            else r.indirectQualified++;
          }
        }
      }
    }
    for (const e of s.shortPlan?.originalEntries ?? [])
      if (!s.shortPlan!.keptEntryIds.includes(e.id)) {
        const x = index.get(e.exerciseId);
        if (x && !advancedEntry(e))
          row(x.muscle).omitted +=
            e.plannedWorkingSets ??
            e.sets.filter((t) => t.kind === "working").length;
      }
  }
  const calendar = {
    planned: 0,
    missed: 0,
    skipped: 0,
    logged: 0,
    active: 0,
    unavailable: 0,
    revised: 0,
  };
  for (const slot of state.schedule ?? []) {
    if (slot.createdAt > asOf) continue;
    if (!current && !future && slot.updatedAt > asOf) {
      if (slot.originalDate >= monday && slot.originalDate < localDate(end))
        calendar.revised++;
      continue;
    }
    if (
      slot.createdAt > asOf ||
      slot.date < monday ||
      slot.date >= localDate(end)
    )
      continue;
    const status = occurrenceStatus(
      slot,
      history,
      current || future ? today : localDate(end),
    );
    if ((current || future) && state.draft?.scheduleOccurrenceId === slot.id) {
      calendar.active++;
      continue;
    }
    if (status === "completed") {
      calendar.logged++;
      continue;
    }
    calendar[status]++;
    if (status !== "planned" || (!current && !future)) continue;
    const p = state.programs.find(
        (p) => p.id === slot.programId && !p.archived,
      ),
      w = p?.workouts.find((w) => w.id === slot.workoutId);
    if (!p || !w) {
      calendar.unavailable++;
      continue;
    }
    for (const e of D.prepareWorkout(
      w,
      p,
      exercises,
      [],
      state.profile?.experience,
    )) {
      const x = index.get(e.exerciseId);
      if (x && !advancedEntry(e))
        row(x.muscle).upcoming += e.plannedWorkingSets ?? 0;
    }
  }
  const programs =
    current && !state.draft
      ? state.programs
          .filter((p) => !p.archived)
          .flatMap((p) =>
            reviewProgram(
              { ...state, sessions: history, draft: null },
              p.id,
              now,
            ),
          )
      : [];
  const rank = { recovery: 0, review: 1, pending: 2, context: 3, keep: 4 };
  const acceptedReviews =
    current && !state.draft
      ? reviewAcceptedChanges({ ...state, sessions: history, draft: null }, now)
      : [];
  const observations = recoveryObservations(history, undefined, asOf);
  return {
    current,
    future,
    asOf,
    calendar,
    rows: [...rows.values()]
      .map((r) => {
        const recovery = D.recoveryStatus(r.muscle, history, exercises, asOf);
        const report = observations
          .flatMap((s) =>
            (s.muscleFeedback ?? [])
              .filter((m) => m.muscle === r.muscle)
              .map((m) => ({ at: s.startedAt, ...m })),
          )
          .at(-1);
        const matching = changes.filter(
          (c) => index.get(c.exerciseId)?.muscle === r.muscle,
        );
        const candidate = programs
          .filter((p) => p.exercise.muscle === r.muscle)
          .sort((a, b) => rank[a.status] - rank[b.status])[0];
        const accepted = candidate
          ? acceptedReviews
              .filter(
                (r) =>
                  r.contextMatches &&
                  r.decision.proposal?.programId ===
                    candidate.session.programId &&
                  r.decision.proposal?.targetId ===
                    candidate.entry.sourceTargetId,
              )
              .sort((a, b) => b.decision.at - a.decision.at)[0]
          : undefined;
        let action = {
          kind: "observe",
          label: "Keep and observe",
          reason:
            "Continue collecting comparable performance and recovery reports before changing dose.",
        };
        if (!current)
          action = {
            kind: "history",
            label: future ? "Upcoming plan" : "Historical summary",
            reason: future
              ? "Review the current routine and readiness before starting this planned work."
              : "Open the current week to review live program targets.",
          };
        else if (recovery.blocked)
          action = {
            kind: "recovery",
            label: "Review recovery",
            reason: recovery.evidence[0],
          };
        else if (
          r.unknownEffort ||
          r.unknownAssignments ||
          r.unconfirmedContext
        )
          action = {
            kind: "context",
            label: "Record missing context",
            reason:
              "Review the recorded dose, report actual RIR and confirm execution/rest on future completed work. Missing observations are not evidence to add sets.",
          };
        else if (accepted && accepted.status !== "keep")
          action = {
            kind: accepted.status,
            label:
              accepted.status === "observe"
                ? "Observe accepted targets"
                : accepted.status === "reverse"
                  ? "Review previous targets"
                  : "Reassess accepted change",
            reason: accepted.reason,
          };
        else if (candidate)
          action = {
            kind: candidate.status,
            label: {
              keep: "Keep current dose",
              review: "Review current targets",
              context: "Gather comparable evidence",
              pending: "Observe accepted targets",
              recovery: "Review recovery",
            }[candidate.status],
            reason: candidate.reason,
          };
        return {
          ...r,
          assigned: r.unknownAssignments ? null : r.knownAssigned,
          exposures: r.exposures.size,
          recovery: { ...recovery, report },
          changes: matching,
          action,
          ...(accepted
            ? {
                accepted: {
                  status: accepted.status,
                  followups: accepted.followups.length,
                  edited: accepted.edited,
                  bundled: accepted.bundled,
                },
              }
            : {}),
          ...(current && candidate
            ? {
                target: {
                  programId: candidate.session.programId!,
                  workoutId: candidate.workout.id,
                  entry: candidate.entry,
                  session: candidate.session,
                },
              }
            : {}),
        };
      })
      .sort(
        (a, b) =>
          b.completed +
            b.advanced +
            b.knownAssigned +
            b.upcoming -
            (a.completed + a.advanced + a.knownAssigned + a.upcoming) ||
          a.muscle.localeCompare(b.muscle),
      ),
  };
}
