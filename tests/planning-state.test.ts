import { it, expect } from "vitest";
import * as D from "../src/domain";
import { planOccurrence, moveOccurrence } from "../src/workoutSchedule";
import { shorterAlternative } from "../src/workoutTiming";
import { exportHistoryBackup, importHistoryBackup } from "../src/historyBackup";
import { mergeThreeWay } from "../src/syncPolicy";
import { editState } from "../src/stateEdit";
import { createGuidancePreview, commitGuidance } from "../src/workoutGuidance";
const now = Date.parse("2026-10-25T12:00:00Z");
function fixture() {
  const base = D.emptyState(),
    p = D.starterProgram("balanced"),
    w = p.workouts[0];
  p.workouts = [w];
  base.programs = [p];
  const schedule = planOccurrence(
    [],
    base.programs,
    [],
    { programId: p.id, workoutId: w.id, date: "2026-10-26" },
    now,
  );
  const full = D.startSession(
    w.name,
    D.prepareWorkout(w, p, D.catalog, []),
    p,
    w,
  );
  full.startedAt = now;
  full.date = "2026-10-25";
  const alt = shorterAlternative(base, full, 30, now);
  const draft = {
    ...alt.session,
    scheduleOccurrenceId: schedule[0].id,
    scheduledDate: schedule[0].date,
    shortPlan: {
      minutes: 30 as const,
      acceptedAt: now,
      originalEntries: alt.originalEntries,
      keptEntryIds: alt.session.exercises.map((e) => e.id),
      estimatedLow: alt.estimate.low,
      estimatedHigh: alt.estimate.high,
      timingSourceIds: alt.estimate.sources,
    },
  };
  return {
    base,
    state: { ...base, minimumClientVersion: 2 as const, schedule, draft },
  };
}
it("keeps legacy data byte-shape compatible while accepting explicitly versioned planning metadata", () => {
  const old = D.emptyState();
  expect(D.historyStateSchema.parse(old)).toEqual(old);
  const { state } = fixture();
  expect(D.historyStateSchema.parse(state)).toEqual(state);
});
it("new planning records require an explicit client capability marker", () => {
  const { state } = fixture();
  expect(
    D.historyStateSchema.safeParse({
      ...state,
      minimumClientVersion: undefined,
    }).success,
  ).toBe(false);
});
it("original intended rows cannot masquerade as completed observations or unrelated identities", () => {
  const { state } = fixture();
  state.draft.shortPlan.originalEntries[0].sets[0].done = true;
  expect(D.historyStateSchema.safeParse(state).success).toBe(false);
  state.draft.shortPlan.originalEntries[0].sets[0].done = false;
  state.draft.shortPlan.keptEntryIds = ["foreign-entry"];
  expect(D.historyStateSchema.safeParse(state).success).toBe(false);
});
it("an active scheduled workout retains its reviewed date and cannot point to a skipped/missing slot", () => {
  const { state } = fixture();
  state.schedule[0].date = "2026-10-27";
  expect(D.historyStateSchema.safeParse(state).success).toBe(false);
  state.schedule[0].date = state.draft.scheduledDate;
  state.schedule[0].status = "skipped";
  expect(D.historyStateSchema.safeParse(state).success).toBe(false);
});
it("new backups identify their format and restore the original plan and calendar exactly", async () => {
  const { state } = fixture(),
    parsed = D.historyStateSchema.parse(state);
  const backup = await exportHistoryBackup(parsed),
    first = JSON.parse((await backup.text()).split("\n")[0]);
  expect(first.version).toBe(4);
  expect(await importHistoryBackup(backup)).toEqual(parsed);
});
it("independent calendar additions merge, while competing moves require a choice", () => {
  const { base, state } = fixture();
  const local = {
    ...base,
    minimumClientVersion: 2 as const,
    schedule: state.schedule,
  };
  const remote = {
    ...base,
    minimumClientVersion: 2 as const,
    schedule: planOccurrence(
      [],
      base.programs,
      [],
      {
        programId: base.programs[0].id,
        workoutId: base.programs[0].workouts[0].id,
        date: "2026-10-28",
      },
      now,
    ),
  };
  expect(mergeThreeWay(base, remote, local)).toMatchObject({
    minimumClientVersion: 2,
    schedule: expect.arrayContaining([local.schedule[0], remote.schedule[0]]),
  });
  const ancestor = D.historyStateSchema.parse(local);
  expect(() =>
    mergeThreeWay(
      ancestor,
      {
        ...ancestor,
        schedule: moveOccurrence(
          local.schedule,
          [],
          local.schedule[0].id,
          "2026-10-29",
          now,
        ),
      },
      {
        ...ancestor,
        schedule: moveOccurrence(
          local.schedule,
          [],
          local.schedule[0].id,
          "2026-10-30",
          now,
        ),
      },
    ),
  ).toThrow(/safely merge/);
});
it("explicit restoration of old data cannot downgrade the account capability fence", () => {
  const { state, base } = fixture(),
    parsed = D.historyStateSchema.parse(state);
  expect(editState(parsed, () => base)).toHaveProperty(
    "minimumClientVersion",
    2,
  );
});

