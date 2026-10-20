import { useMemo, useState } from "react";
import * as D from "./domain";
import {
  weekMonday,
  weekSessions,
  weeklyPrimarySets,
  localDate,
} from "./workoutPresentation";
import { TrainingExposure } from "./TrainingExposure";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Muscle = D.Exercise["muscle"];
const front: Partial<Record<Muscle, string[]>> = {
  Neck: ["M87 37H113L110 54H90Z"],
  Shoulders: [
    "M77 50Q55 51 51 75L70 80 80 65Z",
    "M123 50Q145 51 149 75L130 80 120 65Z",
  ],
  Chest: [
    "M80 57L98 55 98 88 74 84 72 68Z",
    "M102 55L120 57 128 68 126 84 102 88Z",
  ],
  Biceps: ["M52 80L68 85 62 112 45 109Z", "M132 85L148 80 155 109 138 112Z"],
  Forearms: [
    "M45 114L61 117 49 151 34 148Z",
    "M139 117L155 114 166 148 151 151Z",
  ],
  Core: [
    "M76 92L98 95 98 144 83 151 77 125Z",
    "M102 95L124 92 123 125 117 151 102 144Z",
  ],
  Quads: [
    "M81 157L99 153 97 209 79 211 74 176Z",
    "M101 153L119 157 126 176 121 211 103 209Z",
  ],
  Calves: [
    "M80 219L96 217 92 258 81 268 76 250Z",
    "M104 217L120 219 124 250 119 268 108 258Z",
  ],
};
const back: Partial<Record<Muscle, string[]>> = {
  Neck: ["M88 37H112L117 54H83Z"],
  Shoulders: front.Shoulders,
  Back: [
    "M81 57L99 55 99 144 84 151 75 113 72 72Z",
    "M101 55L119 57 128 72 125 113 116 151 101 144Z",
  ],
  Triceps: ["M51 80L69 84 62 113 45 110Z", "M131 84L149 80 155 110 138 113Z"],
  Forearms: front.Forearms,
  Glutes: [
    "M82 155L98 150 98 178 77 182 74 170Z",
    "M102 150L118 155 126 170 123 182 102 178Z",
  ],
  Hamstrings: [
    "M77 187L98 183 96 215 80 218Z",
    "M102 183L123 187 120 218 104 215Z",
  ],
  Calves: front.Calves,
};
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
  const max = Math.max(1, ...Object.values(counts));
  function move(n: number) {
    const d = new Date(monday + "T12:00:00");
    d.setDate(d.getDate() + n * 7);
    setMonday(localDate(d));
  }
  function body(side: "Front" | "Back", shapes: typeof front) {
    return (
      <figure>
        <svg
          viewBox="20 0 160 300"
          role="group"
          aria-label={`${side} muscle map`}
        >
          <circle cx="100" cy="20" r="17" className="body-base" />
          {Object.entries(shapes).map(([name, paths]) => (
            <g
              key={name}
              role="button"
              tabIndex={0}
              aria-label={`${side} ${name}: ${counts[name as Muscle]} working sets`}
              aria-pressed={selected === name}
              onClick={() => setSelected(name as Muscle)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(name as Muscle);
                }
              }}
              className={selected === name ? "muscle selected" : "muscle"}
              style={
                {
                  "--dose":
                    counts[name as Muscle] > 0
                      ? 0.2 + (0.65 * counts[name as Muscle]) / max
                      : 0,
                } as React.CSSProperties
              }
            >
              {paths!.map((d, i) => (
                <path d={d} key={i} />
              ))}
            </g>
          ))}
          <path
            d="M78 272L92 268 94 285H74ZM108 268L122 272 126 285H106Z"
            className="body-base"
          />
        </svg>
        <figcaption>{side}</figcaption>
      </figure>
    );
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
        <div className="body-maps">
          {body("Front", front)}
          {body("Back", back)}
        </div>
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
            <b>{counts[m]}</b>
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
