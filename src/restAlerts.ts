import { useEffect, useSyncExternalStore } from "react";
import type { State } from "./domain";
import { request } from "./store";
type Device = {
  id: string;
  token: string;
  owner: string;
  version: number;
  allowed: boolean;
  enabled?: boolean;
  timerId?: string;
};
type Status = {
  available: boolean;
  enabled: boolean;
  armed: boolean;
  message: string;
  deviceId?: string;
};
let state: Status = {
    available: false,
    enabled: false,
    armed: false,
    message: "Background alerts not enabled.",
  },
  device: Device | undefined,
  owner: string | undefined,
  publicKey = "",
  desired = "",
  queue = Promise.resolve();
const listeners = new Set<() => void>();
const publish = (patch: Partial<Status>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("neoform-rest-device", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function readDevice() {
  const database = await db();
  try {
    return await new Promise<Device | undefined>((resolve, reject) => {
      const r = database.transaction("kv").objectStore("kv").get("active");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    database.close();
  }
}
async function writeDevice(value: Device) {
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = database.transaction("kv", "readwrite");
      t.objectStore("kv").put(value, "active");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    database.close();
  }
}
export function claimRestTimer(id: string) {
  localStorage.setItem("neoform:rest-owned", id);
}
export function useRestAlertState() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
    () => state,
  );
}
async function load(activeOwner: string) {
  const previous = device;
  owner = activeOwner;
  desired = "";
  device = undefined;
  publish({
    available: false,
    enabled: false,
    armed: false,
    message: "Checking notification support…",
    deviceId: undefined,
  });
  try {
    if (previous && previous.owner !== activeOwner) {
      previous.allowed = false;
      await writeDevice({ ...previous });
    }
    const config = await request<{ enabled: boolean; publicKey?: string }>(
        "/rest-alerts/config",
      ),
      stored = await readDevice();
    if (owner !== activeOwner) return;
    publicKey = config.publicKey ?? "";
    if (
      config.enabled &&
      stored?.enabled === true &&
      stored?.owner === activeOwner &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    )
      device = stored;
    const available =
      config.enabled &&
      "PushManager" in window &&
      "serviceWorker" in navigator &&
      typeof Notification !== "undefined";
    publish({
      available,
      enabled: !!device,
      deviceId: device?.id,
      message: available
        ? device
          ? "Background alerts enabled on this device."
          : "Enable to receive rest alerts on your lock screen."
        : "Background alerts unavailable. Foreground timer remains available.",
    });
  } catch {
    if (owner === activeOwner)
      publish({
        message:
          "Background alerts unavailable. Foreground timer remains available.",
      });
  }
}
async function operation(
  op: "schedule" | "cancel" | "disable",
  timerId?: string,
  delaySeconds?: number,
) {
  const current = device;
  if (!current || current.owner !== owner) return;
  const signature = desired;
  current.version = Math.max(Date.now(), current.version + 1);
  current.allowed = op === "schedule";
  current.timerId = timerId;
  const version = current.version;
  await writeDevice({ ...current });
  publish({ armed: false });
  if (!navigator.onLine) {
    publish({
      message:
        "Offline: background alert is not armed. Foreground timer still works.",
    });
    return;
  }
  try {
    await request(
      `/rest-alerts/devices/${current.id}/${op}`,
      "POST",
      { version, ...(op === "schedule" ? { timerId, delaySeconds } : {}) },
      { headers: { "X-Rest-Device-Token": current.token } },
    );
    if (device !== current || signature !== desired) return;
    publish({
      armed: op === "schedule",
      message:
        op === "schedule"
          ? "Lock-screen alert armed on this device."
          : "No background rest alert armed.",
    });
  } catch (e) {
    if ((e as Error & { status?: number }).status === 410)
      publish({ enabled: false });
    if (device === current && signature === desired)
      publish({
        armed: false,
        message: (e as Error).message + " Foreground timing remains available.",
      });
  }
}
export function useRestAlerts(timer: State["timer"], activeOwner?: string) {
  const status = useRestAlertState();
  const [onlineVersion] = useSyncExternalStoreEvent();
  useEffect(() => {
    if (activeOwner) void load(activeOwner);
    else {
      if (device) {
        device.allowed = false;
        void writeDevice({ ...device }).catch(() => {});
      }
      owner = undefined;
      device = undefined;
      publish({ enabled: false, armed: false, deviceId: undefined });
    }
  }, [activeOwner]);
  useEffect(() => {
    if (!device || device.owner !== activeOwner || !status.enabled) return;
    const own =
        timer?.id && timer.id === localStorage.getItem("neoform:rest-owned"),
      seconds =
        timer && !timer.paused
          ? Math.ceil((timer.endAt - Date.now()) / 1000)
          : 0;
    const next = own && seconds > 0 ? `${timer!.id}:${timer!.endAt}` : "cancel";
    if (next === desired) return;
    desired = next;
    const id = timer?.id,
      deadline = timer?.endAt ?? 0;
    queue = queue
      .catch(() => {})
      .then(() =>
        desired === next
          ? operation(
              next === "cancel" || deadline <= Date.now()
                ? "cancel"
                : "schedule",
              id,
              Math.max(
                1,
                Math.min(3600, Math.ceil((deadline - Date.now()) / 1000)),
              ),
            )
          : undefined,
      )
      .catch(() =>
        publish({
          armed: false,
          message:
            "Device notification storage unavailable. Foreground timer still works.",
        }),
      );
  }, [
    timer?.id,
    timer?.endAt,
    timer?.paused,
    activeOwner,
    status.deviceId,
    status.enabled,
    onlineVersion,
  ]);
  return status;
}
// Online events retry only the latest timer state, never a queue of old alarms.
let networkVersion = 0;
const networkListeners = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("online", () => {
    desired = "";
    networkVersion++;
    networkListeners.forEach((fn) => fn());
  });
function useSyncExternalStoreEvent() {
  const value = useSyncExternalStore(
    (fn) => {
      networkListeners.add(fn);
      return () => {
        networkListeners.delete(fn);
      };
    },
    () => networkVersion,
    () => networkVersion,
  );
  return [value, undefined] as const;
}
export async function enableRestAlerts() {
  if (!owner || !state.available)
    throw Error(
      "Install NEOFORM on a supported device and connect to the internet first.",
    );
  const selectedOwner = owner;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    publish({
      message:
        "Notifications are not allowed. Change this in iPhone Settings to enable lock-screen alerts.",
    });
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(
    atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  if (owner !== selectedOwner)
    throw Error("Workspace changed. Enable notifications again.");
  const existing = await readDevice();
  const next: Device =
    existing?.owner === selectedOwner
      ? existing
      : {
          id: crypto.randomUUID(),
          token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
            n.toString(16).padStart(2, "0"),
          ).join(""),
          owner: selectedOwner,
          version: 0,
          allowed: false,
        };
  await request(
    `/rest-alerts/devices/${next.id}/register`,
    "POST",
    { subscription: subscription.toJSON() },
    { headers: { "X-Rest-Device-Token": next.token } },
  );
  next.enabled = true;
  next.allowed = false;
  device = next;
  desired = "";
  await writeDevice(next);
  publish({
    enabled: true,
    deviceId: next.id,
    message:
      "Notifications enabled. Send a test notification to check your iPhone settings.",
  });
}
export async function testRestAlert() {
  desired = "test:" + Date.now();
  await operation("schedule", "test-" + crypto.randomUUID(), 1);
}
export async function disableRestAlerts() {
  desired = "disabled";
  await operation("disable");
  if (device) {
    device.allowed = false;
    device.enabled = false;
    await writeDevice(device);
  }
  device = undefined;
  publish({
    enabled: false,
    armed: false,
    deviceId: undefined,
    message: "Rest notifications disabled on this device.",
  });
}
export async function cancelRestAlertForSwitch() {
  desired = "profile-lock";
  await queue.catch(() => {});
  await operation("cancel");
}