it("atomically links a reviewed planned occurrence and rejects stale or already logged plans", () => {
  const { state } = fixture();
  const without = { ...state, draft: null };
  const p = state.programs[0],
    w = p.workouts[0],
    slot = state.schedule[0];
  const preview = createGuidancePreview(without, p.id, w.id, now, slot.id);
  const result = commitGuidance(without, preview, now);
  expect(result.draft?.scheduledDate).toBe(slot.date);
  expect(result.draft?.date).toBe("2026-10-25");
  expect(() =>
    commitGuidance(
      { ...without, schedule: [{ ...slot, date: "2026-10-27" }] },
      preview,
      now,
    ),
  ).toThrow(/planned date changed/);
  expect(() =>
    commitGuidance({ ...without, sessions: [result.draft!] }, preview, now),
  ).toThrow(/already logged/);
});
it("shorter previews retain their original dose through start and future actual edits", () => {
  const { state, base } = fixture();
  const p = base.programs[0],
    w = p.workouts[0];
  const preview = createGuidancePreview(base, p.id, w.id, now);
  preview.seed = {
    ...preview.seed,
    exercises: state.draft.exercises,
    shortPlan: state.draft.shortPlan,
  };
  const saved = commitGuidance(base, preview, now);
  const changed = editState(saved, (s) => ({
    ...s,
    draft: {
      ...s.draft!,
      exercises: s.draft!.exercises.map((e, i) =>
        i
          ? e
          : {
              ...e,
              sets: e.sets.map((t, j) =>
                j ? t : { ...t, done: true, reps: 5 },
              ),
            },
      ),
    },
  }));
  expect(changed.minimumClientVersion).toBe(2);
  expect(changed.draft?.shortPlan).toEqual(state.draft.shortPlan);
  expect(changed.programs).toEqual(base.programs);
});
it("calendar edits revalidate unchanged saved assignments and original custom-exercise references", () => {
  const { state } = fixture();
  const saved = D.historyStateSchema.parse({
    ...state,
    draft: null,
    sessions: [state.draft],
  });
  expect(() =>
    editState(saved, (s) => ({
      ...s,
      schedule: s.schedule!.map((v) => ({ ...v, date: "2026-10-27" })),
    })),
  ).toThrow(/assignment changed/);
});

it("concurrent sessions cannot claim the same planned occurrence", () => {
  const { state } = fixture();
  expect(
    D.historyStateSchema.safeParse({
      ...state,
      sessions: [{ ...state.draft, id: "another" }],
    }).success,
  ).toBe(false);
  expect(() =>
    editState(D.historyStateSchema.parse(state), (s) => ({
      ...s,
      sessions: [{ ...state.draft, id: "another" }],
    })),
  ).toThrow(/only one/);
});
it("a reviewed short plan must be reviewed again if retained targets change before start", () => {
  const { state, base } = fixture();
  const p = base.programs[0],
    w = p.workouts[0];
  const preview = createGuidancePreview(base, p.id, w.id, now);
  preview.seed = {
    ...preview.seed,
    exercises: state.draft.exercises,
    shortPlan: state.draft.shortPlan,
  };
  preview.seed.exercises = structuredClone(preview.seed.exercises);
  preview.seed.exercises[0].sets[0].rest = 500;
  expect(() => commitGuidance(base, preview, now)).toThrow(/estimate changed/);
});

it("omitted original exercises remain protected references after actual logging", () => {
  const { state } = fixture();
  const custom = {
    ...D.catalog[0],
    id: "original-only-custom",
    name: "Synthetic omitted original",
  };
  state.customExercises = [custom];
  state.draft.shortPlan.originalEntries.at(-1)!.exerciseId = custom.id;
  const parsed = D.historyStateSchema.parse({
    ...state,
    draft: null,
    sessions: [state.draft],
  });
  expect(() =>
    editState(parsed, (s) => ({ ...s, customExercises: [] })),
  ).toThrow(/original plan exercise/);
});
