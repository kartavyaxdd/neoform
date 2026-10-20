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
