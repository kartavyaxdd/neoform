import { useState } from "react";
import * as D from "./domain";
import { saveChange, useStore } from "./store";
import { Button } from "./ui";
import {
  calendarDate,
  occurrenceStatus,
  planOccurrence,
  moveOccurrence,
  skipOccurrence,
  repeatOccurrence,
} from "./workoutSchedule";
export function WorkoutCalendar({
  start,
}: {
  start: (w: D.Workout, p: D.Program, slot: string) => void;
}) {
  const { box, error } = useStore(),
    state = box.data;
  const choices = state.programs
    .filter((p) => !p.archived)
    .flatMap((p) => p.workouts.map((w) => ({ p, w, key: p.id + "/" + w.id })));
  const [choice, setChoice] = useState(choices[0]?.key ?? ""),
    [date, setDate] = useState(calendarDate()),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(action: "add" | "move" | "skip" | "repeat") {
    setBusy(true);
    setNotice("");
    try {
      const result = await saveChange((s) => {
        const slots = s.schedule ?? [];
        const current = choices.find((v) => v.key === choice);
        let schedule;
        if (action === "add") {
          if (!current) throw Error("Choose an available routine.");
          schedule = planOccurrence(slots, s.programs, s.sessions, {
            programId: current.p.id,
            workoutId: current.w.id,
            date,
          });
        } else if (!selected) throw Error("Choose a planned workout.");
        else if (action === "move")
          schedule = moveOccurrence(
            slots,
            s.sessions,
            selected,
            date,
            Date.now(),
            s.draft ?? undefined,
          );
        else if (action === "skip")
          schedule = skipOccurrence(
            slots,
            s.sessions,
            selected,
            Date.now(),
            s.draft ?? undefined,
          );
        else
          schedule = repeatOccurrence(
            slots,
            s.programs,
            s.sessions,
            selected,
            date,
          );
        return { ...s, minimumClientVersion: 2, schedule };
      });
      if (result) {
        setNotice(
          "Plan saved on this device. Cloud sync status is shown above.",
        );
        setSelected(null);
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workout-calendar" aria-label="Workout planner">
      <p>
        Plan around your week. Your goal is {state.profile?.days ?? 4} training
        days. Missed or shortened work is never added to another day
        automatically.
      </p>
      <label>
        Routine
        <select
          aria-label="Planned routine"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {choices.map((v) => (
            <option key={v.key} value={v.key}>
              {v.p.name} · {v.w.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input
          type="date"
          aria-label="Planned date"
          min={calendarDate()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <Button
        variant="primary wide"
        disabled={busy || !choices.length}
        onClick={() => void save("add")}
      >
        Add planned workout
      </Button>
      {(notice || error) && <p role="status">{notice || error}</p>}
      <div className="calendar-occurrences">
        {[...(state.schedule ?? [])]
          .sort((a, b) => {
            const today = calendarDate(),
              ap = a.date >= today,
              bp = b.date >= today;
            return ap !== bp
              ? ap
                ? -1
                : 1
              : (ap
                  ? a.date.localeCompare(b.date)
                  : b.date.localeCompare(a.date)) || a.createdAt - b.createdAt;
          })
          .map((slot) => {
            const status = occurrenceStatus(slot, state.sessions),
              active = state.draft?.scheduleOccurrenceId === slot.id;
            const p = state.programs.find(
                (p) => p.id === slot.programId && !p.archived,
              ),
              w = p?.workouts.find((w) => w.id === slot.workoutId);
            const locked =
              active || status === "completed" || status === "skipped";
            return (
              <article key={slot.id} className="calendar-occurrence">
                <b>{slot.workoutName}</b>
                <p className="caption">
                  {slot.date} ·{" "}
                  {active
                    ? "Active"
                    : status === "completed"
                      ? "Logged"
                      : status}
                  {slot.date !== slot.originalDate
                    ? ` · Originally ${slot.originalDate}`
                    : ""}
                </p>
                {selected === slot.id ? (
                  <div className="actions wrap">
                    <p className="caption">
                      Use the date above for Move or Repeat. Repeating creates a
                      separate plan.
                    </p>
                    <Button
                      disabled={busy || locked}
                      onClick={() => void save("move")}
                    >
                      Move to selected date
                    </Button>
                    <Button
                      disabled={busy || locked}
                      onClick={() => void save("skip")}
                    >
                      Skip occurrence
                    </Button>
                    <Button
                      disabled={busy || !w}
                      onClick={() => void save("repeat")}
                    >
                      Repeat on selected date
                    </Button>
                    <Button onClick={() => setSelected(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="actions wrap">
                    {w && p && !locked && (
                      <Button
                        disabled={busy}
                        onClick={() => start(w, p, slot.id)}
                      >
                        Preview planned workout
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setSelected(slot.id);
                        setNotice("");
                      }}
                    >
                      Plan options for {slot.date}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
      </div>
      <details>
        <summary>Planning rules</summary>
        <p className="caption">
          Keep at least one rest day in each affected seven-day window. This is
          an app planning limit, not a measured recovery threshold. Review
          Readiness in the preview before training; a free calendar day does not
          prove recovery. Logged means a workout was saved, not that all targets
          were achieved. Planned dates never change your actual workout date or
          routine.
        </p>
      </details>
    </section>
  );
}
