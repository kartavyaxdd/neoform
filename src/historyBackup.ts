import { z } from "zod";
import { coachingEventSchema, type CoachingEvent } from "./coachingTypes";
import {
  MAX_BACKUP,
  historyStateSchema,
  sessionSchema,
  importBackup,
  type State,
} from "./domain";
import {
  headerOf,
  storageHeader,
  storageHash,
  textBytes,
  validateHistoryRecord,
} from "./storageProtocol";
const legacyStartSchema = z
  .object({
    version: z.literal(2),
    header: storageHeader,
    count: z.number().int().min(0).max(50000),
  })
  .strict();
const startSchema = z.union([
  legacyStartSchema,
  legacyStartSchema
    .extend({
      version: z.literal(3),
      coachingCount: z.number().int().min(0).max(100000),
    })
    .strict(),
]);
const coachingRecordSchema = z
  .object({
    type: z.literal("coaching"),
    position: z.number().int().min(0).max(99999),
    event: coachingEventSchema,
  })
  .strict();
const recordSchema = z
  .object({
    type: z.literal("session"),
    position: z.number().int().min(0).max(49999),
    session: sessionSchema,
  })
  .strict();
const endSchema = z
  .object({
    type: z.literal("end"),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function exportHistoryBackup(data: State): Promise<Blob> {
  const header = startSchema.parse({
    version: data.coachingEvents?.length ? 3 : 2,
    header: headerOf(data),
    count: data.sessions.length,
    ...(data.coachingEvents?.length
      ? { coachingCount: data.coachingEvents.length }
      : {}),
  });
  const pieces: BlobPart[] = [JSON.stringify(header) + "\n"],
    hashes = [await storageHash(header)];
  for (let i = 0; i < data.sessions.length; i++) {
    const session = data.sessions[i];
    validateHistoryRecord(session, header.header);
    const row = { type: "session", position: i, session };
    if (textBytes(row) > MAX_BACKUP)
      throw Error("A workout exceeds the backup record limit.");
    pieces.push(JSON.stringify(row) + "\n");
    hashes.push(await storageHash(row));
  }
  for (
    let position = 0;
    position < (data.coachingEvents?.length ?? 0);
    position++
  ) {
    const row = coachingRecordSchema.parse({
      type: "coaching",
      position,
      event: data.coachingEvents![position],
    });
    if (textBytes(row) > MAX_BACKUP)
      throw Error("Coaching record exceeds the backup budget");
    pieces.push(JSON.stringify(row) + "\n");
    hashes.push(await storageHash(row));
  }
  pieces.push(
    JSON.stringify({ type: "end", checksum: await storageHash(hashes) }) + "\n",
  );
  return new Blob(pieces, { type: "application/x-ndjson" });
}
async function* lines(blob: Blob) {
  const reader = blob.stream().getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  try {
    while (true) {
      const r = await reader.read();
      buffer += r.done
        ? decoder.decode()
        : decoder.decode(r.value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        if (new TextEncoder().encode(line).length > MAX_BACKUP)
          throw Error("Backup record exceeds 2 MB.");
        yield line;
      }
      if (new TextEncoder().encode(buffer).length > MAX_BACKUP)
        throw Error("Backup record exceeds 2 MB.");
      if (r.done) {
        if (buffer.trim()) yield buffer;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function importHistoryBackup(blob: Blob): Promise<State> {
  if (blob.size <= MAX_BACKUP) {
    try {
      return importBackup(await blob.text());
    } catch {
      /* Try the version 2 streaming format. */
    }
  }
  let header: z.infer<typeof startSchema> | undefined,
    ended = false;
  const sessions: State["sessions"] = [],
    hashes: string[] = [],
    ids = new Set<string>();
  const events: CoachingEvent[] = [];
  const eventIds = new Set<string>();
  for await (const line of lines(blob)) {
    if (!line.trim()) continue;
    if (ended) throw Error("Unexpected data after backup checksum.");
    const raw = JSON.parse(line);
    if (!header) {
      header = startSchema.parse(raw);
      hashes.push(await storageHash(header));
      continue;
    }
    if (raw.type === "end") {
      const end = endSchema.parse(raw);
      if (
        sessions.length !== header.count ||
        events.length !== (header.version === 3 ? header.coachingCount : 0) ||
        end.checksum !== (await storageHash(hashes))
      )
        throw Error("Backup is incomplete or its checksum differs.");
      ended = true;
      continue;
    }
    if (raw.type === "coaching") {
      if (header.version !== 3 || sessions.length !== header.count)
        throw Error(
          "Coaching records require version 3 and complete workout records",
        );
      const row = coachingRecordSchema.parse(raw);
      if (
        row.position !== events.length ||
        events.length >= header.coachingCount ||
        eventIds.has(row.event.id)
      )
        throw Error("Invalid coaching record ordering or identity");
      events.push(row.event);
      eventIds.add(row.event.id);
      hashes.push(await storageHash(row));
      continue;
    }
    if (events.length)
      throw Error("Workout records cannot follow coaching records");
    const row = recordSchema.parse(raw);
    if (
      row.position !== sessions.length ||
      sessions.length >= header.count ||
      ids.has(row.session.id)
    )
      throw Error("Backup ordering or workout IDs are invalid.");
    validateHistoryRecord(row.session, header.header);
    sessions.push(row.session);
    ids.add(row.session.id);
    hashes.push(await storageHash(row));
  }
  if (!header || !ended)
    throw Error("Backup is incomplete: final checksum missing.");
  return historyStateSchema.parse({
    ...header.header,
    sessions,
    ...(events.length ? { coachingEvents: events } : {}),
  });
}
