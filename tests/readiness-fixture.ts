import type { Readiness, Exercise } from "../src/domain";
export const syntheticReadiness = (
  recordedAt = Date.now(),
  muscle: Exercise["muscle"] = "Chest",
): Readiness => ({
  recordedAt,
  fatigue: 1,
  pain: false,
  context: "usual",
  factors: [],
  muscles: [{ muscle, recovered: "yes", pain: false, soreness: 1 }],
});
