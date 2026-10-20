import { expect, it } from "vitest";
import {
  emptyState,
  createEntry,
  catalog,
  startSession,
  completeSession,
} from "../src/domain";
import {
  historyDelta,
  storageHash,
  storagePart,
  validateHistoryRecord,
  headerOf,
  storageRevision,
  storageBaseRevision,
} from "../src/storageProtocol";

it("allows the final safe revision to be read but cannot increment beyond it", () => {
  expect(storageRevision.parse(Number.MAX_SAFE_INTEGER)).toBe(
    Number.MAX_SAFE_INTEGER,
  );
  expect(storageBaseRevision.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(
    false,
  );
  expect(storageBaseRevision.parse(Number.MAX_SAFE_INTEGER - 1) + 1).toBe(
    Number.MAX_SAFE_INTEGER,
  );
});

it("hashes JSON content independently of object-key order while preserving array order", async () => {
  expect(await storageHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
    await storageHash({ a: { c: 3, d: 4 }, b: 2 }),
  );
  expect(await storageHash([1, 2])).not.toBe(await storageHash([2, 1]));
  expect(await storageHash({ a: undefined, b: 1 })).toBe(
    await storageHash({ b: 1 }),
  );
});
it("emits only changed records with explicit positions and deletion IDs", () => {
  const base = emptyState();
  base.sessions = [0, 1, 2].map((i) =>
    completeSession(startSession(String(i), [createEntry(catalog[0])])),
  );
  expect(historyDelta(base, structuredClone(base))).toEqual({
    upserts: [],
    deletes: [],
  });
  const next = structuredClone(base);
  next.sessions[1].notes = "changed";
  expect(historyDelta(base, next)).toEqual({
    upserts: [{ position: 1, session: next.sessions[1] }],
    deletes: [],
  });
  next.sessions.shift();
  expect(historyDelta(base, next)).toEqual({
    upserts: next.sessions.map((session, position) => ({ session, position })),
    deletes: [base.sessions[0].id],
  });
});
it("rejects duplicated mutations and invalid per-record references", () => {
  const state = emptyState(),
    entry = createEntry(catalog[0]);
  entry.sets[0].done = true;
  const session = completeSession(startSession("Synthetic", [entry]));
  expect(
    storagePart.safeParse({
      upserts: [{ position: 0, session }],
      deletes: [session.id],
    }).success,
  ).toBe(false);
  expect(
    storagePart.safeParse({
      upserts: [
        { position: 0, session },
        { position: 0, session: { ...session, id: "other" } },
      ],
      deletes: [],
    }).success,
  ).toBe(false);
  expect(() => validateHistoryRecord(session, headerOf(state))).not.toThrow();
  session.exercises[0].sets.push({ ...session.exercises[0].sets[0] });
  expect(() => validateHistoryRecord(session, headerOf(state))).toThrow(
    "Duplicate",
  );
});
