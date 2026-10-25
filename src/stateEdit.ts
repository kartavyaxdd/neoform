import { produce, freeze } from "immer";
import { coachingEventSchema } from "./coachingTypes";
import { sessionSchema, type State } from "./domain";
import {
  headerOf,
  storageHeader,
  validateHistoryRecord,
} from "./storageProtocol";
export function editState(base: State, fn: (data: State) => State): State {
  const edited = produce(base, (draft) => fn(draft as State));
  const next =
    base.minimumClientVersion === 2 && edited.minimumClientVersion !== 2
      ? { ...edited, minimumClientVersion: 2 as const }
      : edited;
  const header = storageHeader.parse(headerOf(next));
  if (
    next.sessions !== base.sessions ||
    next.draft?.scheduleOccurrenceId !== base.draft?.scheduleOccurrenceId
  ) {
    const links = [
      ...next.sessions,
      ...(next.draft ? [next.draft] : []),
    ].flatMap((s) => (s.scheduleOccurrenceId ? [s.scheduleOccurrenceId] : []));
    if (new Set(links).size !== links.length)
      throw Error("A planned occurrence can link to only one workout.");
  }
  let sessions = next.sessions;
  const removed = base.customExercises.some(
    (e) => !header.customExercises.some((n) => n.id === e.id),
  );
  const planningChanged =
    next.schedule !== base.schedule ||
    next.minimumClientVersion !== base.minimumClientVersion;
  if (sessions !== base.sessions || removed || planningChanged) {
    if (
      sessions.length > 50000 ||
      new Set(sessions.map((s) => s.id)).size !== sessions.length
    )
      throw Error("Invalid or duplicated workout history.");
    const previous = new Map(base.sessions.map((s) => [s.id, s]));
    sessions = sessions.map((s) => {
      if (previous.get(s.id) === s && !removed && !planningChanged) return s;
      const record = sessionSchema.parse(s);
      validateHistoryRecord(record, header);
      return record;
    });
  }
  let events = next.coachingEvents;
  if (events && events !== base.coachingEvents) {
    if (
      events.length > 100000 ||
      new Set(events.map((e) => e.id)).size !== events.length
    )
      throw Error("Invalid coaching ledger");
    const before = new Map((base.coachingEvents ?? []).map((e) => [e.id, e]));
    events = events.map((e) =>
      before.get(e.id) === e ? e : coachingEventSchema.parse(e),
    );
  }
  return freeze(
    { ...header, sessions, ...(events ? { coachingEvents: events } : {}) },
    true,
  ) as State;
}
