import { z } from "zod";
import { coachingEventSchema, type CoachingEvent } from "./coachingTypes";
import {
  historyStateSchema,
  sessionSchema,
  MAX_BACKUP,
  type State,
} from "./domain";
import {
  headerOf,
  historyDelta,
  storageHash,
  storageHeader,
  storagePart,
  storageRevision,
  storageBaseRevision,
  textBytes,
  validateHistoryRecord,
  type HistoryPart,
  type StateHeader,
} from "./storageProtocol";

export type HistoryRequest = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
export type HistoryMutation = {
  id: string;
  revision: number;
  header: StateHeader;
  count: number;
  coachingCount?: number;
  parts: HistoryPart[];
};
const ackSchema = z.object({ revision: storageRevision }).strict();
const headSchema = z
  .object({
    revision: storageRevision,
    header: storageHeader,
    count: z.number().int().min(0).max(50000),
    coachingCount: z.number().int().min(0).max(100000).optional(),
  })
  .strict();
const pageSchema = z
  .object({
    records: z
      .array(
        z
          .object({
            position: z.number().int().min(0).max(49999),
            session: sessionSchema,
          })
          .strict(),
      )
      .max(32),
    next: z.number().int().min(0).max(49999).nullable(),
  })
  .strict();

export function partitionHistory(changes: HistoryPart): HistoryPart[] {
  const parts: HistoryPart[] = [];
  let part: HistoryPart = { upserts: [], deletes: [] },
    bytes = textBytes(part);
  const append = <K extends "upserts" | "deletes">(
    kind: K,
    value: HistoryPart[K][number],
  ) => {
    const cost = textBytes(value);
    if (cost + textBytes({ upserts: [], deletes: [] }) > MAX_BACKUP)
      throw Error("A single workout cannot fit in a history transfer.");
    if (
      part[kind].length >= 200 ||
      bytes + cost + (part[kind].length ? 1 : 0) > MAX_BACKUP
    ) {
      parts.push(part);
      part = { upserts: [], deletes: [] };
      bytes = textBytes(part);
    }
    bytes += cost + (part[kind].length ? 1 : 0);
    // The branch preserves the correlation between array key and element type.
    if (kind === "upserts")
      part.upserts.push(value as HistoryPart["upserts"][number]);
    else part.deletes.push(value as string);
  };
  changes.upserts.forEach((r) => append("upserts", r));
  changes.deletes.forEach((id) => append("deletes", id));
  if (part.upserts.length || part.deletes.length || !parts.length)
    parts.push(part);
  // Ledger parts share the immutable upload manifest and byte/record budgets.
  for (const key of ["coachingUpserts", "coachingDeletes"] as const) {
    for (const value of changes[key] ?? []) {
      let tail = parts[parts.length - 1];
      const current = tail[key] ?? [];
      const candidate = { ...tail, [key]: [...current, value] };
      if (current.length >= 200 || textBytes(candidate) > MAX_BACKUP) {
        tail = { upserts: [], deletes: [] };
        parts.push(tail);
      }
      if (key === "coachingUpserts")
        (tail.coachingUpserts ??= []).push(
          value as NonNullable<HistoryPart["coachingUpserts"]>[number],
        );
      else (tail.coachingDeletes ??= []).push(value as string);
    }
  }
  if (parts.length > 1024) throw Error("Too many history transfer parts.");
  return parts;
}

// Persist this immutable plan before sending it. Retrying must reuse its ID,
// base revision and exact contents, even if newer local edits have appeared.
export function prepareHistoryMutation(
  base: State,
  next: State,
  revision: number,
  id = crypto.randomUUID(),
): HistoryMutation {
  storageBaseRevision.parse(revision);
  z.uuid().parse(id);
  const header = storageHeader.parse(headerOf(next));
  const delta = historyDelta(base, next);
  for (const r of delta.upserts) validateHistoryRecord(r.session, header);
  const parts = partitionHistory(delta).map((p) => storagePart.parse(p));
  return {
    id,
    revision,
    header,
    count: next.sessions.length,
    parts,
    ...(base.coachingEvents || next.coachingEvents
      ? { coachingCount: next.coachingEvents?.length ?? 0 }
      : {}),
  };
}

