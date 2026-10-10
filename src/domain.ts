import { z } from "zod";
export const uid = () => crypto.randomUUID();
export const MAX_BACKUP = 2_000_000;
export const MAX_STATE_BYTES = MAX_BACKUP - 256;
const id = z.string().min(1).max(100),
  name = z.string().trim().min(1).max(120),
  note = z.string().max(2000);
export const muscles = [
  "Chest",
  "Back",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Calves",
  "Core",
] as const;
export const equipment = [
  "Barbell",
  "Dumbbell",
  "Cable",
  "Machine",
  "Bodyweight",
  "Band",
] as const;
export const patterns = [
  "Push",
  "Pull",
  "Squat",
  "Hinge",
  "Isolation",
  "Core",
] as const;
export const conventions = [
  "total",
  "per-dumbbell",
  "per-side",
  "machine-label",
  "added-bodyweight",
] as const;
export const conventionLabels: Record<string, string> = {
  total: "Total load",
  "per-dumbbell": "Per dumbbell",
  "per-side": "Per side",
  "machine-label": "Machine label",
  "added-bodyweight": "Added bodyweight",
};
export const exerciseSchema = z
  .object({
    id,
    name,
    muscle: z.enum(muscles),
    secondary: z.array(z.enum(muscles)).max(5),
    equipment: z.enum(equipment),
    pattern: z.enum(patterns),
    convention: z.enum(conventions),
    e1rm: z.boolean(),
    instructions: note,
  })
  .strict();
