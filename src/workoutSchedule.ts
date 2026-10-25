import * as D from "./domain";
import {
  plannedDateSchema,
  scheduledOccurrenceSchema,
  workoutScheduleSchema,
  type ScheduledOccurrence,
} from "./schedulingTypes";
export type ScheduledSession = D.Session & { scheduleOccurrenceId?: string };
export function calendarDate(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function futureDate(date: string, now: number) {
  plannedDateSchema.parse(date);
  if (date < calendarDate(now))
    throw Error(
      "Choose today or a future date; missed plans are not automatically caught up.",
    );
  return date;
}
export function occurrenceStatus(
  slot: ScheduledOccurrence,
  sessions: ScheduledSession[],
  today = calendarDate(),
) {
  if (sessions.some((s) => s.scheduleOccurrenceId === slot.id))
    return "completed" as const;
  if (slot.status === "skipped") return "skipped" as const;
  return slot.date < today ? ("missed" as const) : ("planned" as const);
}
function preserveRest(
  slots: ScheduledOccurrence[],
  sessions: ScheduledSession[],
  date: string,
) {
  const completed = new Set(
    sessions.flatMap((s) =>
      s.scheduleOccurrenceId ? [s.scheduleOccurrenceId] : [],
    ),
  );
  const days = new Set([
    ...slots
      .filter((s) => s.status === "planned" && !completed.has(s.id))
      .map((s) => s.date),
    ...sessions
      .filter((s) =>
        s.exercises.some((e) =>
          e.sets.some((t) => t.done && t.kind !== "warmup"),
        ),
      )
      .map((s) => s.date),
  ]);
  days.add(date);
  for (let i = 0; i < 7; i++) {
    const start = addDays(date, -i),
      end = addDays(start, 6);
    if ([...days].filter((v) => v >= start && v <= end).length >= 7)
      throw Error(
        "Keep at least one rest day in each affected seven-day window. Move or skip another plan deliberately.",
      );
  }
}
function editable(
  slots: ScheduledOccurrence[],
  sessions: ScheduledSession[],
  id: string,
  active?: ScheduledSession,
) {
  const slot = slots.find((s) => s.id === id);
  if (!slot) throw Error("This planned workout changed. Refresh the calendar.");
  if (active?.scheduleOccurrenceId === id)
    throw Error("Finish the active workout before changing its planned date.");
  if (sessions.some((s) => s.scheduleOccurrenceId === id))
    throw Error(
      "A completed occurrence keeps its planned date. Repeat it explicitly instead.",
    );
  return slot;
}
export function planOccurrence(
  slots: ScheduledOccurrence[],
  programs: D.Program[],
  sessions: ScheduledSession[],
  input: { programId: string; workoutId: string; date: string },
  now = Date.now(),
) {
  const date = futureDate(input.date, now),
    program = programs.find((p) => p.id === input.programId && !p.archived),
    workout = program?.workouts.find((w) => w.id === input.workoutId);
  if (!program || !workout) throw Error("Choose an available saved routine.");
  preserveRest(slots, sessions, date);
  return workoutScheduleSchema.parse([
    ...slots,
    scheduledOccurrenceSchema.parse({
      id: D.uid(),
      programId: program.id,
      workoutId: workout.id,
      programName: program.name,
      workoutName: workout.name,
      date,
      originalDate: date,
      status: "planned",
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}
export function moveOccurrence(
  slots: ScheduledOccurrence[],
  sessions: ScheduledSession[],
  id: string,
  date: string,
  now = Date.now(),
  active?: ScheduledSession,
) {
  const slot = editable(slots, sessions, id, active);
  if (slot.status === "skipped")
    throw Error(
      "Repeat a skipped occurrence explicitly instead of silently restoring it.",
    );
  futureDate(date, now);
  preserveRest(
    slots.filter((s) => s.id !== id),
    sessions,
    date,
  );
  return workoutScheduleSchema.parse(
    slots.map((s) => (s.id === id ? { ...s, date, updatedAt: now } : s)),
  );
}
export function skipOccurrence(
  slots: ScheduledOccurrence[],
  sessions: ScheduledSession[],
  id: string,
  now = Date.now(),
  active?: ScheduledSession,
) {
  editable(slots, sessions, id, active);
  return workoutScheduleSchema.parse(
    slots.map((s) =>
      s.id === id ? { ...s, status: "skipped", updatedAt: now } : s,
    ),
  );
}
export function repeatOccurrence(
  slots: ScheduledOccurrence[],
  programs: D.Program[],
  sessions: ScheduledSession[],
  id: string,
  date: string,
  now = Date.now(),
) {
  const original = slots.find((s) => s.id === id);
  if (!original) throw Error("Choose a saved calendar occurrence.");
  const next = planOccurrence(
    slots,
    programs,
    sessions,
    { programId: original.programId, workoutId: original.workoutId, date },
    now,
  );
  return workoutScheduleSchema.parse(
    next.map((s, i) =>
      i === next.length - 1 ? { ...s, repeatOf: original.id } : s,
    ),
  );
}
