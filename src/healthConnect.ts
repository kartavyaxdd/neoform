import { useEffect, useSyncExternalStore } from "react";
import { Native, isAndroid } from "./native";
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
  op: "connect" | "sync" | "disconnect" | "delete" | "settings",
  sources?: HealthSnapshot["sources"],
) {
  if (!isAndroid() || owner !== "sharma") return;
  const at = generation;
  publish({
    busy: true,
    message: op === "sync" ? "Syncing on this phone…" : "Updating connection…",
  });
  try {
    if (op === "settings") {
      await Native.openHealthSettings();
      return;
    }
    if (op === "disconnect" || op === "delete") {
      if (op === "disconnect") await Native.healthDisconnect();
      else await Native.healthDelete();
      if (at === generation)
        publish({
          snapshot: null,
          message:
            op === "disconnect"
              ? "Disconnected. Imported data deleted from this phone."
              : "Imported data deleted. Connect again to import; source apps are unchanged.",
        });
      return;
    }
    if (op === "connect") await Native.healthConnect();
    if (at !== generation) return;
    const status = await Native.healthStatus();
    if (at !== generation) return;
    publish(status);
    const result = sources
      ? await Native.healthSources({ sources })
      : await Native.healthSync();
    if (at === generation)
      publish({
        snapshot: normalizeHealthSnapshot(result.snapshot),
        message: "Saved privately on this phone. No cloud upload.",
      });
  } catch {
    if (at === generation) {
      // Re-check permission visibility even when a sync was interrupted by revocation.
      try {
        const result = await Native.healthSnapshot();
        if (at === generation)
          publish({
            snapshot: result.snapshot
              ? { ...normalizeHealthSnapshot(result.snapshot), clipped: true }
              : null,
          });
      } catch {
        if (at === generation) publish({ snapshot: null });
      }
      if (at === generation)
        publish({
          message:
            "Health Connect could not update. Check permissions and source apps, then sync again. Workout logging remains available.",
        });
    }
  } finally {
    if (at === generation) publish({ busy: false });
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
        await bindNativeProfile(profile);
        if (generation !== at || profile !== "sharma") return;
        owner = profile;
        const status = await Native.healthStatus();
        if (generation !== at) return;
        const result = await Native.healthSnapshot();
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
      owner = null;
      publish(empty);
      window.removeEventListener("neoform:foreground", foreground);
      void bindNativeProfile(null).catch(() => {});
    };
  }, [profile, ready]);
  return null;
}