export type Exercise = z.infer<typeof exerciseSchema>;
const cues: Record<string, string> = {
  bench:
    "Set your feet and upper back firmly. Lower the bar to a repeatable comfortable touch point, then press without bouncing. Include the bar in total load.",
  "incline-db":
    "Use a modest bench incline. Keep forearms under the dumbbells and lower with control. Enter the weight of one dumbbell.",
  "cable-fly":
    "Keep a soft elbow bend and bring your hands together through a comfortable arc. Enter the resistance on one side; use the same cable setup each time.",
  pushup:
    "Keep your trunk braced as one unit and use a repeatable chest depth. Enter added external load only, not your bodyweight.",
  row: "Brace in a stable hip hinge. Pull toward the lower ribs without turning the rep into a hip drive. Include the bar in total load.",
  "db-row":
    "Support your trunk and pull the elbow toward your hip. Log the single dumbbell load and reps per side; repeat on both sides.",
  pulldown:
    "Secure the thigh pad, keep your torso stable and pull toward the upper chest. Record the machine label as entered. Create a separate exercise for another machine.",
  "cable-row":
    "Use the same seat, handle and cable station. Pull with a stable trunk and avoid rocking. Keep the resistance label consistent.",
  pullup:
    "Start with a controlled hang and pull through a repeatable range without swinging. Enter added load only. Use a distinct custom exercise for assisted pull-ups.",
  squat:
    "Brace before each rep. Descend to a repeatable comfortable depth with your feet planted, then stand while keeping the bar balanced. Include the bar in load.",
  goblet:
    "Hold one dumbbell close to your chest. Sit between your hips through a comfortable range, then stand with a braced trunk. Enter the single implement load.",
  "leg-press":
    "Choose a repeatable seat position and foot placement. Lower without rounding your pelvis, then press without abruptly locking your knees. Record the same machine label.",
  "leg-extension":
    "Align your knee with the machine pivot and adjust the shin pad. Extend with control without lifting your hips. Keep seat settings and the resistance label consistent.",
  "split-squat":
    "Use a stable split stance and a comfortable depth. Log one dumbbell and reps per side. Complete both sides using the same load and range.",
  rdl: "Keep the bar near your legs, soften the knees and send the hips back. Stop at a repeatable hamstring stretch while maintaining your back position. Include the bar.",
  "db-rdl":
    "Hold the dumbbells beside your legs, hinge your hips back and keep the descent controlled. Enter one dumbbell load, not their combined weight.",
  "leg-curl":
    "Align the knee with the pivot and keep your hips supported. Curl without bouncing. Use the same seat/pad settings and resistance label.",
  "hip-thrust":
    "Support your upper back securely, brace your trunk and drive through your feet. Finish with your hips extended without arching the lower back. Include the bar in load.",
  "glute-bridge":
    "Lie on your back with your feet planted. Lift the hips through a controlled range without overextending your back. Enter additional external load only.",
  ohp: "Brace your trunk and press the bar overhead through a comfortable path. Avoid turning the movement into a leg drive. Enter the bar plus plates as total load.",
  "db-press":
    "Use a supported seated setup and press through a comfortable range without flaring your ribs. Record the weight of one dumbbell.",
  lateral:
    "Raise your arms out to the sides with softly bent elbows. Choose a controlled range and avoid swinging. Enter the weight of one dumbbell.",
  "rear-delt":
    "Keep your torso stable and open your arms through a comfortable arc. Enter one side resistance and repeat the same cable setup.",
  curl: "Keep your elbows near your sides and curl without swinging the trunk. Lower with control. Enter the weight of one dumbbell.",
  "cable-curl":
    "Use the same handle and cable position. Keep the upper arm stable and curl through a controlled range. Record the resistance label.",
  pushdown:
    "Keep the upper arms still, extend your elbows and return with control. Use the same cable station and attachment; record its resistance label.",
  "db-extension":
    "Hold one dumbbell securely and extend your elbows through a comfortable overhead range. Enter the single dumbbell load.",
  calf: "Use the same machine setup. Lower to a comfortable calf stretch and rise without bouncing. Record the resistance label.",
  "db-calf":
    "Use a stable support and controlled ankle range. Enter one dumbbell load if holding a matching pair; use a custom exercise for a different setup.",
  crunch:
    "Keep a repeatable kneeling position and flex your trunk without pulling only with your arms. Use the same cable station and resistance label.",
  "reverse-crunch":
    "Curl the pelvis upward with control and lower without swinging. Enter any added external load only.",
  "band-row":
    "Anchor the band securely and keep your torso stable while pulling. Use a consistent band, anchor and stretch length. Label changes need a distinct custom exercise.",
  "band-curl":
    "Secure the band and keep your upper arms stable. Repeat the same band and stretch length. The logged resistance number is a raw label, not a 1RM load.",
};
const ex = (
  id: string,
  name: string,
  muscle: Exercise["muscle"],
  equipment: Exercise["equipment"],
  pattern: Exercise["pattern"],
  convention: Exercise["convention"] = "total",
  secondary: Exercise["muscle"][] = [],
): Exercise => ({
  id,
  name,
  muscle,
  equipment,
  pattern,
  convention,
  secondary,
  e1rm: equipment === "Barbell",
  instructions:
    (cues[id] || "Use a controlled range you can repeat.") +
    " Stop if technique or comfort deteriorates. Warm up appropriately before hard sets.",
});
export const catalog: Exercise[] = [
  ex("bench", "Barbell bench press", "Chest", "Barbell", "Push", "total", [
    "Triceps",
    "Shoulders",
  ]),
  ex(
    "incline-db",
    "Incline dumbbell press",
    "Chest",
    "Dumbbell",
    "Push",
    "per-dumbbell",
    ["Triceps"],
  ),
  ex("cable-fly", "Cable chest fly", "Chest", "Cable", "Isolation", "per-side"),
  ex("pushup", "Push-up", "Chest", "Bodyweight", "Push", "added-bodyweight", [
    "Triceps",
  ]),
  ex("row", "Barbell row", "Back", "Barbell", "Pull", "total", ["Biceps"]),
  ex(
    "db-row",
    "Single-arm dumbbell row",
    "Back",
    "Dumbbell",
    "Pull",
    "per-dumbbell",
    ["Biceps"],
  ),
  ex("pulldown", "Lat pulldown", "Back", "Machine", "Pull", "machine-label", [
    "Biceps",
  ]),
  ex(
    "cable-row",
    "Seated cable row",
    "Back",
    "Cable",
    "Pull",
    "machine-label",
    ["Biceps"],
  ),
  ex("pullup", "Pull-up", "Back", "Bodyweight", "Pull", "added-bodyweight", [
    "Biceps",
  ]),
  ex("squat", "Barbell back squat", "Quads", "Barbell", "Squat", "total", [
    "Glutes",
  ]),
  ex("goblet", "Goblet squat", "Quads", "Dumbbell", "Squat"),
  ex("leg-press", "Leg press", "Quads", "Machine", "Squat", "machine-label", [
    "Glutes",
  ]),
  ex(
    "leg-extension",
    "Leg extension",
    "Quads",
    "Machine",
    "Isolation",
    "machine-label",
  ),
  ex(
    "split-squat",
    "Dumbbell split squat",
    "Quads",
    "Dumbbell",
    "Squat",
    "per-dumbbell",
    ["Glutes"],
  ),
  ex("rdl", "Romanian deadlift", "Hamstrings", "Barbell", "Hinge", "total", [
    "Glutes",
  ]),
  ex(
    "db-rdl",
    "Dumbbell Romanian deadlift",
    "Hamstrings",
    "Dumbbell",
    "Hinge",
    "per-dumbbell",
    ["Glutes"],
  ),
  ex(
    "leg-curl",
    "Seated leg curl",
    "Hamstrings",
    "Machine",
    "Isolation",
    "machine-label",
  ),
  ex("hip-thrust", "Barbell hip thrust", "Glutes", "Barbell", "Hinge"),
  ex(
    "glute-bridge",
    "Glute bridge",
    "Glutes",
    "Bodyweight",
    "Hinge",
    "added-bodyweight",
  ),
  ex(
    "ohp",
    "Standing overhead press",
    "Shoulders",
    "Barbell",
    "Push",
    "total",
    ["Triceps"],
  ),
  ex(
    "db-press",
    "Seated dumbbell shoulder press",
    "Shoulders",
    "Dumbbell",
    "Push",
    "per-dumbbell",
    ["Triceps"],
  ),
  ex(
    "lateral",
    "Dumbbell lateral raise",
    "Shoulders",
    "Dumbbell",
    "Isolation",
    "per-dumbbell",
  ),
  ex(
    "rear-delt",
    "Cable rear delt fly",
    "Shoulders",
    "Cable",
    "Isolation",
    "per-side",
  ),
  ex(
    "curl",
    "Dumbbell curl",
    "Biceps",
    "Dumbbell",
    "Isolation",
    "per-dumbbell",
  ),
  ex(
    "cable-curl",
    "Cable curl",
    "Biceps",
    "Cable",
    "Isolation",
    "machine-label",
  ),
  ex(
    "pushdown",
    "Cable triceps pressdown",
    "Triceps",
    "Cable",
    "Isolation",
    "machine-label",
  ),
  ex(
    "db-extension",
    "Dumbbell overhead extension",
    "Triceps",
    "Dumbbell",
    "Isolation",
  ),
  ex(
    "calf",
    "Standing calf raise",
    "Calves",
    "Machine",
    "Isolation",
    "machine-label",
  ),
  ex(
    "db-calf",
    "Dumbbell calf raise",
    "Calves",
    "Dumbbell",
    "Isolation",
    "per-dumbbell",
  ),
  ex("crunch", "Cable crunch", "Core", "Cable", "Core", "machine-label"),
  ex(
    "reverse-crunch",
    "Reverse crunch",
    "Core",
    "Bodyweight",
    "Core",
    "added-bodyweight",
  ),
  ex("band-row", "Band row", "Back", "Band", "Pull", "machine-label"),
  ex("band-curl", "Band curl", "Biceps", "Band", "Isolation", "machine-label"),
];
export const setSchema = z
  .object({
    id,
    weight: z.number().finite().min(0).max(2000),
    reps: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    kind: z.enum(["working", "warmup", "drop"]),
    done: z.boolean(),
  })
  .strict();
