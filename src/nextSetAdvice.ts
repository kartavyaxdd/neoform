import * as D from "./domain";
import { canonical } from "./coachingEvidence";
export type NextSetCheck = {
  execution: "consistent" | "changed" | "unknown";
  rest: "usual" | "shorter" | "longer" | "unknown";
};
export type NextSetAdvice = {
  kind:
    | "context"
    | "effort"
    | "load"
    | "keep"
    | "rest"
    | "manual"
    | "pause"
    | "done";
  reason: string;
  nextSetId?: string;
  load?: number;
  basis: string;
};
export function nextSetHeadline(
  advice: NextSetAdvice,
  unit: "kg" | "lb",
  convention: D.Exercise["convention"],
) {
  if (advice.kind === "load")
    return `Review ${Number(D.displayLoad(advice.load!, convention, unit).toFixed(2))} ${convention === "machine-label" ? "label" : unit} next`;
  return {
    context: "Check rest & execution",
    effort: "Report the last set’s RIR",
    keep: "Keep the assigned row",
    rest: "Rest before your next set",
    manual: "Review the next set",
    pause: "Pause and review recovery",
    done: "Working sets complete",
  }[advice.kind];
}
export function nextSetAdvice(
  state: D.State,
  session: D.Session,
  entryId: string,
  check?: NextSetCheck,
  now = Date.now(),
): NextSetAdvice {
  const entry = session.exercises.find((e) => e.id === entryId),
    exercises = [...D.catalog, ...state.customExercises],
    ex = exercises.find((x) => x.id === entry?.exerciseId);
  const basis = canonical([
    session.id,
    entry,
    session.readiness,
    session.feedback,
    session.muscleFeedback,
    session.exercises.map((e) => [
      e.id,
      e.exerciseId,
      e.sets.filter((t) => t.done),
    ]),
  ]);
  const advice = (
    kind: NextSetAdvice["kind"],
    reason: string,
    extra: Partial<NextSetAdvice> = {},
  ): NextSetAdvice => ({ kind, reason, basis, ...extra });
  if (!entry || !ex)
    return advice("manual", "Open a current exercise to review its next set.");
  if (state.coaching?.enabled === false)
    return advice(
      "manual",
      "Coaching is disabled. Your assigned targets remain available.",
    );
  if (
    entry.coachingContext?.skipReason === "pain" ||
    session.feedback.pain === true ||
    session.muscleFeedback?.some(
      (m) => [ex.muscle, ...ex.secondary].includes(m.muscle) && m.pain === true,
    ) ||
    [ex.muscle, ...ex.secondary].some(
      (m) =>
        D.recoveryStatus(m, state.sessions, exercises, now, session.readiness)
          .blocked,
    )
  )
    return advice(
      "pause",
      "Pause and review this exercise’s reported pain or incomplete recovery before continuing. No load change is inferred.",
    );
  if (
    (entry.technique && entry.technique !== "straight") ||
    entry.techniqueGroup ||
    entry.protocol ||
    entry.repGoal ||
    entry.tempo ||
    entry.superset ||
    entry.sets.some(
      (t) =>
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  )
    return advice(
      "manual",
      "Review this advanced or linked sequence in its editor; straight-set advice cannot change its bouts.",
    );
  const working = entry.sets.filter((t) => t.kind === "working"),
    nextIndex = working.findIndex((t) => !t.done),
    next = working[nextIndex];
  if (!next)
    return advice(
      "done",
      "The working sets are complete. Review next-workout targets after saving; no extra sets are suggested.",
    );
  const extra = { nextSetId: next.id };
  if (nextIndex === 0 || working.slice(nextIndex + 1).some((t) => t.done))
    return advice(
      "manual",
      "Log the preceding working set in order, or deliberately review skipped work before using next-set advice.",
      extra,
    );
  const last = working[nextIndex - 1],
    previousPlan = last.prescription,
    plan = next.prescription;
  if (
    !previousPlan ||
    !plan ||
    !entry.target ||
    session.phase !== "accumulation" ||
    ex.muscle === "Neck"
  )
    return advice(
      "manual",
      "Keep the current phase and prescription under review. A numeric next-set adjustment is not supported here.",
      extra,
    );
  if (
    working.length !== entry.plannedWorkingSets ||
    [previousPlan, plan].some(
      (p) =>
        p.min !== entry.target!.min ||
        p.max !== entry.target!.max ||
        p.rir !== entry.target!.rir ||
        p.rest !== entry.target!.rest,
    )
  )
    return advice(
      "manual",
      "The dose or assigned row context differs from the current prescription. Review Targets before interpreting this set.",
      extra,
    );
  if (
    state.timer?.setId &&
    session.exercises.some((e) =>
      e.sets.some((t) => t.id === state.timer!.setId),
    ) &&
    (state.timer.paused ? state.timer.remaining > 0 : state.timer.endAt > now)
  )
    return advice(
      "rest",
      "Your rest timer is still active. Finish or extend rest and reassess readiness before changing the next set’s load. The timer is not an order to start.",
      extra,
    );
  if (last.effortReported !== true)
    return advice(
      "effort",
      "Report the last set’s actual RIR if known. Unreported effort stays — and cannot justify a numeric adjustment.",
      extra,
    );
  if (last.weight !== previousPlan.weight || next.weight !== plan.weight)
    return advice(
      "manual",
      "Actual load differs from the assigned plan. Review that change before interpreting a miss or changing another target.",
      extra,
    );
  if (check?.execution !== "consistent" || check.rest !== "usual")
    return advice(
      "context",
      "Check rest and execution first. Shorter rest or changed technique can explain a different result; no numeric load change is inferred.",
      extra,
    );
  if (last.reps >= previousPlan.min && last.rir >= previousPlan.rir)
    return advice(
      "keep",
      "Keep the next assigned row and intended reserve. Do not chase extra reps or raise the load mid-workout just because one set felt easier.",
      extra,
    );
  if (plan.weight < previousPlan.weight)
    return advice(
      "keep",
      "A lighter back-off row is already planned. Keep its intended reserve and reassess; one miss does not justify stacking another reduction.",
      extra,
    );
  const convention = entry.convention ?? ex.convention,
    inventory = entry.setup?.availableLoads ?? [],
    anchor = Math.min(plan.weight, previousPlan.weight);
  const load =
    ["machine-label", "added-bodyweight"].includes(convention) ||
    !inventory.includes(plan.weight) ||
    !inventory.includes(anchor)
      ? undefined
      : [...inventory]
          .reverse()
          .find(
            (v) =>
              v > 0 && v < anchor && v >= anchor - Math.min(5, anchor * 0.1),
          );
  if (load === undefined)
    return advice(
      "manual",
      "The last set missed the lower rep bound or intended reserve after reported usual rest/execution. Review the next load manually; no supported smaller selected load is available.",
      extra,
    );
  return advice(
    "load",
    "The last set missed the lower rep bound or intended reserve after reported usual rest/execution. Consider the next selected lower load while preserving the planned rep range and reserve. Review the result; this is a cautious adjustment, not a fatigue diagnosis.",
    { ...extra, load },
  );
}
