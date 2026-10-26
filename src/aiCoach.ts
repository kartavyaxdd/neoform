import { z } from "zod";
import * as D from "./domain";
import { recoveryTime } from "./readiness";
import { reviewProgram } from "./programReview";
export function canUseGemini(
  user:
    | {
        id: string;
        accessMode?: string;
        profileId?: string;
        aiAccess?: boolean;
      }
    | null
    | undefined,
) {
  if (!user || user.accessMode === "public-workspace") return false;
  return (
    user.accessMode !== "workspace-profiles" ||
    (user.profileId === "sharma" && user.aiAccess === true)
  );
}
const text = (max = 120) => z.string().max(max),
  number = z.number().finite();
const setSchema = z
  .object({
    weight: number,
    reps: number,
    rir: number.nullable(),
    kind: text(16),
    bout: text(40).nullable(),
    assigned: z
      .object({
        weight: number,
        reps: number,
        min: number,
        max: number,
        rir: number,
        rest: number,
      })
      .strict()
      .nullable(),
  })
  .strict();
const entrySchema = z
  .object({
    id: text(100),
    exerciseId: text(120),
    name: text(120),
    equipment: text(80),
    convention: text(40),
    setup: text(120).nullable(),
    setupExecution: text(300).nullable(),
    tempo: text(80).nullable(),
    protocol: text(600).nullable(),
    group: text(80).nullable(),
    method: text(80),
    plannedSets: number.nullable(),
    execution: text(40),
    restContext: text(40),
    confirmedAt: number.nullable(),
    sets: z.array(setSchema).max(6),
  })
  .strict();
const targetSchema = z
  .object({
    id: text(100),
    exerciseId: text(120),
    name: text(120),
    equipment: text(80),
    convention: text(40),
    setup: text(120).nullable(),
    setupExecution: text(300).nullable(),
    tempo: text(80).nullable(),
    protocol: text(600).nullable(),
    group: text(80).nullable(),
    method: text(80),
    sets: number,
    min: number,
    max: number,
    rir: number,
    rest: number,
  })
  .strict();
export const coachFocusSchema = z
  .object({
    title: text(120),
    action: text(40),
    reason: text(1000),
    sourceIds: z.array(text(100)).max(8),
    evidence: z.array(text(1000)).max(8).optional(),
    excluded: z.array(text(500)).max(8).optional(),
    targets: z
      .array(
        z
          .object({
            ordinal: number,
            weight: number,
            reps: number,
            rir: number,
          })
          .strict(),
      )
      .max(40)
      .optional(),
  })
  .strict();
export type CoachFocus = z.infer<typeof coachFocusSchema>;
export const coachContextSchema = z
  .object({
    capturedAt: number,
    profile: z
      .object({
        goal: text(80),
        experience: text(40),
        days: number,
        diet: text(40),
      })
      .strict(),
    program: z
      .object({
        id: text(100),
        name: text(120),
        phase: text(40),
        week: number,
        workouts: z
          .array(
            z
              .object({
                name: text(120),
                targets: z.array(targetSchema).max(10),
              })
              .strict(),
          )
          .max(8),
      })
      .strict()
      .nullable(),
    workouts: z
      .array(
        z
          .object({
            id: text(100),
            date: text(20),
            phase: text(40).nullable(),
            duration: number,
            shortened: z.boolean(),
            fatigue: number.nullable(),
            pain: z.boolean().nullable(),
            entries: z.array(entrySchema).max(8),
            muscleReports: z
              .array(
                z
                  .object({
                    muscle: text(40),
                    recovered: text(40),
                    pain: z.boolean().nullable(),
                    soreness: number.nullable(),
                    at: number,
                  })
                  .strict(),
              )
              .max(12),
          })
          .strict(),
      )
      .max(8),
    guidance: z
      .array(
        z
          .object({
            exerciseId: text(120),
            status: text(40),
            reason: text(1000),
          })
          .strict(),
      )
      .max(32),
    coverage: z
      .object({
        savedWorkouts: number,
        includedWorkouts: number,
        omittedEntries: number,
        omittedSets: number,
        omittedTargets: number,
      })
      .strict(),
    focus: coachFocusSchema.optional(),
  })
  .strict();