export type SetLog = z.infer<typeof setSchema>;
const entryTarget = z
  .object({
    min: z.number().int().min(1).max(100),
    max: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    rest: z.number().int().min(0).max(900),
  })
  .strict()
  .refine((t) => t.max >= t.min, "Invalid rep range");
const entrySchema = z
  .object({
    id,
    exerciseId: id,
    notes: note,
    convention: z.enum(conventions).optional(),
    equipment: z.enum(equipment).optional(),
    superset: z.string().max(20).optional(),
    target: entryTarget.optional(),
    sets: z.array(setSchema).max(40),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
const feedbackSchema = z
  .object({
    pump: z.number().int().min(1).max(5),
    soreness: z.number().int().min(1).max(5),
    fatigue: z.number().int().min(1).max(5),
    pain: z.boolean(),
  })
  .strict();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) =>
      !Number.isNaN(Date.parse(d)) &&
      new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d,
    "Invalid date",
  );
export const sessionSchema = z
  .object({
    id,
    name,
    date,
    startedAt: z.number().finite().min(0),
    duration: z.number().finite().min(0).max(86400),
    notes: note,
    feedback: feedbackSchema,
    programId: id.optional(),
    week: z.number().int().min(1).max(16).optional(),
    exercises: z.array(entrySchema).max(60),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export const targetSchema = z
  .object({
    id,
    exerciseId: id,
    sets: z.number().int().min(1).max(10),
    min: z.number().int().min(1).max(100),
    max: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    rest: z.number().int().min(0).max(900),
    kind: z.enum(["working", "warmup", "drop"]),
    superset: z.string().max(20),
  })
  .strict()
  .refine((t) => t.max >= t.min, "Max reps must be at least min reps");
export type Target = z.infer<typeof targetSchema>;
export const workoutSchema = z
  .object({
    id,
    name,
    day: z.string().max(30),
    exercises: z.array(targetSchema).max(60),
  })
  .strict();
export type Workout = z.infer<typeof workoutSchema>;
export const programSchema = z
  .object({
    id,
    name,
    description: note,
    weeks: z.number().int().min(2).max(16),
    deloadWeek: z.number().int().min(1).max(16),
    currentWeek: z.number().int().min(1).max(16),
    archived: z.boolean(),
    workouts: z.array(workoutSchema).min(1).max(14),
  })
  .strict()
  .refine(
    (p) => p.deloadWeek <= p.weeks && p.currentWeek <= p.weeks,
    "Weeks must fit the cycle",
  );
export type Program = z.infer<typeof programSchema>;
const profileSchema = z
  .object({
    name,
    experience: z.enum(["New", "Intermediate", "Advanced"]),
    goal: z.enum(["Build muscle", "Strength + muscle", "Consistency"]),
    equipment: z.array(z.enum(equipment)).min(1),
    days: z.number().int().min(1).max(7),
  })
  .strict();
const rawState = z
  .object({
    profile: profileSchema.nullable(),
    settings: z
      .object({
        unit: z.enum(["kg", "lb"]),
        theme: z.enum(["dark", "light"]),
        timerSound: z.boolean(),
        reminders: z.boolean(),
      })
      .strict(),
    customExercises: z.array(exerciseSchema).max(500),
    programs: z.array(programSchema).max(100),
    sessions: z.array(sessionSchema).max(5000),
    draft: sessionSchema.nullable(),
    timer: z
      .object({
        endAt: z.number().min(0),
        remaining: z.number().min(0).max(3600),
        paused: z.boolean(),
      })
      .strict()
      .nullable(),
    decisions: z
      .array(
        z
          .object({
            key: id,
            choice: z.enum(["accept", "decline", "defer"]),
            at: z.number(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export const stateSchema = rawState.superRefine((s, ctx) => {
  const all = [...catalog, ...s.customExercises];
  const ids = new Set(all.map((e) => e.id));
  const unique = (items: { id: string }[], path: string) => {
    if (new Set(items.map((x) => x.id)).size !== items.length)
      ctx.addIssue({ code: "custom", message: "Duplicate IDs", path: [path] });
  };
  unique(all, "customExercises");
  unique(s.programs, "programs");
  unique(s.sessions, "sessions");
  const ref = (eid: string) => {
    if (!ids.has(eid))
      ctx.addIssue({ code: "custom", message: "Unknown exercise reference" });
  };
  for (const p of s.programs) {
    unique(p.workouts, "workouts");
    for (const w of p.workouts) {
      unique(w.exercises, "targets");
      w.exercises.forEach((t) => ref(t.exerciseId));
    }
  }
  for (const sess of [...s.sessions, ...(s.draft ? [s.draft] : [])]) {
    unique(sess.exercises, "entries");
    unique(
      sess.exercises.flatMap((e) => e.sets),
      "sets",
    );
    for (const e of sess.exercises) {
      ref(e.exerciseId);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(s)).length > MAX_STATE_BYTES)
    ctx.addIssue({
      code: "custom",
      message:
        "Account storage exceeds the 2 MB sync/backup budget. Export a backup, then remove older sessions before adding more.",
    });
});
export type State = z.infer<typeof rawState>;
export const restRemaining = (timer: State["timer"], now = Date.now()) =>
  !timer
    ? 0
    : timer.paused
      ? timer.remaining
      : Math.max(0, Math.ceil((timer.endAt - now) / 1000));
export const emptyState = (): State => ({
  profile: null,
  settings: { unit: "kg", theme: "dark", timerSound: false, reminders: false },
  customExercises: [],
  programs: [],
  sessions: [],
  draft: null,
  timer: null,
  decisions: [],
});
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const target = (exerciseId: string): Target => ({
  id: uid(),
  exerciseId,
  sets: 3,
  min: 8,
  max: 12,
  rir: 2,
  rest: 120,
  kind: "working",
  superset: "",
});
export function starterProgram(
  style: "balanced" | "upper-lower" | "minimal",
): Program {
  const layouts =
    style === "upper-lower"
      ? [
          ["Upper A", "bench", "row", "lateral", "curl"],
          ["Lower A", "squat", "rdl", "calf"],
          ["Upper B", "incline-db", "pulldown", "db-press", "pushdown"],
          ["Lower B", "leg-press", "leg-curl", "hip-thrust"],
        ]
      : style === "minimal"
        ? [
            ["Full body A", "goblet", "incline-db", "db-row", "db-rdl"],
            ["Full body B", "split-squat", "db-press", "db-row", "db-calf"],
          ]
        : [
            ["Full body A", "squat", "bench", "row", "lateral"],
            ["Full body B", "rdl", "incline-db", "pulldown", "curl"],
            ["Full body C", "leg-press", "db-press", "cable-row", "pushdown"],
          ];
  return {
    id: uid(),
    name:
      style === "upper-lower"
        ? "Upper / Lower"
        : style === "minimal"
          ? "Dumbbell foundations"
          : "Balanced foundations",
    description:
      "An original flexible hypertrophy template. Adjust exercises and targets to your equipment and recovery.",
    weeks: 6,
    deloadWeek: 6,
    currentWeek: 1,
    archived: false,
    workouts: layouts.map((l, i) => ({
      id: uid(),
      name: l[0],
      day: ["Monday", "Wednesday", "Friday", "Saturday"][i],
      exercises: l.slice(1).map(target),
    })),
  };
}
export function weeklyTarget(p: Program, week: number) {
  const deload = week === p.deloadWeek;
  return {
    sets: p.workouts.reduce(
      (sum, w) =>
        sum +
        w.exercises
          .filter((e) => e.kind !== "warmup")
          .reduce(
            (s, e) =>
              s + (deload ? Math.max(1, Math.ceil(e.sets / 2)) : e.sets),
            0,
          ),
      0,
    ),
    rir: deload ? 4 : Math.max(1, 3 - Math.floor((week - 1) / 2)),
    deload,
  };
}
export function createEntry(e: Exercise, t?: Target, deload = false): Entry {
  return {
    id: uid(),
    exerciseId: e.id,
    notes: "",
    convention: e.convention,
    equipment: e.equipment,
    superset: t?.superset || "",
    target: {
      min: t?.min || 8,
      max: t?.max || 12,
      rir: deload ? 4 : (t?.rir ?? 2),
      rest: t?.rest ?? 120,
    },
    sets: Array.from(
      {
        length: t ? (deload ? Math.max(1, Math.ceil(t.sets / 2)) : t.sets) : 3,
      },
      () => ({
        id: uid(),
        weight: 0,
        reps: t?.min || 8,
        rir: deload ? 4 : (t?.rir ?? 2),
        kind: t?.kind || "working",
        done: false,
      }),
    ),
  };
}
export function startSession(
  name: string,
  entries: Entry[],
  program?: Program,
): Session {
  return {
    id: uid(),
    name,
    date: today(),
    startedAt: Date.now(),
    duration: 0,
    notes: "",
    feedback: { pump: 3, soreness: 1, fatigue: 1, pain: false },
    exercises: entries,
    ...(program ? { programId: program.id, week: program.currentWeek } : {}),
  };
}
export const toggleSet = (s: Session, id: string): Session => ({
  ...s,
  exercises: s.exercises.map((e) => ({
    ...e,
    sets: e.sets.map((set) =>
      set.id === id ? { ...set, done: !set.done } : set,
    ),
  })),
});
export const completeSession = (s: Session): Session => ({
  ...s,
  exercises: s.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
    .filter((e) => e.sets.length),
});
export const hard = (s: SetLog) => s.done && s.kind !== "warmup" && s.rir <= 4;
export function volume(sessions: Session[], exercises: Exercise[]) {
  const result: Record<string, number> = {};
  for (const s of sessions)
    for (const e of s.exercises) {
      const muscle = exercises.find((x) => x.id === e.exerciseId)?.muscle;
      if (muscle) {
        const n = e.sets.filter(hard).length;
        if (n) result[muscle] = (result[muscle] || 0) + n;
      }
    }
  return result;
}
export const convertWeight = (
  value: number,
  from: "kg" | "lb",
  to: "kg" | "lb",
) =>
  from === to
    ? value
    : from === "kg"
      ? value * 2.2046226218487757
      : value / 2.2046226218487757;
// Standardized loads are canonical kg. Unfamiliar machine/band labels are raw
// numbers: converting a pin position or resistance label would invent meaning.
export const displayLoad = (
  value: number,
  convention: string,
  unit: "kg" | "lb",
) =>
  convention === "machine-label" ? value : convertWeight(value, "kg", unit);
export const canonicalLoad = (
  value: number,
  convention: string,
  unit: "kg" | "lb",
) =>
  convention === "machine-label" ? value : convertWeight(value, unit, "kg");
export function comparableKey(e: Entry, x: Exercise) {
  return `${x.id}|${e.convention || x.convention}|${e.equipment || x.equipment}`;
}
export function records(sessions: Session[], exercises: Exercise[]) {
  const result = new Map<
    string,
    {
      key: string;
      name: string;
      weight: number;
      reps: number;
      e1rm: number | null;
      date: string;
      convention: string;
      equipment: string;
    }
  >();
  for (const s of sessions)
    for (const e of s.exercises) {
      const x = exercises.find((x) => x.id === e.exerciseId);
      if (!x) continue;
      const key = comparableKey(e, x);
      for (const set of e.sets.filter((t) => t.done && t.kind !== "warmup")) {
        const old = result.get(key);
        const est =
          x.e1rm &&
          (e.equipment || x.equipment) === "Barbell" &&
          (e.convention || x.convention) === "total" &&
          set.reps <= 12 &&
          set.weight > 0
            ? set.weight * (1 + set.reps / 30)
            : null;
        if (
          !old ||
          set.weight > old.weight ||
          (set.weight === old.weight && set.reps > old.reps)
        )
          result.set(key, {
            key,
            name: x.name,
            weight: set.weight,
            reps: set.reps,
            e1rm: est,
            date: s.date,
            convention: e.convention || x.convention,
            equipment: e.equipment || x.equipment,
          });
      }
    }
  return [...result.values()];
}
export type Recommendation = {
  action: "hold" | "load" | "reps" | "recover";
  reason: string;
  weight?: number;
  reps?: number;
};
export function recommend(
  exerciseId: string,
  sessions: Session[],
  exercises: Exercise[],
  range: { min: number; max: number },
): Recommendation {
  const x = exercises.find((x) => x.id === exerciseId);
  if (!x) return { action: "hold", reason: "Exercise unavailable." };
  const wantedKey = `${x.id}|${x.convention}|${x.equipment}`;
  const matchingEntries = (s: Session) =>
    s.exercises.filter(
      (e) => e.exerciseId === exerciseId && comparableKey(e, x) === wantedKey,
    );
  const workingSets = (s: Session) =>
    matchingEntries(s).flatMap((e) =>
      e.sets.filter((t) => t.done && t.kind === "working"),
    );
  const comparable = sessions
    .filter((s) => workingSets(s).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
    .slice(-2);
  const latest = comparable.at(-1);
  const recovery = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
    .at(-1);
  if (
    recovery &&
    (recovery.feedback.pain ||
      recovery.feedback.fatigue >= 4 ||
      recovery.feedback.soreness >= 4)
  )
    return {
      action: "recover",
      reason:
        "Pain or elevated fatigue/soreness: defer progression. Consider less volume or a deload; seek qualified advice for persistent pain.",
    };
  if (comparable.length < 2)
    return {
      action: "hold",
      reason:
        "Log two comparable sessions before receiving progression suggestions.",
    };
  const sets = comparable.flatMap(workingSets);
  if (!sets.length || sets.some((s) => s.rir < 1))
    return {
      action: "hold",
      reason:
        "Hold your targets until working sets are controlled with at least 1 rep in reserve.",
    };
  const latestSets = workingSets(latest!);
  const weight = latestSets[0]?.weight || 0;
  if (
    sets.every((s) => s.reps >= range.max) &&
    weight > 0 &&
    !["machine-label", "added-bodyweight"].includes(x.convention) &&
    sets.every((s) => Math.abs(s.weight - weight) < 0.01)
  ) {
    const nextWeight =
      Math.floor((weight + Math.min(2.5, weight * 0.025)) * 100) / 100;
    if (nextWeight <= weight)
      return {
        action: "hold",
        reason:
          "No increment fits within the cap at this load resolution. Keep load stable and repeat controlled reps.",
      };
    return {
      action: "load",
      weight: nextWeight,
      reps: range.min,
      reason:
        "Both comparable sessions met the rep ceiling with reserve. Add at most 2.5% or 2.5 kg, whichever is smaller; round down to available plates.",
    };
  }
  if (sets.every((s) => s.reps >= range.min) && latestSets.length)
    return {
      action: "reps",
      weight,
      reps: Math.min(range.max, Math.min(...latestSets.map((s) => s.reps)) + 1),
      reason:
        "Keep load stable and try one more rep, bounded by your rep range. Machine labels stay on the same machine; no inferred load increment.",
    };
  return {
    action: "hold",
    reason:
      "Keep targets stable until comparable working sets reach the lower rep target.",
  };
}
export function importBackup(text: string): State {
  if (new TextEncoder().encode(text).length > MAX_BACKUP)
    throw new Error("Backup exceeds 2 MB.");
  const parsed = z
    .object({ version: z.literal(1), data: stateSchema })
    .strict()
    .safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error(
      "Invalid version 1 backup: " + parsed.error.issues[0]?.message,
    );
  return parsed.data.data;
}
export function mergeStates(remote: State, local: State): State {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => [
    ...new Map([...a, ...b].map((x) => [x.id, x])).values(),
  ];
  return stateSchema.parse({
    ...local,
    customExercises: merge(remote.customExercises, local.customExercises),
    programs: merge(remote.programs, local.programs),
    sessions: merge(remote.sessions, local.sessions),
  });
}
export function csvSessions(
  sessions: Session[],
  exercises: Exercise[],
): string {
  const quote = (x: unknown) =>
    '"' + String(x ?? "").replaceAll('"', '""') + '"';
  return [
    [
      "date",
      "session",
      "exercise",
      "equipment",
      "convention",
      "kind",
      "load_kg",
      "machine_label",
      "reps",
      "RIR",
      "duration_seconds",
    ],
    ...sessions.flatMap((s) =>
      s.exercises.flatMap((e) => {
        const x = exercises.find((x) => x.id === e.exerciseId);
        return e.sets
          .filter((t) => t.done)
          .map((t) => [
            s.date,
            s.name,
            x?.name,
            e.equipment || x?.equipment,
            e.convention || x?.convention,
            t.kind,
            (e.convention || x?.convention) === "machine-label" ? "" : t.weight,
            (e.convention || x?.convention) === "machine-label" ? t.weight : "",
            t.reps,
            t.rir,
            s.duration,
          ]);
      }),
    ),
  ]
    .map((row) =>
      row
        .map((v) =>
          quote(typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v),
        )
        .join(","),
    )
    .join("\r\n");
}
