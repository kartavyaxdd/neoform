import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as D from "../src/domain";
import * as T from "../src/techniques";
import { TechniqueSheet } from "../src/TechniqueSheet";

it("offers explicit whole-pair unpairing only while both exercises are unlogged", () => {
  const a = D.createEntry(D.catalog.find((x) => x.id === "bench")!),
    b = D.createEntry(D.catalog.find((x) => x.id === "curl")!);
  const session = T.pairTechnique(
    D.startSession("QA", [a, b]),
    a.id,
    b.id,
    "superset",
    D.catalog,
  );
  const props = {
    session,
    entry: session.exercises[0],
    exercises: D.catalog,
    unit: "kg" as const,
    onChange: () => {},
  };
  const html = renderToStaticMarkup(createElement(TechniqueSheet, props));
  expect(html).toContain("Unpair unlogged exercises");
  session.exercises[1].sets[0].done = true;
  const locked = renderToStaticMarkup(createElement(TechniqueSheet, props));
  expect(locked).toMatch(
    /<button[^>]*disabled=""[^>]*>Unpair unlogged exercises/,
  );
});
