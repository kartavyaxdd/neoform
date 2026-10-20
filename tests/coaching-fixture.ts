import { coachingEventSchema, type CoachingEvent } from "../src/coachingTypes";
export function syntheticCoachingEvent(index = 0): CoachingEvent {
  const proposalId = `coach-qa-proposal-${index}`;
  return coachingEventSchema.parse({
    id: "coach-" + crypto.randomUUID(),
    at: 1000 + index,
    kind: "decision",
    proposalId,
    choice: "defer",
    scope: "session",
    proposal: {
      id: proposalId,
      version: "coach-v1",
      action: "hold",
      sessionId: "synthetic-session",
      entryId: "synthetic-entry",
      exerciseId: "bench",
      fingerprint: "synthetic-basis-" + index,
      reason: "Synthetic pending observation",
      evidence: [],
      excluded: [],
      sourceIds: [],
      rows: [],
      beforeRows: [],
      review: "Collect confirmed observations",
      uncertain: true,
    },
  });
}
