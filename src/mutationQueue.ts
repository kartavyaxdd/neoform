import { z } from "zod";
import {
  storageHeader,
  storageId,
  storageRevision,
  storageBaseRevision,
  storagePart,
  storageHash,
  validateHistoryRecord,
} from "./storageProtocol";
import type { HistoryMutation } from "./historyTransport";

type StoredPlan = Omit<HistoryMutation, "parts"> & {
  owner: string;
  hashes: string[];
  fingerprint: string;
};
export type MutationReceipt = {
  owner: string;
  id: string;
  revision: number;
  fingerprint: string;
  discarded?: boolean;
};
const stores = ["plans", "parts", "receipts"];
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(r.error || Error("Device storage request failed."));
  });
const partRange = (owner: string, id: string) =>
  IDBKeyRange.bound([owner, id, 0], [owner, id, 1024]);
const ownerRange = (owner: string) =>
  IDBKeyRange.bound([owner, ""], [owner, "\uffff"]);

// This queue preserves exact cloud transactions. It is not yet the offline
// state/journal cache: the store integration must durably save drafts as well.
export class MutationQueue {
  private constructor(private db: IDBDatabase) {
    db.onversionchange = () => db.close();
  }
  static async open(name = "neoform-history-v1") {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      let rejected = false;
      r.onblocked = () => {
        rejected = true;
        reject(
          Error("Close older NEOFORM tabs to finish opening device storage."),
        );
      };
      r.onerror = () => reject(r.error || Error("Device storage unavailable."));
      r.onupgradeneeded = () => {
        r.result.createObjectStore("plans", { keyPath: ["owner", "id"] });
        r.result.createObjectStore("parts", {
          keyPath: ["owner", "id", "index"],
        });
        r.result.createObjectStore("receipts", { keyPath: ["owner", "id"] });
      };
      r.onsuccess = () => {
        if (rejected) r.result.close();
        else resolve(r.result);
      };
    });
    return new MutationQueue(db);
  }
  close() {
    this.db.close();
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (tx: IDBTransaction) => Promise<T>,
  ) {
    const tx = this.db.transaction(
      stores,
      mode,
      mode === "readwrite" ? { durability: "strict" } : {},
    );
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error || Error("Device storage transaction was aborted."));
    });
    // An asynchronous request may fail before action has returned. Observe the
    // transaction immediately, then propagate that same failure to the caller.
    void done.catch(() => {});
    try {
      // Only IndexedDB requests may be awaited inside action. Hashes and schema
      // work happen before opening the transaction so it cannot auto-commit.
      const result = await action(tx);
      await done;
      return result;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* Already completed or aborted. */
      }
      await done.catch(() => {});
      throw e;
    }
  }
  async stage(
    owner: string,
    mutation: HistoryMutation,
  ): Promise<MutationReceipt | null> {
    storageId.parse(owner);
    const header = storageHeader.parse(mutation.header),
      revision = storageBaseRevision.parse(mutation.revision);
    z.uuid().parse(mutation.id);
    z.number().int().min(0).max(50000).parse(mutation.count);
    z.number().int().min(1).max(1024).parse(mutation.parts.length);
    const parts = mutation.parts.map((p) => storagePart.parse(p));
    for (const p of parts)
      for (const r of p.upserts) validateHistoryRecord(r.session, header);
    const hashes = await Promise.all(parts.map(storageHash));
    const base = {
      id: mutation.id,
      revision,
      header,
      count: mutation.count,
      hashes,
    };
    const fingerprint = await storageHash(base);
    const plan: StoredPlan = { ...base, owner, fingerprint };
    return this.transaction("readwrite", async (tx) => {
      const receipts = tx.objectStore("receipts"),
        plans = tx.objectStore("plans");
      const prior = (await request(receipts.get([owner, plan.id]))) as
        MutationReceipt | undefined;
      if (prior) {
        if (prior.discarded)
          throw Error(
            "This transaction was explicitly discarded during conflict resolution.",
          );
        if (prior.fingerprint !== fingerprint)
          throw Error(
            "A completed transaction ID belongs to different changes.",
          );
        return prior;
      }
      const existing = (await request(plans.get([owner, plan.id]))) as
        StoredPlan | undefined;
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw Error("A pending transaction ID belongs to different changes.");
        return null;
      }
      plans.put(plan);
      parts.forEach((part, index) =>
        tx.objectStore("parts").put({ owner, id: plan.id, index, part }),
      );
      return null;
    });
  }
  async list(owner: string): Promise<HistoryMutation[]> {
    storageId.parse(owner);
    const rows = await this.transaction("readonly", async (tx) => {
      const plans = (await request(
        tx.objectStore("plans").getAll(ownerRange(owner)),
      )) as StoredPlan[];
      const result: {
        plan: StoredPlan;
        parts: { index: number; part: HistoryMutation["parts"][number] }[];
      }[] = [];
      for (const plan of plans) {
        const parts = await request(
          tx.objectStore("parts").getAll(partRange(owner, plan.id)),
        );
        result.push({ plan, parts });
      }
      return result;
    });
    const mutations: HistoryMutation[] = [];
    for (const { plan, parts } of rows) {
      if (parts.length !== plan.hashes.length)
        throw Error(
          "Incomplete device transaction. Keep this device copy and retry recovery.",
        );
      for (let i = 0; i < parts.length; i++) {
        if (
          parts[i].index !== i ||
          (await storageHash(parts[i].part)) !== plan.hashes[i]
        )
          throw Error("Device transaction checksum differs.");
      }
      const { owner: _, fingerprint, hashes, ...base } = plan;
      if ((await storageHash({ ...base, hashes })) !== fingerprint)
        throw Error("Device transaction metadata checksum differs.");
      mutations.push({ ...base, parts: parts.map((p) => p.part) });
    }
    return mutations;
  }
  async acknowledge(
    owner: string,
    id: string,
    revision: number,
  ): Promise<MutationReceipt> {
    storageId.parse(owner);
    z.uuid().parse(id);
    storageRevision.parse(revision);
    return this.transaction("readwrite", async (tx) => {
      const receipts = tx.objectStore("receipts"),
        plans = tx.objectStore("plans");
      const prior = (await request(receipts.get([owner, id]))) as
        MutationReceipt | undefined;
      if (prior) {
        if (prior.revision !== revision)
          throw Error("Conflicting transaction acknowledgement.");
        return prior;
      }
      const plan = (await request(plans.get([owner, id]))) as
        StoredPlan | undefined;
      if (!plan || revision !== plan.revision + 1)
        throw Error("Acknowledgement does not match a pending transaction.");
      const receipt = { owner, id, revision, fingerprint: plan.fingerprint };
      receipts.put(receipt);
      plans.delete([owner, id]);
      tx.objectStore("parts").delete(partRange(owner, id));
      return receipt;
    });
  }
  async clearOwner(owner: string) {
    storageId.parse(owner);
    await this.transaction("readwrite", async (tx) => {
      tx.objectStore("plans").delete(ownerRange(owner));
      tx.objectStore("receipts").delete(ownerRange(owner));
      tx.objectStore("parts").delete(
        IDBKeyRange.bound([owner, "", 0], [owner, "\uffff", 1024]),
      );
    });
  }
  async discard(owner: string, id: string, revision: number) {
    storageId.parse(owner);
    z.uuid().parse(id);
    storageRevision.parse(revision);
    return this.transaction("readwrite", async (tx) => {
      const plans = tx.objectStore("plans"),
        receipts = tx.objectStore("receipts");
      const prior = await request(receipts.get([owner, id]));
      if (prior) return;
      const plan = (await request(plans.get([owner, id]))) as
        StoredPlan | undefined;
      if (!plan) return;
      receipts.put({
        owner,
        id,
        revision,
        fingerprint: plan.fingerprint,
        discarded: true,
      });
      plans.delete([owner, id]);
      tx.objectStore("parts").delete(partRange(owner, id));
    });
  }
}
