import { useSyncExternalStore } from "react";
import {
  emptyState,
  stateSchema,
  historyStateSchema,
  uid,
  type State,
} from "./domain";
import {
  acknowledge,
  receiveRemote,
  mergeThreeWay,
  type Outbox,
  type Remote,
} from "./syncPolicy";
import { editState } from "./stateEdit";
import { OfflineVault, type JournalAck } from "./offlineVault";
import { MutationQueue } from "./mutationQueue";
import {
  readHistory,
  historyChanged,
  prepareHistoryMutation,
  writeHistoryMutation,
  type HistoryMutation,
} from "./historyTransport";
type User =
  | {
      id: string;
      email: string;
      accessMode?: "single-user-local";
      kind?: never;
      storageFormat?: 2;
    }
  | {
      id: string;
      kind: "workspace";
      accessMode: "workspace-profiles";
      profileId: string;
      profileName: string;
      email?: never;
      storageFormat: 2;
    }
  | {
      id: "public-workspace";
      kind: "workspace";
      accessMode: "public-workspace";
      email?: never;
      storageFormat?: 2;
    };
type Snapshot = {
  user: User | null;
  accessMode?: "single-user-local" | "public-workspace" | "workspace-profiles";
  box: Outbox;
  ready: boolean;
  status: string;
  error: string;
  conflict: Remote | null;
};
const freshBox = (): Outbox => ({
  data: emptyState(),
  revision: 0,
  dirty: false,
  generation: 0,
});
let current: Snapshot = {
  user: null,
  box: freshBox(),
  ready: false,
  status: "Loading",
  error: "",
  conflict: null,
};
const listeners = new Set<() => void>();
const accountRequests = new Set<AbortController>();
const tabId = uid();
let vault: OfflineVault | null = null,
  mutationQueue: MutationQueue | null = null;
let storageBlocked = false;
let resolving: object | null = null;
let diskBoxes = new Map<string, Outbox>(),
  diskAcks = new Map<string, number>();
let diskWrites: Promise<boolean> = Promise.resolve(false),
  durableGeneration = -1,
  diskStale = false;
let pendingSend: { mutation: HistoryMutation; sent: Outbox } | null = null;
const modern = () => current.user?.storageFormat === 2;
let tabConflict = false;
let acknowledgedJournalConflict = false;
let blockedJournals: Record<string, number> = {};
let activeSync: object | null = null,
  epoch = 0,
  accountBlocked = false;
let debounce: ReturnType<typeof setTimeout>;
const identityKey = "neoform:identity",
  profileModeKey = "neoform:profile-mode",
  signedOutKey = "neoform:signed-out";
function publish(p: Partial<Snapshot>) {
  current = { ...current, ...p };
  listeners.forEach((fn) => fn());
}
function invalidate() {
  epoch++;
  resolving = null;
  for (const controller of accountRequests) controller.abort();
  accountRequests.clear();
  activeSync = null;
  pendingSend = null;
  clearTimeout(debounce);
}
function accountChanged() {
  invalidate();
  accountBlocked = true;
  const error = current.box.dirty
    ? "Browser account changed. Export pending changes before clearing this device or sign back into the original account."
    : "Browser account changed. Sign in again to load this account.";
  publish(
    current.box.dirty
      ? { status: "Account changed · sync paused", error }
      : {
          user: null,
          box: freshBox(),
          conflict: null,
          ready: true,
          status: "Account changed · sign in again",
          error,
        },
  );
}
function observeAccount() {
  if (accountBlocked) return false;
  if (current.user) {
    try {
      const shared = JSON.parse(localStorage.getItem(identityKey) || "null");
      if (
        localStorage.getItem(signedOutKey) ||
        shared?.id !== current.user.id
      ) {
        accountChanged();
        return false;
      }
    } catch {
      accountChanged();
      return false;
    }
  }
  return true;
}
export const useStore = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
export async function request<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  options?: { signal?: AbortSignal; headers?: Record<string, string> },
): Promise<T> {
  if (
    ["public-workspace", "workspace-profiles"].includes(
      current.accessMode || "",
    ) &&
    (path.startsWith("/ai/") ||
      ["/login", "/register", "/logout", "/password", "/account"].includes(
        path,
      ))
  )
    throw new Error(
      "Private accounts, credentials and AI are unavailable in the public workspace.",
    );
  const bound = ![
      "/login",
      "/register",
      "/me",
      "/health",
      "/profiles",
      "/profiles/open",
    ].includes(path),
    requestEpoch = epoch;
  if (bound && !observeAccount())
    throw Object.assign(
      new Error(
        "Browser account changed. Export pending changes and sign in again.",
      ),
      { status: 412 },
    );
  const expected = bound ? current.user?.id : undefined;
  if (bound && !expected)
    throw Object.assign(
      new Error("Please sign in before accessing account data."),
      { status: 401 },
    );
  const controller = new AbortController();
  const abort = () => controller.abort(options?.signal?.reason);
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.signal?.aborted) abort();
  if (bound) accountRequests.add(controller);
  try {
    const res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(expected ? { "X-Neoform-Account": expected } : {}),
        ...options?.headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json()) as { error?: string };
    if (bound && (requestEpoch !== epoch || !observeAccount()))
      throw Object.assign(
        new Error("Browser account changed. Sign in again."),
        {
          status: 412,
        },
      );
    if (!res.ok)
      throw Object.assign(new Error(json.error || "Request failed"), {
        status: res.status,
        data: json,
      });
    return json as T;
  } finally {
    accountRequests.delete(controller);
    options?.signal?.removeEventListener("abort", abort);
  }
}
const key = (id: string) => "neoform:account:" + id;
const pendingPrefix = (id: string) => "neoform:pending:" + id + ":";
const journalAckKey = (journal: string, generation: number) =>
  `neoform:journal-ack:${journal}:${generation}`;
