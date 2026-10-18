import { useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import type { Exercise } from "./domain";
import { conventionLabels } from "./domain";
import { change, useStore } from "./store";
import { demonstrations, videoId, watchUrl } from "./videos";
export function VideoInfo({ exercise: e }: { exercise: Exercise }) {
  const links = useStore().box.data.exerciseVideos || [],
    personal = links.find((x) => x.exerciseId === e.id);
  const demo = demonstrations[e.id],
    id = personal ? videoId(personal.url) : demo?.id;
  const [playing, setPlaying] = useState(false),
    [url, setUrl] = useState(personal?.url || ""),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <div className="video-info">
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
            <b>{personal ? "Personal demonstration" : demo.title}</b>
            <span>{personal ? "Your saved video" : demo.creator}</span>
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
      <div className="chips">
        <span className="tag">{e.equipment}</span>
        <span className="tag">{e.muscle}</span>
        {e.secondary.map((m) => (
          <span className="tag" key={m}>
            {m}
          </span>
        ))}
      </div>
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
  );
}
