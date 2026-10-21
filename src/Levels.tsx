import { useMemo, useState } from "react";
import * as D from "./domain";
import {
  weekMonday,
  weekSessions,
  weeklyPrimarySets,
  localDate,
} from "./workoutPresentation";
import { TrainingBodyMap } from "./TrainingBodyMap";
import { TrainingExposure } from "./TrainingExposure";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Muscle = D.Exercise["muscle"];
export function Levels({
  state,
  exercises,
  insights,
}: {
  state: D.State;
  exercises: D.Exercise[];
  insights: React.ReactNode;
}) {
  const [monday, setMonday] = useState(() => weekMonday()),
    [selected, setSelected] = useState<Muscle>("Chest");
  const week = useMemo(
    () => weekSessions(state.sessions, monday),
    [state.sessions, monday],
  );
  const counts = useMemo(
    () => weeklyPrimarySets(state.sessions, exercises, monday),
    [state.sessions, exercises, monday],
  );
  function move(n: number) {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() + n * 7);
    setMonday(localDate(d));
  }
  return (
    <div className="levels-screen">
      <header className="screen-heading">
        <h1>Levels</h1>
      </header>
      <div className="week-selector">
        <button
          className="icon-button"
          aria-label="Previous week"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span>
          Week of{" "}
          {new Date(monday + "T12:00:00").toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        <button
          className="icon-button"
          aria-label="Next week"
          onClick={() => move(1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <section className="body-card">
        <TrainingBodyMap
          counts={counts}
          selected={selected}
          onSelect={setSelected}
        />
        <p className="caption">
          Completed primary-muscle working sets. Tap a muscle to explore.
        </p>
      </section>
      <div className="muscle-list" aria-label="Muscle working sets">
        {D.muscles.map((m) => (
          <button
            key={m}
            aria-pressed={selected === m}
            className={selected === m ? "selected" : ""}
            onClick={() => setSelected(m)}
          >
            <span>{m}</span>
            <span className="muscle-meter">
              <i style={{ width: `${Math.min(100, counts[m] * 5)}%` }} />
            </span>
            <b>{counts[m]} sets</b>
          </button>
        ))}
      </div>
      <section className="panel muscle-detail">
        <h2>{selected}</h2>
        <p>{counts[selected]} working sets this week</p>
        {exercises
          .filter(
            (x) =>
              x.muscle === selected &&
              week.some((s) =>
                s.exercises.some(
                  (e) =>
                    e.exerciseId === x.id &&
                    e.sets.some((t) => t.done && t.kind !== "warmup"),
                ),
              ),
          )
          .map((x) => (
            <div className="group-row" key={x.id}>
              <span>
                <b>{x.name}</b>
                <small>
                  {
                    week
                      .flatMap((s) => s.exercises)
                      .filter((e) => e.exerciseId === x.id)
                      .flatMap((e) => e.sets)
                      .filter((t) => t.done && t.kind !== "warmup").length
                  }{" "}
                  logged non-warmup bouts
                </small>
              </span>
            </div>
          ))}
        <details>
          <summary>Effort, indirect involvement and advanced bouts</summary>
          <TrainingExposure sessions={week} exercises={exercises} />
        </details>
      </section>
      <details className="panel detailed-insights">
        <summary>Detailed training insights</summary>
        {insights}
      </details>
    </div>
  );
}