export type CoachContext = z.infer<typeof coachContextSchema>;
export const coachInputSchema = z
  .object({
    question: z.string().trim().min(3).max(1500),
    context: coachContextSchema,
    conversation: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            text: z.string().max(4000),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
export const coachReplySchema = z
  .object({
    answer: z.string().trim().min(1).max(4000),
    sourceIds: z.array(text(100)).max(8),
    uncertainties: z.array(text(220)).max(4),
    nextCheck: text(400),
  })
  .strict();
export type CoachReply = z.infer<typeof coachReplySchema>;
export function buildCoachContext(
  state: D.State,
  now = Date.now(),
  focus?: CoachFocus,
): CoachContext {
  const exercises = [...D.catalog, ...state.customExercises],
    index = new Map(exercises.map((e) => [e.id, e]));
  const history = state.sessions
      .filter((s) => s.startedAt <= now && recoveryTime(s) <= now)
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt),
    recent = history.slice(-8),
    p = state.programs.find((p) => !p.archived);
  let omittedEntries = 0,
    omittedSets = 0,
    omittedTargets = 0;
  const workouts = recent.map((s) => {
    omittedEntries += Math.max(0, s.exercises.length - 8);
    return {
      id: s.id,
      date: s.date,
      phase: s.phase ?? null,
      duration: s.duration,
      shortened: !!s.shortPlan,
      fatigue:
        s.feedback.reported === true ? (s.feedback.fatigue ?? null) : null,
      pain:
        s.feedback.pain === true
          ? true
          : s.feedback.reported === true
            ? (s.feedback.pain ?? null)
            : null,
      entries: s.exercises.slice(0, 8).map((e) => {
        const x = index.get(e.exerciseId),
          sets = e.sets.filter((t) => t.done && t.kind !== "warmup");
        omittedSets += Math.max(0, sets.length - 6);
        return {
          id: e.id,
          exerciseId: e.exerciseId,
          name: (x?.name ?? "Unknown exercise").slice(0, 120),
          equipment: e.equipment ?? "unknown",
          convention: e.convention ?? "unknown",
          setup: e.setup?.label?.slice(0, 120) ?? null,
          setupExecution: e.setup?.execution ?? null,
          tempo: e.tempo ? JSON.stringify(e.tempo) : null,
          protocol: e.protocol ?? null,
          group: e.techniqueGroup ?? e.superset ?? null,
          method: e.technique ?? "unclassified legacy / straight",
          plannedSets: e.plannedWorkingSets ?? null,
          execution:
            e.coachingContext && e.coachingContext.recordedAt <= now
              ? e.coachingContext.execution
              : "unknown",
          restContext:
            e.coachingContext && e.coachingContext.recordedAt <= now
              ? e.coachingContext.rest
              : "unknown",
          confirmedAt:
            e.coachingContext && e.coachingContext.recordedAt <= now
              ? e.coachingContext.recordedAt
              : null,
          sets: sets.slice(0, 6).map((t) => ({
            weight: t.weight,
            reps: t.reps,
            rir: t.effortReported === true ? t.rir : null,
            kind: t.kind,
            bout: t.bout ?? null,
            assigned: t.prescription
              ? {
                  weight: t.prescription.weight,
                  reps: t.prescription.reps,
                  min: t.prescription.min,
                  max: t.prescription.max,
                  rir: t.prescription.rir,
                  rest: t.prescription.rest,
                }
              : null,
          })),
        };
      }),
      muscleReports: (s.muscleFeedback ?? [])
        .filter((m) => (m.recordedAt ?? recoveryTime(s)) <= now)
        .slice(0, 12)
        .map((m) => ({
          muscle: m.muscle,
          recovered: m.recovered ?? "unknown",
          pain: m.pain ?? null,
          soreness: m.soreness ?? null,
          at: m.recordedAt ?? recoveryTime(s),
        })),
    };
  });
  const program = p
    ? {
        id: p.id,
        name: p.name.slice(0, 120),
        phase: D.programPhase(p),
        week: p.currentWeek,
        workouts: p.workouts.slice(0, 8).map((w) => {
          omittedTargets += Math.max(0, w.exercises.length - 10);
          return {
            name: w.name.slice(0, 120),
            targets: w.exercises.slice(0, 10).map((t) => {
              const x = index.get(t.exerciseId),
                phase = D.phaseTarget(t, p, state.profile?.experience);
              return {
                id: t.id,
                exerciseId: t.exerciseId,
                name: (x?.name ?? "Unknown exercise").slice(0, 120),
                equipment: x?.equipment ?? "Unknown",
                convention: x?.convention ?? "unknown",
                setup: t.setup?.label?.slice(0, 120) ?? null,
                setupExecution: t.setup?.execution ?? null,
                tempo: t.tempo ? JSON.stringify(t.tempo) : null,
                protocol: null,
                group: t.techniqueGroup ?? null,
                method: t.technique ?? "straight",
                sets: phase.sets,
                min: phase.min,
                max: phase.max,
                rir: phase.rir,
                rest: t.rest,
              };
            }),
          };
        }),
      }
    : null;
  if (p)
    omittedTargets += p.workouts
      .slice(8)
      .reduce((n, w) => n + w.exercises.length, 0);
  const data = {
    capturedAt: now,
    profile: {
      goal: state.profile?.goal ?? "unknown",
      experience: state.profile?.experience ?? "unknown",
      days: state.profile?.days ?? 0,
      diet: state.coaching?.diet ?? "unknown",
    },
    program,
    workouts,
    guidance: p
      ? reviewProgram({ ...state, sessions: history }, p.id, now)
          .slice(0, 32)
          .map((r) => ({
            exerciseId: r.exercise.id,
            status: r.status,
            reason: r.reason.slice(0, 1000),
          }))
      : [],
    coverage: {
      savedWorkouts: history.length,
      includedWorkouts: workouts.length,
      omittedEntries,
      omittedSets,
      omittedTargets,
    },
    ...(focus ? { focus } : {}),
  };
  // Keep a genuine bounded request even for large imports and advanced logs.
  // Drop oldest included evidence first; the coverage summary exposes omissions.
  while (new TextEncoder().encode(JSON.stringify(data)).length > 64000) {
    if (data.workouts.length) {
      const removed = data.workouts.shift()!;
      data.coverage.includedWorkouts--;
      data.coverage.omittedEntries += removed.entries.length;
      data.coverage.omittedSets += removed.entries.reduce(
        (n, e) => n + e.sets.length,
        0,
      );
    } else if (data.program?.workouts.length) {
      data.coverage.omittedTargets +=
        data.program.workouts.pop()!.targets.length;
    } else break;
  }
  return coachContextSchema.parse(data);
}
