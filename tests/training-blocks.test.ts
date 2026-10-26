import { it, expect } from "vitest";
import {
  blockScenarios,
  evaluateTrainingBlock,
} from "./training-block-fixture";
import { weeklyReview } from "../src/weeklyReview";
import { weekMonday } from "../src/workoutPresentation";
import * as D from "../src/domain";
import { writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
for (const scenario of blockScenarios)
  it(`eight-week coaching block: ${scenario}`, () => {
    const r = evaluateTrainingBlock(scenario);
    expect(r.weeks).toBe(8);
    expect(r.sessions).toBe(32);
    expect(r.summary.forbiddenEscalations).toBe(0);
    expect(r.trace.length).toBeGreaterThanOrEqual(48);
    expect(
      r.reviews.every(
        (v) => v.followups === v.uniqueFollowups && v.followups <= r.sessions,
      ),
    ).toBe(true);
    if (scenario === "improving")
      expect(
        r.summary.accepted,
        JSON.stringify(r.trace.slice(0, 10)),
      ).toBeGreaterThan(2);
    if (scenario === "local-recovery") {
      expect(r.summary.recoveryReviews).toBeGreaterThan(0);
      expect(r.summary.deloadOffers).toBe(0);
    }
    if (scenario === "systemic-recovery")
      expect(r.summary.deloadOffers).toBeGreaterThan(0);
    if (scenario === "repeated-misses")
      expect(r.summary.proposedReductions).toBeGreaterThan(0);
    if (scenario === "cut-volume") expect(r.volumeAccepted).toBe(0);
    if (scenario === "volume-experiment")
      expect(
        r.volumeAccepted,
        JSON.stringify(r.trace.filter((t) => t.week === 4)),
      ).toBe(1);
    for (let week = 1; week <= 8; week++) {
      const at =
        Date.parse("2026-08-03T10:00:00Z") + ((week - 1) * 7 + 6) * 86400000;
      const review = weeklyReview(
        r.state,
        D.catalog,
        weekMonday(new Date(at).toISOString().slice(0, 10)),
        at,
      );
      expect(
        review.muscle.rows.every(
          (m) =>
            m.qualified <= m.completed && m.indirectQualified <= m.indirect,
        ),
      ).toBe(true);
    }
    if (process.env.NEOFORM_BLOCK_OUTPUT) {
      const root = realpathSync(path.resolve(".qa-state")),
        dir = realpathSync(process.env.NEOFORM_BLOCK_OUTPUT);
      if (!dir.startsWith(root + path.sep))
        throw Error("Evaluation output must be isolated");
      writeFileSync(
        path.join(dir, scenario + ".json"),
        JSON.stringify(
          {
            scenario,
            weeks: r.weeks,
            sessions: r.sessions,
            ...r.summary,
            trace: r.trace,
            reviews: r.reviews,
          },
          null,
          2,
        ),
      );
    }
  }, 30000);
