import * as D from "./domain";
import {
  canonical,
  coachContextKey,
  precedingDoseIssue,
} from "./coachingEvidence";
import { recoveryTime } from "./readiness";

export type LiftObservation = {
  sessionId: string;
  entryId: string;
  date: string;
  at: number;
  comparable: boolean;
  note: string;
  rows: {
    setId: string;
    ordinal: number;
    weight: number;
    reps: number;
    rir: number | null;
    method: string;
    prescription?: D.SetLog["prescription"];
  }[];
  changes: { id: string; label: string; edited: boolean }[];
};
export type LiftSegment = {
  id: string;
  key: string;
  exercise: D.Exercise;
  equipment: D.Exercise["equipment"];
  convention: D.Exercise["convention"];
  setup?: D.EquipmentSetup;
  phase?: D.Phase;
  target?: D.Entry["target"];
  planned?: number;
  method: string;
  workout: string;
  preceding: string[];
  exposures: LiftObservation[];
};

export function liftSegments(
  state: D.State,
  exerciseId: string,
  now = Date.now(),
): LiftSegment[] {
  const exercise = [...D.catalog, ...state.customExercises].find(
    (x) => x.id === exerciseId,
  );
  if (!exercise) return [];
  const result: LiftSegment[] = [],
    lastByStream = new Map<string, LiftSegment>();
  const decisions = new Map(
    (state.coachingEvents ?? [])
      .filter(
        (e) =>
          e.kind === "decision" &&
          e.proposal &&
          ["accept", "edit"].includes(e.choice ?? ""),
      )
      .map((e) => [e.proposalId, e]),
  );
  for (const s of [...state.sessions]
    .filter((s) => s.startedAt <= now && recoveryTime(s) <= now)
    .sort(
      (a, b) => recoveryTime(a) - recoveryTime(b) || a.id.localeCompare(b.id),
    )) {
    for (const e of s.exercises.filter((e) => e.exerciseId === exerciseId)) {
      const rows = e.sets.filter((t) => t.kind !== "warmup" && t.done);
      if (!rows.length) continue;
      const working = e.sets.filter((t) => t.kind === "working");
      const advanced = !!(
        (e.technique && e.technique !== "straight") ||
        e.techniqueGroup ||
        e.repGoal ||
        e.tempo ||
        e.superset ||
        e.sets.some(
          (t) =>
            t.kind !== "warmup" &&
            (t.kind !== "working" || (t.bout && t.bout !== "straight")),
        )
      );
      const unambiguous =
        s.exercises.filter(
          (other) =>
            other.exerciseId === e.exerciseId &&
            other.sourceTargetId === e.sourceTargetId,
        ).length === 1;
      const bodyweight =
        s.bodyweight &&
        s.bodyweight.at <= s.startedAt &&
        s.startedAt - s.bodyweight.at <= 7 * 86400000
          ? s.bodyweight.kg
          : null;
      const key = canonical([
        coachContextKey(s, e, exercise),
        unambiguous ? null : [s.id, e.id],
        (e.convention ?? exercise.convention) === "added-bodyweight"
          ? (bodyweight ?? s.id)
          : null,
      ]);
      const stream = canonical([
        s.programId ?? null,
        s.workoutId ?? null,
        e.sourceTargetId ?? null,
      ]);
      let segment = lastByStream.get(stream);
      if (!segment || segment.key !== key) {
        segment = {
          id: `${s.id}:${e.id}`,
          key,
          exercise,
          equipment: e.equipment ?? exercise.equipment,
          convention: e.convention ?? exercise.convention,
          setup: e.setup,
          phase: s.phase,
          target: e.target,
          planned: e.plannedWorkingSets,
          method: D.executionContext(e, undefined, s.phase),
          workout: s.name,
          preceding: s.exercises
            .slice(0, s.exercises.indexOf(e))
            .map(
              (other) =>
                `${[...D.catalog, ...state.customExercises].find((x) => x.id === other.exerciseId)?.name ?? "Exercise"} · ${other.plannedWorkingSets ?? "?"} planned sets${other.setup ? ` · ${other.setup.label}` : ""}`,
            ),
          exposures: [],
        };
        result.push(segment);
        lastByStream.set(stream, segment);
      }
      const confirmation = e.coachingContext;
      const pain =
        e.coachingContext?.skipReason === "pain" ||
        s.feedback.pain === true ||
        s.muscleFeedback?.some(
          (m) =>
            [exercise.muscle, ...exercise.secondary].includes(m.muscle) &&
            m.pain === true,
        );
      const precedingIssue = precedingDoseIssue(s, e, now);
      const exclusion = pain
        ? "Reported pain: review this saved observation separately."
        : precedingIssue
          ? precedingIssue
          : advanced
            ? "Advanced method: inspect the raw bouts separately."
            : !unambiguous
              ? "Repeated exercise instance is ambiguous."
              : !s.phase
                ? "Training phase was not recorded."
                : !e.target ||
                    !e.plannedWorkingSets ||
                    working.length !== e.plannedWorkingSets ||
                    working.some((t) => !t.done)
                  ? "Planned working dose incomplete or unknown."
                  : confirmation?.execution !== "consistent" ||
                      confirmation.rest !== "usual"
                    ? "Execution or rest unconfirmed/changed."
                    : confirmation.recordedAt < s.startedAt ||
                        confirmation.recordedAt > s.startedAt + 2 * 86400000 ||
                        confirmation.recordedAt > now
                      ? "Execution confirmation does not describe this completed workout."
                      : (e.convention ?? exercise.convention) ===
                            "added-bodyweight" && bodyweight === null
                        ? "Bodyweight reference unreported or stale."
                        : null;
      const comparable = exclusion === null;
      const note =
        exclusion ??
        "Matching declared context and complete dose; effort is shown only when reported.";
      const ids = [
        ...new Set(
          rows.flatMap((r) =>
            r.prescription?.proposalId ? [r.prescription.proposalId] : [],
          ),
        ),
      ];
      segment.exposures.push({
        sessionId: s.id,
        entryId: e.id,
        date: s.date,
        at: recoveryTime(s),
        comparable,
        note,
        rows: rows.map((t) => ({
          setId: t.id,
          ordinal: e.sets.filter((v) => v.kind !== "warmup").indexOf(t),
          weight: t.weight,
          reps: t.reps,
          rir: t.effortReported === true ? t.rir : null,
          method: D.executionContext(e, t, s.phase),
          prescription: t.prescription,
        })),
        changes: ids.flatMap((id) => {
          const d = decisions.get(id);
          return d?.proposal
            ? [
                {
                  id,
                  label: d.proposal.action.replaceAll("-", " "),
                  edited: d.choice === "edit",
                },
              ]
            : [];
        }),
      });
    }
  }
  return result.sort(
    (a, b) => a.exposures[0].at - b.exposures[0].at || a.id.localeCompare(b.id),
  );
}

export function liftPoints(
  segment: LiftSegment,
  ordinal: number,
  weight: number,
  rir: number | null,
) {
  if (rir === null) return [];
  return segment.exposures
    .filter((e) => e.comparable)
    .flatMap((e) => {
      const row = e.rows.find(
        (r) => r.ordinal === ordinal && r.weight === weight && r.rir === rir,
      );
      return row
        ? [
            {
              ...row,
              sessionId: e.sessionId,
              entryId: e.entryId,
              date: e.date,
              at: e.at,
            },
          ]
        : [];
    });
}
