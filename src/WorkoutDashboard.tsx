import { RewardProgress } from "./RewardProgress";
import { useMemo, type CSSProperties } from "react";
import { ChevronRight, CalendarDays, TrendingUp } from "lucide-react";
import * as D from "./domain";
import {
  weekMonday,
  weekSessions,
  weeklyPrimarySets,
} from "./workoutPresentation";
export function WorkoutDashboard({
  state,
  exercises,
  history,
  detail,
  progress,
  review,
}: {
  state: D.State;
  exercises: D.Exercise[];
  history: () => void;
  detail: (s: D.Session) => void;
  progress: () => void;
  review: () => void;
}) {
  const monday = weekMonday(),
    week = useMemo(
      () => weekSessions(state.sessions, monday),
      [state.sessions, monday],
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
  const records = useMemo(
    () => D.records(state.sessions, exercises).slice(0, 4),
    [state.sessions, exercises],
  );
  const completed = week
    .flatMap((s) => s.exercises)
    .filter((e) =>
      e.sets.some(
        (t) =>
          t.done &&
          t.kind === "working" &&
          (!t.bout || ["straight", "down"].includes(t.bout)),
      ),
    );
  const primary = weeklyPrimarySets(state.sessions, exercises, monday);
  const trainingDays = new Set(
    week
      .filter((s) =>
        s.exercises.some((e) =>
          e.sets.some((t) => t.done && t.kind === "working"),
        ),
      )
      .map((s) => s.date),
  ).size;
  const totals = [
    {
      label: "Muscles",
      value: Object.values(primary).filter((n) => n > 0).length,
      color: "#548bff",
    },
    {
      label: "Sets",
      value: Object.values(primary).reduce((a, b) => a + b, 0),
      color: "#ff855c",
    },
    {
      label: "Exercises",
      value: new Set(completed.map((e) => e.exerciseId)).size,
      color: "#00b8c8",
    },
  ];
  const lastSeven = [...state.sessions]
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
    );
  return (
    <div className="simple-dashboard">
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
          className="icon-button"
          aria-label="Workout history"
          onClick={history}
        >
          <CalendarDays size={21} />
        </button>
      </header>
      <section className="activity-card">
        <div className="section-heading">
          <h2>Weekly Workouts</h2>
        </div>
        <div className="weekly-rings" aria-label="Completed training this week">
          {totals.map((t) => (
            <div
              className="weekly-ring-stat"
              key={t.label}
              style={{ "--ring-color": t.color } as CSSProperties}
            >
              <div className="weekly-ring">
                <b>{t.value}</b>
                <small>completed</small>
              </div>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div className="weekly-scope">All workouts · This week</div>
      </section>
      <section className="dashboard-analytics">
        <h2>Insights &amp; Analytics</h2>
        <div className="analytics-tiles">
          <button className="analytics-tile" onClick={history}>
            <b>Workouts</b>
            <small>Last {lastSeven.length || 0} workouts</small>
            <div className="mini-bars" aria-hidden="true">
              {lastSeven.map((n, i) => (
                <i
                  key={i}
                  style={{
                    height: `${Math.max(3, (n / Math.max(1, ...lastSeven)) * 44)}px`,
                  }}
                />
              ))}
            </div>
            <span>
              {lastSeven.at(-1) ?? 0} sets <ChevronRight size={16} />
            </span>
          </button>
          <button className="analytics-tile" onClick={review}>
            <b>Training days</b>
            <small>This week</small>
            <div className="day-markers" aria-label="Weekly training days">
              {Array.from({ length: state.profile?.days ?? 4 }, (_, i) => (
                <i key={i} className={i < trainingDays ? "done" : ""} />
              ))}
            </div>
            <span>
              {trainingDays} / {state.profile?.days ?? 4} days{" "}
              <ChevronRight size={16} />
            </span>
          </button>
        </div>
      </section>
      <RewardProgress state={state} exercises={exercises} />
      <button className="group-row weekly-review-link grouped" onClick={review}>
        <CalendarDays size={19} />
        <span>
          <b>Weekly review</b>
          <small>Lift changes, assigned targets and coaching outcomes</small>
        </span>
        <ChevronRight size={18} />
      </button>
      <section>
        <div className="group-heading">
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
                  &middot; {Math.round(s.duration / 60)} min
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
      <section>
        <div className="group-heading">
          <h2>Exercise progress</h2>
          <button className="text-button" onClick={progress}>
            View levels
          </button>
        </div>
        <div className="grouped">
          {records.map((r) => (
            <button className="group-row" key={r.key} onClick={progress}>
              <TrendingUp size={19} />
              <span>
                <b>{r.name}</b>
                <small>
                  {D.displayLoad(
                    r.weight,
                    r.convention,
                    state.settings.unit,
                  ).toLocaleString()}{" "}
                  {r.convention === "machine-label"
                    ? "label"
                    : state.settings.unit}{" "}
                  &times; {r.reps} reps<small>{r.context}</small>
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
          {!records.length && (
            <p className="empty-caption">
              Comparable exercise records appear as you log workouts.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
