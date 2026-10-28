// Presentation only. Durability and conflict resolution remain owned by store.ts.
export function persistencePresentation(
  status: string,
  deviceSaved: boolean | undefined,
  conflict: boolean,
) {
  if (
    conflict ||
    /not saved|unavailable|recovery|again|changed|conflict/i.test(status)
  )
    return { label: "Needs attention", tone: "attention", detail: status };
  if (
    status === "Saving on device" ||
    (deviceSaved === false &&
      (status === "Pending sync" || status.includes("saved on device")))
  )
    return { label: "Saving…", tone: "saving", detail: status };
  if (
    (deviceSaved === true &&
      /^(?:Offline|Pending sync|Syncing)/.test(status)) ||
    (deviceSaved === undefined &&
      (status === "Pending sync" || status.includes("saved on device")))
  )
    return { label: "Saved on device", tone: "device", detail: status };
  if (/paused/i.test(status))
    return { label: "Needs attention", tone: "attention", detail: status };
  return {
    label: status === "Syncing" ? "Syncing…" : status,
    tone: status === "Synced" ? "synced" : "saving",
    detail: status,
  };
}
