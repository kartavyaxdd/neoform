import type { Readiness, Session } from "./domain";

// A software freshness limit for a check-in, not a physiological recovery timer.
export const READINESS_MAX_AGE_MS = 12 * 3600000;
export const readinessFresh = (
  r: Pick<Readiness, "recordedAt"> | undefined,
  now: number,
) => !!r && r.recordedAt <= now && now - r.recordedAt <= READINESS_MAX_AGE_MS;

export function recoveryTime(s: Session) {
  const dateTime = Date.parse(s.date + "T12:00:00Z");
  // Legacy imports sometimes retain only an ordinal startedAt. Anchor those
  // date-only reports to local day start for ordering; noon UTC can be in the
  // future during an early-morning check-in. This is not a measured event time.
  return Math.abs(s.startedAt - dateTime) <= 36 * 3600000
    ? s.startedAt + s.duration * 1000
    : Date.parse(s.date + "T00:00:00");
}

export function recoveryObservations(
  sessions: Session[],
  current: Readiness | undefined,
  now: number,
): Session[] {
  const observations: Session[] = [];
  function addReadiness(r: Readiness, key: string) {
    if (r.recordedAt > now) return; // Future reports cannot clear known flags.
    observations.push({
      id: key,
      name: "Pre-session readiness",
      date: new Date(r.recordedAt).toISOString().slice(0, 10),
      startedAt: r.recordedAt,
      duration: 0,
      notes: "",
      exercises: [],
      feedback: { reported: true, pain: r.pain, fatigue: r.fatigue },
    });
    for (const row of r.muscles) {
      const at = row.recordedAt ?? r.recordedAt;
      if (at > now) continue;
      observations.push({
        id: key + ":" + row.muscle,
        name: "Pre-session muscle readiness",
        date: new Date(at).toISOString().slice(0, 10),
        startedAt: at,
        duration: 0,
        notes: "",
        exercises: [],
        feedback: { reported: false },
        muscleFeedback: [{ ...row, recordedAt: at }],
      });
    }
  }
  for (const s of sessions) {
    if (s.readiness) addReadiness(s.readiness, s.id + ":before");
    const at = recoveryTime(s);
    observations.push({
      ...s,
      feedback:
        at > now
          ? {
              reported: false,
              pain: s.feedback.pain === true ? true : null,
              fatigue:
                (s.feedback.fatigue ?? 0) >= 4 ? s.feedback.fatigue : null,
              soreness:
                (s.feedback.soreness ?? 0) >= 4 ? s.feedback.soreness : null,
            }
          : s.feedback,
      startedAt: at,
      duration: 0,
      muscleFeedback: undefined,
    });
    for (const row of s.muscleFeedback ?? []) {
      const recordedAt = row.recordedAt ?? at;
      if (recordedAt > now) {
        // Keep an explicit pain warning, but a future timestamp cannot attest recovery.
        if (row.pain !== true) continue;
      }
      observations.push({
        id: s.id + ":" + row.muscle,
        name: "Muscle report",
        date: new Date(Math.min(recordedAt, now)).toISOString().slice(0, 10),
        startedAt: Math.min(recordedAt, now),
        duration: 0,
        notes: "",
        exercises: [],
        feedback: { reported: false },
        muscleFeedback: [
          recordedAt > now ? { muscle: row.muscle, pain: true } : row,
        ],
      });
    }
  }
  if (current) addReadiness(current, "current-readiness");
  return observations.sort((a, b) => a.startedAt - b.startedAt);
}
