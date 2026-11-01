import { registerPlugin } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { isAndroid } from "./native";
import { deviceSaveAcknowledged } from "./store";
import { Button } from "./ui";
import {
  runAndroidUpdate,
  type UpdatePhase,
  type UpdateRelease,
} from "./appUpdates";

const updates = registerPlugin<{
  status(): Promise<{ version: string; versionCode: number }>;
  check(): Promise<UpdateRelease>;
  download(): Promise<UpdateRelease>;
  install(): Promise<void>;
  cancel(): Promise<void>;
}>("AppUpdates");

export function AppUpdatePanel() {
  const android = isAndroid();
  const [installed, setInstalled] = useState(""),
    [phase, setPhase] = useState<UpdatePhase | null>(null),
    [message, setMessage] = useState("");
  const active = useRef(false),
    running = useRef(false);
  useEffect(() => {
    if (!android) return;
    active.current = true;
    let mounted = true;
    void (async () => {
      try {
        const v = await updates.status();
        if (mounted && v.version)
          setInstalled(`${v.version} (${v.versionCode})`);
      } catch {
        if (mounted)
          setMessage("Update checking is unavailable in this build.");
      }
    })();
    return () => {
      active.current = false;
      mounted = false;
      if (running.current) void updates.cancel().catch(() => {});
    };
  }, [android]);
  if (!android) return null;
  return (
    <section
      className="panel preference-group"
      aria-label="App updates"
      aria-busy={!!phase}
    >
      <div className="preference-content">
        <h3>App updates</h3>
        {installed && <p>Version {installed}</p>}
        <Button
          disabled={!!phase}
          onClick={async () => {
            if (running.current) return;
            running.current = true;
            setMessage("");
            try {
              const result = await runAndroidUpdate({
                native: updates,
                phase: setPhase,
                active: () => active.current,
                saved: () => deviceSaveAcknowledged() !== false,
              });
              if (active.current)
                setMessage(
                  result.status === "latest"
                    ? "You’re up to date."
                    : result.status === "installer-opened"
                      ? "Confirm the update in Android. Your app data stays in place."
                      : "Update cancelled.",
                );
            } catch (e) {
              if (active.current)
                setMessage(
                  e instanceof Error
                    ? e.message
                    : "Could not check for updates. Try again.",
                );
            } finally {
              running.current = false;
              if (active.current) setPhase(null);
            }
          }}
        >
          {phase === "checking"
            ? "Checking…"
            : phase === "downloading"
              ? "Downloading update…"
              : phase === "installing"
                ? "Opening Android installer…"
                : "Check for updates"}
        </Button>
        <p role="status" aria-live="polite">
          {message ||
            "Downloads updates from NEOFORM. Android asks you to confirm installation."}
        </p>
      </div>
    </section>
  );
}
