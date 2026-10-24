import * as D from "./domain";
import {
  applyCoaching,
  evaluateCoaching,
  canonical,
  type CoachingChoice,
} from "./coaching";
import { coachingEventSchema, type CoachingEvent } from "./coachingTypes";

export type GuidancePreview = {
  seed: D.Session;
  basis: string;
  choices: CoachingChoice[];
  records: CoachingEvent[];
  bundle: string;
};
function basis(state: D.State, session: D.Session) {
  const program = state.programs.find((p) => p.id === session.programId),
    workout = program?.workouts.find((w) => w.id === session.workoutId);
  if (!program || program.archived || !workout)
    throw Error("This workout is no longer available. Open a fresh preview.");
  return canonical({
    id: program.id,
    week: program.currentWeek,
    phase: D.programPhase(program),
    effort: program.effort,
    workout,
  });
}
export function createGuidancePreview(
  state: D.State,
  programId: string,
  workoutId: string,
  now = Date.now(),
): GuidancePreview {
  const program = state.programs.find((p) => p.id === programId),
    workout = program?.workouts.find((w) => w.id === workoutId);
  if (!program || !workout) throw Error("Open a current workout.");
  const seed = D.startSession(
    workout.name,
    D.prepareWorkout(
      workout,
      program,
      [...D.catalog, ...state.customExercises],
      state.sessions,
      state.profile?.experience,
    ),
    program,
    workout,
  );
  seed.startedAt = now;
  seed.bodyweight = state.coaching?.bodyweight;
  return {
    seed,
    basis: basis(state, seed),
    choices: [],
    records: [],
    bundle: "coach-" + D.uid(),
  };
}
export function replayGuidance(
  state: D.State,
  preview: GuidancePreview,
  now = Date.now(),
) {
  if (state.draft)
    throw Error(
      "Another workout is active. Resume it before reviewing this preview.",
    );
  if (basis(state, preview.seed) !== preview.basis)
    throw Error("The program changed. Open a fresh preview.");
  let next = state;
  for (const [index, choice] of preview.choices.entries()) {
    next = applyCoaching(next, preview.seed, [choice], now);
    const saved = preview.records[index];
    if (saved) {
      const generated = next.coachingEvents!.at(-1)!;
      const content = ({
        id: _id,
        at: _at,
        note: _note,
        ...value
      }: CoachingEvent) => value;
      if (
        saved.at > now ||
        canonical(content(saved)) !== canonical(content(generated))
      )
        throw Error("The queued decision changed. Review targets again.");
      next = {
        ...next,
        coachingEvents: [
          ...next.coachingEvents!.slice(0, -1),
          coachingEventSchema.parse(saved),
        ],
        decisions: next.decisions.map((d) =>
          d.key === saved.proposalId ? { ...d, at: saved.at } : d,
        ),
      };
    }
  }
  return { state: next, session: next.draft ?? preview.seed };
}
export function guidanceView(
  state: D.State,
  preview: GuidancePreview,
  now = Date.now(),
) {
  const view = replayGuidance(state, preview, now);
  const rows = evaluateCoaching(view.state, view.session, now)
    .filter((p, i, all) => all.findIndex((v) => v.entryId === p.entryId) === i)
    .map((proposal) => ({
      proposal,
      label:
        proposal.action === "reps"
          ? proposal.rows.reduce((n, r) => n + r.reps, 0) <
            proposal.beforeRows.reduce((n, r) => n + r.reps, 0)
            ? "Review reps"
            : "Add a rep"
          : ["load", "trial", "reduce-load"].includes(proposal.action)
            ? "Review load"
            : proposal.action === "recover"
              ? "Recovery review"
              : proposal.action === "hold"
                ? proposal.sourceIds.length
                  ? "Keep"
                  : "Establish baseline"
                : "Review plan",
    }));
  return { ...view, rows };
}
export function guidanceRows(
  state: D.State,
  preview: GuidancePreview,
  now = Date.now(),
) {
  return guidanceView(state, preview, now).rows;
}
export function stageGuidance(
  state: D.State,
  preview: GuidancePreview,
  choice: CoachingChoice,
  now = Date.now(),
) {
  const staged = { ...preview, choices: [...preview.choices, choice] };
  const view = replayGuidance(state, staged, now);
  staged.records = [
    ...preview.records,
    {
      ...view.state.coachingEvents!.at(-1)!,
      note: `Bundle ${preview.bundle}. Coordinated changes cannot establish each component's causal effect.`,
    },
  ];
  return { preview: staged, session: view.session };
}
export function commitGuidance(
  state: D.State,
  preview: GuidancePreview,
  now = Date.now(),
): D.State {
  if (preview.seed.phase === "active-rest")
    throw Error("Review your program phase before starting a workout.");
  const view = replayGuidance(state, preview, now),
    date = new Date(now);
  const draft = {
    ...view.session,
    startedAt: now,
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    duration: 0,
  };
  return D.historyStateSchema.parse({ ...view.state, draft, timer: null });
}
