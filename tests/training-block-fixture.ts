import * as D from "../src/domain";
import {
  evaluateCoaching,
  applyCoaching,
  classifyCoachingOutcomes,
} from "../src/coaching";
import { createGuidancePreview, commitGuidance } from "../src/workoutGuidance";
import { shorterAlternative } from "../src/workoutTiming";
import { reviewAcceptedChanges } from "../src/coachingResponse";
import type { CoachingProposal } from "../src/coachingTypes";
import { syntheticReadiness } from "./readiness-fixture";
export const blockScenarios = [
  "improving",
  "repeated-misses",
  "unknown-effort",
  "shortened-workouts",
  "equipment-switch",
  "local-recovery",
  "systemic-recovery",
  "recovery-phase",
  "changed-execution",
  "corrected-history",
  "cut-volume",
  "volume-experiment",
  "legacy-sequence",
  "partial-preceding-work",
] as const;
export type BlockScenario = (typeof blockScenarios)[number];
const day = 86400000,
  start = Date.parse("2026-08-03T10:00:00Z");
const increaseActions = new Set([
  "reps",
  "load",
  "trial",
  "rep-range",
  "add-volume",
]);
const escalates = (p: CoachingProposal) =>
  p.action === "reps"
    ? p.rows.reduce((n, r) => n + r.reps, 0) >
      p.beforeRows.reduce((n, r) => n + r.reps, 0)
    : increaseActions.has(p.action);
const reduces = (p: CoachingProposal) =>
  ["reduce-load", "reduce-volume"].includes(p.action) ||
  (p.action === "reps" &&
    p.rows.reduce((n, r) => n + r.reps, 0) <
      p.beforeRows.reduce((n, r) => n + r.reps, 0));
