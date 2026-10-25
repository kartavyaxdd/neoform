import { it, expect } from "vitest";
import * as D from "../src/domain";
import {
  planOccurrence,
  moveOccurrence,
  skipOccurrence,
  repeatOccurrence,
  occurrenceStatus,
  type ScheduledSession,
} from "../src/workoutSchedule";
const now = Date.parse("2026-10-25T12:00:00Z");
function fixture() {
  const state = D.emptyState();
  state.programs = [D.starterProgram("balanced")];
  return {
    state,
    input: {
      programId: state.programs[0].id,
      workoutId: state.programs[0].workouts[0].id,
      date: "2026-10-26",
    },
  };
}
it("planning is explicit and keeps routines, completed history and existing dates intact", () => {
  const { state, input } = fixture(),
    before = structuredClone(state);
  const slots = planOccurrence([], state.programs, [], input, now);
  expect(slots).toHaveLength(1);
  expect(slots[0].date).toBe(input.date);
  expect(slots[0].originalDate).toBe(input.date);
  expect(state).toEqual(before);
});
it("deliberate moving and skipping preserve identity and never add catch-up volume", () => {
  const { state, input } = fixture(),
    slots = planOccurrence([], state.programs, [], input, now);
  const moved = moveOccurrence(slots, [], slots[0].id, "2026-10-28", now);
  expect(moved).toHaveLength(1);
  expect(moved[0].id).toBe(slots[0].id);
  expect(moved[0].originalDate).toBe("2026-10-26");
  expect(slots[0].date).toBe("2026-10-26");
  const skipped = skipOccurrence(moved, [], slots[0].id, now);
  expect(skipped[0].status).toBe("skipped");
  expect(skipped).toHaveLength(1);
});
it("missed plans remain missed until an explicit move, skip or repeat", () => {
  const { state, input } = fixture(),
    slots = planOccurrence([], state.programs, [], input, now);
  expect(occurrenceStatus(slots[0], [], "2026-10-30")).toBe("missed");
  expect(slots).toHaveLength(1);
  expect(slots[0].date).toBe("2026-10-26");
});
it("repeating is an explicit new occurrence and cannot silently reuse completion", () => {
  const { state, input } = fixture(),
    slots = planOccurrence([], state.programs, [], input, now);
  const session: ScheduledSession = {
    ...D.startSession("Done", []),
    scheduleOccurrenceId: slots[0].id,
  };
  const repeated = repeatOccurrence(
    slots,
    state.programs,
    [session],
    slots[0].id,
    "2026-10-29",
    now,
  );
  expect(repeated).toHaveLength(2);
  expect(repeated[1].id).not.toBe(slots[0].id);
  expect(repeated[1].repeatOf).toBe(slots[0].id);
  expect(occurrenceStatus(slots[0], [session], "2026-10-30")).toBe("completed");
  expect(occurrenceStatus(repeated[1], [session], "2026-10-30")).toBe("missed");
});
it("completed and active occurrences cannot be moved or skipped", () => {
  const { state, input } = fixture(),
    slots = planOccurrence([], state.programs, [], input, now);
  const session: ScheduledSession = {
    ...D.startSession("Done", []),
    scheduleOccurrenceId: slots[0].id,
  };
  expect(() =>
    moveOccurrence(slots, [session], slots[0].id, "2026-10-29", now),
  ).toThrow(/completed/);
  expect(() => skipOccurrence(slots, [], slots[0].id, now, session)).toThrow(
    /active/,
  );
});
it("preserves at least one unscheduled day in each affected seven-day window", () => {
  const { state, input } = fixture();
  let slots = planOccurrence([], state.programs, [], input, now);
  for (const day of [27, 28, 29, 30, 31])
    slots = planOccurrence(
      slots,
      state.programs,
      [],
      { ...input, date: `2026-10-${day}` },
      now,
    );
  expect(() =>
    planOccurrence(
      slots,
      state.programs,
      [],
      { ...input, date: "2026-11-01" },
      now,
    ),
  ).toThrow(/rest day/);
  const skipped = skipOccurrence(slots, [], slots[2].id, now);
  expect(
    planOccurrence(
      skipped,
      state.programs,
      [],
      { ...input, date: "2026-11-01" },
      now,
    ),
  ).toHaveLength(7);
});
it("validates dates and current routine identity instead of making a replacement program", () => {
  const { state, input } = fixture();
  expect(() =>
    planOccurrence(
      [],
      state.programs,
      [],
      { ...input, date: "2026-02-30" },
      now,
    ),
  ).toThrow();
  expect(() =>
    planOccurrence(
      [],
      state.programs,
      [],
      { ...input, date: "2026-10-24" },
      now,
    ),
  ).toThrow(/future date/);
  state.programs[0].archived = true;
  expect(() => planOccurrence([], state.programs, [], input, now)).toThrow(
    /available/,
  );
});
