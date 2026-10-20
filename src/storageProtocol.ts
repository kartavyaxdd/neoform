import { z } from "zod";
import {
  catalog,
  sessionSchema,
  stateHeaderSchema,
  MAX_STATE_BYTES,
  MAX_BACKUP,
  type State,
  type Session,
} from "./domain";
export const storageId = z.string().min(1).max(100);
export const storageRevision = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const storageBaseRevision = storageRevision.max(
  Number.MAX_SAFE_INTEGER - 1,
);
export const storageHeader = stateHeaderSchema.refine(
  (h) => new TextEncoder().encode(JSON.stringify(h)).length <= MAX_STATE_BYTES,
  "A single metadata record exceeds the storage row limit.",
);
export type StateHeader = Omit<State, "sessions">;
export const storagePart = z
  .object({
    upserts: z
      .array(
        z
          .object({
            position: z.number().int().min(0).max(50000),
            session: sessionSchema,
          })
          .strict(),
      )
      .max(200),
    deletes: z.array(storageId).max(200),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = [...p.upserts.map((r) => r.session.id), ...p.deletes];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate history mutation IDs.",
      });
    if (new Set(p.upserts.map((r) => r.position)).size !== p.upserts.length)
      ctx.addIssue({ code: "custom", message: "Duplicate history positions." });
    if (textBytes(p) > MAX_BACKUP)
      ctx.addIssue({
        code: "custom",
        message: "History part exceeds the transfer limit.",
      });
  });
export type HistoryPart = z.infer<typeof storagePart>;
const plan = {
  id: z.uuid(),
  revision: storageBaseRevision,
  header: storageHeader,
  count: z.number().int().min(0).max(50000),
};
export const storageCommit = z
  .object({ ...plan, changes: storagePart })
  .strict();
export const storageUpload = z
  .object({
    ...plan,
    parts: z.number().int().min(1).max(1024),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type StorageCommit = z.infer<typeof storageCommit>;
export type StorageUpload = z.infer<typeof storageUpload>;
export const textBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
// Schema parsing may reorder object keys. Hash the JSON value, preserving array
// order, so a valid parsed part has the same digest on client and Worker.
export const storageHash = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(value, (_key, v) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? Object.fromEntries(
                  Object.keys(v)
                    .sort()
                    .map((key) => [key, v[key]]),
                )
              : v,
          ),
        ),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export function headerOf(state: State): StateHeader {
  const { sessions: _, ...head } = state;
  return head;
}
export function validateHistoryRecord(session: Session, header: StateHeader) {
  const ids = new Set([...catalog, ...header.customExercises].map((x) => x.id));
  const entries = session.exercises.map((e) => e.id),
    sets = session.exercises.flatMap((e) => e.sets.map((s) => s.id));
  if (
    new Set(entries).size !== entries.length ||
    new Set(sets).size !== sets.length
  )
    throw Error("Duplicate entry or set IDs.");
  if (session.exercises.some((e) => !ids.has(e.exerciseId)))
    throw Error("Unknown exercise reference.");
  if (textBytes(session) > MAX_STATE_BYTES)
    throw Error("A single workout exceeds the storage row limit.");
}
export function historyDelta(base: State, next: State): HistoryPart {
  const prior = new Map(
    base.sessions.map((session, position) => [
      session.id,
      { session, position },
    ]),
  );
  const nextIds = new Set(next.sessions.map((s) => s.id));
  return {
    upserts: next.sessions.flatMap((session, position) => {
      const old = prior.get(session.id);
      return !old ||
        old.position !== position ||
        old.session !== session && JSON.stringify(old.session) !== JSON.stringify(session)
        ? [{ position, session }]
        : [];
    }),
    deletes: base.sessions.filter((s) => !nextIds.has(s.id)).map((s) => s.id),
  };
}
