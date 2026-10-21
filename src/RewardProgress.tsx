import { useEffect, useMemo, useRef, useState } from "react";
import * as D from "./domain";
import { rewards, sessionRecords } from "./rewards";
import { weekMonday } from "./workoutPresentation";
import type { PersonalRecord } from "./rewards";
const celebrationKey = (sessionId: string, entryId: string) =>
  `neoform:pr-seen:${sessionId}:${entryId}`;
export function recordAlreadyCelebrated(sessionId: string, entryId: string) {
  try {
    return sessionStorage.getItem(celebrationKey(sessionId, entryId)) === "1";
  } catch {
    return false;
  }
}
export function LiveRecordBadge({
  sessionId,
  entryId,
  records,
  unit,
  convention,
}: {
  sessionId: string;
  entryId: string;
  records: PersonalRecord[];
  unit: "kg" | "lb";
  convention: string;
}) {
  const candidates = records.filter((r) => r.entryId === entryId),
    r =
      candidates
        .filter((r) => r.kind !== "baseline")
        .sort((a, b) => b.after - b.before - (a.after - a.before))[0] ??
      candidates[0],
    [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!r || r.kind === "baseline") return;
    const key = celebrationKey(sessionId, entryId);
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    setFresh(true);
    const id = setTimeout(() => setFresh(false), 2500);
    return () => clearTimeout(id);
  }, [sessionId, entryId, !!r && r.kind !== "baseline"]);
  if (!r) return null;
  const loadUnit = convention === "machine-label" ? "label" : unit;
  const label =
    r.kind === "baseline"
      ? "Baseline established"
      : r.kind === "reps"
        ? `★ Rep PR: ${r.before} → ${r.after} at ${D.displayLoad(r.weight, convention, unit)} ${loadUnit}`
        : `★ Load PR: ${D.displayLoad(r.before, convention, unit)} → ${D.displayLoad(r.after, convention, unit)} ${loadUnit} × ${r.reps}`;
  return (
    <div
      className={`pr-banner ${fresh ? "pr-fresh" : "pr-quiet"}`}
      role="status"
    >
      {label}
    </div>
  );
}
export function RewardProgress({
  state,
  exercises,
}: {
  state: D.State;
  exercises: D.Exercise[];
}) {
  const r = useMemo(
    () =>
      rewards(
        state.sessions,
        exercises,
        weekMonday(),
        state.profile?.days ?? 4,
      ),
    [state.sessions, state.profile?.days, exercises],
  );
  return (
    <section className="reward-progress">
      <div>
        <span className="reward-level">LEVEL {r.level}</span>
        <b>{r.xp.toLocaleString()} XP</b>
      </div>
      <progress
        max={500}
        value={r.progress}
        aria-label="Training level progress"
      />
      <small>
        {r.week} / {r.goal} training days this week · {r.days} lifetime
      </small>
      {r.milestones.length > 0 && (
        <div className="milestone-chips">
          {r.milestones.map((n) => (
            <span key={n}>★ {n} days</span>
          ))}
        </div>
      )}
      <details>
        <summary>How XP works</summary>
        <p>
          100 XP per saved training day. Up to 25 bonus XP for a comparable PR
          with reported effort. 500 XP per level. Extra sets and lower RIR earn
          no extra points.
        </p>
      </details>
    </section>
  );
}
export function WorkoutCelebration({
  session,
  xp,
  exercises,
  history,
  close,
  goal = 4,
  recap,
}: {
  session: D.Session;
  xp: number;
  exercises: D.Exercise[];
  history: D.Session[];
  close: () => void;
  goal?: number;
  recap?: () => void;
}) {
  const dismiss = useRef(close);
  dismiss.current = close;
  const [shown, setShown] = useState(xp);
  useEffect(() => {
    const id = setTimeout(() => dismiss.current(), 6000);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 600);
      setShown(Math.round(xp * progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [xp]);
  const progress = rewards(history, exercises, weekMonday(), goal);
  const records = sessionRecords(session, history, exercises).filter(
    (r) => r.kind !== "baseline",
  );
  return (
    <div className="workout-celebration" role="status">
      <button
        className="icon-button"
        aria-label="Dismiss celebration"
        onClick={close}
      >
        ×
      </button>
      <span className="reward-level">WORKOUT SAVED</span>
      <h2>Workout complete</h2>
      <strong>{xp ? `+${shown} XP` : "Session saved"}</strong>
      <p>
        Level {progress.level} · {progress.week} / {progress.goal} training days
        this week
      </p>
      <p>
        {records.length
          ? `${new Set(records.map((r) => r.entryId)).size} exercises with new personal records`
          : "Your consistency counts."}
      </p>
      <small>Saved on this device · cloud status is shown above</small>
      {recap && (
        <button className="btn wide" onClick={recap}>
          View recap & share
        </button>
      )}
    </div>
  );
}
