import { useSyncExternalStore } from "react";
import { emptyState, stateSchema, type State } from "./domain";
import {
  acknowledge,
  receiveRemote,
  mergeThreeWay,
  type Outbox,
  type Remote,
} from "./syncPolicy";

type User = { id: string; email: string };
type Snapshot = {
  user: User | null;
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
): Promise<T> {
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
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(expected ? { "X-Neoform-Account": expected } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { error?: string };
  if (bound && (requestEpoch !== epoch || !observeAccount()))
    throw Object.assign(new Error("Browser account changed. Sign in again."), {
      status: 412,
    });
  if (!res.ok)
    throw Object.assign(new Error(json.error || "Request failed"), {
      status: res.status,
      data: json,
    });
  return json as T;
}
const key = (id: string) => "neoform:account:" + id;
function persist() {
  if (!current.user || accountBlocked) return;
  try {
    localStorage.setItem(key(current.user.id), JSON.stringify(current.box));
    localStorage.setItem(identityKey, JSON.stringify(current.user));
  } catch {
    publish({
      error:
        "Device storage is full. Export a backup; this draft cannot be preserved offline.",
    });
  }
}
function cached(user: User): Outbox | null {
  try {
    const box = JSON.parse(localStorage.getItem(key(user.id)) || "null");
    if (
      box &&
      Number.isInteger(box.revision) &&
      box.revision >= 0 &&
      Number.isInteger(box.generation) &&
      box.generation >= 0 &&
      typeof box.dirty === "boolean"
    ) {
      box.data = stateSchema.parse(box.data);
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
export function change(fn: (data: State) => State) {
  if (!observeAccount() || !current.user) return false;
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
  persist();
  clearTimeout(debounce);
  debounce = setTimeout(() => void sync(), 450);
  return true;
}
function parseRemote(value: Remote): Remote {
  if (!Number.isInteger(value.revision) || value.revision < 0)
    throw new Error("Invalid server revision.");
  return { data: stateSchema.parse(value.data), revision: value.revision };
}
export async function sync() {
  if (
    !observeAccount() ||
    activeSync ||
    !current.user ||
    current.conflict ||
    !navigator.onLine
  )
    return;
  const token = {},
    syncEpoch = epoch;
  activeSync = token;
  try {
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
      },
      conflict: null,
      error: "",
      status: choice === "remote" ? "Synced" : "Pending sync",
    });
    persist();
    void sync();
  } catch (e) {
    publish({ error: (e as Error).message });
  }
}
export async function initialize(user?: User) {
  if (!user && localStorage.getItem(signedOutKey)) {
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
  try {
    user = user || (await request<User>("/me"));
    if (epoch !== initEpoch) return;
    if (!user?.id || !user.email) throw new Error("Invalid account identity.");
    const cache = cached(user);
    localStorage.removeItem(signedOutKey);
    publish({
      user,
      box: cache || freshBox(),
      ready: true,
      error: "",
      conflict: null,
    });
    persist();
    await sync();
  } catch (e) {
    if (epoch !== initEpoch) return;
    const err = e as Error & { status?: number };
    if (!err.status && !localStorage.getItem(signedOutKey)) {
      try {
        const identity = JSON.parse(
          localStorage.getItem(identityKey) || "null",
        );
        const cache = identity?.id && identity?.email && cached(identity);
        if (cache) {
          publish({
            user: identity,
            box: cache,
            ready: true,
            error: "",
            conflict: null,
            status: "Offline · saved on device",
          });
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
