import { historyStateSchema, type State } from "./domain";
import type { CoachingEvent } from "./coachingTypes";
import { headerOf, historyDelta, type StateHeader } from "./storageProtocol";
import type { Outbox } from "./syncPolicy";
type Meta = Omit<Outbox, "data" | "base"> & {
  token: string;
  owner: string;
  slot: string;
  data: StateHeader;
  dataCount: number;
  baseCount: number;
  dataCoachCount?: number;
  baseCoachCount?: number;
  base?: { revision: number; data: StateHeader };
};
export type JournalAck = {
  journal: string;
  generation: number;
  revision: number;
};
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const range = (owner: string, slot: string, kind?: string) =>
  IDBKeyRange.bound(
    [owner, slot, kind ?? "", ""],
    [owner, slot, kind ?? "\uffff", "\uffff"],
  );
export class OfflineVault {
  private prior = new Map<string, Outbox>();
  private tokens = new Map<string, string>();
  private constructor(private db: IDBDatabase) {
    db.onversionchange = () => db.close();
  }
  static async open(name = "neoform-state-v2") {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      let blocked = false;
      r.onblocked = () => {
        blocked = true;
        reject(Error("Close older app tabs to open device storage."));
      };
      r.onerror = () => reject(r.error);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("boxes", { keyPath: ["owner", "slot"] });
        r.result.createObjectStore("sessions", {
          keyPath: ["owner", "slot", "kind", "id"],
        });
        r.result.createObjectStore("acks", {
          keyPath: ["owner", "journal", "generation"],
        });
        r.result.createObjectStore("operations", { keyPath: ["owner", "id"] });
      };
      r.onsuccess = () => {
        if (blocked) r.result.close();
        else resolve(r.result);
      };
    });
    return new OfflineVault(db);
  }
  close() {
    this.db.close();
  }
  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (t: IDBTransaction) => Promise<T>,
  ) {
    const t = this.db.transaction(
      ["boxes", "sessions", "acks", "operations"],
      mode,
      { durability: "strict" },
    );
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error ?? Error("Device write aborted."));
    });
    void done.catch(() => {});
    try {
      const value = await fn(t);
      await done;
      return value;
    } catch (e) {
      try {
        t.abort();
      } catch {}
      await done.catch(() => {});
      throw e;
    }
  }
  async save(
    owner: string,
    slot: string,
    box: Outbox,
    acks: JournalAck[] = [],
    operation?: { id: string; revision: number },
  ) {
    const memoryKey = JSON.stringify([owner, slot]),
      before = this.prior.get(memoryKey),
      beforeToken = this.tokens.get(memoryKey);
    const changed = (a: State | undefined, b: State) =>
      a?.sessions === b.sessions
        ? { upserts: [], deletes: [] }
        : historyDelta(a ?? { ...b, sessions: [] }, b);
    // Hashing/serialization is done before opening the IDB transaction.
    const delta = changed(before?.data, box.data),
      baseDelta = box.base ? changed(before?.base?.data, box.base.data) : null;
    let wrote = false;
    const token = crypto.randomUUID();
    await this.tx("readwrite", async (t) => {
      const boxes = t.objectStore("boxes"),
        rows = t.objectStore("sessions"),
        ledger = t.objectStore("acks");
      const old = (await req(boxes.get([owner, slot]))) as Meta | undefined;
      const consumed = await req(ledger.get([owner, slot, box.generation]));
      const eligible =
        !(slot === "cache" && old && old.revision > box.revision) &&
        !(slot !== "cache" && old && old.generation > box.generation) &&
        !(consumed && box.dirty);
      if (eligible) {
        const reset = !before || !old || old.token !== beforeToken;
        if (reset) rows.delete(range(owner, slot));
        const initial = (state: State | undefined) =>
          state
            ? {
                upserts: state.sessions.map((session, position) => ({
                  session,
                  position,
                })),
                deletes: [],
              }
            : null;
        for (const [kind, d] of [
          ["data", reset ? initial(box.data) : delta],
          ["base", reset ? initial(box.base?.data) : baseDelta],
        ] as const) {
          if (!d) {
            rows.delete(range(owner, slot, kind));
            continue;
          }
          d.deletes.forEach((id) => rows.delete([owner, slot, kind, id]));
          d.upserts.forEach((r) =>
            rows.put({
              owner,
              slot,
              kind,
              id: r.session.id,
              position: r.position,
              session: r.session,
            }),
          );
        }
        for (const [kind, state, prior] of [
          ["data-coaching", box.data, before?.data],
          ["base-coaching", box.base?.data, before?.base?.data],
        ] as const) {
          if (reset || !state) rows.delete(range(owner, slot, kind));
          if (!state) continue;
          const oldEvents = new Map(
            (prior?.coachingEvents ?? []).map((event, position) => [
              event.id,
              { event, position },
            ]),
          );
          const ids = new Set((state.coachingEvents ?? []).map((e) => e.id));
          if (!reset)
            for (const id of oldEvents.keys())
              if (!ids.has(id)) rows.delete([owner, slot, kind, id]);
          (state.coachingEvents ?? []).forEach((event, position) => {
            const old = oldEvents.get(event.id);
            if (reset || old?.event !== event || old?.position !== position)
              rows.put({ owner, slot, kind, id: event.id, position, event });
          });
        }
        const { data, base, ...rest } = box;
        boxes.put({
          ...rest,
          token,
          owner,
          slot,
          data: headerOf(data),
          dataCount: data.sessions.length,
          baseCount: base?.data.sessions.length ?? 0,
          dataCoachCount: data.coachingEvents?.length ?? 0,
          baseCoachCount: base?.data.coachingEvents?.length ?? 0,
          ...(base
            ? { base: { revision: base.revision, data: headerOf(base.data) } }
            : {}),
        });
        wrote = true;
      }
      for (const ack of acks) {
        const existing = await req(
          ledger.get([owner, ack.journal, ack.generation]),
        );
        if (!existing) ledger.put({ owner, ...ack });
        const journal = (await req(boxes.get([owner, ack.journal]))) as
          Meta | undefined;
        if (journal?.generation === ack.generation && journal.dirty) {
          boxes.delete([owner, ack.journal]);
          rows.delete(range(owner, ack.journal));
        }
      }
      if (operation) t.objectStore("operations").put({ owner, ...operation });
    });
    if (wrote) {
      this.prior.set(memoryKey, box);
      this.tokens.set(memoryKey, token);
    }
    return wrote;
  }
  async load(owner: string, slot: string): Promise<Outbox | null> {
    let token = "";
    const box = await this.tx("readonly", async (t) => {
      const meta = (await req(t.objectStore("boxes").get([owner, slot]))) as
        Meta | undefined;
      if (!meta) return null;
      token = meta.token;
      const records = (await req(
        t.objectStore("sessions").getAll(range(owner, slot)),
      )) as {
        kind: string;
        position: number;
        session: State["sessions"][number];
        event?: CoachingEvent;
      }[];
      const sessions = (kind: string) =>
        records
          .filter((r) => r.kind === kind)
          .sort((a, b) => a.position - b.position)
          .map((r, i) => {
            if (r.position !== i)
              throw Error(
                "Incomplete device history. Export recovery copies before clearing storage.",
              );
            return r.session;
          });
      const events = (kind: string, count: number) => {
        const values = records
          .filter((r) => r.kind === kind)
          .sort((a, b) => a.position - b.position);
        if (
          values.length !== count ||
          values.some((r, i) => r.position !== i || !r.event)
        )
          throw Error(
            "Incomplete device coaching history. Keep recovery copies.",
          );
        return values.map((r) => r.event!);
      };
      const dataEvents = events("data-coaching", meta.dataCoachCount ?? 0),
        baseEvents = events("base-coaching", meta.baseCoachCount ?? 0);
      if (
        records.filter((r) => r.kind === "data").length !== meta.dataCount ||
        records.filter((r) => r.kind === "base").length !== meta.baseCount
      )
        throw Error("Incomplete device history. Keep recovery copies.");
      const {
        owner: _,
        token: _token,
        slot: __,
        dataCount: ___,
        baseCount: ____,
        dataCoachCount: _dataEvents,
        baseCoachCount: _baseEvents,
        data,
        base,
        ...rest
      } = meta;
      return {
        ...rest,
        data: historyStateSchema.parse({
          ...data,
          sessions: sessions("data"),
          ...(dataEvents.length ? { coachingEvents: dataEvents } : {}),
        }),
        ...(base
          ? {
              base: {
                revision: base.revision,
                data: historyStateSchema.parse({
                  ...base.data,
                  sessions: sessions("base"),
                  ...(baseEvents.length ? { coachingEvents: baseEvents } : {}),
                }),
              },
            }
          : {}),
      };
    });
    if (box) {
      this.prior.set(JSON.stringify([owner, slot]), box);
      this.tokens.set(JSON.stringify([owner, slot]), token);
    }
    return box;
  }
  async slots(owner: string): Promise<string[]> {
    return this.tx("readonly", async (t) =>
      (
        await req(
          t
            .objectStore("boxes")
            .getAllKeys(IDBKeyRange.bound([owner, ""], [owner, "\uffff"])),
        )
      ).map((k) => (k as string[])[1]),
    );
  }
  async acknowledgements(owner: string): Promise<JournalAck[]> {
    return this.tx(
      "readonly",
      async (t) =>
        await req(
          t
            .objectStore("acks")
            .getAll(
              IDBKeyRange.bound(
                [owner, "", 0],
                [owner, "\uffff", Number.MAX_SAFE_INTEGER],
              ),
            ),
        ),
    );
  }
  async acknowledgedOperation(
    owner: string,
    id: string,
  ): Promise<{ revision: number } | undefined> {
    return this.tx("readonly", (t) =>
      req(t.objectStore("operations").get([owner, id])),
    );
  }
  async remove(owner: string, slot: string) {
    await this.tx("readwrite", async (t) => {
      t.objectStore("boxes").delete([owner, slot]);
      t.objectStore("sessions").delete(range(owner, slot));
    });
    this.prior.delete(JSON.stringify([owner, slot]));
    this.tokens.delete(JSON.stringify([owner, slot]));
  }
  async clearOwner(owner: string, preservePending = false) {
    await this.tx("readwrite", async (t) => {
      if (preservePending) {
        const boxes = (await req(
          t
            .objectStore("boxes")
            .getAll(IDBKeyRange.bound([owner, ""], [owner, "\uffff"])),
        )) as Meta[];
        if (boxes.some((b) => b.dirty && b.slot.startsWith("neoform:pending:")))
          throw Error(
            "Other tab drafts are still pending. Sign in again to sync or export them before clearing this account cache.",
          );
      }
      t.objectStore("boxes").delete(
        IDBKeyRange.bound([owner, ""], [owner, "\uffff"]),
      );
      t.objectStore("sessions").delete(
        IDBKeyRange.bound(
          [owner, "", "", ""],
          [owner, "\uffff", "\uffff", "\uffff"],
        ),
      );
      t.objectStore("acks").delete(
        IDBKeyRange.bound(
          [owner, "", 0],
          [owner, "\uffff", Number.MAX_SAFE_INTEGER],
        ),
      );
      t.objectStore("operations").delete(
        IDBKeyRange.bound([owner, ""], [owner, "\uffff"]),
      );
    });
    this.prior.clear();
    this.tokens.clear();
  }
}
