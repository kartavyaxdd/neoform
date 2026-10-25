import { z } from "zod";
export const plannedDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const n = Date.parse(v + "T12:00:00Z");
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === v;
  }, "Invalid planned date");
const id = z.string().min(1).max(100);
export const scheduledOccurrenceSchema = z
  .object({
    id,
    programId: id,
    workoutId: id,
    programName: z.string().min(1).max(120),
    workoutName: z.string().min(1).max(120),
    date: plannedDateSchema,
    originalDate: plannedDateSchema,
    status: z.enum(["planned", "skipped"]),
    createdAt: z.number().finite().min(0),
    updatedAt: z.number().finite().min(0),
    repeatOf: id.optional(),
  })
  .strict()
  .refine((s) => s.updatedAt >= s.createdAt, "Plan update predates creation");
export const workoutScheduleSchema = z
  .array(scheduledOccurrenceSchema)
  .max(5000)
  .refine(
    (slots) => new Set(slots.map((s) => s.id)).size === slots.length,
    "Duplicate calendar occurrence",
  );
export type ScheduledOccurrence = z.infer<typeof scheduledOccurrenceSchema>;