export function evaluateTrainingBlock(scenario: BlockScenario) {
  let state = D.emptyState();
  state.profile = {
    name: "Synthetic block",
    experience: "Intermediate",
    goal: "Build muscle",
    equipment: ["Barbell"],
    days: 4,
  };
  const p = D.starterProgram("balanced");
  p.id = "block-program";
  p.weeks = 8;
  p.deloadWeek = 8;
  p.workouts = [0, 1].map((n) => ({
    id: `block-workout-${n}`,
    name: `Synthetic ${n + 1}`,
    day: "",
    exercises: ["bench", "row"].map((id, i) => ({
      ...D.target(id),
      id: `block-target-${n}-${i}`,
      sets: 3,
      rest: 180,
      startingLoad: 50,
      setup: {
        label: "QA setup A",
        execution: "Same ROM",
        availableLoads:
          scenario.includes("volume") || scenario === "volume-experiment"
            ? [50, 60]
            : Array.from({ length: 61 }, (_, i) => 30 + i),
      },
    })),
  }));
  if (scenario === "legacy-sequence")
    p.workouts.forEach((w) =>
      w.exercises.forEach((t) => {
        t.techniqueGroup = "legacy-unclassified";
        t.repGoal = 30;
      }),
    );
  state.programs = [p];
  if (scenario.includes("volume"))
    state.coaching = {
      enabled: true,
      minutes: 120,
      diet: scenario === "cut-volume" ? "cut" : "gain",
      earlyTrials: false,
      priorities: ["Chest"],
    };
  const trace: {
    week: number;
    at: number;
    exerciseId: string;
    action: string;
    escalation: boolean;
    reduction: boolean;
    reason: string;
    sources: number;
    accepted: boolean;
    forbidden: boolean;
  }[] = [];
  const reviews: {
    week: number;
    status: string;
    followups: number;
    uniqueFollowups: number;
  }[] = [];
  let volumeAccepted = 0,
    deloadOffers = 0;
  for (let week = 1; week <= 8; week++)
    for (let slot = 0; slot < 4; slot++) {
      const at = start + ((week - 1) * 7 + [0, 1, 3, 4][slot]) * day;
      state = structuredClone(state);
      state.programs[0].currentWeek = week;
      if (scenario === "recovery-phase")
        state.programs[0].phase =
          week === 5 || week === 8 ? "deload" : "accumulation";
      if (
        scenario === "equipment-switch" &&
        (week === 4 || week === 7) &&
        slot === 0
      )
        state.programs[0].workouts.forEach(
          (w) =>
            (w.exercises[0].setup!.label =
              week === 4 ? "QA setup B" : "QA setup A"),
        );
      const w = state.programs[0].workouts[slot % 2],
        current = state.programs[0];
      let preview = createGuidancePreview(state, current.id, w.id, at);
      const readiness = syntheticReadiness(at);
      readiness.muscles = D.muscles.map((m) => ({
        muscle: m,
        recovered: "yes" as const,
        pain: false,
        soreness: 1,
        recordedAt: at,
      }));
      if (scenario === "systemic-recovery" && (week === 3 || week === 4))
        readiness.fatigue = 5;
      if (scenario === "local-recovery") {
        const m = readiness.muscles.find((m) => m.muscle === "Chest")!;
        if (week === 3 || week === 4) {
          m.pain = true;
          m.recovered = "no";
          m.soreness = 4;
        }
        if (week === 5) {
          m.pain = null;
          m.recovered = "unknown";
          m.soreness = null;
        }
      }
      preview.seed.readiness = readiness;
      if (scenario === "shortened-workouts" && week >= 3 && week <= 6) {
        const a = shorterAlternative(state, preview.seed, 30, at);
        if (!a.feasible)
          throw Error("Synthetic short plan unexpectedly infeasible");
        preview.seed = {
          ...a.session,
          shortPlan: {
            minutes: 30,
            acceptedAt: at,
            originalEntries: a.originalEntries,
            keptEntryIds: a.session.exercises.map((e) => e.id),
            estimatedLow: a.estimate.low,
            estimatedHigh: a.estimate.high,
            timingSourceIds: a.estimate.sources,
          },
        };
      }
      // The synthetic user explicitly establishes the initial prescribed load for each new setup.
      for (const e of preview.seed.exercises)
        if (
          preview.seed.phase === "accumulation" &&
          e.sets.every((t) => t.weight === 0)
        )
          e.sets.forEach((t) => {
            t.weight = 50;
            t.prescription!.weight = 50;
          });
      if (scenario === "legacy-sequence")
        preview.seed.exercises.forEach((e) => {
          e.techniqueGroup = "legacy-unclassified";
          e.repGoal = 30;
        });
      const recommendations = evaluateCoaching(state, preview.seed, at);
      deloadOffers += recommendations.filter(
        (p) => p.action === "deload",
      ).length;
      const choices: Parameters<typeof applyCoaching>[2] = [];
      for (const e of preview.seed.exercises) {
        const own = recommendations.filter((p) => p.entryId === e.id),
          primary = own[0];
        if (!primary) continue;
        const previous = state.sessions
          .filter((s) => s.workoutId === w.id)
          .at(-1)
          ?.exercises.find((old) => old.sourceTargetId === e.sourceTargetId);
        const boundary =
          scenario === "equipment-switch" &&
          [4, 7].includes(week) &&
          slot < 2 &&
          e.exerciseId === "bench";
        const excluded =
          (scenario === "unknown-effort" &&
            week >= 2 &&
            previous?.sets.some((t) => t.effortReported !== true)) ||
          (scenario === "changed-execution" &&
            week >= 3 &&
            previous?.coachingContext?.execution === "changed") ||
          (scenario === "corrected-history" &&
            previous?.sets.some((t) => t.effortReported !== true));
        const recovery =
          (scenario === "local-recovery" &&
            [3, 4, 5].includes(week) &&
            e.exerciseId === "bench") ||
          (scenario === "systemic-recovery" && [3, 4].includes(week));
        const phase =
          current.phase === "deload" ||
          week === 8 ||
          (scenario === "recovery-phase" && week === 6 && slot < 2);
        const staleReturn =
          scenario === "shortened-workouts" &&
          week === 7 &&
          slot < 2 &&
          e.exerciseId === "row";
        const chosen =
          scenario === "volume-experiment" && volumeAccepted === 0
            ? (own.find((p) => p.action === "add-volume") ?? primary)
            : primary;
        const accept =
          choices.length === 0 &&
          ((!preview.seed.shortPlan &&
            !["hold", "recover", "substitute", "deload", "add-volume"].includes(
              chosen.action,
            )) ||
            (scenario === "volume-experiment" &&
              chosen.action === "add-volume" &&
              volumeAccepted === 0));
        const partialPrefix =
          scenario === "partial-preceding-work" &&
          e.exerciseId === "row" &&
          previous &&
          state.sessions.filter((s) => s.workoutId === w.id).at(-1)!
            .exercises[0].sets.length < 3;
        const repeatedFailure =
          scenario === "repeated-misses" && week >= 4 && week <= 5;
        const forbidden =
          (scenario === "legacy-sequence" && own.some(escalates)) ||
          ((boundary ||
            excluded ||
            recovery ||
            phase ||
            staleReturn ||
            partialPrefix ||
            repeatedFailure) &&
            own.some(escalates)) ||
          (scenario === "cut-volume" &&
            own.some((p) => p.action === "add-volume"));
        trace.push({
          week,
          at,
          exerciseId: e.exerciseId,
          action: chosen.action,
          escalation: escalates(chosen),
          reduction: reduces(chosen),
          reason: chosen.reason,
          sources: chosen.sourceIds.length,
          accepted: accept,
          forbidden,
        });
        if (accept) {
          choices.push({
            proposal: chosen,
            choice: "accept",
            scope: "program",
          });
          if (chosen.action === "add-volume") volumeAccepted++;
        }
      }
      // Every acceptance is a scripted user's choice; the engine never changes a routine by being read.
      const before = JSON.stringify(state.programs);
      evaluateCoaching(state, preview.seed, at);
      if (before !== JSON.stringify(state.programs))
        throw Error("Reading coaching changed a program");
      // Revalidate each coordinated choice against the evolving ledger, as the UI does.
      let draftState = commitGuidance(state, preview, at);
      for (const choice of choices) {
        const refreshed = evaluateCoaching(
          draftState,
          draftState.draft!,
          at,
        ).find(
          (p) =>
            p.entryId === choice.proposal.entryId &&
            p.action === choice.proposal.action,
        );
        if (
          !refreshed ||
          JSON.stringify(refreshed.rows) !==
            JSON.stringify(choice.proposal.rows)
        )
          throw Error("A scripted acceptance became stale before application");
        draftState = applyCoaching(
          draftState,
          draftState.draft!,
          [{ ...choice, proposal: refreshed }],
          at,
        );
      }
      state = draftState;
      const s = structuredClone(state.draft!);
      s.duration = 3600;
      for (const e of s.exercises) {
        e.coachingContext = {
          execution:
            scenario === "changed-execution" && (week === 3 || week === 4)
              ? "changed"
              : "consistent",
          rest: "usual",
          recordedAt: at + 3600000,
        };
        e.sets.forEach((t) => {
          const p = t.prescription!;
          t.done = !(
            scenario === "partial-preceding-work" &&
            e.exerciseId === "bench" &&
            (week === 3 || week === 4) &&
            p.ordinal === 2
          );
          t.effortReported = !(scenario === "unknown-effort" && week >= 2);
          t.reps =
            (scenario === "repeated-misses" && week >= 3 && week <= 5) ||
            (scenario === "systemic-recovery" && [3, 4].includes(week))
              ? Math.max(1, p.reps - 2)
              : scenario.includes("volume") || scenario === "volume-experiment"
                ? p.max
                : Math.min(p.max, p.reps + 1);
          t.rir =
            (scenario === "repeated-misses" && week >= 3 && week <= 5) ||
            (scenario === "systemic-recovery" && [3, 4].includes(week))
              ? 0
              : scenario.includes("volume") || scenario === "volume-experiment"
                ? p.rir + 1
                : p.rir;
        });
      }
      const logged = D.completeSession(s);
      state = {
        ...state,
        sessions: [...state.sessions, logged],
        coachingEvents: [
          ...(state.coachingEvents ?? []),
          ...classifyCoachingOutcomes(state, logged, at + 3600000),
        ],
        draft: null,
        timer: null,
      };
      if (scenario === "corrected-history" && week === 4 && slot === 3) {
        state.sessions.at(-1)!.exercises[0].sets[0].effortReported = false;
        const last = state.coachingEvents!.at(-1);
        if (last)
          state.coachingEvents!.push({
            ...last,
            id: "coach-duplicate-correction",
          });
      }
      for (const r of reviewAcceptedChanges(state, at + 3600000))
        reviews.push({
          week,
          status: r.status,
          followups: r.followups.length,
          uniqueFollowups: new Set(r.followups.map((f) => f.sessionId)).size,
        });
      D.historyStateSchema.parse(state);
    }
  return {
    scenario,
    weeks: 8,
    sessions: state.sessions.length,
    trace,
    reviews,
    state,
    volumeAccepted,
    summary: {
      accepted: trace.filter((t) => t.accepted).length,
      proposedIncreases: trace.filter((t) => t.escalation).length,
      deloadOffers,
      proposedReductions: trace.filter((t) => t.reduction).length,
      recoveryReviews: trace.filter((t) => t.action === "recover").length,
      holds: trace.filter((t) => t.action === "hold").length,
      forbiddenEscalations: trace.filter((t) => t.forbidden).length,
    },
  };
}
