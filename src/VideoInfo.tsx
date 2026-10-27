import { useId, useMemo, useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import type { Exercise } from "./domain";
import { conventionLabels } from "./domain";
import { change, useStore } from "./store";
import { demonstrationFor, videoId, watchUrl } from "./videos";
import * as D from "./domain";
import { rirColour } from "./rewards";
export function VideoInfo({ exercise: e }: { exercise: Exercise }) {
  const state = useStore().box.data;
  const links = state.exerciseVideos || [],
    personal = links.find((x) => x.exerciseId === e.id);
  const demo = demonstrationFor(e, links),
    id = demo?.id;
  const [playing, setPlaying] = useState(false),
    [url, setUrl] = useState(personal?.url || ""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [tab, setTab] = useState(0),
    tabId = useId();
  const tabs = ["Instructions", "Details", "History"];
  const history = useMemo(
    () =>
      tab !== 2
        ? []
        : [...state.sessions]
            .sort(
              (a, b) =>
                b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
            )
            .flatMap((s) =>
              s.exercises
                .filter(
                  (entry) =>
                    entry.exerciseId === e.id && entry.sets.some((t) => t.done),
                )
                .map((entry) => ({ session: s, entry })),
            ),
    [state.sessions, e.id, tab],
  );
  return (
    <div className="video-info">
      <div
        className="exercise-info-tabs"
        role="tablist"
        aria-label="Exercise information"
      >
        {tabs.map((label, i) => (
          <button
            type="button"
            key={label}
            id={`${tabId}-tab-${i}`}
            role="tab"
            aria-selected={tab === i}
            aria-controls={`${tabId}-panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => {
              setTab(i);
              if (i !== 0) setPlaying(false);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (i + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (i + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(next);
              if (next !== 0) setPlaying(false);
              document.getElementById(`${tabId}-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${tabId}-panel-0`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-0`}
        hidden={tab !== 0}
      >
        {id ? (
          <>
            <div className="video-stage">
              {playing ? (
                <iframe
                  title={`${e.name} demonstration`}
                  src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button
                  className="video-poster"
                  onClick={() => setPlaying(true)}
                  aria-label="Play demonstration"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                    alt=""
                  />
                  <span>
                    <Play size={24} />
                    Play demonstration
                  </span>
                </button>
              )}
            </div>
            <div className="video-credit">
              <b>{demo?.title}</b>
              <span>{demo?.creator}</span>
              <a href={watchUrl(id)} target="_blank" rel="noopener noreferrer">
                Watch on YouTube <ExternalLink size={15} />
              </a>
            </div>
            <p className="caption">
              If playback is restricted, use Watch on YouTube.
            </p>
          </>
        ) : (
          <p className="unmapped">
            No verified demonstration mapped to this movement yet. You can add
            your own specific video below.
          </p>
        )}
        <h3>Technique cues</h3>
        <p>
          {e.instructions ||
            "Use a stable setup and a controlled, comfortable range."}
        </p>
        <p className="caption">
          Log {conventionLabels[e.convention].toLowerCase()}.
        </p>
        <details>
          <summary>
            {personal ? "Edit personal video" : "Add a personal video"}
          </summary>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const next = videoId(url);
              if (!next) {
                setError("Use a specific HTTPS YouTube video link.");
                return;
              }
              if (
                change((s) => ({
                  ...s,
                  exerciseVideos: [
                    ...(s.exerciseVideos || []).filter(
                      (x) => x.exerciseId !== e.id,
                    ),
                    { exerciseId: e.id, url: watchUrl(next) },
                  ],
                }))
              ) {
                setPlaying(false);
                setError("");
                setSaved(true);
              }
            }}
          >
            <label className="field">
              <span>YouTube video URL</span>
              <input
                aria-label="YouTube video URL"
                type="url"
                maxLength={300}
                value={url}
                onChange={(ev) => {
                  setUrl(ev.target.value);
                  setSaved(false);
                }}
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="btn primary" type="submit">
              Save video link
            </button>
            {personal && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  change((s) => ({
                    ...s,
                    exerciseVideos: (s.exerciseVideos || []).filter(
                      (x) => x.exerciseId !== e.id,
                    ),
                  }));
                  setPlaying(false);
                  setUrl("");
                }}
              >
                Remove personal link
              </button>
            )}
            {saved && <p role="status">Video link saved.</p>}
          </form>
        </details>
      </div>
      <div
        id={`${tabId}-panel-1`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-1`}
        hidden={tab !== 1}
      >
        <dl className="exercise-info-facts">
          <div>
            <dt>Equipment</dt>
            <dd>{e.equipment}</dd>
          </div>
          <div>
            <dt>Primary muscle</dt>
            <dd>{e.muscle}</dd>
          </div>
          <div>
            <dt>Supporting muscles</dt>
            <dd>{e.secondary.join(", ") || "None listed"}</dd>
          </div>
          <div>
            <dt>Load convention</dt>
            <dd>{conventionLabels[e.convention]}</dd>
          </div>
        </dl>
        <p className="caption">
          Exercise setup and execution stay separate in your logs. Changing a
          setup does not combine its records with another one.
        </p>
      </div>
      <div
        id={`${tabId}-panel-2`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-2`}
        hidden={tab !== 2}
      >
        {history.length ? (
          history.map(({ session, entry }) => (
            <section
              className="exercise-info-history"
              key={`${session.id}-${entry.id}`}
            >
              <h3>{session.name}</h3>
              <p className="caption">
                {session.date} ·{" "}
                {entry.setup?.label || entry.equipment || e.equipment} ·{" "}
                {session.phase || "Unrecorded phase"}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Load</th>
                    <th>Reps</th>
                    <th>RIR</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.sets.map((t, i) =>
                    t.done ? (
                      <tr key={t.id}>
                        <td>
                          {i + 1}
                          <small>{t.bout || t.kind}</small>
                        </td>
                        <td>
                          {D.displayLoad(
                            t.weight,
                            entry.convention ?? e.convention,
                            state.settings.unit,
                          )}{" "}
                          {entry.convention === "machine-label" ||
                          (!entry.convention &&
                            e.convention === "machine-label")
                            ? "label"
                            : state.settings.unit}
                        </td>
                        <td>{t.reps}</td>
                        <td
                          style={{
                            color: rirColour(t.rir, t.effortReported === true),
                          }}
                        >
                          {t.effortReported === true ? t.rir : "—"}
                        </td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </section>
          ))
        ) : (
          <p className="empty-caption">
            No completed sets for this exercise yet.
          </p>
        )}
      </div>
    </div>
  );
}
