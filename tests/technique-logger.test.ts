import { it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as D from "../src/domain";
vi.mock("../src/store", () => ({
  useStore: () => ({
    box: { data: D.emptyState() },
  }),
  change: vi.fn(),
}));
import { SessionLogger } from "../src/CompactLogger";

it("does not invent a prescription for historical sets without saved targets", () => {
  const entry = D.createEntry(D.catalog[0]);
  delete entry.target;
  entry.sets.forEach((set) => delete set.prescription);
  const html = renderToStaticMarkup(
    createElement(SessionLogger, {
      session: D.startSession("Historical", [entry]),
      exercises: D.catalog,
      unit: "kg",
      history: true,
      setSession: () => {},
      remove: () => {},
    }),
  );
  expect(html).toContain("No saved prescription");
  expect(html).not.toContain("2 RIR target");
});

it("shows differing assigned effort and rep ranges beside actual inputs", () => {
  const entry = D.createEntry(D.catalog[0], D.target(D.catalog[0].id));
  entry.sets[0].prescription = {
    ...entry.sets[0].prescription!,
    min: 9,
    max: 11,
    reps: 10,
    rir: 3,
    rest: 75,
  };
  entry.sets[0].rir = 1;
  entry.sets[0].effortReported = true;
  const html = renderToStaticMarkup(
    createElement(SessionLogger, {
      session: D.startSession("QA", [entry]),
      exercises: D.catalog,
      unit: "kg",
      setSession: () => {},
      remove: () => {},
    }),
  );
  expect(html).toContain('title="Assigned rep range"');
  expect(html).toContain('title="Assigned effort target"');
  expect(html).toContain('title="Assigned rest"');
  expect(entry.sets[0].prescription.rir).toBe(3);
});

it("requires explicit sequence setup before logging a legacy metadata-only advanced prescription", () => {
  const entry = {
    ...D.createEntry(D.catalog[0]),
    technique: "myoreps" as const,
  };
  const html = renderToStaticMarkup(
    createElement(SessionLogger, {
      session: D.startSession("QA", [entry]),
      exercises: D.catalog,
      unit: "kg",
      setSession: () => {},
      remove: () => {},
    }),
  );
  expect(html).toContain("Confirm technique setup");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Complete/);
});
