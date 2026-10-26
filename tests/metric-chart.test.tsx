import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricChart, ComparisonBars } from "../src/MetricChart";
it("never connects unknown values or different contexts", () => {
  const s = renderToStaticMarkup(
    <MetricChart
      title="Example"
      unit="RIR"
      kind="line"
      points={[
        { id: "1", label: "2026-10-01", value: 2, group: "a" },
        { id: "2", label: "2026-10-02", value: null, group: "a" },
        { id: "3", label: "2026-10-03", value: 3, group: "a" },
        { id: "4", label: "2026-10-04", value: 2, group: "b" },
      ]}
    />,
  );
  expect(s).not.toContain('class="chart-line"');
  expect(s).toContain("—");
  expect(s).toContain("exact saved values");
});
it("unknown assignments remain unknown while bars share a zero-based scale", () => {
  const s = renderToStaticMarkup(
    <ComparisonBars
      title="Work"
      rows={[
        { label: "Completed", value: 3, secondary: null },
        { label: "Other", value: 6 },
      ]}
    />,
  );
  expect(s).toContain("width:50%");
  expect(s).toContain("0–6 sets");
  expect(s).toContain("— sets");
  expect(s).toContain("unknown");
});
it("empty charts never fabricate trend points", () => {
  expect(
    renderToStaticMarkup(<MetricChart title="Weight" unit="kg" points={[]} />),
  ).toContain("No saved observations yet");
});