function persist() {
  if (modern() && vault && current.user && !accountBlocked) {
    const user = current.user,
      box = current.box,
      at = epoch,
      selectedVault = vault,
      slot = box.dirty ? pendingPrefix(user.id) + tabId : "cache";
    diskWrites = diskWrites
      .catch(() => false)
      .then(async () => {
        try {
          if (!(await selectedVault.save(user.id, slot, box))) return false;
          if (epoch === at && current.user?.id === user.id) {
            diskBoxes.set(slot, box);
            durableGeneration = Math.max(durableGeneration, box.generation);
            localStorage.setItem("neoform:v2-event", uid());
            if (
              current.box.generation === box.generation &&
              current.box.dirty &&
              current.status === "Saving on device"
            )
              publish({
                status: navigator.onLine
                  ? "Pending sync"
                  : "Offline · saved on device",
                error: "",
              });
          }
          return true;
        } catch {
          if (epoch === at)
            publish({
              status: "Not saved · kept in memory",
              error:
                "Device storage could not save this draft. Keep this tab open, export a backup or retry sync.",
            });
          return false;
        }
      });
    return false;
  }
  if (!current.user || accountBlocked) return false;
  let durable = false;
  try {
    const serialized = JSON.stringify(current.box);
    // A tab owns only its journal. Shared cache writes cannot erase another
    // tab's offline draft, even when storage events are delayed or absent.
    if (current.box.dirty) {
      localStorage.setItem(pendingPrefix(current.user.id) + tabId, serialized);
      durable = true;
    }
    localStorage.setItem(key(current.user.id), serialized);
    durable = true;
    if (!current.box.dirty)
      localStorage.removeItem(pendingPrefix(current.user.id) + tabId);
    localStorage.setItem(identityKey, JSON.stringify(current.user));
  } catch {
    if (!durable && !current.box.dirty && current.box.base)
      publish({
        status: navigator.onLine
          ? "Synced"
          : "Saved online · offline copy unavailable",
        error:
          "Device storage is full. Changes are saved online; the offline copy could not be updated.",
      });
    else if (!durable)
      publish({
        status: "Not saved · kept in memory",
        error:
          "Device storage is full. Export a backup; this draft cannot be preserved offline.",
      });
  }
  return durable;
}
function parseCache(serialized: string | null): Outbox | null {
  try {
    const box = JSON.parse(serialized || "null");
    if (
      box &&
      Number.isInteger(box.revision) &&
      box.revision >= 0 &&
      Number.isInteger(box.generation) &&
      box.generation >= 0 &&
      typeof box.dirty === "boolean"
    ) {
      box.data = historyStateSchema.parse(box.data);
      if (
        box.incorporated &&
        (typeof box.incorporated !== "object" ||
          Array.isArray(box.incorporated) ||
          Object.entries(box.incorporated).some(
            ([k, generation]) =>
              !k.startsWith("neoform:pending:") ||
              !Number.isSafeInteger(generation) ||
              Number(generation) < 0,
          ))
      )
        box.incorporated = undefined;
      if (
        box.acknowledgedJournals &&
        (typeof box.acknowledgedJournals !== "object" ||
          Array.isArray(box.acknowledgedJournals) ||
          Object.entries(box.acknowledgedJournals).some(
            ([k, g]) =>
              !k.startsWith("neoform:pending:") ||
              !Number.isSafeInteger(g) ||
              Number(g) < 0,
          ))
      )
        box.acknowledgedJournals = undefined;
      if (box.base?.revision === box.revision) {
        const parsed = historyStateSchema.safeParse(box.base.data);
        box.base = parsed.success
          ? { data: parsed.data, revision: box.revision }
          : undefined;
      } else box.base = undefined;
      // Legacy clean caches are known server snapshots; dirty ones have no safe base.
      if (!box.dirty)
        box.base = { data: structuredClone(box.data), revision: box.revision };
      return box;
    }
  } catch {
    /* corrupted cache must not poison server data */
  }
  return null;
}
function reconcileTabs(user: User, initial: Outbox | null): Outbox | null {
  let box = initial;
  tabConflict = false;
  acknowledgedJournalConflict = false;
  blockedJournals = {};
  for (const k of [
    ...new Set([
      ...Object.keys(localStorage),
      ...(user.storageFormat === 2 ? [...diskBoxes.keys()] : []),
    ]),
  ]
    .filter((k) => k.startsWith(pendingPrefix(user.id)))
    .sort()) {
    const pending =
      user.storageFormat === 2 && diskBoxes.has(k)
        ? diskBoxes.get(k)!
        : parseCache(localStorage.getItem(k));
    if (!pending?.dirty) continue;
    const ackRevision = Math.max(
      Number(localStorage.getItem(journalAckKey(k, pending.generation))),
      diskAcks.get(journalAckKey(k, pending.generation)) ?? 0,
    );
    if (
      ackRevision > 0 &&
      Number.isSafeInteger(ackRevision) &&
      (box?.acknowledgedJournals?.[k] ?? -1) < pending.generation
    ) {
      if (box && !box.dirty && box.revision >= ackRevision) {
        box = {
          ...box,
          incorporated: { ...box.incorporated, [k]: pending.generation },
          acknowledgedJournals: {
            ...box.acknowledgedJournals,
            [k]: pending.generation,
          },
        };
      } else {
        // A receipt alone cannot rebase dirty data. Fetch the actual remote
        // snapshot and ask for an explicit conflict choice before any PUT.
        tabConflict = true;
        acknowledgedJournalConflict = true;
        blockedJournals[k] = pending.generation;
      }
      continue;
    }
    if ((box?.incorporated?.[k] ?? -1) >= pending.generation) continue;
    const incorporate = (value: Outbox): Outbox => ({
      ...value,
      incorporated: Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(value.incorporated ?? {}),
            ...Object.keys(pending.incorporated ?? {}),
            k,
          ]),
        ].map((key) => [
          key,
          Math.max(
            value.incorporated?.[key] ?? -1,
            pending.incorporated?.[key] ?? -1,
            key === k ? pending.generation : -1,
          ),
        ]),
      ),
    });
    if (!box) {
      box = incorporate(pending);
      continue;
    }
    // The in-memory branch already contains this tab's earlier generations.
    // Its asynchronous disk journal may lag behind the next logger edit.
    if (
      user.storageFormat === 2 &&
      initial === current.box &&
      current.user?.id === user.id &&
      k === pendingPrefix(user.id) + tabId &&
      box.generation >= pending.generation
    ) {
      box = incorporate(box);
      continue;
    }
    if (JSON.stringify(box.data) === JSON.stringify(pending.data)) {
      box = incorporate(box);
      continue;
    }
    try {
      if (!pending.base) throw new Error("A pending tab has no common base.");
      const data = mergeThreeWay(pending.base.data, box.data, pending.data);
      if (JSON.stringify(data) !== JSON.stringify(box.data))
        box = { ...box, data, dirty: true, generation: box.generation + 1 };
      box = incorporate(box);
    } catch {
      // Leave every original journal intact; never auto-select a competing edit.
      tabConflict = true;
      blockedJournals[k] = pending.generation;
    }
  }
  return box;
}
function retireAcknowledgedJournals(sent: Outbox, revision: number) {
  // localStorage has no compare-and-delete transaction across tabs. Only an
  // owner may remove its own journal; persistent receipts suppress all others.
  for (const [journal, generation] of Object.entries(sent.incorporated ?? {})) {
    try {
      // Immutable per-generation receipt: stale shared-cache writers cannot
      // erase a different tab's server acknowledgement or discard decision.
      localStorage.setItem(
        journalAckKey(journal, generation),
        String(revision),
      );
      if (!current.user || journal !== pendingPrefix(current.user.id) + tabId)
        continue;
      const pending = parseCache(localStorage.getItem(journal));
      if (pending?.generation === generation) localStorage.removeItem(journal);
    } catch {
      /* Receipts remain in the cache; failure cannot erase newer work. */
    }
  }
}
function cached(user: User): Outbox | null {
  return reconcileTabs(
    user,
    (user.storageFormat === 2 ? diskBoxes.get("cache") : null) ||
      parseCache(localStorage.getItem(key(user.id))),
  );
}
function observeTabs() {
  if (!current.user || accountBlocked) return;
  const box = reconcileTabs(current.user, current.box);
  if (box)
    publish({
      box,
      ...(tabConflict
        ? {
            status: "Tab conflict · sync paused",
            error:
              "Competing tab changes are preserved on this device. Export pending copies before choosing a replacement.",
          }
        : {}),
    });
}
export function exportPendingCopies() {
  if (!current.user) return [];
  return [
    ...(current.box.dirty ? [current.box] : []),
    ...[...new Set([...Object.keys(localStorage), ...diskBoxes.keys()])]
      .filter((k) => k.startsWith(pendingPrefix(current.user!.id)))
      .map((k) => diskBoxes.get(k) || parseCache(localStorage.getItem(k)))
      .filter((box): box is Outbox => !!box?.dirty),
  ];
}
export function change(fn: (data: State) => State) {
  if (resolving || storageBlocked || !observeAccount() || !current.user)
    return false;
  observeTabs();
  if (tabConflict) return false;
  let data: ReturnType<typeof stateSchema.safeParse>;
  try {
    data = modern()
      ? { success: true, data: editState(current.box.data, fn) }
      : stateSchema.safeParse(fn(structuredClone(current.box.data)));
  } catch (e) {
    publish({ error: (e as Error).message });
    return false;
  }
  if (!data.success) {
    publish({ error: data.error.issues[0]?.message || "Invalid change" });
    return false;
  }
  publish({
    box: {
      ...current.box,
      data: data.data,
      dirty: true,
      generation: current.box.generation + 1,
    },
    status:
      modern() && vault
        ? "Saving on device"
        : navigator.onLine
          ? "Pending sync"
          : "Offline · saved on device",
    error: "",
  });
  const durable = persist();
  clearTimeout(debounce);
  debounce = setTimeout(() => void sync(), 450);
  return durable;
}
// A preview closes only after durable device persistence or a server ack.
// Failed transactions roll back when no newer edit occurred, so retry cannot
// insert a duplicate generated program. The caller retains its editable preview.
export async function saveChange(fn: (data: State) => State) {
  const before = current,
    saveEpoch = epoch;
  if (change(fn)) return true;
  const attempted = current.box;
  if (attempted === before.box) return false;
  if (modern() && vault) {
    await diskWrites;
    if (saveEpoch !== epoch) return false;
    if (durableGeneration >= attempted.generation) return true;
  }
  await sync();
  if (saveEpoch !== epoch) return false;
  if (
    !current.box.dirty &&
    current.box.base &&
    JSON.stringify(current.box.base.data) === JSON.stringify(attempted.data)
  )
    return true;
  if (current.box.generation === attempted.generation) {
    publish({
      box: before.box,
      status: "Not saved · preview kept",
      error:
        "Could not save on this device or online. Keep the preview, export it or retry.",
    });
  }
  return false;
}
function parseRemote(value: Remote): Remote {
  if (!Number.isInteger(value.revision) || value.revision < 0)
    throw new Error("Invalid server revision.");
  return {
    data: (modern() ? historyStateSchema : stateSchema).parse(value.data),
    revision: value.revision,
  };
}
async function refreshDisk(user: User) {
  if (!vault) return;
  const at = epoch,
    selectedVault = vault,
    boxes = new Map<string, Outbox>();
  for (const slot of await selectedVault.slots(user.id))
    if (slot === "cache" || slot.startsWith(pendingPrefix(user.id))) {
      const box = await selectedVault.load(user.id, slot);
      if (box) boxes.set(slot, box);
    }
  const acks = await selectedVault.acknowledgements(user.id);
  if (epoch !== at) return;
  diskBoxes = boxes;
  diskAcks = new Map(
    acks.map((a) => [journalAckKey(a.journal, a.generation), a.revision]),
  );
  diskStale = false;
}
async function openDevice(user: User, at = epoch) {
  if (user.storageFormat !== 2 || typeof indexedDB === "undefined") {
    if (epoch === at) {
      vault = null;
      mutationQueue = null;
      diskBoxes = new Map();
      diskAcks = new Map();
    }
    return;
  }
  const openedVault = await OfflineVault.open(),
    openedQueue = await MutationQueue.open();
  if (epoch !== at) {
    openedVault.close();
    openedQueue.close();
    return;
  }
  for (const k of Object.keys(localStorage).filter((k) =>
    k.startsWith(pendingPrefix(user.id)),
  )) {
    const box = parseCache(localStorage.getItem(k));
    if (box?.dirty) await openedVault.save(user.id, k, box);
  }
  const legacy = parseCache(localStorage.getItem(key(user.id)));
  if (legacy)
    await openedVault.save(
      user.id,
      legacy.dirty ? pendingPrefix(user.id) + "legacy-cache" : "cache",
      legacy,
    );
  const boxes = new Map<string, Outbox>();
  for (const slot of await openedVault.slots(user.id))
    if (slot === "cache" || slot.startsWith(pendingPrefix(user.id))) {
      const box = await openedVault.load(user.id, slot);
      if (box) boxes.set(slot, box);
    }
  const acks = await openedVault.acknowledgements(user.id);
  if (epoch !== at) {
    openedVault.close();
    openedQueue.close();
    return;
  }
  vault = openedVault;
  mutationQueue = openedQueue;
  diskBoxes = boxes;
  diskAcks = new Map(
    acks.map((a) => [journalAckKey(a.journal, a.generation), a.revision]),
  );
  durableGeneration = -1;
  diskStale = false;
}
function capturedApi(owner: string, at: number) {
  return async <T>(
    path: string,
    method?: string,
    body?: unknown,
  ): Promise<T> => {
    if (epoch !== at || current.user?.id !== owner || accountBlocked)
      throw Object.assign(
        Error(
          "Account changed; prepared changes remain with their original account.",
        ),
        { status: 412 },
      );
    return request<T>(path, method, body);
  };
}
const remoteData = () =>
  modern() ? readHistory(request) : request<Remote>("/data");
