import { produce, freeze } from "immer";
import { sessionSchema, type State } from "./domain";
import {
  headerOf,
  storageHeader,
  validateHistoryRecord,
} from "./storageProtocol";
export function editState(base: State, fn: (data: State) => State): State {
  const next = produce(base, (draft) => fn(draft as State));
  const header = storageHeader.parse(headerOf(next));
  let sessions = next.sessions;
  const removed = base.customExercises.some(
    (e) => !header.customExercises.some((n) => n.id === e.id),
  );
  if (sessions !== base.sessions || removed) {
    if (
      sessions.length > 50000 ||
      new Set(sessions.map((s) => s.id)).size !== sessions.length
    )
      throw Error("Invalid or duplicated workout history.");
    const previous = new Map(base.sessions.map((s) => [s.id, s]));
    sessions = sessions.map((s) => {
      if (previous.get(s.id) === s && !removed) return s;
      const record = sessionSchema.parse(s);
      validateHistoryRecord(record, header);
      return record;
    });
  }
  return freeze({ ...header, sessions }, true) as State;
}
