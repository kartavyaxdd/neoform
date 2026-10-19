import * as D from "./domain";

export type Technique = NonNullable<D.Entry["technique"]>;
export function reviewRecommendation(
  entry: D.Entry,
  recommendation: ReturnType<typeof D.recommend>,
): ReturnType<typeof D.recommend> {
  if (canApplyStraightProgression(entry) &&
      (!recommendation.setTargets || recommendation.setTargets.length === entry.sets.filter(s => s.kind === "working").length))
    return recommendation;
  return {
    ...recommendation,
    action: recommendation.action === "recover" ? "recover" : "hold",
    weight: undefined,
    reps: undefined,
    setTargets: undefined,
    reason:
      recommendation.action === "recover"
        ? recommendation.reason
        : "Review the whole sequence and current set dose; straight-set progression does not apply to a changed dose or technique context.",
    assumptions: [
      ...(recommendation.assumptions || []),
      "Earlier straight-set performance is not an equivalent dose or a progression target for these bouts.",
    ],
    sourcePages: [
      ...new Set([...(recommendation.sourcePages || []), 106, 257]),
    ],
  };
}
export function canApplyStraightProgression(entry: D.Entry) {
  return (
    (!entry.technique || entry.technique === "straight") &&
    !entry.tempo &&
    !entry.repGoal &&
    !entry.superset &&
    !entry.techniqueGroup &&
    entry.sets.every(
      (s) => s.kind !== "drop" && (!s.bout || s.bout === "straight"),
    )
  );
}
export function pairTechnique(
  session: D.Session,
  firstId: string,
  secondId: string,
  technique: "superset" | "pre-exhaust",
  exercises: D.Exercise[],
): D.Session {
  const first = session.exercises.find((e) => e.id === firstId),
    second = session.exercises.find((e) => e.id === secondId);
  if (!first || !second || first === second)
    throw new Error("Choose two different exercises.");
  if (
    [first, second].some(
      (e) => e.techniqueGroup || e.superset || e.sets.some((s) => s.done),
    )
  )
    throw new Error(
      "Unpair existing groups first; keep logged work unchanged.",
    );
  const a = exercises.find((x) => x.id === first.exerciseId),
    b = exercises.find((x) => x.id === second.exerciseId);
  if (!a || !b) throw new Error("Exercise unavailable.");
  if (
    technique === "pre-exhaust" &&
    (a.pattern !== "Isolation" ||
      b.pattern === "Isolation" ||
      ![b.muscle, ...b.secondary].includes(a.muscle))
  )
    throw new Error(
      "Pre-exhaust needs an isolation first, then a compound involving that muscle.",
    );
  if (
    technique === "superset" &&
    [a.muscle, ...a.secondary].some((m) =>
      [b.muscle, ...b.secondary].includes(m),
    )
  )
    throw new Error("Choose non-overlapping muscles for this superset.");
  const group = D.uid();
  const protocol = [first, second].map((e) => {
    const x = exercises.find((x) => x.id === e.exerciseId)!;
    return `${e.exerciseId}[${e.equipment ?? x.equipment}/${e.convention ?? x.convention}]`;
  }).join(" -> ");
  const pair = [first, second].map((e, role) => {
    let round = 0;
    return {
      ...configureTechnique(e, technique),
      protocol: `${technique}: ${protocol}; role ${role + 1}`,
      techniqueGroup: group,
      sets: e.sets.map((s) => ({
        ...s,
        bout: "straight" as const,
        groupId: s.kind === "warmup" ? undefined : `${group}:${round++}`,
      })),
    };
  });
  const rest = session.exercises.filter(
    (e) => e.id !== firstId && e.id !== secondId,
  );
  rest.splice(
    session.exercises
      .filter((e) => e.id !== secondId)
      .findIndex((e) => e.id === firstId),
    0,
    ...pair,
  );
  return { ...session, exercises: rest };
}
export function unpairTechnique(
  session: D.Session,
  entryId: string,
): D.Session {
  const entry = session.exercises.find((e) => e.id === entryId);
  if (!entry?.techniqueGroup) return session;
  const group = session.exercises.filter(
    (e) => e.techniqueGroup === entry.techniqueGroup,
  );
  if (group.some((e) => e.sets.some((s) => s.done)))
    throw new Error("Keep logged pairs unchanged.");
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.techniqueGroup === entry.techniqueGroup
        ? configureTechnique(e, "straight")
        : e,
    ),
  };
}
export function giantProgress(entry: D.Entry) {
  return {
    reps: entry.sets
      .filter((s) => s.done && s.bout === "giant")
      .reduce((n, s) => n + s.reps, 0),
    goal: entry.repGoal || 30,
  };
}
export function appendBout(
  entry: D.Entry,
  input: { weight: number; reps: number; rir: number; rest: number },
): D.Entry {
  if (entry.sets.length >= 40)
    throw new Error("Maximum 40 raw bouts per exercise.");
  const last = entry.sets.filter((s) => s.kind !== "warmup").at(-1);
  const technique = entry.technique || "straight";
  if (
    ["myoreps", "drop-set"].includes(technique) &&
    !entry.sets.some((s) => s.bout === "activation")
  )
    throw new Error("Configure the initial activation before appending bouts.");
  if (
    ["drop-set", "down-set"].includes(technique) &&
    last &&
    (input.weight > last.weight ||
      (input.weight === last.weight &&
        !(technique === "down-set" && last.bout === "down")))
  )
    throw new Error(
      "Enter a lower load or machine label explicitly; no percentage is inferred.",
    );
  if (
    ["myoreps", "giant-set"].includes(technique) &&
    last &&
    input.weight !== last.weight
  )
    throw new Error(
      "Myoreps use the same load. Start a new exercise context to change it.",
    );
  const bout: D.SetLog["bout"] =
    technique === "myoreps"
      ? "mini"
      : technique === "drop-set"
        ? "drop"
        : technique === "down-set"
          ? "down"
          : technique === "giant-set"
            ? "giant"
            : "straight";
  const paired = technique === "superset" || technique === "pre-exhaust";
  const set = D.setSchema.parse({
    ...input,
    effortReported: false,
    id: D.uid(),
    kind: bout === "drop" ? "drop" : "working",
    done: false,
    bout,
    groupId:
      paired && entry.techniqueGroup
        ? `${entry.techniqueGroup}:${entry.sets.filter((s) => s.kind !== "warmup").length}`
        : entry.techniqueGroup,
  });
  return { ...entry, sets: [...entry.sets, set] };
}
export function configureTechnique(
  entry: D.Entry,
  technique: Technique,
): D.Entry {
  if (entry.sets.some((s) => s.done && s.kind !== "warmup"))
    throw new Error("Keep logged work unchanged; configure before logging.");
  const group = D.uid();
  const pending = entry.sets.filter((s) => s.kind !== "warmup");
  const sequence = ["myoreps", "drop-set", "giant-set"].includes(technique);
  const activation = technique === "myoreps" || technique === "drop-set";
  const sets = sequence
    ? pending.slice(0, 1).map((s) => ({
        ...s,
        kind: "working" as const,
        reps: activation ? Math.max(10, Math.min(20, s.reps)) : s.reps,
        bout:
          technique === "giant-set"
            ? ("giant" as const)
            : ("activation" as const),
        groupId: group,
      }))
    : pending.map((s) => ({
        ...s,
        kind: "working" as const,
        bout: "straight" as const,
        groupId: undefined,
      }));
  return {
    ...entry,
    technique,
    protocol: undefined,
    techniqueGroup: sequence ? group : undefined,
    repGoal: technique === "giant-set" ? 30 : undefined,
    tempo:
      technique === "tempo"
        ? { eccentric: 2, pause: 1, concentric: 1 }
        : undefined,
    superset: undefined,
    target: activation
      ? {
          min: 10,
          max: 20,
          rir: entry.target?.rir ?? 2,
          rest: entry.target?.rest ?? 90,
        }
      : entry.target
        ? { ...entry.target }
        : undefined,
    sets: [...entry.sets.filter((s) => s.kind === "warmup"), ...sets],
  };
}
