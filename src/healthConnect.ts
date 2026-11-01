import { useEffect, useSyncExternalStore } from "react";
import { Native, isAndroid, type HealthControls } from "./native";
import { healthDeadline } from "./healthOperation";
import { useStore } from "./store";
import {
  normalizeHealthSnapshot,
  type HealthSnapshot,
  type HealthKind,
} from "./healthConnectPolicy";

type View = {
  snapshot: HealthSnapshot | null;
  message: string;
  busy: boolean;
  availability: string;
  permissions: HealthKind[];
  controls?: HealthControls;
  backgroundSupported?: boolean;
  backgroundGranted?: boolean;
};
const empty: View = {
  snapshot: null,
  message: "Not connected.",
  busy: false,
  availability: "unknown",
  permissions: [],
};
let view = empty,
  owner: string | null = null,
  generation = 0;
let operation = 0;
const stopNativeHealth = () => {
  void Native.healthCancel().catch(() => {});
};
export function cancelHealthOperation() {
  operation++;
  stopNativeHealth();
  publish({
    busy: false,
    message:
      "Connection stopped. You can review permissions or try syncing again. Existing workout data is unchanged.",
  });
}
let profileBinding: Promise<void> = Promise.resolve();
function bindNativeProfile(profile: string | null) {
  profileBinding = profileBinding
    .catch(() => {})
    .then(() => Native.bindProfile({ profile }));
  return profileBinding;
}
const listeners = new Set<() => void>();
const publish = (patch: Partial<View>) => {
  view = { ...view, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useHealthState() {
  const user = useStore().user;
  const state = useSyncExternalStore(
    subscribe,
    () => view,
    () => empty,
  );
  return user?.accessMode === "workspace-profiles" &&
    user.profileId === "sharma" &&
    user.aiAccess === true &&
    owner === "sharma"
    ? state
    : empty;
}
export async function healthOperation(
  op:
    | "connect"
    | "sync"
    | "disconnect"
    | "delete"
    | "settings"
    | "background"
    | "stop-background"
    | "auto-on"
    | "auto-off",
  sources?: HealthSnapshot["sources"],
) {
  if (!isAndroid() || owner !== "sharma") return;
  const at = generation;
  const selectedOperation = ++operation;
  const current = () => at === generation && selectedOperation === operation;
  publish({
    busy: true,
    message:
      op === "connect"
        ? "Opening Android health permissions…"
        : op === "sync"
          ? "Preparing Health Connect sync…"
          : "Updating connection…",
  });
  try {
    if (["background", "stop-background", "auto-on", "auto-off"].includes(op)) {
      if (op === "background")
        await healthDeadline(
          Native.healthEnableBackground(),
          120000,
          stopNativeHealth,
        );
      else if (op === "stop-background")
        await healthDeadline(Native.healthDisableBackground(), 10000);
      else
        await healthDeadline(
          Native.healthPreferences({ autoReduce: op === "auto-on" }),
          10000,
        );
      const status = await healthDeadline(Native.healthStatus(), 15000);
      if (current())
        publish({
          ...status,
          message:
            op === "background"
              ? "Background imports enabled. Android may delay scheduled work."
              : "Health preferences saved on this phone.",
        });
      return;
    }
    if (op === "settings") {
      await healthDeadline(Native.openHealthSettings(), 10000);
      return;
    }
    if (op === "disconnect" || op === "delete") {
      if (op === "disconnect")
        await healthDeadline(
          Native.healthDisconnect(),
          30000,
          stopNativeHealth,
        );
      else await healthDeadline(Native.healthDelete(), 10000, stopNativeHealth);
      if (current())
        publish({
          snapshot: null,
          controls: {},
          ...(op === "disconnect" ? { permissions: [] } : {}),
          message:
            op === "disconnect"
              ? "Disconnected. Imported data deleted from this phone."
              : "Imported data deleted. Connect again to import; source apps are unchanged.",
        });
      return;
    }
    if (op === "connect")
      await healthDeadline(Native.healthConnect(), 120000, stopNativeHealth);
    if (!current()) return;
    publish({ message: "Checking granted health permissions…" });
    const status = await healthDeadline(
      Native.healthStatus(),
      15000,
      stopNativeHealth,
    );
    if (!current()) return;
    publish(status);
    publish({ message: "Importing available records from Health Connect…" });
    const result = sources
      ? await healthDeadline(
          Native.healthSources({ sources }),
          10000,
          stopNativeHealth,
        )
      : await healthDeadline(Native.healthSync(), 60000, stopNativeHealth);
    const updatedStatus = await healthDeadline(
      Native.healthStatus(),
      15000,
      stopNativeHealth,
    );
    if (current())
      publish({
        ...updatedStatus,
        snapshot: normalizeHealthSnapshot(result.snapshot),
        message: "Saved privately on this phone. No cloud upload.",
      });
  } catch (error) {
    if (current()) {
      // Re-check permission visibility even when a sync was interrupted by revocation.
      try {
        const result = await healthDeadline(
          Native.healthSnapshot(),
          10000,
          stopNativeHealth,
        );
        if (current())
          publish({
            snapshot: result.snapshot
              ? { ...normalizeHealthSnapshot(result.snapshot), clipped: true }
              : null,
          });
      } catch {
        if (current()) publish({ snapshot: null });
      }
      if (current())
        publish({
          message:
            (error as { code?: string })?.code === "HEALTH_TIMEOUT"
              ? "Health Connect did not respond in time. The operation stopped; try Sync now again. Workout logging remains available."
              : (error as { code?: string })?.code?.startsWith("HEALTH_READ_")
                ? "Health Connect could not read " +
                  ({
                    HEALTH_READ_STEPS: "steps",
                    HEALTH_READ_SLEEP: "sleep",
                    HEALTH_READ_WEIGHT: "weight",
                    HEALTH_READ_NUTRITION: "nutrition",
                    HEALTH_READ_RESTING_HEART_RATE: "resting heart rate",
                    HEALTH_READ_HRV_RMSSD: "HRV (RMSSD)",
                    HEALTH_READ_RESPIRATORY_RATE: "respiratory rate",
                    HEALTH_READ_SKIN_TEMPERATURE: "skin temperature",
                  }[(error as { code: string }).code] ??
                    "a permitted data type") +
                  ". Review its permissions and try syncing again. Workout logging remains available."
                : "Health Connect could not update. Check permissions and source apps, then sync again. Workout logging remains available.",
        });
    }
  } finally {
    if (current()) publish({ busy: false });
  }
}
export function HealthLifecycle() {
  const { user, ready } = useStore();
  const profile =
    user?.accessMode === "workspace-profiles" &&
    (user.profileId !== "sharma" || user.aiAccess === true)
      ? user.profileId
      : null;
  useEffect(() => {
    if (!isAndroid() || !ready) return;
    const at = ++generation;
    owner = null;
    publish(empty);
    async function refresh() {
      try {
        await healthDeadline(
          bindNativeProfile(profile),
          15000,
          stopNativeHealth,
        );
        if (generation !== at || profile !== "sharma") return;
        owner = profile;
        const status = await healthDeadline(
          Native.healthStatus(),
          15000,
          stopNativeHealth,
        );
        if (generation !== at) return;
        const result = await healthDeadline(
          Native.healthSnapshot(),
          15000,
          stopNativeHealth,
        );
        if (generation !== at) return;
        publish({
          ...status,
          snapshot: result.snapshot
            ? normalizeHealthSnapshot(result.snapshot)
            : null,
          message: result.snapshot?.enabled
            ? "Connected on this phone."
            : "Not connected.",
        });
        if (result.snapshot?.enabled && status.availability === "available")
          await healthOperation("sync");
      } catch {
        if (generation === at)
          publish({
            ...empty,
            message: "Unlock Sharma online once to connect Health Connect.",
          });
      }
    }
    void refresh();
    const foreground = () => {
      if (!view.busy) void refresh();
    };
    window.addEventListener("neoform:foreground", foreground);
    return () => {
      ++generation;
      operation++;
      owner = null;
      publish(empty);
      window.removeEventListener("neoform:foreground", foreground);
      void bindNativeProfile(null).catch(() => {});
    };
  }, [profile, ready]);
  return null;
}
