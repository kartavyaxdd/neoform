import * as D from "./domain";
export function rirColour(rir: number, reported: boolean) {
  return reported
    ? `light-dark(hsl(${Math.max(0, Math.min(10, rir)) * 12} 65% 30%), hsl(${Math.max(0, Math.min(10, rir)) * 12} 75% 72%))`
    : "var(--muted)";
}
export type PersonalRecord = {
  entryId: string;
  setId: string;
  name: string;
  kind: "baseline" | "reps" | "load";
  before: number;
  after: number;
  weight: number;
  reps: number;
  confirmed: boolean;
  convention: string;
};
type Index = Map<
  string,
  { loads: Map<number, number>; reps: Map<number, number> }
>;
function rows(s: D.Session, exercises: D.Exercise[]) {
  return s.exercises.flatMap((e) => {
    const x = exercises.find((x) => x.id === e.exerciseId),
      convention = e.convention ?? x?.convention;
    if (
      !x ||
      (e.technique && e.technique !== "straight") ||
      e.protocol ||
      e.tempo ||
      e.superset ||
      e.techniqueGroup ||
      !convention ||
      !["total", "per-dumbbell", "per-side", "machine-label"].includes(
        convention,
      ) ||
      ["Bodyweight", "Band"].includes(e.equipment ?? x.equipment)
    )
      return [];
    return e.sets
      .filter(
        (t) =>
          t.done &&
          t.kind === "working" &&
          (!t.bout || t.bout === "straight") &&
          t.weight > 0,
      )
      .map((t) => ({
        e,
        x,
        t,
        key: D.comparableKey(e, x) + "|" + (s.phase ?? "unknown"),
      }));
  });
}
function assess(
  s: D.Session,
  index: Index,
  exercises: D.Exercise[],
  update = false,
) {
  const result: PersonalRecord[] = [];
  for (const { e, x, t, key } of rows(s, exercises)) {
    const old = index.get(key);
    const base = {
      convention: e.convention ?? x.convention,
      entryId: e.id,
      setId: t.id,
      name: x.name,
      weight: t.weight,
      reps: t.reps,
      confirmed: t.effortReported === true,
    };
    if (!old) result.push({ ...base, kind: "baseline", before: 0, after: 0 });
    else {
      const r = old.loads.get(t.weight),
        w = old.reps.get(t.reps);
      if (r !== undefined && t.reps > r)
        result.push({ ...base, kind: "reps", before: r, after: t.reps });
      if (w !== undefined && t.weight > w)
        result.push({ ...base, kind: "load", before: w, after: t.weight });
    }
  }
  if (update)
    for (const { t, key } of rows(s, exercises)) {
      let old = index.get(key);
      if (!old) {
        old = { loads: new Map(), reps: new Map() };
        index.set(key, old);
      }
      old.loads.set(t.weight, Math.max(old.loads.get(t.weight) ?? 0, t.reps));
      old.reps.set(t.reps, Math.max(old.reps.get(t.reps) ?? 0, t.weight));
    }
  return result;
}
const ordered = (sessions: D.Session[]) =>
  [...new Map(sessions.map((s) => [s.id, s])).values()].sort(
    (a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id),
  );
export function sessionRecords(
  session: D.Session,
  history: D.Session[],
  exercises: D.Exercise[],
) {
  const index: Index = new Map();
  for (const s of ordered(history).filter(
    (s) => s.id !== session.id && s.startedAt <= session.startedAt,
  ))
    assess(s, index, exercises, true);
  return assess(session, index, exercises);
}
// Single chronological pass using the logger's observed-record comparator.
export function recentPersonalRecords(
  sessions: D.Session[],
  exercises: D.Exercise[],
) {
  const index: Index = new Map();
  return ordered(sessions)
    .flatMap((s) => {
      const best = new Map<string, PersonalRecord>();
      for (const r of assess(s, index, exercises, true)) {
        if (r.kind === "baseline") continue;
        const key = r.entryId + ":" + r.kind,
          old = best.get(key);
        if (!old || r.after > old.after) best.set(key, r);
      }
      return [...best.values()].map((record) => ({
        record,
        sessionId: s.id,
        date: s.date,
      }));
    })
    .reverse();
}
export function rewards(
  sessions: D.Session[],
  exercises: D.Exercise[],
  monday: string,
  goal: number,
) {
  const index: Index = new Map(),
    days = new Set<string>(),
    prDays = new Set<string>();
  for (const s of ordered(sessions)) {
    const found = assess(s, index, exercises, true);
    if (
      s.exercises.some((e) =>
        e.sets.some((t) => t.done && t.kind === "working"),
      )
    )
      days.add(s.date);
    if (found.some((r) => r.kind !== "baseline" && r.confirmed))
      prDays.add(s.date);
  }
  const xp =
      days.size * 100 + [...prDays].filter((d) => days.has(d)).length * 25,
    end = new Date(monday + "T12:00:00");
  end.setDate(end.getDate() + 7);
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    week = [...days].filter((d) => d >= monday && d < endDate).length;
  return {
    xp,
    level: Math.floor(xp / 500) + 1,
    progress: xp % 500,
    days: days.size,
    week,
    goal,
    milestones: [10, 25, 50, 100].filter((n) => days.size >= n),
  };
}