export async function writeHistoryMutation(
  api: HistoryRequest,
  mutation: HistoryMutation,
) {
  const { parts, ...plan } = mutation;
  const direct = { ...plan, changes: parts[0] };
  const check = (result: unknown) => {
    const ack = ackSchema.parse(result);
    if (ack.revision !== mutation.revision + 1)
      throw Error("Invalid history acknowledgement.");
    return ack;
  };
  if (parts.length === 1 && textBytes(direct) <= MAX_BACKUP)
    return check(await api("/storage/commit", "POST", direct));
  const checksum = await storageHash(await Promise.all(parts.map(storageHash)));
  const begin = await api<{ id?: string; revision?: number }>(
    "/storage/uploads",
    "POST",
    { ...plan, parts: parts.length, checksum },
  );
  if (begin.revision !== undefined) return check(begin);
  if (begin.id !== mutation.id)
    throw Error("Invalid history upload acknowledgement.");
  for (let i = 0; i < parts.length; i++)
    await api(`/storage/uploads/${mutation.id}/parts/${i}`, "PUT", parts[i]);
  return check(await api(`/storage/uploads/${mutation.id}/commit`, "POST", {}));
}

export async function historyChanged(api: HistoryRequest, revision: number) {
  return ackSchema.parse(await api("/storage/revision")).revision !== revision;
}

export async function readHistory(
  api: HistoryRequest,
): Promise<{ revision: number; data: State }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const head = headSchema.parse(await api("/storage/head"));
      const sessions: State["sessions"] = [],
        ids = new Set<string>();
      let after = -1;
      while (true) {
        const raw = await api(
          `/storage/history?revision=${head.revision}&after=${after}`,
        );
        if (textBytes(raw) > MAX_BACKUP)
          throw Error("History page exceeds the transfer limit.");
        const page = pageSchema.parse(raw);
        for (const r of page.records) {
          if (
            r.position !== sessions.length ||
            ids.has(r.session.id) ||
            sessions.length >= head.count
          )
            throw Error("Invalid history ordering or duplicate workout.");
          validateHistoryRecord(r.session, head.header);
          sessions.push(r.session);
          ids.add(r.session.id);
        }
        if (page.next === null) break;
        if (
          !page.records.length ||
          page.next !== page.records[page.records.length - 1].position ||
          page.next <= after
        )
          throw Error("History cursor did not advance correctly.");
        after = page.next;
      }
      if (sessions.length !== head.count)
        throw Error("Incomplete workout history.");
      const events: CoachingEvent[] = [];
      if (head.coachingCount) {
        let cursor = -1;
        while (true) {
          const raw = await api(
            `/storage/coaching?revision=${head.revision}&after=${cursor}`,
          );
          if (textBytes(raw) > MAX_BACKUP)
            throw Error("Coaching page exceeds the transfer limit");
          const page = z
            .object({
              records: z
                .array(
                  z
                    .object({
                      position: z.number().int().min(0).max(99999),
                      event: coachingEventSchema,
                    })
                    .strict(),
                )
                .max(32),
              next: z.number().int().min(0).max(99999).nullable(),
            })
            .strict()
            .parse(raw);
          for (const row of page.records) {
            if (
              row.position !== events.length ||
              events.some((e) => e.id === row.event.id) ||
              events.length >= head.coachingCount
            )
              throw Error("Invalid coaching ordering or duplicate record");
            events.push(row.event);
          }
          if (page.next === null) break;
          if (
            !page.records.length ||
            page.next !== page.records.at(-1)!.position ||
            page.next <= cursor
          )
            throw Error("Coaching cursor did not advance");
          cursor = page.next;
        }
        if (events.length !== head.coachingCount)
          throw Error("Incomplete coaching history");
      }
      return {
        revision: head.revision,
        data: historyStateSchema.parse({
          ...head.header,
          sessions,
          ...(events.length ? { coachingEvents: events } : {}),
        }),
      };
    } catch (e) {
      if ((e as { status?: number }).status !== 409 || attempt === 2) throw e;
    }
  }
  throw Error("History changed repeatedly. Retry when connected.");
}
