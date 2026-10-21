import type { CSSProperties } from "react";
import type * as D from "./domain";
type Muscle = D.Exercise["muscle"];
export const front: Partial<Record<Muscle, string[]>> = {
  Neck: ["M87 37H113L110 54H90Z"],
  Shoulders: [
    "M77 50Q55 51 51 75L70 80 80 65Z",
    "M123 50Q145 51 149 75L130 80 120 65Z",
  ],
  Chest: [
    "M80 57Q88 53 98 55L98 84Q86 91 75 82L73 69Z",
    "M102 55Q112 53 120 57L127 69 125 82Q114 91 102 84Z",
  ],
  Biceps: ["M52 80L68 85 62 112 45 109Z", "M132 85L148 80 155 109 138 112Z"],
  Forearms: [
    "M45 114L61 117 49 151 34 148Z",
    "M139 117L155 114 166 148 151 151Z",
  ],
  Core: [
    "M87 93Q92 89 98 92V104H87Z",
    "M102 92Q108 89 113 93V104H102Z",
    "M87 108H98V120H87Z",
    "M102 108H113V120H102Z",
    "M87 124H98V140L88 147Z",
    "M102 124H113L112 147 102 140Z",
    "M76 91L83 96 84 142 80 134Z",
    "M117 96L124 91 120 134 116 142Z",
  ],
  Quads: [
    "M81 156L88 154 86 194 79 207Q73 186 76 172Z",
    "M91 154L98 156 95 202 89 213 86 200Z",
    "M111 154L119 156 124 172Q127 186 121 207L114 194Z",
    "M102 156L109 154 114 200 111 213 105 202Z",
  ],
  Calves: [
    "M80 219L96 217 92 258 81 268 76 250Z",
    "M104 217L120 219 124 250 119 268 108 258Z",
  ],
};
export const back: Partial<Record<Muscle, string[]>> = {
  Neck: ["M88 37H112L117 54H83Z"],
  Shoulders: front.Shoulders,
  Back: [
    "M85 53L98 50V85L78 68Z",
    "M102 50L115 53 122 68 102 85Z",
    "M75 73L96 90 93 123 81 113 76 95Z",
    "M104 90L125 73 124 95 119 113 107 123Z",
    "M95 96L98 93V145L86 149Z",
    "M102 93L105 96 114 149 102 145Z",
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

export const bodySilhouette =
  "M88 6Q100 -2 112 6Q118 15 114 28L108 39 110 46Q116 50 128 51Q145 54 149 73L158 109Q160 123 168 144L174 154 172 167Q170 173 166 169L158 154 144 125 133 96Q128 117 128 134L130 153Q136 165 132 183L125 216Q129 235 124 252L120 271 126 282Q130 290 122 292H108Q103 290 105 278L107 247 100 215 93 247 95 278Q97 290 92 292H78Q70 290 74 282L80 271 76 252Q71 235 75 216L68 183Q64 165 70 153L72 134Q72 117 67 96L56 125 42 154 34 169Q30 173 28 167L26 154 32 144Q40 123 42 109L51 73Q55 54 72 51Q84 50 90 46L92 39 86 28Q82 15 88 6Z";

/** Shared primary-muscle schematic; colour represents logged work, not growth. */
export function TrainingBodyMap({
  counts,
  selected,
  onSelect,
  countLabel = "working sets",
}: {
  counts: Partial<Record<Muscle, number>>;
  selected?: Muscle;
  onSelect?: (muscle: Muscle) => void;
  countLabel?: string;
}) {
  const max = Math.max(
    1,
    ...Object.values(counts).filter((n): n is number => n != null),
  );
  return (
    <div className="body-maps">
      {(["Front", "Back"] as const).map((side) => (
        <figure key={side}>
          <svg
            viewBox="20 0 160 300"
            role={onSelect ? "group" : "img"}
            aria-label={`${side} muscle map`}
          >
            <path className="body-base" d={bodySilhouette} />
            {Object.entries(side === "Front" ? front : back).map(
              ([name, paths]) => {
                const muscle = name as Muscle,
                  count = counts[muscle] ?? 0;
                return (
                  <g
                    key={name}
                    role={onSelect ? "button" : undefined}
                    tabIndex={onSelect ? 0 : undefined}
                    aria-label={`${side} ${name}: ${count} ${countLabel}`}
                    aria-pressed={onSelect ? selected === name : undefined}
                    onClick={onSelect ? () => onSelect(muscle) : undefined}
                    onKeyDown={
                      onSelect
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelect(muscle);
                            }
                          }
                        : undefined
                    }
                    className={`muscle ${selected === name ? "selected" : ""}`}
                    style={
                      {
                        "--dose": count ? 0.45 + (0.55 * count) / max : 0,
                      } as CSSProperties
                    }
                  >
                    {paths!.map((d, i) => (
                      <path d={d} key={i} />
                    ))}
                  </g>
                );
              },
            )}
          </svg>
          <figcaption>{side}</figcaption>
        </figure>
      ))}
    </div>
  );
}
