// Shared by Playwright and its isolated Worker/D1 harness.
export const privateBrowserSuites = [
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
  "glass-ui.spec.ts",
  "exercise-swap.spec.ts",
  "manual-swap-recovery.spec.ts",
  "premium-experience.spec.ts",
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
];

export function browserBatches(mode, focused = []) {
  if (mode === "public") return [focused];
  const suites = focused.length
    ? focused
    : mode === "profiles"
      ? [
          "workspace-profiles.spec.ts",
          "profile-gemini.spec.ts",
          "android-health.spec.ts",
          "app-updates.spec.ts",
        ]
      : privateBrowserSuites;
  return suites.map((name) => [name]);
}
