import { useState as useLocalState } from "react";
import {
  useRestAlertState,
  enableRestAlerts,
  testRestAlert,
  disableRestAlerts,
  claimRestTimer,
} from "./restAlerts";
import { unlockFeedbackAudio } from "./feedbackAudio";
import { uid } from "./domain";
import { useEffect, useState } from "react";
import { useStore, change } from "./store";
import { Button } from "./ui";
export function TimerSheet() {
  const alerts = useRestAlertState(),
    [error, setError] = useLocalState("");
  const timer = useStore().box.data.timer,
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timer || timer.paused) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [timer]);
  const seconds = timer
    ? timer.paused
      ? timer.remaining
      : Math.max(0, Math.ceil((timer.endAt - now) / 1000))
    : 0;
  function adjust(delta: number) {
    unlockFeedbackAudio();
    const id = timer?.id ?? uid();
    claimRestTimer(id);
    change((s) => {
      if (!s.timer) return s;
      const current = s.timer.paused
        ? s.timer.remaining
        : Math.max(0, Math.ceil((s.timer.endAt - Date.now()) / 1000));
      const remaining = Math.max(0, Math.min(3600, current + delta));
      return {
        ...s,
        timer: {
          ...s.timer,
          id,
          remaining,
          endAt: Date.now() + remaining * 1000,
        },
      };
    });
    setNow(Date.now());
  }
  return (
    <div className="timer-sheet">
      <p className="timer-value" role="timer" aria-label="Rest remaining">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </p>
      <p className="caption">
        Rest until you are ready for another controlled set.
      </p>
      <section className="rest-notifications">
        <p role="status">{alerts.message}</p>
        {error && <p role="alert">{error}</p>}
        <div className="actions wrap">
          {!alerts.enabled && (
            <Button
              disabled={!alerts.available}
              onClick={() =>
                void enableRestAlerts().catch((e) => setError(e.message))
              }
            >
              Enable rest notifications
            </Button>
          )}
          {alerts.enabled && (
            <>
              <Button
                disabled={!!timer && !timer.paused && seconds > 0}
                onClick={() =>
                  void testRestAlert().catch((e) => setError(e.message))
                }
              >
                Send test notification
              </Button>
              <Button
                onClick={() =>
                  void disableRestAlerts().catch((e) => setError(e.message))
                }
              >
                Disable notifications
              </Button>
            </>
          )}
        </div>
        <p className="caption">
          iPhone: open from the Home Screen. Delivery and sound depend on
          permission, Focus and connectivity. Foreground timing remains
          available offline.
        </p>
      </section>
      {timer ? (
        <>
          <div className="actions">
            <Button onClick={() => adjust(-30)}>−30 seconds</Button>
            <Button onClick={() => adjust(30)}>+30 seconds</Button>
          </div>
          <div className="actions">
            <Button
              onClick={() => {
                unlockFeedbackAudio();
                const id = timer?.id ?? uid();
                claimRestTimer(id);
                change((s) =>
                  s.timer
                    ? {
                        ...s,
                        timer: {
                          ...s.timer,
                          id,
                          paused: !s.timer.paused,
                          remaining: seconds,
                          endAt: Date.now() + seconds * 1000,
                        },
                      }
                    : s,
                );
                setNow(Date.now());
              }}
            >
              {timer.paused ? "Resume timer" : "Pause timer"}
            </Button>
            <Button onClick={() => change((s) => ({ ...s, timer: null }))}>
              End timer
            </Button>
          </div>
        </>
      ) : (
        <p>No active rest timer.</p>
      )}
    </div>
  );
}
