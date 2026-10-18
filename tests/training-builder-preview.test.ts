import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const scene = vi.hoisted(() => ({ review: false, tempo: false }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (value: unknown) =>
      react.useState(
        scene.review && value === 0
          ? 3
          : scene.review && value === null
            ? {
                name: "FIXTURE ONLY",
                description: "Synthetic UI preview",
                weeks: 6,
                workouts: [0, 1, 2].map((i) => ({
                  name: `Day ${i + 1}`,
                  exercises: [
                    {
                      exerciseId: "goblet",
                      sets: 2,
                      min: 8,
                      max: 12,
                      rir: 3,
                      rest: 90,
                      ...(scene.tempo
                        ? {
                            technique: "tempo",
                            tempo: { eccentric: 3, pause: 1, concentric: 1 },
                          }
                        : {}),
                    },
                  ],
                })),
              }
            : scene.tempo &&
                typeof value === "object" &&
                value !== null &&
                "goal" in value
              ? { ...value, technique: "tempo", experience: "Intermediate" }
              : value,
      ),
  };
});
vi.mock("../src/store", () => ({
  useStore: () => ({ box: { data: { profile: null } } }),
  request: vi.fn(),
  saveChange: vi.fn(),
}));
import { AiWizard } from "../src/AiWizard";
import { saveChange, request } from "../src/store";
it("starts straight and renders deterministic source-linked review warnings without saving or generating", () => {
  scene.review = false;
  const focus = renderToStaticMarkup(
    createElement(AiWizard, { close: vi.fn() }),
  );
  expect(focus).toContain("Technique preference");
  expect(focus).toContain('value="straight" selected=""');
  scene.review = true;
  const review = renderToStaticMarkup(
    createElement(AiWizard, { close: vi.fn() }),
  );
  expect(review).toContain("Program audit");
  expect(review).toContain("builder-v1");
  expect(review).toContain("physical PDF pp.");
  expect(review).toContain("not measured effective volume");
  expect(review).toContain("Straight sets");
  expect(saveChange).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
it("makes opted-in cadence visible and editable, with a straight-set escape hatch", () => {
  scene.review = true;
  scene.tempo = true;
  const review = renderToStaticMarkup(
    createElement(AiWizard, { close: vi.fn() }),
  );
  expect(review).toContain("Tempo 3–1–1s");
  expect(review).toContain("eccentric seconds");
  expect(review).toContain("Use straight sets");
  expect(review).toContain("explicitly opted in");
});
