import { useState } from "react";
import {
  CalendarDays,
  Plus,
  Dumbbell,
  ChevronDown,
  ArrowRight,
  BookOpen,
  Archive,
  Layers,
  Sparkles,
} from "lucide-react";
import * as D from "./domain";
import { change } from "./store";
import { Modal, Button } from "./ui";
import { WorkoutCalendar } from "./WorkoutCalendar";
import { occurrenceStatus } from "./workoutSchedule";
export function WorkoutHome({
  state: s,
  start,
  edit,
  create,
  history,
  library,
  detail,
  coach,
  reviewProgram,
}: {
  state: D.State;
  start: (w?: D.Workout, p?: D.Program, scheduleOccurrenceId?: string) => void;
  edit: (p: D.Program) => void;
  create: () => void;
  history: () => void;
  library: () => void;
  detail: (s: D.Session) => void;
  coach?: (w: D.Workout, p: D.Program) => void;
  reviewProgram: (p: D.Program) => void;
}) {
  const [planner, setPlanner] = useState(false);
  const [date, setDate] = useState(D.today()),
    [templates, setTemplates] = useState(false);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const exercises = [...D.catalog, ...s.customExercises];
  const active = s.programs.find((p) => !p.archived);
  function program(p: D.Program, open = false) {
    const next = p.workouts.indexOf(D.nextWorkout(p, s.sessions));
    return (
      <details
        className={"program-card grouped " + (p.archived ? "archived" : "")}
        key={p.id}
        open={open || undefined}
      >
        <summary>
          <span className="program-icon">
            <Dumbbell size={22} />
          </span>
          <span>
            <h3>
              <button
                className="program-name-link"
                aria-label={`View program ${p.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  edit(p);
                }}
              >
                {p.name}
              </button>
            </h3>
            <small>
              {p.workouts.length} workouts · Week {p.currentWeek}
            </small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className="program-days">
          {p.workouts.map((w, i) => (
            <button
              className="workout-row"
              key={w.id}
              onClick={() => start(w, p)}
              disabled={p.archived}
              aria-label={`Start ${w.name}`}
            >
              <span>
                <b>{w.name}</b>
                <small className="program-exercise-names">
                  {w.exercises
                    .map(
                      (t) => exercises.find((x) => x.id === t.exerciseId)?.name,
                    )
                    .filter(Boolean)
                    .join(", ")}
                </small>
                <span className="program-muscle-tags">
                  {[
                    ...new Set(
                      w.exercises
                        .map(
                          (t) =>
                            exercises.find((x) => x.id === t.exerciseId)
                              ?.muscle,
                        )
                        .filter(Boolean),
                    ),
                  ].map((m) => (
                    <small key={m}>{m}</small>
                  ))}
                </span>
              </span>
              {open && i === next && <span className="next-tag">Next</span>}
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
        {!p.archived && (
          <button className="btn" onClick={() => reviewProgram(p)}>
            Review program
          </button>
        )}
        <details className="program-options">
          <summary>Program options</summary>
          <p className="caption">{p.description}</p>
          <div className="actions wrap">
            <button className="btn" onClick={() => edit(p)}>
              Edit
            </button>
            <button
              className="btn"
              onClick={() =>
                change((s) => ({
                  ...s,
                  programs: [
                    ...s.programs,
                    {
                      ...structuredClone(p),
                      id: D.uid(),
                      name: p.name + " · copy",
                      archived: false,
                      workouts: p.workouts.map((w) => ({
                        ...w,
                        id: D.uid(),
                        exercises: w.exercises.map((t) => ({
                          ...t,
                          id: D.uid(),
                        })),
                      })),
                    },
                  ],
                }))
              }
            >
              Duplicate
            </button>
            <button
              className="btn"
              onClick={() =>
                change((s) => ({
                  ...s,
                  programs: s.programs.map((x) =>
                    x.id === p.id ? { ...x, archived: !x.archived } : x,
                  ),
                }))
              }
            >
              {p.archived ? "Restore" : "Archive"}
            </button>
            {!p.archived && p.id !== active?.id && (
              <button
                className="btn"
                onClick={() =>
                  change((s) => ({
                    ...s,
                    programs: [p, ...s.programs.filter((x) => x.id !== p.id)],
                  }))
                }
              >
                Activate
              </button>
            )}
          </div>
          <div className="cycle-strip">
            {Array.from({ length: p.weeks }, (_, i) => (
              <button
                key={i}
                className={
                  "cycle-week " + (p.currentWeek === i + 1 ? "selected" : "")
                }
                onClick={() =>
                  change((s) => ({
                    ...s,
                    programs: s.programs.map((x) =>
                      x.id === p.id ? { ...x, currentWeek: i + 1 } : x,
                    ),
                  }))
                }
              >
                W{i + 1}
                <small>{i + 1 === p.deloadWeek ? "Deload" : "Build"}</small>
              </button>
            ))}
          </div>
        </details>
      </details>
    );
  }
  return (
    <div className="workout-home">
      <header className="workout-title">
        <button
          className="icon-button"
          aria-label="Open calendar and history"
          onClick={history}
        >
          <CalendarDays size={22} />
        </button>
        <h1>Workout</h1>
        <button
          className="icon-button"
          aria-label="Create workout or program"
          onClick={create}
        >
          <Plus size={22} />
        </button>
      </header>
      <div className="date-strip" aria-label="Training week">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(d.getDate() + i);
          const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return (
            <button
              key={i}
              onClick={() => setDate(value)}
              aria-pressed={date === value}
              aria-label={d.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            >
              <small>
                {d.toLocaleDateString(undefined, { weekday: "narrow" })}
              </small>
              <span>{d.getDate()}</span>
              <i
                className={
                  s.sessions.some((x) => x.date === value)
                    ? "has-workout"
                    : s.schedule?.some(
                          (x) =>
                            x.date === value &&
                            occurrenceStatus(x, s.sessions) === "planned",
                        )
                      ? "has-plan"
                      : ""
                }
              />
            </button>
          );
        })}
      </div>
      <div className="home-groups">
        <button
          className="text-button plan-workouts-link"
          onClick={() => setPlanner(true)}
        >
          Plan workouts
        </button>
        {planner && (
          <Modal title="Plan workouts" close={() => setPlanner(false)}>
            <WorkoutCalendar
              start={(w, p, id) => {
                setPlanner(false);
                start(w, p, id);
              }}
            />
          </Modal>
        )}
        {s.draft && (
          <button
            className="group-row resume-row"
            aria-label="Resume session"
            onClick={() => start()}
          >
            <Dumbbell size={20} />
            <span>
              <b>Resume session</b>
              <small>{s.draft.name}</small>
            </span>
            <ArrowRight size={20} />
          </button>
        )}
        {date !== D.today() && (
          <section>
            <h2>
              {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </h2>
            {s.sessions.filter((x) => x.date === date).length ? (
              s.sessions
                .filter((x) => x.date === date)
                .map((x) => (
                  <button
                    className="group-row"
                    key={x.id}
                    onClick={() => detail(x)}
                  >
                    {x.name}
                    <ArrowRight size={18} />
                  </button>
                ))
            ) : (
              <p className="caption">No workouts logged on this day.</p>
            )}
          </section>
        )}
        <section>
          <div className="group-heading">
            <h2>Active Program</h2>
            {active && (
              <small className="current-week">Week {active.currentWeek}</small>
            )}
          </div>
          {active ? (
            program(active, true)
          ) : (
            <button className="group-row" onClick={create}>
              <Sparkles size={20} />
              Create a program
              <ArrowRight size={18} />
            </button>
          )}
        </section>
        <section>
          <div className="group-heading">
            <h2>Workout Library</h2>
            <button
              className="text-button"
              onClick={() => setTemplates(!templates)}
            >
              {templates ? "Collapse" : "Templates"}
            </button>
          </div>
          {s.programs
            .filter((p) => !p.archived && p.id !== active?.id)
            .map((p) => program(p))}
          <button className="group-row library-row" onClick={library}>
            <Layers size={21} />
            <span>
              Exercise library<small>Movements, cues & demonstrations</small>
            </span>
            <ArrowRight size={18} />
          </button>
          {templates && (
            <div className="grouped">
              {(["balanced", "upper-lower", "minimal"] as const).map(
                (style) => (
                  <button
                    className="group-row"
                    key={style}
                    onClick={() => edit(D.starterProgram(style))}
                  >
                    {D.starterProgram(style).name}
                    <Plus size={18} />
                  </button>
                ),
              )}
            </div>
          )}
        </section>
        <section>
          <details className="workout-tools">
            <summary>More workout tools</summary>
            <div className="grouped">
              <button className="group-row" onClick={() => start()}>
                <Plus size={20} />
                Empty Workout
                <ArrowRight size={18} />
              </button>
              <button className="group-row" onClick={history}>
                <BookOpen size={20} />
                Workout History
                <ArrowRight size={18} />
              </button>
              <details className="archive-group">
                <summary>
                  <Archive size={20} />
                  <span>
                    Archive
                    <small>
                      {s.programs.filter((p) => p.archived).length || "No"}{" "}
                      archived programs
                    </small>
                  </span>
                  <ChevronDown size={18} />
                </summary>
                {s.programs.filter((p) => p.archived).map((p) => program(p))}
              </details>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
