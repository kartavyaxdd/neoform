import * as D from "./domain";
import { localDate, weekMonday, weekSessions } from "./workoutPresentation";
import { recoveryTime } from "./readiness";
export type VisualPoint = {
  id: string;
  label: string;
  value: number | null;
  group?: string;
};
export type TrendWeeks = 4 | 8 | 12;
function saved(sessions: D.Session[], now: number) {
  return sessions.filter((s) => s.startedAt <= now && recoveryTime(s) <= now);
}
function weeksBefore(monday: string, weeks: number) {
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return localDate(d);
  });
}
export function primaryWork(
  sessions: D.Session[],
  exercises: D.Exercise[],
  muscle?: D.Exercise["muscle"],
) {
  const index = new Map(exercises.map((x) => [x.id, x]));
  return sessions.reduce(
    (total, s) =>
      total +
      s.exercises.reduce((n, e) => {
        const x = index.get(e.exerciseId);
        if (!x || (muscle && x.muscle !== muscle)) return n;
        return (
          n +
          e.sets.filter(
            (t) =>
              t.done && t.kind === "working" && !D.advancedVolumeBout(e, t),
          ).length
        );
      }, 0),
    0,
  );
}
export function trainingTrend(
  sessions: D.Session[],
  weeks: TrendWeeks,
  monday = weekMonday(),
  now = Date.now(),
): VisualPoint[] {
  const history = saved(sessions, now);
  if (!history.length) return [];
  return weeksBefore(monday, weeks).map((date) => ({
    id: date,
    label: date,
    value: new Set(
      weekSessions(history, date)
        .filter((s) =>
          s.exercises.some((e) =>
            e.sets.some((t) => t.done && t.kind === "working"),
          ),
        )
        .map((s) => s.date),
    ).size,
  }));
}
export function muscleTrend(
  sessions: D.Session[],
  exercises: D.Exercise[],
  muscle: D.Exercise["muscle"],
  weeks: TrendWeeks,
  monday = weekMonday(),
  now = Date.now(),
): VisualPoint[] {
  const history = saved(sessions, now);
  if (!history.length) return [];
  return weeksBefore(monday, weeks).map((date) => ({
    id: date,
    label: date,
    value: primaryWork(weekSessions(history, date), exercises, muscle),
  }));
}
export function weightTrend(
  state: D.State,
  weeks: TrendWeeks,
  now = Date.now(),
): VisualPoint[] {
  const first = weeksBefore(weekMonday(localDate(new Date(now))), weeks)[0];
  const start = new Date(first + "T00:00:00").getTime(),
    reports = new Map<string, { kg: number; at: number }>();
  for (const r of [
    state.coaching?.bodyweight,
    ...saved(state.sessions, now).map((s) => s.bodyweight),
  ]) {
    if (!r || r.at < start || r.at > now) continue;
    const day = localDate(new Date(r.at)),
      old = reports.get(day);
    if (!old || old.at < r.at) reports.set(day, r);
  }
  let previous = 0,
    group = 0;
  return [...reports]
    .sort((a, b) => a[1].at - b[1].at)
    .map(([date, r]) => {
      if (previous && r.at - previous > 7 * 86400000) group++;
      previous = r.at;
      return {
        id: date,
        label: date,
        value: D.displayLoad(r.kg, "total", state.settings.unit),
        group: String(group),
      };
    });
}
