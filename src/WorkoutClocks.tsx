import { useState, useEffect, useRef } from "react";
import * as D from "./domain";
import { useStore, change } from "./store";
import { useRestAlerts } from "./restAlerts";
import { feedbackTone } from "./feedbackAudio";
import { isAndroid } from "./native";
import { CountdownArc } from "./CountdownArc";
import { Clock, Play, Pause, X } from "lucide-react";
const duration = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function useDisplayClock(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update();
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") update();
    }, 1000);
    window.addEventListener("neoform:foreground", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("neoform:foreground", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active]);
  return now;
}
export function WorkoutDuration({ startedAt }: { startedAt: number }) {
  const now = useDisplayClock(true);
  return (
    <span aria-label="Workout duration">
      {duration(Math.max(0, (now - startedAt) / 1000))}
    </span>
  );
}
export function CompactRestButton({ open }: { open: () => void }) {
  const s = useStore().box.data;
  useDisplayClock(!!s.timer && !s.timer.paused);
  const seconds = D.restRemaining(s.timer, Date.now());
  return (
    <button
      className="slim-rest"
      aria-label="Rest timer controls"
      aria-description={
        s.timer?.paused
          ? "Rest timer paused"
          : s.timer && seconds === 0
            ? "Rest timer finished. Start when ready."
            : "Rest time remaining"
      }
      data-paused={s.timer?.paused || undefined}
      onClick={() => open()}
    >
      {s.timer ? (
        <CountdownArc seconds={seconds} total={s.timer.remaining} />
      ) : (
        <Clock size={16} />
      )}
      {s.timer && !s.timer.paused && seconds === 0
        ? "Rest done"
        : duration(seconds)}
      {s.timer?.paused && <span aria-hidden="true">Ⅱ</span>}
    </button>
  );
}
export function RestFinishedBanner() {
  const s = useStore().box.data,
    tick = useDisplayClock(!!s.timer && !s.timer.paused);
  return s.timer && !s.timer.paused && tick >= s.timer.endAt ? (
    <div className="rest-finished-banner" role="status">
      <b>Rest finished</b>
      <span>Start when you’re ready.</span>
      <button
        className="btn"
        onClick={() => change((d) => ({ ...d, timer: null }))}
      >
        Ready
      </button>
    </div>
  ) : null;
}
export function RestAlertLifecycle() {
  const store = useStore(),
    s = store.box.data,
    tick = useDisplayClock(!!s.timer && !s.timer.paused);
  const seconds = D.restRemaining(s.timer, Date.now());
  const restAlerts = useRestAlerts(
    s.timer,
    store.user?.id,
    s.settings.timerSound,
  );
  const expiredSound = useRef(false);
  useEffect(() => {
    if (
      s.timer &&
      !s.timer.paused &&
      tick >= s.timer.endAt &&
      (!isAndroid() || restAlerts.available) &&
      !expiredSound.current
    ) {
      expiredSound.current = true;
      const delivered =
        restAlerts.deliveredTimerId === s.timer.id &&
        restAlerts.deliveredDeadline === s.timer.endAt;
      if (
        s.settings.timerSound &&
        !delivered &&
        (!restAlerts.armed || (!isAndroid() && !navigator.onLine))
      )
        feedbackTone(false, s.settings.restChimeVolume);
    } else if (!s.timer || tick < s.timer.endAt) expiredSound.current = false;
  }, [
    tick,
    s.timer,
    s.settings.timerSound,
    s.settings.restChimeVolume,
    restAlerts.armed,
    restAlerts.available,
    restAlerts.deliveredTimerId,
    restAlerts.deliveredDeadline,
  ]);
  return null;
}
export function RestRuntime() {
  const s = useStore().box.data;
  useDisplayClock(!!s.timer && !s.timer.paused);
  const seconds = D.restRemaining(s.timer, Date.now());
  return (
    <>
      {s.timer && (
        <div className="rest-timer" role="region" aria-label="Rest timer">
          <CountdownArc seconds={seconds} total={s.timer.remaining} />
          <div>
            <small>
              {seconds <= 0
                ? "READY WHEN YOU ARE"
                : s.timer.paused
                  ? "REST PAUSED"
                  : "RECOVER & RESET"}
            </small>
            <b>{duration(seconds)}</b>
          </div>
          <button
            className="icon-button"
            aria-label={s.timer.paused ? "Resume rest" : "Pause rest"}
            onClick={() =>
              change((s) => ({
                ...s,
                timer: s.timer
                  ? {
                      ...s.timer,
                      paused: !s.timer.paused,
                      remaining: seconds,
                      endAt: Date.now() + seconds * 1000,
                    }
                  : null,
              }))
            }
          >
            {s.timer.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            className="timer-add"
            onClick={() =>
              change((s) => ({
                ...s,
                timer: s.timer
                  ? {
                      ...s.timer,
                      remaining: Math.min(3600, seconds + 30),
                      endAt: Date.now() + Math.min(3600, seconds + 30) * 1000,
                    }
                  : null,
              }))
            }
          >
            +30s
          </button>
          <button
            className="icon-button"
            aria-label="Skip rest"
            onClick={() => change((s) => ({ ...s, timer: null }))}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  );
}
