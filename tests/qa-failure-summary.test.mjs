import { it, expect } from "vitest";
import {
  browserGateFailures,
  workflowDiagnostic,
} from "../scripts/qa-failure-summary.mjs";
it("reports nested unexpected failures with their first diagnostic line", () => {
  const report = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                file: "tests/browser/example.spec.ts",
                line: 12,
                title: "synthetic save flow",
                tests: [
                  {
                    status: "unexpected",
                    results: [
                      {
                        status: "failed",
                        errors: [
                          {
                            message:
                              "Error: synthetic failure\nprivate-looking details omitted",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  expect(browserGateFailures(report)).toEqual([
    "tests/browser/example.spec.ts:12 synthetic save flow — Error: synthetic failure",
  ]);
});
it("does not label expected failures or passed checks as release failures", () => {
  expect(
    browserGateFailures({
      suites: [
        {
          specs: [
            {
              title: "expected rejection",
              tests: [
                {
                  status: "expected",
                  expectedStatus: "failed",
                  results: [{ status: "failed" }],
                },
              ],
            },
            {
              title: "passed",
              tests: [{ status: "expected", results: [{ status: "passed" }] }],
            },
          ],
        },
      ],
    }),
  ).toEqual([]);
});
it("escapes workflow control characters and bounds diagnostic text", () => {
  const value = workflowDiagnostic(
    "synthetic%\r\n::warning::injection" + "x".repeat(9000),
  );
  expect(value.split("\n")).toHaveLength(1);
  expect(value).toContain("synthetic%25%0D%0A::warning::injection");
  expect(value.length).toBeLessThan(4200);
});
