import { z } from "zod";

const id = z.string().min(1).max(100);
const load = z.number().finite().min(0).max(2000);
export const setPrescriptionSchema = z
  .object({
    weight: load,
    reps: z.number().int().min(1).max(100),
    min: z.number().int().min(1).max(100),
    max: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    rest: z.number().int().min(0).max(900),
    ordinal: z.number().int().min(0).max(39),
    proposalId: id.optional(),
  })
  .strict()
  .refine(
    (p) => p.max >= p.min && p.reps >= p.min && p.reps <= p.max,
    "Prescription reps must fit the range",
  );
export const coachingContextSchema = z
  .object({
    execution: z.enum(["consistent", "changed", "unknown"]),
    rest: z.enum(["usual", "shorter", "longer", "unknown"]),
    recordedAt: z.number().finite().min(0),
    skipReason: z
      .enum(["time", "equipment", "performance", "pain", "other", "unknown"])
      .optional(),
  })
  .strict();
export const bodyweightReportSchema = z
  .object({
    kg: z.number().finite().min(20).max(400),
    at: z.number().finite().min(0),
  })
  .strict();
export const coachingAssignmentSchema = z
  .object({ proposalId: id, entryId: id })
  .strict();
export const coachSettingsSchema = z
  .object({
    enabled: z.boolean(),
    minutes: z.number().int().min(30).max(120),
    diet: z.enum(["cut", "maintenance", "gain", "unknown"]),
    earlyTrials: z.boolean(),
    priorities: z.array(z.string().min(1).max(30)).max(12),
    bodyweight: bodyweightReportSchema.optional(),
  })
  .strict();
export const DEFAULT_COACH_SETTINGS = {
  enabled: true,
  minutes: 75,
  diet: "unknown" as const,
  earlyTrials: true,
  priorities: [] as string[],
};
export const proposalRowSchema = z
  .object({
    ordinal: z.number().int().min(0).max(39),
    weight: load,
    reps: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
  })
  .strict();
export const targetChangeSchema = z
  .object({
    exerciseId: id,
    sets: z.number().int().min(1).max(10),
    min: z.number().int().min(1).max(100),
    max: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    rest: z.number().int().min(0).max(900),
    startingLoad: load.optional(),
  })
  .strict()
  .refine((t) => t.max >= t.min, "Invalid proposed range");
export const coachingProposalSchema = z
  .object({
    id,
    version: z.literal("coach-v1"),
    action: z.enum([
      "hold",
      "reps",
      "load",
      "trial",
      "rep-range",
      "reduce-load",
      "reduce-volume",
      "add-volume",
      "substitute",
      "deload",
      "recover",
    ]),
    sessionId: id,
    entryId: id,
    exerciseId: id,
    programId: id.optional(),
    workoutId: id.optional(),
    targetId: id.optional(),
    fingerprint: z.string().min(1).max(100000),
    contextKey: z.string().max(30000).optional(),
    reason: z.string().min(1).max(1200),
    evidence: z.array(z.string().max(1000)).max(24),
    excluded: z.array(z.string().max(500)).max(16),
    sourceIds: z.array(id).max(8),
    rows: z.array(proposalRowSchema).max(40),
    beforeRows: z.array(proposalRowSchema).max(40),
    beforeTarget: targetChangeSchema.optional(),
    afterTarget: targetChangeSchema.optional(),
    phase: z.enum(["deload"]).optional(),
    alternatives: z.array(id).max(3).optional(),
    review: z.string().max(500),
    uncertain: z.boolean(),
  })
  .strict();
export const coachingEventSchema = z
  .object({
    id: id.refine((v) => v.startsWith("coach-"), "Invalid coaching event ID"),
    at: z.number().finite().min(0),
    kind: z.enum(["decision", "outcome"]),
    proposalId: id,
    proposal: coachingProposalSchema.optional(),
    choice: z.enum(["accept", "edit", "decline", "defer"]).optional(),
    scope: z.enum(["session", "program"]).optional(),
    outcome: z
      .enum(["met", "too-demanding", "easier", "changed", "unknown"])
      .optional(),
    sessionId: id.optional(),
    sessionFingerprint: z.string().max(100000).optional(),
    painReported: z.boolean().optional(),
    note: z.string().max(1000).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (
      e.kind === "decision" &&
      (!e.proposal || !e.choice || !e.scope || e.proposalId !== e.proposal.id)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "A coaching decision requires its exact proposal, choice and scope",
      });
    if (e.kind === "outcome" && (!e.outcome || !e.sessionId))
      ctx.addIssue({
        code: "custom",
        message: "A coaching outcome requires a session and classification",
      });
    if (new TextEncoder().encode(JSON.stringify(e)).length > 150000)
      ctx.addIssue({
        code: "custom",
        message: "Coaching record exceeds its resource budget",
      });
  });
export type SetPrescription = z.infer<typeof setPrescriptionSchema>;
export type CoachingContext = z.infer<typeof coachingContextSchema>;
export type CoachSettings = z.infer<typeof coachSettingsSchema>;
export type CoachingProposal = z.infer<typeof coachingProposalSchema>;
export type CoachingEvent = z.infer<typeof coachingEventSchema>;
