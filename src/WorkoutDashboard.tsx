import { useMemo, useState } from "react";
import { ChevronRight, CalendarDays, Trophy, ArrowUpRight } from "lucide-react";
import * as D from "./domain";
import {
  dashboardActivity,
  weekMonday,
  type DashboardScope,
} from "./workoutPresentation";
import { recentPersonalRecords, rewards } from "./rewards";
import { RewardProgress } from "./RewardProgress";
import { MetricChart, TrendRange } from "./MetricChart";
import { trainingTrend, weightTrend, type TrendWeeks } from "./visualData";
export function WorkoutDashboard({
  state,
  exercises,
  history,
  detail,
  progress,
  review,
  weight,
  coach,
}: {
  state: D.State;
  exercises: D.Exercise[];
  history: () => void;
  detail: (s: D.Session) => void;
  progress: () => void;
  review: () => void;
  weight: () => void;
  coach?: () => void;
}) {
  const [scope, setScope] = useState<DashboardScope>("all"),
    [weeks, setWeeks] = useState<TrendWeeks>(8);
  const monday = weekMonday();
  const activity = useMemo(
    () => dashboardActivity(state, exercises, monday, scope),
    [state, exercises, monday, scope],
  );
  const reward = useMemo(
    () => rewards(state.sessions, exercises, monday, state.profile?.days ?? 4),
    [state.sessions, exercises, monday, state.profile?.days],
  );
  const trends = useMemo(
    () => ({
      days: trainingTrend(state.sessions, weeks, monday),
      weight: weightTrend(state, weeks),
    }),
    [state, weeks, monday],
  );
  const records = useMemo(
    () =>
      recentPersonalRecords(state.sessions, exercises)
        .filter(
          (r) =>
            scope === "all" ||
            state.sessions.find((s) => s.id === r.sessionId)?.programId ===
              activity.program?.id,
        )
        .slice(0, 4),
    [state.sessions, exercises, scope, activity.program?.id],
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
  return (
    <div className="simple-dashboard glass-dashboard">
      <header className="screen-heading">
        <div>
          <p className="dashboard-date">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          <h1>Dashboard</h1>
        </div>
        <button
          className="icon-button"
          aria-label="Workout history"
          onClick={history}
        >
          <CalendarDays size={22} />
        </button>
      </header>
      {coach && (
        <button className="gemini-entry glass-card" onClick={coach}>
          <span>
            <b>Gemini coach</b>
            <small>Ask, understand, review.</small>
          </span>
          <ArrowUpRight size={20} />
        </button>
      )}
      <section className="activity-card glass-card" aria-label="This week">
        <div className="glass-section-heading">
          <div>
            <p className="eyebrow">YOUR CONSISTENCY</p>
            <h2>This week</h2>
          </div>
          <span className="goal-count">
            <b>{reward.week}</b> / {reward.goal}
            <small>training days</small>
          </span>
        </div>
        <progress
          className="weekly-goal"
          max={Math.max(reward.goal, reward.week)}
          value={reward.week}
          aria-label="Weekly training-day goal"
        />
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
        <div className="week-stat-row">
          {(
            [
              ["sets", "Sets"],
              ["exercises", "Exercises"],
              ["muscles", "Muscles"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <b>{activity.completed[key]}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <button className="text-button weekly-review-link" onClick={review}>
          Weekly review <ArrowUpRight size={16} />
        </button>
      </section>
      <div className="glass-section-heading">
        <h2>Your trends</h2>
        <TrendRange value={weeks} onChange={setWeeks} />
      </div>
      <div className="dashboard-chart-grid">
        <section className="glass-card">
          <MetricChart
            title="Training consistency"
            unit="days / week"
            points={trends.days}
            caption="Unique saved training days, across all workouts."
          />
          <button className="text-button" onClick={history}>
            View workout history <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="glass-card">
          <MetricChart
            title="Bodyweight"
            unit={state.settings.unit}
            points={trends.weight}
            kind="line"
            caption="Recorded measurements. Lines stop across gaps longer than a week."
          />
          <button className="text-button" onClick={weight}>
            Log bodyweight <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
      <section className="glass-card">
        <div className="glass-section-heading">
          <h2>Recent records</h2>
          <Trophy className="gold-icon" size={20} />
        </div>
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
                <Trophy size={22} />
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
              Your first comparable improvements will appear here. New lifts
              establish a baseline.
            </p>
          )}
        </div>
      </section>
      <RewardProgress state={state} exercises={exercises} />
      <section>
        <div className="glass-section-heading">
          <h2>Recent workouts</h2>
          <button className="text-button" onClick={history}>
            View all
          </button>
        </div>
        <div className="grouped">
          {recent.map((s) => (
            <button className="group-row" key={s.id} onClick={() => detail(s)}>
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
      <button className="group-row grouped" onClick={progress}>
        <Trophy size={20} />
        <span>
          <b>Exercise progress</b>
          <small>Matching lifts and muscle work</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <details className="activity-definition">
        <summary>About these totals</summary>
        <p>
          Completed primary straight/down working sets. Advanced bouts and
          indirect involvement stay separate in Levels. Training days and XP
          follow the existing reward rules; these counts do not measure growth.
        </p>
      </details>
    </div>
  );
}
