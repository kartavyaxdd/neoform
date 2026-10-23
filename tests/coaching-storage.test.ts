import { it, expect } from "vitest";
import * as D from "../src/domain";
import { syntheticCoachingEvent } from "./coaching-fixture";
import { headerOf, historyDelta } from "../src/storageProtocol";
import {
  prepareHistoryMutation,
  recoverHistoryMutation,
} from "../src/historyTransport";
import { exportHistoryBackup, importHistoryBackup } from "../src/historyBackup";
import { editState } from "../src/stateEdit";
import { mergeThreeWay } from "../src/syncPolicy";
it("recovers only the missing coaching manifest count from the immutable saved copy", async () => {
  const base = D.emptyState(),
    next = { ...base, coachingEvents: [syntheticCoachingEvent()] };
  const plan = prepareHistoryMutation(base, next, 0);
  const { coachingCount, ...legacy } = plan;
  expect(await recoverHistoryMutation(legacy, base, next)).toEqual(plan);
  await expect(
    recoverHistoryMutation(legacy, base, {
      ...next,
      settings: { ...next.settings, unit: "lb" },
    }),
  ).rejects.toThrow(/differs/);
  expect(await recoverHistoryMutation(plan, base, next)).toBe(plan);
});
it("keeps an unbounded-by-header ledger in normalized transfer parts and checksummed version 3 backups", async () => {
  const before = D.emptyState(),
    state = {
      ...before,
      coachingEvents: Array.from({ length: 201 }, (_, i) =>
        syntheticCoachingEvent(i),
      ),
    };
  expect(headerOf(state)).not.toHaveProperty("coachingEvents");
  const mutation = prepareHistoryMutation(before, state, 0);
  expect(mutation.coachingCount).toBe(201);
  expect(
    mutation.parts.flatMap((p) => p.coachingUpserts ?? []).map((r) => r.event),
  ).toEqual(state.coachingEvents);
  expect(mutation.parts).toHaveLength(2);
  const backup = await exportHistoryBackup(state);
  expect(JSON.parse((await backup.text()).split("\n")[0]).version).toBe(3);
  expect(await importHistoryBackup(backup)).toEqual(state);
  await expect(
    importHistoryBackup(
      new Blob([
        (await backup.text()).replace(
          "Synthetic pending observation",
          "corrupted",
        ),
      ]),
    ),
  ).rejects.toThrow();
});
it("retains ledger references during ordinary edits, unions independent event additions, and carries explicit deletions", () => {
  const original = {
    ...D.emptyState(),
    coachingEvents: [syntheticCoachingEvent()],
  };
  const next = editState(original, (s) => ({
    ...s,
    settings: { ...s.settings, timerSound: true },
  }));
  expect(next.coachingEvents).toBe(original.coachingEvents);
  const b = D.emptyState(),
    r = { ...b, coachingEvents: [syntheticCoachingEvent(1)] },
    l = { ...b, coachingEvents: [syntheticCoachingEvent(2)] };
  expect(mergeThreeWay(b, r, l).coachingEvents).toHaveLength(2);
  expect(
    historyDelta(original, { ...original, coachingEvents: [] }).coachingDeletes,
  ).toEqual([original.coachingEvents[0].id]);
});
