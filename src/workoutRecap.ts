import * as D from "./domain";
import { rewards, sessionRecords, type PersonalRecord } from "./rewards";
export function estimateSessionEnergy(
  seconds: number,
  kg: number | undefined,
  source: "session" | "current",
) {
  if (
    !Number.isFinite(seconds) ||
    seconds < 60 ||
    seconds > 4 * 3600 ||
    !kg ||
    !Number.isFinite(kg) ||
    kg < 20 ||
    kg > 400
  )
    return null;
  // Generic gross energy scenarios, not a confidence interval or measured burn.
  // 2024 Adult Compendium: conditioning codes 02054 (3.5 MET), 02050 (6 MET).
  // No RIR, lifted tonnage, age or subjective feeling is converted to calories.
  return {
    low: Math.round((3.5 * kg * seconds) / 3600 / 10) * 10,
    high: Math.round((6 * kg * seconds) / 3600 / 10) * 10,
    source,
  };
}
export function recordLabel(r: PersonalRecord, unit: "kg" | "lb") {
  const u = r.convention === "machine-label" ? "label" : unit,
    load = (n: number) =>
      D.displayLoad(n, r.convention, unit).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
  return r.kind === "reps"
    ? `Rep PR: ${r.before} → ${r.after} at ${load(r.weight)} ${u}`
    : `Load PR: ${load(r.before)} → ${load(r.after)} ${u} × ${r.reps}`;
}
export function workoutRecap(
  s: D.Session,
  history: D.Session[],
  exercises: D.Exercise[],
  unit: "kg" | "lb",
  currentKg?: number,
) {
  const raw = sessionRecords(s, history, exercises),
    distinct = new Map<string, PersonalRecord>();
  for (const r of raw.filter((r) => r.kind !== "baseline")) {
    const key = `${r.entryId}:${r.kind}:${r.kind === "reps" ? r.weight : r.reps}`,
      old = distinct.get(key);
    if (!old || r.after > old.after) distinct.set(key, r);
  }
  const rows = s.exercises.flatMap((e) =>
    e.sets.filter((t) => t.done && t.kind !== "warmup"),
  );
  const sorted = [
      ...new Map([...history, s].map((x) => [x.id, x])).values(),
    ].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)),
    before = sorted.slice(
      0,
      sorted.findIndex((x) => x.id === s.id),
    );
  const past = rewards(before, exercises, s.date, 4),
    through = rewards([...before, s], exercises, s.date, 4);
  return {
    name: s.name,
    date: s.date,
    minutes: s.duration > 0 ? Math.max(1, Math.round(s.duration / 60)) : null,
    work: rows.length,
    reps: rows.reduce((n, t) => n + t.reps, 0),
    records: [...distinct.values()].map((r) => ({
      ...r,
      label: recordLabel(r, unit),
    })),
    baselines: new Set(
      raw.filter((r) => r.kind === "baseline").map((r) => r.entryId),
    ).size,
    xp: Math.max(0, through.xp - past.xp),
    level: through.level,
    days: through.days,
    energy: rows.length
      ? estimateSessionEnergy(
          s.duration,
          s.bodyweight?.kg ?? currentKg,
          s.bodyweight ? "session" : "current",
        )
      : null,
    muscles: [
      ...new Set(
        s.exercises
          .filter((e) => e.sets.some((t) => t.done && t.kind !== "warmup"))
          .flatMap((e) => {
            const x = exercises.find((x) => x.id === e.exerciseId);
            return x ? [x.muscle] : [];
          }),
      ),
    ],
  };
}
export type WorkoutRecapModel = ReturnType<typeof workoutRecap>;
