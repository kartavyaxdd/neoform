import { defineConfig } from "@playwright/test";
import { qaTarget } from "./tests/qa-target";
const baseURL = qaTarget();
const evidenceRoot = process.env.NEOFORM_QA_OUTPUT!;
export default defineConfig({
  testDir: "./tests/browser",
  // Provider-independent end-to-end release gates. Live-provider and special
  // access-mode rehearsals require their separate isolated configurations.
  testMatch:
    process.env.NEOFORM_QA_MODE === "profiles"
      ? ["workspace-profiles.spec.ts"]
      : process.env.NEOFORM_QA_MODE === "public"
        ? [
            "public-storage.spec.ts",
            "preview-guidance.spec.ts",
            "coaching-response.spec.ts",
            "lift-progress.spec.ts",
            "next-set.spec.ts",
            "coaching.spec.ts",
            "ui-redesign.spec.ts",
            "adaptive-workout.spec.ts",
            "gym-experience.spec.ts",
            "workout-recap.spec.ts",
            "reference-fidelity.spec.ts",
            "program-layout.spec.ts",
            "planning.spec.ts",
            "weekly-muscles.spec.ts",
          ]
        : [
            "preview-guidance.spec.ts",
            "coaching-response.spec.ts",
            "lift-progress.spec.ts",
            "next-set.spec.ts",
            "ui-redesign.spec.ts",
            "adaptive-workout.spec.ts",
            "gym-experience.spec.ts",
            "workout-recap.spec.ts",
            "reference-fidelity.spec.ts",
            "program-layout.spec.ts",
            "planning.spec.ts",
            "weekly-muscles.spec.ts",
            "coaching.spec.ts",
            "readiness.spec.ts",
            "reliability.spec.ts",
            "training-phase.spec.ts",
            "v2-layout.spec.ts",
            "v2-accessibility.spec.ts",
            "mutation-queue.spec.ts",
            "coaching-recovery.spec.ts",
            "storage-release.spec.ts",
            "store-races.spec.ts",
          ],
  timeout: 90000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${evidenceRoot}/browser-artifacts`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidenceRoot}/browser-report`, open: "never" }],
    ["json", { outputFile: `${evidenceRoot}/browser-results.json` }],
  ],
  use: {
    baseURL,
    headless: true,
    ...(process.env.NEOFORM_QA_BROWSER
      ? { launchOptions: { executablePath: process.env.NEOFORM_QA_BROWSER } }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
});
