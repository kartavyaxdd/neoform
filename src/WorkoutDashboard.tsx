import { RewardProgress } from "./RewardProgress";
import { useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, CalendarDays, Trophy } from "lucide-react";
import * as D from "./domain";
import {
  dashboardActivity,
  dashboardWeights,
  weekMonday,
  type DashboardScope,
} from "./workoutPresentation";
import { recentPersonalRecords } from "./rewards";

export function WorkoutDashboard({
  state,
  exercises,
  history,
  detail,
  progress,
  review,
  weight,
}: {
  state: D.State;
  exercises: D.Exercise[];
  history: () => void;
  detail: (s: D.Session) => void;
  progress: () => void;
  review: () => void;
  weight: () => void;
}) {
  const [scope, setScope] = useState<DashboardScope>("all"),
    [panel, setPanel] = useState(0);
  const monday = weekMonday();
  const activity = useMemo(
    () => dashboardActivity(state, exercises, monday, scope),
    [state, exercises, monday, scope],
  );
  const recent = useMemo(
    () =>
      [...state.sessions]
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
        )
        .slice(0, 4),
    [state.sessions],
  );
  const records = useMemo(() => {
    const programSessions = new Set(
      state.sessions
        .filter((s) => activity.program && s.programId === activity.program.id)
        .map((s) => s.id),
    );
    return recentPersonalRecords(state.sessions, exercises)
      .filter((r) => scope === "all" || programSessions.has(r.sessionId))
      .slice(0, 4);
  }, [state.sessions, exercises, scope, activity.program?.id]);
  const weights = useMemo(() => dashboardWeights(state), [state]);
  const lastSeven = useMemo(
    () =>
      [...state.sessions]
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(-7)
        .map(
          (s) =>
            s.exercises
              .flatMap((e) => e.sets)
              .filter(
                (t) =>
                  t.done &&
                  t.kind === "working" &&
                  (!t.bout || ["straight", "down"].includes(t.bout)),
              ).length,
        ),
    [state.sessions],
  );
  const totals = [
    { key: "muscles", label: "Muscles", color: "#548bff" },
    { key: "sets", label: "Sets", color: "#ff805b" },
    { key: "exercises", label: "Exercises", color: "#00b7c8" },
  ] as const;
  const weightValues = weights.map((r) =>
    D.displayLoad(r.kg, "total", state.settings.unit),
  );
  const low = Math.min(...weightValues),
    range = Math.max(0.5, Math.max(...weightValues) - low);
  const points = weights.map((w, i) => ({
    x:
      8 +
      (weights.length > 1
        ? (w.at - weights[0].at) /
          Math.max(1, weights.at(-1)!.at - weights[0].at)
        : 0.5) *
        184,
    y: 40 - ((weightValues[i] - low) / range) * 28,
  }));
  return (
    <div className="simple-dashboard">
      <div className="dashboard-overview">
        <header className="screen-heading">
          <div>
            <p className="dashboard-date">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1>Dashboard</h1>
          </div>
          <button
            className="icon-button dashboard-history"
            aria-label="Workout history"
            onClick={history}
          >
            <CalendarDays size={21} />
          </button>
        </header>
        <section className="activity-card" aria-labelledby="activity-title">
          <h2 id="activity-title">
            {panel === 0 ? "Weekly Workouts" : "Recent Records"}
          </h2>
          {panel === 0 ? (
            <div
              className="weekly-rings"
              aria-label="Completed training this week"
            >
              {totals.map((t) => {
                const value = activity.completed[t.key],
                  target = activity.planned?.[t.key];
                const percent = target ? Math.min(1, value / target) : 0;
                return (
                  <div
                    className="weekly-ring-stat"
                    key={t.key}
                    style={{ "--ring-color": t.color } as CSSProperties}
                  >
                    <div
                      className="weekly-ring"
                      role="img"
                      aria-label={`${value} ${t.label.toLowerCase()} completed${target === undefined ? "; no program target" : `; ${target} planned`}`}
                    >
                      <svg viewBox="0 0 100 100" aria-hidden="true">
                        <circle className="ring-track" cx="50" cy="50" r="48" />
                        <circle
                          className="ring-value"
                          cx="50"
                          cy="50"
                          r="48"
                          pathLength="100"
                          strokeDasharray={`${percent * 100} 100`}
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div>
                        <b>{value}</b>
                        <small>
                          {target === undefined
                            ? "completed"
                            : `${Math.max(0, target - value)} left`}
                        </small>
                      </div>
                    </div>
                    <span>{t.label}</span>
                    <small>
                      {target === undefined
                        ? "No program target"
                        : `${target} target`}
                    </small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-record-page">
              {records.length ? (
                records.map(({ record: r, sessionId, date }) => (
                  <button
                    className="dashboard-record"
                    key={`${sessionId}-${r.entryId}-${r.kind}`}
                    onClick={() => {
                      const s = state.sessions.find((s) => s.id === sessionId);
                      if (s) detail(s);
                    }}
                  >
                    <Trophy size={25} />
                    <span>
                      <b>{r.name}</b>
                      <small>
                        {r.kind === "reps"
                          ? `${r.before} → ${r.after} reps at ${D.displayLoad(r.weight, r.convention, state.settings.unit)} ${r.convention === "machine-label" ? "label" : state.settings.unit}`
                          : `${D.displayLoad(r.before, r.convention, state.settings.unit)} → ${D.displayLoad(r.after, r.convention, state.settings.unit)} ${r.convention === "machine-label" ? "label" : state.settings.unit} × ${r.reps} reps`}
                      </small>
                      <small>{date}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))
              ) : (
                <p className="empty-caption">
                  Your first comparable improvements will appear here. A new
                  exercise establishes a baseline.
                </p>
              )}
            </div>
          )}
          <div
            className="weekly-scope"
            role="group"
            aria-label="Weekly workout scope"
          >
            <button
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All Workouts
            </button>
            <button
              aria-pressed={scope === "program"}
              disabled={!activity.program}
              onClick={() => setScope("program")}
            >
              Active Program
            </button>
          </div>
        </section>
      </div>
      <div className="dashboard-lower">
        <div
          className="dashboard-pages"
          role="group"
          aria-label="Dashboard panels"
        >
          {["Weekly workouts", "Recent records"].map((name, i) => (
            <button
              key={name}
              aria-label={name}
              aria-pressed={panel === i}
              onClick={() => setPanel(i)}
            >
              <i />
            </button>
          ))}
        </div>
        <section className="dashboard-analytics">
          <h2>Insights &amp; Analytics</h2>
          <div className="analytics-tiles">
            <button className="analytics-tile" onClick={history}>
              <b>Workouts</b>
              <small>Last {lastSeven.length} Workouts</small>
              <div className="mini-bars" aria-hidden="true">
                {lastSeven.map((n, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${(n / Math.max(1, ...lastSeven)) * 35}px`,
                    }}
                  />
                ))}
              </div>
              <span>
                <span>
                  <strong>{lastSeven.at(-1) ?? 0}</strong> sets
                </span>
                <ChevronRight size={18} />
              </span>
            </button>
            <button className="analytics-tile" onClick={weight}>
              <b>Weight Trend</b>
              <small>Recorded · 7 Days</small>
              {weights.length ? (
                <svg
                  className="weight-sparkline"
                  viewBox="0 0 200 52"
                  role="img"
                  aria-label={`${weights.length} recorded weight measurements; latest ${weightValues.at(-1)?.toFixed(1)} ${state.settings.unit}`}
                >
                  {points.length > 1 && (
                    <polyline
                      points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                    />
                  )}
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="3.4" />
                  ))}
                </svg>
              ) : (
                <div className="weight-chart-empty">No measurements yet</div>
              )}
              <span>
                <span>
                  {weights.length ? (
                    <>
                      <strong>{weightValues.at(-1)!.toFixed(1)}</strong>{" "}
                      {state.settings.unit}
                    </>
                  ) : (
                    "Log your weight"
                  )}
                </span>
                <ChevronRight size={18} />
              </span>
            </button>
          </div>
        </section>
        <section>
          <div className="group-heading">
            <h2>Recent workouts</h2>
            <button className="text-button" onClick={history}>
              View all
            </button>
          </div>
          <div className="grouped">
            {recent.map((s) => (
              <button
                className="group-row"
                key={s.id}
                onClick={() => detail(s)}
              >
                <CalendarDays size={19} />
                <span>
                  <b>{s.name}</b>
                  <small>
                    {new Date(s.date + "T12:00:00").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}{" "}
                    · {Math.round(s.duration / 60)} min
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            {!recent.length && (
              <p className="empty-caption">
                Your completed workouts will appear here.
              </p>
            )}
          </div>
        </section>
        <button
          className="group-row weekly-review-link grouped"
          onClick={review}
        >
          <CalendarDays size={19} />
          <span>
            <b>Weekly review</b>
            <small>Performance, targets and coaching</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <RewardProgress state={state} exercises={exercises} />
        <button className="group-row grouped" onClick={progress}>
          <Trophy size={19} />
          <span>
            <b>Exercise progress</b>
            <small>View levels and training details</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <details className="activity-definition">
          <summary>About these totals</summary>
          <p>
            Completed primary-muscle straight/down working sets this week.
            Targets show one cycle of{" "}
            {activity.program
              ? `${activity.program.name}, week ${activity.program.currentWeek}`
              : "your active program"}
            , using its assigned phase. Advanced bouts and indirect involvement
            stay in Levels. These are activity counts, not growth estimates.
          </p>
        </details>
      </div>
    </div>
  );
}
