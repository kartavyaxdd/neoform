import { expect, it } from "vitest";
import {
  emptyState,
  createEntry,
  catalog,
  startSession,
  completeSession,
  MAX_BACKUP,
} from "../src/domain";
import { headerOf, textBytes } from "../src/storageProtocol";
import {
  prepareHistoryMutation,
  writeHistoryMutation,
  readHistory,
  historyChanged,
  partitionHistory,
  type HistoryRequest,
} from "../src/historyTransport";
const session = () => {
  const e = createEntry(catalog[0]);
  e.sets[0].done = true;
  return completeSession(startSession("Synthetic", [e]));
};
it("partitions by UTF-8 bytes and record count without changing record order", () => {
  const upserts = Array.from({ length: 201 }, (_, position) => ({
    position,
    session: session(),
  }));
  const parts = partitionHistory({ upserts, deletes: [] });
  expect(parts.map((p) => p.upserts.length)).toEqual([200, 1]);
  expect(parts.flatMap((p) => p.upserts)).toEqual(upserts);
  const large = Array.from({ length: 12 }, (_, position) => {
    const s = session();
    s.notes = "训练".repeat(900);
    s.exercises = Array.from({ length: 100 }, () => {
      const e = createEntry(catalog[0]);
      e.notes = "é".repeat(1000);
      return e;
    });
    return { position, session: s };
  });
  expect(textBytes({ upserts: large, deletes: [] })).toBeGreaterThan(
    MAX_BACKUP,
  );
  const split = partitionHistory({
    upserts: large,
    deletes: Array.from({ length: 401 }, (_, i) => String(i)),
  });
  expect(
    split.every(
      (p) =>
        textBytes(p) <= MAX_BACKUP &&
        p.upserts.length <= 200 &&
        p.deletes.length <= 200,
    ),
  ).toBe(true);
  expect(split.flatMap((p) => p.upserts)).toEqual(large);
  expect(split.flatMap((p) => p.deletes)).toHaveLength(401);
});
it("retains the transaction ID across lost acknowledgements instead of inventing a new write", async () => {
  const base = emptyState(),
    next = structuredClone(base);
  next.sessions = [session()];
  const mutation = prepareHistoryMutation(base, next, 4);
  const calls: { path: string; body: any }[] = [];
  const api: HistoryRequest = async <T>(
    path: string,
    _method?: string,
    body?: unknown,
  ) => {
    calls.push({ path, body });
    if (calls.length === 1) throw Error("Connection lost after server commit");
    return { revision: 5 } as T;
  };
  await expect(writeHistoryMutation(api, mutation)).rejects.toThrow(
    "Connection lost",
  );
  expect(await writeHistoryMutation(api, mutation)).toEqual({ revision: 5 });
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0].body.id).toBe(mutation.id);
});
it("uses staged immutable parts for large deltas and accepts an already committed retry", async () => {
  const base = emptyState(),
    next = structuredClone(base);
  next.sessions = Array.from({ length: 201 }, session);
  const mutation = prepareHistoryMutation(base, next, 0);
  const calls: string[] = [];
  const api: HistoryRequest = async <T>(path: string) => {
    calls.push(path);
    return (
      path === "/storage/uploads" ? { id: mutation.id } : { revision: 1 }
    ) as T;
  };
  expect(await writeHistoryMutation(api, mutation)).toEqual({ revision: 1 });
  expect(calls).toEqual([
    "/storage/uploads",
    `/storage/uploads/${mutation.id}/parts/0`,
    `/storage/uploads/${mutation.id}/parts/1`,
    `/storage/uploads/${mutation.id}/commit`,
  ]);
  const retry: HistoryRequest = async <T>() => ({ revision: 1 }) as T;
  expect(await writeHistoryMutation(retry, mutation)).toEqual({ revision: 1 });
});
it("restarts hydration after a concurrent commit and never publishes mixed pages", async () => {
  const first = session(),
    second = session();
  let heads = 0;
  const api: HistoryRequest = async <T>(path: string) => {
    if (path === "/storage/head")
      return {
        revision: ++heads,
        header: headerOf(emptyState()),
        count: 1,
      } as T;
    if (path.includes("revision=1"))
      throw Object.assign(Error("Changed"), { status: 409 });
    return { records: [{ position: 0, session: second }], next: null } as T;
  };
  const remote = await readHistory(api);
  expect(remote.revision).toBe(2);
  expect(remote.data.sessions).toEqual([second]);
  expect(remote.data.sessions).not.toContainEqual(first);
});
it("rejects partial, duplicated or incorrectly ordered history instead of representing it as the complete state", async () => {
  for (const records of [[], [{ position: 1, session: session() }]]) {
    const api: HistoryRequest = async <T>(path: string) =>
      (path === "/storage/head"
        ? { revision: 1, header: headerOf(emptyState()), count: 1 }
        : { records, next: null }) as T;
    await expect(readHistory(api)).rejects.toThrow();
  }
});
it("checks only the revision while idle", async () => {
  const calls: string[] = [];
  const api: HistoryRequest = async <T>(path: string) => {
    calls.push(path);
    return { revision: 7 } as T;
  };
  expect(await historyChanged(api, 7)).toBe(false);
  expect(await historyChanged(api, 6)).toBe(true);
  expect(calls).toEqual(["/storage/revision", "/storage/revision"]);
});
