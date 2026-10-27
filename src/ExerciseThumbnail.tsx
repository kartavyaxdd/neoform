import { useState } from "react";
import { Dumbbell, Play } from "lucide-react";
import type { Exercise } from "./domain";
import { useStore } from "./store";
import { demonstrationFor } from "./videos";
export function ExerciseThumbnail({ exercise }: { exercise: Exercise }) {
  const links = useStore().box.data.exerciseVideos;
  const demo = demonstrationFor(exercise, links),
    [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="tutorial-thumbnail" aria-hidden="true">
      {demo && failed !== demo.id ? (
        <>
          <img
            src={`https://i.ytimg.com/vi/${demo.id}/mqdefault.jpg`}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(demo.id)}
          />
          <span className="tutorial-play">
            <Play size={12} />
          </span>
        </>
      ) : (
        <Dumbbell size={20} />
      )}
    </span>
  );
}
