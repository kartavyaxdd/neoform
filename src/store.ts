import { useSyncExternalStore } from "react";
import { emptyState, stateSchema, uid, type State } from "./domain";
import {
  acknowledge,
  receiveRemote,
  mergeThreeWay,
  type Outbox,
  type Remote,
} from "./syncPolicy";

type User = { id: string; email: string; accessMode?: "single-user-local"; kind?: never } |
  { id: "public-workspace"; kind: "workspace"; accessMode: "public-workspace"; email?: never };
type Snapshot = {
  user: User | null;
  accessMode?: "single-user-local" | "public-workspace";
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
let tabConflict = false;
let acknowledgedJournalConflict = false;
let blockedJournals: Record<string, number> = {};
let activeSync: object | null = null,
  epoch = 0,
  accountBlocked = false;
let debounce: ReturnType<typeof setTimeout>;
const identityKey = "neoform:identity",
  signedOutKey = "neoform:signed-out";
function publish(p: Partial<Snapshot>) {
  current = { ...current, ...p };
  listeners.forEach((fn) => fn());
}
function invalidate() {
  epoch++;
  for (const controller of accountRequests) controller.abort();
  accountRequests.clear();
  activeSync = null;
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
  if (current.accessMode === "public-workspace" &&
      (path.startsWith("/ai/") || ["/login", "/register", "/logout", "/password", "/account"].includes(path)))
    throw new Error("Private accounts, credentials and AI are unavailable in the public workspace.");
  const bound = !["/login", "/register", "/me", "/health"].includes(path),
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
        status: navigator.onLine ? "Synced" : "Saved online · offline copy unavailable",
        error: "Device storage is full. Changes are saved online; the offline copy could not be updated.",
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
      box.data = stateSchema.parse(box.data);
      if (box.incorporated &&
          (typeof box.incorporated !== "object" || Array.isArray(box.incorporated) ||
           Object.entries(box.incorporated).some(([k, generation]) =>
             !k.startsWith("neoform:pending:") || !Number.isSafeInteger(generation) || Number(generation) < 0)))
        box.incorporated = undefined;
      if (box.acknowledgedJournals &&
          (typeof box.acknowledgedJournals !== "object" || Array.isArray(box.acknowledgedJournals) ||
           Object.entries(box.acknowledgedJournals).some(([k,g]) =>
             !k.startsWith("neoform:pending:") || !Number.isSafeInteger(g) || Number(g) < 0)))
        box.acknowledgedJournals = undefined;
      if (box.base?.revision === box.revision) {
        const parsed = stateSchema.safeParse(box.base.data);
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
  for (const k of Object.keys(localStorage)
    .filter((k) => k.startsWith(pendingPrefix(user.id)))
    .sort()) {
    const pending = parseCache(localStorage.getItem(k));
    if (!pending?.dirty) continue;
    const ackRevision = Number(localStorage.getItem(journalAckKey(k, pending.generation)));
    if (ackRevision > 0 && Number.isSafeInteger(ackRevision) &&
        (box?.acknowledgedJournals?.[k] ?? -1) < pending.generation) {
      if (box && !box.dirty && box.revision >= ackRevision) {
        box = { ...box,
          incorporated: { ...box.incorporated, [k]: pending.generation },
          acknowledgedJournals: { ...box.acknowledgedJournals, [k]: pending.generation } };
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
        [...new Set([...Object.keys(value.incorporated ?? {}), ...Object.keys(pending.incorporated ?? {}), k])]
          .map(key => [key, Math.max(value.incorporated?.[key] ?? -1,
            pending.incorporated?.[key] ?? -1, key === k ? pending.generation : -1)]),
      ),
    });
    if (!box) {
      box = incorporate(pending);
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
      localStorage.setItem(journalAckKey(journal, generation), String(revision));
      if (!current.user || journal !== pendingPrefix(current.user.id) + tabId) continue;
      const pending = parseCache(localStorage.getItem(journal));
      if (pending?.generation === generation) localStorage.removeItem(journal);
    } catch { /* Receipts remain in the cache; failure cannot erase newer work. */ }
  }
}
function cached(user: User): Outbox | null {
  return reconcileTabs(user, parseCache(localStorage.getItem(key(user.id))));
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
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(pendingPrefix(current.user!.id)))
    .map((k) => parseCache(localStorage.getItem(k)))
    .filter((box): box is Outbox => !!box?.dirty);
}
export function change(fn: (data: State) => State) {
  if (!observeAccount() || !current.user) return false;
  observeTabs();
  if (tabConflict) return false;
  const data = stateSchema.safeParse(fn(structuredClone(current.box.data)));
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
    status: navigator.onLine ? "Pending sync" : "Offline · saved on device",
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
  return { data: stateSchema.parse(value.data), revision: value.revision };
}
export async function sync() {
  // Do not turn a known authentication failure into a transient "Retry sync"
  // action during background polling. Only confirmed initialize/login clears
  // the error and resumes the preserved outbox.
  if (current.status === "Sign in again to sync" && current.error) return;
  if (observeAccount()) observeTabs();
  const needsJournalReview = tabConflict && acknowledgedJournalConflict;
  if (
    !observeAccount() ||
    activeSync ||
    !current.user ||
    current.conflict ||
    (tabConflict && !needsJournalReview) ||
    !navigator.onLine
  )
    return;
  const token = {},
    syncEpoch = epoch;
  activeSync = token;
  try {
    if (needsJournalReview) {
      const remote = parseRemote(await request<Remote>("/data"));
      if (epoch !== syncEpoch) return;
      publish({ conflict: { ...remote, incorporated: { ...blockedJournals } },
        status: "Conflict · review changes",
        error: "Another tab acknowledged or discarded earlier work. Review the actual cloud copy before reapplying local edits." });
      return;
    }
    if (current.box.dirty) {
      const sent = current.box;
      publish({ status: "Syncing" });
      const result = await request<{ revision: number }>("/data", "PUT", {
        data: sent.data,
        revision: sent.revision,
      });
      if (epoch !== syncEpoch) return;
      if (
        !Number.isInteger(result.revision) ||
        result.revision !== sent.revision + 1
      )
        throw new Error("Invalid server acknowledgement.");
      const acknowledged = acknowledge(
        current.box,
        sent.generation,
        result.revision,
        sent.data,
      );
      acknowledged.acknowledgedJournals = { ...acknowledged.acknowledgedJournals,
        ...sent.incorporated };
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
      const remote = parseRemote(await request<Remote>("/data"));
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
        publish({
          conflict: parseRemote(err.data!),
          status: "Conflict · review changes",
        });
      } catch {
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
export function resolveConflict(choice: "remote" | "merge" | "local") {
  if (!observeAccount()) return;
  const remote = current.conflict;
  if (!remote) return;
  const incorporated = { ...current.box.incorporated, ...remote.incorporated,
    [pendingPrefix(current.user!.id) + tabId]: current.box.generation };
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
        acknowledgedJournals: choice === "remote"
          ? { ...current.box.acknowledgedJournals, ...incorporated }
          : { ...current.box.acknowledgedJournals, ...remote.incorporated },
      },
      conflict: null,
      error: "",
      status: choice === "remote" ? "Synced" : "Pending sync",
    });
    persist();
    if (choice === "remote") retireAcknowledgedJournals(resolvedJournals, remote.revision);
    void sync();
  } catch (e) {
    publish({ error: (e as Error).message });
  }
}
export async function initialize(user?: User) {
  const explicitlySignedOut = !user && !!localStorage.getItem(signedOutKey);
  if (explicitlySignedOut && !navigator.onLine) {
    publish({ user: null, box: freshBox(), ready: true, status: "Signed out", conflict: null });
    return;
  }
  invalidate();
  const initEpoch = epoch;
  accountBlocked = false;
  tabConflict = false;
  try {
    user = user || (await request<User>("/me"));
    if (epoch !== initEpoch) return;
    // Probe safe identity metadata even after an older authenticated-mode logout.
    // Never re-open an ordinary cookie account against an explicit sign-out.
    if (explicitlySignedOut && user.accessMode !== "single-user-local" && user.accessMode !== "public-workspace")
      throw Object.assign(new Error("Signed out"), { status: 401 });
    if (!user?.id || (user.accessMode === "public-workspace"
        ? user.id !== "public-workspace" || user.kind !== "workspace" || "email" in user
        : !user.email)) throw new Error("Invalid account identity.");
    const cache = cached(user);
    localStorage.removeItem(signedOutKey);
    publish({
      user,
      accessMode: user.accessMode,
      box: cache || freshBox(),
      ready: true,
      error: "",
      conflict: null,
    });
    persist();
    if (tabConflict) observeTabs();
    await sync();
  } catch (e) {
    if (epoch !== initEpoch) return;
    const err = e as Error & { status?: number; data?: { accessMode?: "single-user-local" } };
    if (err.data?.accessMode === "single-user-local") {
      publish({ user: null, accessMode: "single-user-local", ready: true,
        status: "Local setup required", error: err.message, conflict: null });
      return;
    }
    if (!err.status && !localStorage.getItem(signedOutKey)) {
      try {
        const identity = JSON.parse(
          localStorage.getItem(identityKey) || "null",
        );
        const validIdentity = identity?.accessMode === "public-workspace"
          ? identity.id === "public-workspace" && identity.kind === "workspace" && !("email" in identity)
          : identity?.id && identity?.email;
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
      accessMode: undefined,
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
export async function logout() {
  if (current.accessMode === "public-workspace")
    throw new Error("Sign-out is unavailable in the public workspace. Close this tab instead.");
  if (current.user?.accessMode === "single-user-local")
    throw new Error("Sign-out is disabled in single-user mode. Close this tab instead.");
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
    clearLocal();
    if (failed)
      publish({
        status: "Signed out on this device",
        error:
          "Local account data cleared. The server session could not be revoked; sign in again when online to manage it.",
      });
  }
}
export function clearLocal() {
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
}
window.addEventListener("storage", (event) => {
  const e = event as StorageEvent;
  if (e.storageArea && e.storageArea !== localStorage) return;
  if (e.key === null || e.key === identityKey || e.key === signedOutKey) {
    if (current.user) observeAccount();
    else accountChanged();
  } else if (
    current.user &&
    (e.key === key(current.user.id) ||
      e.key?.startsWith(pendingPrefix(current.user.id)))
  ) {
    if (observeAccount()) observeTabs();
  }
});
window.addEventListener("online", () => void sync());
window.addEventListener("offline", () => {
  if (!accountBlocked && current.user)
    publish({ status: "Offline · saved on device" });
});
window.addEventListener("focus", () => void sync());
setInterval(() => void sync(), 15000);
void initialize();
