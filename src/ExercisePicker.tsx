import { useState } from "react";
import { Search, ChevronRight, Plus } from "lucide-react";
import * as D from "./domain";
export function ExercisePicker({
  exercises,
  onPick,
  browse = false,
  preferredMuscle,
  disabled = false,
}: {
  exercises: D.Exercise[];
  onPick: (e: D.Exercise) => void;
  browse?: boolean;
  preferredMuscle?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState(""),
    [muscle, setMuscle] = useState(preferredMuscle || ""),
    [gear, setGear] = useState(""),
    [pattern, setPattern] = useState("");
  const filtered = exercises.filter(
    (e) =>
      (!q ||
        (e.name + " " + e.muscle).toLowerCase().includes(q.toLowerCase())) &&
      (!muscle || e.muscle === muscle) &&
      (!gear || e.equipment === gear) &&
      (!pattern || e.pattern === pattern),
  );
  return (
    <>
      <div className="filter-row">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Search exercises"
            placeholder="Search movements…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Muscle filter"
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
        >
          <option value="">All muscles</option>
          {D.muscles.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Equipment filter"
          value={gear}
          onChange={(e) => setGear(e.target.value)}
        >
          <option value="">All equipment</option>
          {D.equipment.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Movement filter"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        >
          <option value="">All patterns</option>
          {D.patterns.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <p className="caption">
        {filtered.length} movements ·{" "}
        {browse
          ? "Select for instructions and alternatives."
          : "Substitutions begin a new comparable load history."}
      </p>
      <div className={browse ? "exercise-grid" : "picker-list"}>
        {filtered.map((e) => (
          <button
            className="exercise-card"
            key={e.id}
            disabled={disabled}
            onClick={() => onPick(e)}
          >
            <span className="muscle-icon">
              {e.muscle.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{e.name}</b>
              <small>
                {e.muscle} · {e.equipment}
              </small>
              <span className="caption">
                {D.conventionLabels[e.convention]}
              </span>
            </span>
            {browse ? <ChevronRight size={18} /> : <Plus size={18} />}
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-caption">
          <b>No movements found.</b>
          Try a different filter or create your own exercise.
        </div>
      )}
    </>
  );
}