async function modernWrite(sent: Outbox) {
  const user = current.user!,
    owner = user.id,
    at = epoch,
    api = capturedApi(owner, at),
    selectedVault = vault,
    selectedQueue = mutationQueue;
  const check = () => {
    if (epoch !== at || current.user?.id !== owner)
      throw Object.assign(Error("Account changed."), { status: 412 });
  };
  if (!pendingSend && selectedQueue && selectedVault) {
    const queued = (await selectedQueue!.list(owner)).sort(
      (a, b) => a.revision - b.revision,
    );
    for (const mutation of queued) {
      const acknowledged = await selectedVault!.acknowledgedOperation(
        owner,
        mutation.id,
      );
      if (acknowledged) {
        await selectedQueue!.acknowledge(
          owner,
          mutation.id,
          acknowledged.revision,
        );
        await selectedVault!.remove(owner, "send:" + mutation.id);
        continue;
      }
      const saved = await selectedVault!.load(owner, "send:" + mutation.id);
      if (!saved)
        throw Error(
          "Pending cloud transaction needs recovery; export device copies before changing accounts.",
        );
      check();
      pendingSend = { mutation, sent: saved };
      break;
    }
  }
  if (!pendingSend && !sent.dirty) return null;
  if (!pendingSend) {
    let base = sent.base;
    if (!base) {
      const remote = await readHistory(api);
      if (remote.revision !== sent.revision)
        throw Object.assign(
          Error("Review cloud changes before replacing them."),
          { status: 409 },
        );
      base = remote;
    }
    const mutation = prepareHistoryMutation(
      base.data,
      sent.data,
      sent.revision,
    );
    if (selectedVault && selectedQueue) {
      await selectedVault!.save(owner, "send:" + mutation.id, sent);
      await selectedQueue!.stage(owner, mutation);
    }
    check();
    pendingSend = { mutation, sent };
  }
  check();
  const sending = pendingSend;
  const result = await writeHistoryMutation(api, sending.mutation);
  return { ...result, sent: sending.sent, id: sending.mutation.id };
}
export async function sync() {
  if (resolving) return;
  // Do not turn a known authentication failure into a transient "Retry sync"
  // action during background polling. Only confirmed initialize/login clears
  // the error and resumes the preserved outbox.
  if (
    storageBlocked ||
    (current.status === "Sign in again to sync" && current.error)
  )
    return;
  if (observeAccount() && !modern()) observeTabs();
  const needsJournalReview =
    tabConflict && (acknowledgedJournalConflict || modern());
  if (
    !observeAccount() ||
    activeSync ||
    !current.user ||
    current.conflict ||
    (tabConflict && !needsJournalReview && !modern()) ||
    !navigator.onLine
  )
    return;
  const token = {},
    syncEpoch = epoch;
  activeSync = token;
  const syncOwner = current.user.id,
    api = capturedApi(syncOwner, syncEpoch),
    isModern = modern();
  const fetchRemote = () =>
    isModern ? readHistory(api) : request<Remote>("/data");
  try {
    if (modern() && vault) {
      await diskWrites;
      if (diskStale) await refreshDisk(current.user);
      if (epoch !== syncEpoch) return;
      observeTabs();
    }
    if (needsJournalReview || (modern() && tabConflict)) {
      const remote = parseRemote(await fetchRemote());
      if (epoch !== syncEpoch) return;
      publish({
        conflict: { ...remote, incorporated: { ...blockedJournals } },
        status: "Conflict · review changes",
        error:
          "Another tab acknowledged or discarded earlier work. Review the actual cloud copy before reapplying local edits.",
      });
      return;
    }
    if (
      current.box.dirty ||
      (modern() &&
        mutationQueue &&
        (await mutationQueue.list(current.user.id)).length > 0)
    ) {
      let sent = current.box;
      publish({ status: "Syncing" });
      const result = modern()
        ? await modernWrite(sent)
        : await request<{ revision: number; sent?: Outbox; id?: string }>(
            "/data",
            "PUT",
            { data: sent.data, revision: sent.revision },
          );
      if (epoch !== syncEpoch) return;
      if (!result) {
        publish({ status: "Synced", error: "" });
        return;
      }
      if (result.sent) sent = result.sent;
      if (epoch !== syncEpoch) return;
      if (
        !Number.isInteger(result.revision) ||
        result.revision !== sent.revision + 1
      )
        throw new Error("Invalid server acknowledgement.");
      let acknowledged: Outbox = modern()
        ? {
            ...current.box,
            revision: Math.max(current.box.revision, result.revision),
            base:
              current.box.revision > result.revision
                ? current.box.base
                : { data: sent.data, revision: result.revision },
            dirty:
              current.box.revision > result.revision
                ? current.box.dirty
                : current.box.data !== sent.data,
          }
        : acknowledge(current.box, sent.generation, result.revision, sent.data);
      acknowledged.acknowledgedJournals = {
        ...acknowledged.acknowledgedJournals,
        ...sent.incorporated,
      };
      if (modern() && vault) {
        const owner = current.user.id,
          selectedVault = vault,
          selectedQueue = mutationQueue;
        const acks = Object.entries(sent.incorporated ?? {}).map(
          ([journal, generation]) => ({
            journal,
            generation,
            revision: result.revision,
          }),
        );
        await selectedVault.save(
          owner,
          acknowledged.dirty ? pendingPrefix(owner) + tabId : "cache",
          acknowledged,
          acks,
          result.id ? { id: result.id, revision: result.revision } : undefined,
        );
        if (epoch !== syncEpoch) return;
        // This operation's receipt is now durable. Mark its known journal
        // lineage before exposing receipts while asynchronous send cleanup
        // runs, so an intervening logger/timer edit is not rejected as a
        // foreign acknowledgement. Data and the eventual rebase stay intact.
        publish({
          box: {
            ...current.box,
            acknowledgedJournals: {
              ...current.box.acknowledgedJournals,
              ...sent.incorporated,
            },
          },
        });
        acks.forEach((a) =>
          diskAcks.set(journalAckKey(a.journal, a.generation), a.revision),
        );
        if (result.id && mutationQueue) {
          await selectedQueue!.acknowledge(owner, result.id, result.revision);
          await selectedVault.remove(owner, "send:" + result.id);
        }
        if (epoch !== syncEpoch) return;
        for (const a of acks)
          if (diskBoxes.get(a.journal)?.generation === a.generation)
            diskBoxes.delete(a.journal);
        diskBoxes.set(
          acknowledged.dirty ? pendingPrefix(owner) + tabId : "cache",
          acknowledged,
        );
        pendingSend = null;
      }
      if (epoch !== syncEpoch) return;
      if (modern())
        acknowledged = {
          ...current.box,
          revision: Math.max(current.box.revision, result.revision),
          base:
            current.box.revision > result.revision
              ? current.box.base
              : { data: sent.data, revision: result.revision },
          dirty:
            current.box.revision > result.revision
              ? current.box.dirty
              : current.box.data !== sent.data,
          acknowledgedJournals: {
            ...current.box.acknowledgedJournals,
            ...sent.incorporated,
          },
        };
      retireAcknowledgedJournals(sent, result.revision);
      publish({
        box: acknowledged,
        status: !navigator.onLine
          ? "Offline · saved on device"
          : acknowledged.dirty
            ? "Pending sync"
            : "Synced",
        error: "",
      });
      persist();
    } else {
      if (
        modern() &&
        current.box.base &&
        !(await historyChanged(api, current.box.revision))
      ) {
        if (epoch !== syncEpoch) return;
        publish({ status: "Synced", error: "" });
        return;
      }
      const remote = parseRemote(await fetchRemote());
      if (epoch !== syncEpoch) return;
      const next = receiveRemote(current.box, remote);
      publish(
        next.conflict
          ? { conflict: remote, status: "Conflict · review changes" }
          : {
              box: next.box,
              status: current.box.dirty ? "Pending sync" : "Synced",
              error: "",
            },
      );
      persist();
    }
  } catch (e) {
    if (epoch !== syncEpoch) return;
    const err = e as Error & { status?: number; data?: Remote };
    if (err.status === 412) accountChanged();
    else if (err.status === 409) {
      try {
        const conflict = parseRemote(
          modern() ? await readHistory(api) : err.data!,
        );
        if (epoch !== syncEpoch) return;
        publish({ conflict, status: "Conflict · review changes" });
      } catch {
        if (epoch !== syncEpoch) return;
        publish({
          status: "Sync paused",
          error:
            "Invalid server conflict response. Local changes are preserved.",
        });
      }
    } else
      publish({
        status:
          err.status === 401
            ? "Sign in again to sync"
            : "Offline / sync paused",
        error: err.message,
      });
  } finally {
    if (activeSync === token) {
      activeSync = null;
      if (
        current.box.dirty &&
        !current.conflict &&
        ["Synced", "Pending sync"].includes(current.status)
      )
        debounce = setTimeout(() => void sync(), 100);
    }
  }
}
export async function resolveConflict(choice: "remote" | "merge" | "local") {
  if (resolving || !observeAccount()) return;
  const before = current,
    owner = current.user!.id,
    at = epoch,
    selectedVault = vault,
    selectedQueue = mutationQueue;
  const alive = () => epoch === at && current.user?.id === owner;
  const remote = current.conflict;
  if (!remote) return;
  const resolution = {};
  resolving = resolution;
  const incorporated = {
    ...current.box.incorporated,
    ...remote.incorporated,
    [pendingPrefix(current.user!.id) + tabId]: current.box.generation,
  };
  const resolvedJournals = { ...current.box, incorporated };
  let data = remote.data;
  try {
    if (choice === "local") data = current.box.data;
    if (choice === "merge") {
      const base = current.box.base;
      if (!base || base.revision !== current.box.revision)
        throw new Error(
          "Cannot safely merge without a common base. Export both copies, then choose Use cloud or Replace cloud explicitly.",
        );
      data = mergeThreeWay(base.data, remote.data, current.box.data);
    }
    publish({
      box: {
        data,
        revision: remote.revision,
        base: structuredClone(remote),
        dirty: choice !== "remote",
        generation: current.box.generation + 1,
        incorporated,
        acknowledgedJournals:
          choice === "remote"
            ? { ...current.box.acknowledgedJournals, ...incorporated }
            : { ...current.box.acknowledgedJournals, ...remote.incorporated },
      },
      conflict: modern() ? remote : null,
      error: "",
      status: choice === "remote" ? "Synced" : "Pending sync",
    });
    persist();
    if (modern() && vault) {
      if (!(await diskWrites))
        throw Error(
          "Could not preserve this conflict choice on device. Export pending copies and retry.",
        );
      if (!alive()) return;
      for (const mutation of await selectedQueue!.list(owner)) {
        if (!alive()) return;
        await selectedQueue!.discard(owner, mutation.id, remote.revision);
        await selectedVault!.remove(owner, "send:" + mutation.id);
      }
      if (!alive()) return;
      pendingSend = null;
      if (choice === "remote") {
        const acks = Object.entries(incorporated).map(
          ([journal, generation]) => ({
            journal,
            generation,
            revision: remote.revision,
          }),
        );
        await selectedVault!.save(owner, "cache", current.box, acks);
        if (!alive()) return;
        diskStale = true;
      }
      tabConflict = false;
      acknowledgedJournalConflict = false;
    }
    if (choice === "remote")
      retireAcknowledgedJournals(resolvedJournals, remote.revision);
    publish({
      conflict: null,
      status: choice === "remote" ? "Synced" : "Pending sync",
    });
    if (resolving === resolution) resolving = null;
    void sync();
  } catch (e) {
    if (!alive()) return;
    publish({
      box: before.box,
      conflict: before.conflict,
      status: before.status,
      error: (e as Error).message,
    });
  } finally {
    if (resolving === resolution) resolving = null;
  }
}
export async function initialize(user?: User) {
  const explicitlySignedOut = !user && !!localStorage.getItem(signedOutKey);
  if (explicitlySignedOut && !navigator.onLine) {
    publish({
      user: null,
      box: freshBox(),
      ready: true,
      status: "Signed out",
      conflict: null,
    });
    return;
  }
  invalidate();
  const initEpoch = epoch;
  accountBlocked = false;
  storageBlocked = false;
  tabConflict = false;
  try {
    user = user || (await request<User>("/me"));
    if (epoch !== initEpoch) return;
    if (user.accessMode === "workspace-profiles")
      localStorage.setItem(profileModeKey, "1");
    else localStorage.removeItem(profileModeKey);
    // Probe safe identity metadata even after an older authenticated-mode logout.
    // Never re-open an ordinary cookie account against an explicit sign-out.
    if (
      explicitlySignedOut &&
      user.accessMode !== "single-user-local" &&
      user.accessMode !== "public-workspace" &&
      user.accessMode !== "workspace-profiles"
    )
      throw Object.assign(new Error("Signed out"), { status: 401 });
    if (
      !user?.id ||
      (user.accessMode === "public-workspace"
        ? user.id !== "public-workspace" ||
          user.kind !== "workspace" ||
          "email" in user
        : user.accessMode === "workspace-profiles"
          ? user.kind !== "workspace" ||
            !user.profileId ||
            !user.profileName ||
            user.storageFormat !== 2 ||
            (user.id !== "public-workspace" &&
              user.id !== `workspace-profile:${user.profileId}`)
          : !user.email)
    )
      throw new Error("Invalid account identity.");
    try {
      await openDevice(user, initEpoch);
    } catch {
      if (epoch !== initEpoch) return;
      vault = null;
      mutationQueue = null;
      storageBlocked = true;
      localStorage.setItem(identityKey, JSON.stringify(user));
      publish({
        user,
        accessMode: user.accessMode,
        box: freshBox(),
        ready: true,
        status: "Device storage needs recovery",
        error:
          "Could not open existing device data. Keep other tabs and backups; retry opening the app before making changes.",
        conflict: null,
      });
      return;
    }
    if (epoch !== initEpoch) return;
    const cache = cached(user);
    localStorage.removeItem(signedOutKey);
    localStorage.setItem(identityKey, JSON.stringify(user));
    publish({
      user,
      accessMode: user.accessMode,
      box: cache || freshBox(),
      ready: !(user.storageFormat === 2 && navigator.onLine),
      error: "",
      conflict: null,
    });
    persist();
    if (tabConflict) observeTabs();
    await sync();
    if (epoch === initEpoch) publish({ ready: true });
  } catch (e) {
    if (epoch !== initEpoch) return;
    const err = e as Error & {
      status?: number;
      data?: { accessMode?: "single-user-local" | "workspace-profiles" };
    };
    if (err.data?.accessMode === "single-user-local") {
      publish({
        user: null,
        accessMode: "single-user-local",
        ready: true,
        status: "Local setup required",
        error: err.message,
        conflict: null,
      });
      return;
    }
    if (err.data?.accessMode === "workspace-profiles") {
      localStorage.setItem(profileModeKey, "1");
      publish({
        user: null,
        accessMode: "workspace-profiles",
        box: freshBox(),
        ready: true,
        status: "Choose profile",
        error: "",
        conflict: null,
      });
      return;
    }
    if (!err.status && !localStorage.getItem(signedOutKey)) {
      try {
        const identity = JSON.parse(
          localStorage.getItem(identityKey) || "null",
        );
        const validIdentity =
          identity?.accessMode === "public-workspace"
            ? identity.id === "public-workspace" &&
              identity.kind === "workspace" &&
              !("email" in identity)
            : identity?.accessMode === "workspace-profiles"
              ? identity.kind === "workspace" &&
                identity.profileId &&
                (identity.id === "public-workspace" ||
                  identity.id === `workspace-profile:${identity.profileId}`)
              : identity?.id && identity?.email;
        if (validIdentity) await openDevice(identity, initEpoch);
        if (epoch !== initEpoch) return;
        const cache = validIdentity && cached(identity);
        if (cache) {
          publish({
            user: identity,
            accessMode: identity.accessMode,
            box: cache,
            ready: true,
            error: "",
            conflict: null,
            status: "Offline · saved on device",
          });
          if (tabConflict) observeTabs();
          return;
        }
      } catch {
        /* absent cache */
      }
    }
    publish({
      user: null,
      box: freshBox(),
      ready: true,
      status: "Signed out",
      accessMode: localStorage.getItem(profileModeKey)
        ? "workspace-profiles"
        : undefined,
      conflict: null,
      error: "",
    });
  }
}
export async function login(
  mode: "login" | "register",
  email: string,
  password: string,
) {
  const loginEpoch = epoch;
  const user = await request<User>("/" + mode, "POST", { email, password });
  if (epoch === loginEpoch) await initialize(user);
}
export async function openProfile(id: string, password?: string) {
  const at = epoch;
  const user = await request<User>("/profiles/open", "POST", {
    id,
    ...(password === undefined ? {} : { password }),
  });
  if (at === epoch) await initialize(user);
}
export async function lockProfile(beforeLock?: () => Promise<void>) {
  if (current.accessMode !== "workspace-profiles") return;
  await sync();
  if (current.box.dirty || current.conflict)
    throw Error("Sync or export pending changes before switching profiles.");
  const at = epoch;
  await beforeLock?.();
  if (at !== epoch) return;
  if (current.box.dirty || current.conflict)
    throw Error(
      "New changes are still syncing. Try switching profiles again after sync finishes.",
    );
  await request("/profiles/lock", "POST", {});
  await diskWrites;
  if (at !== epoch) return;
  if (current.box.dirty || current.conflict)
    throw Error(
      "New edits were preserved while locking. Reload and unlock this profile to finish syncing before switching.",
    );
  const owner = current.user!.id,
    selectedVault = vault,
    selectedQueue = mutationQueue,
    writes = diskWrites;
  invalidate();
  localStorage.removeItem(identityKey);
  localStorage.removeItem(key(owner));
  localStorage.setItem(signedOutKey, "1");
  publish({
    user: null,
    box: freshBox(),
    ready: true,
    status: "Choose profile",
    error: "",
    conflict: null,
    accessMode: "workspace-profiles",
  });
  await writes;
  await selectedVault?.clearOwner(owner, true);
  await selectedQueue?.clearOwner(owner);
}
export async function logout() {
  if (current.accessMode === "public-workspace")
    throw new Error(
      "Sign-out is unavailable in the public workspace. Close this tab instead.",
    );
  if (current.user?.accessMode === "single-user-local")
    throw new Error(
      "Sign-out is disabled in single-user mode. Close this tab instead.",
    );
  if (current.box.dirty) {
    await sync();
    if (current.box.dirty)
      throw new Error(
        "Sync or export your pending changes before signing out.",
      );
  }
  const logoutEpoch = epoch;
  let failed = false;
  try {
    await request("/logout", "POST", {});
  } catch {
    failed = true;
  }
  // A delayed logout must never clear a newer login or another tab's cache.
  if (epoch === logoutEpoch) {
    if (current.box.dirty)
      throw new Error(
        "Sync or export your pending changes before signing out.",
      );
    await clearLocal(true);
    if (failed)
      publish({
        status: "Signed out on this device",
        error:
          "Local account data cleared. The server session could not be revoked; sign in again when online to manage it.",
      });
  }
}
export function clearLocal(preservePending = false) {
  const owner = current.user?.id,
    selectedVault = vault,
    selectedQueue = mutationQueue,
    priorWrites = diskWrites;
  invalidate();
  accountBlocked = false;
  for (const k of Object.keys(localStorage))
    if (k.startsWith("neoform:")) localStorage.removeItem(k);
  localStorage.setItem(signedOutKey, "1");
  publish({
    user: null,
    box: freshBox(),
    ready: true,
    status: "Signed out",
    error: "",
    conflict: null,
  });
  return (async () => {
    await priorWrites;
    if (owner) {
      await selectedVault?.clearOwner(owner, preservePending);
      await selectedQueue?.clearOwner(owner);
    }
  })();
}
window.addEventListener("storage", (event) => {
  const e = event as StorageEvent;
  if (e.storageArea && e.storageArea !== localStorage) return;
  if (e.key === null || e.key === identityKey || e.key === signedOutKey) {
    if (current.user) observeAccount();
    else accountChanged();
  } else if (
    current.user &&
    (e.key === "neoform:v2-event" ||
      e.key === key(current.user.id) ||
      e.key?.startsWith(pendingPrefix(current.user.id)))
  ) {
    if (observeAccount()) {
      if (modern()) {
        diskStale = true;
        void sync();
      } else observeTabs();
    }
  }
});
window.addEventListener("online", () => void sync());
window.addEventListener("offline", () => {
  if (!accountBlocked && current.user)
    publish({
      status:
        modern() &&
        vault &&
        current.box.dirty &&
        durableGeneration < current.box.generation
          ? "Saving on device"
          : "Offline · saved on device",
    });
});
window.addEventListener("focus", () => void sync());
setInterval(() => {
  if (typeof document === "undefined" || document.visibilityState !== "hidden")
    void sync();
}, 15000);
void initialize();
