import { useMemo } from "react";
import { ChevronRight, CalendarDays, TrendingUp } from "lucide-react";
import * as D from "./domain";
import { weekMonday, weekSessions, localDate } from "./workoutPresentation";
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
  return (
    <div className="simple-dashboard">
      <header className="screen-heading">
        <h1>Dashboard</h1>
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
          <h2>This week</h2>
          <span>
            {week.length} / {state.profile?.days ?? 0} workouts
          </span>
        </div>
        <div className="activity-week">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday + "T12:00:00");
            d.setDate(d.getDate() + i);
            const date = localDate(d),
              done = week.some((s) => s.date === date);
            return (
              <div key={date} className={done ? "trained" : ""}>
                <small>
                  {d.toLocaleDateString(undefined, { weekday: "narrow" })}
                </small>
                <span>{done ? "✓" : d.getDate()}</span>
              </div>
            );
          })}
        </div>
        <div className="activity-totals">
          <span>
            <b>{Math.round(week.reduce((n, s) => n + s.duration, 0) / 60)}</b>{" "}
            minutes
          </span>
          <span>
            <b>
              {week.reduce(
                (n, s) =>
                  n +
                  s.exercises
                    .flatMap((e) => e.sets)
                    .filter((t) => t.done && t.kind === "working").length,
                0,
              )}
            </b>{" "}
            working sets
          </span>
        </div>
      </section>
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
