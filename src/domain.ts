import { z } from "zod";
import { videoId } from "./videos";
export const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN HTTP lacks randomUUID; getRandomValues remains cryptographically secure.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
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
export const techniques = [
  "straight",
  "down-set",
  "superset",
  "pre-exhaust",
  "myoreps",
  "drop-set",
  "giant-set",
  "tempo",
] as const;
const techniqueFields = {
  technique: z.enum(techniques).optional(),
  techniqueGroup: z.string().max(80).optional(),
  repGoal: z.number().int().min(1).max(300).optional(),
  tempo: z
    .object({
      eccentric: z.number().min(0).max(10),
      pause: z.number().min(0).max(10),
      concentric: z.number().min(0).max(10),
    })
    .strict()
    .optional(),
};
export const phases = [
  "accumulation",
  "deload",
  "maintenance",
  "resensitization",
  "active-rest",
] as const;
export type Phase = (typeof phases)[number];
export const setSchema = z
  .object({
    id,
    weight: z.number().finite().min(0).max(2000),
    reps: z.number().int().min(1).max(100),
    rir: z.number().min(0).max(10),
    kind: z.enum(["working", "warmup", "drop"]),
    effortReported: z.boolean().optional(),
    done: z.boolean(),
    bout: z
      .enum(["straight", "activation", "mini", "drop", "down", "giant"])
      .optional(),
    groupId: z.string().max(80).optional(),
    rest: z.number().int().min(0).max(900).optional(),
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
export const equipmentSetupSchema = z.object({
  label: z.string().trim().min(1).max(120),
  execution: z.string().trim().max(300),
  // Canonical kg for standardized loads; raw labels otherwise. No inferred grid.
  availableLoads: z.array(z.number().finite().min(0).max(2000)).max(100)
    .refine(values => values.every((v, i) => i === 0 || v > values[i - 1]), "Loads must be unique and increasing"),
}).strict();
export type EquipmentSetup = z.infer<typeof equipmentSetupSchema>;
const entrySchema = z
  .object({
    id,
    protocol: z.string().max(600).optional(),
    exerciseId: id,
    ...techniqueFields,
    notes: note,
    convention: z.enum(conventions).optional(),
    equipment: z.enum(equipment).optional(),
    superset: z.string().max(20).optional(),
    target: entryTarget.optional(),
    plannedWorkingSets: z.number().int().min(0).max(40).optional(),
    sourceTargetId: id.optional(),
    setup: equipmentSetupSchema.optional(),
    sets: z.array(setSchema).max(40),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
const feedbackSchema = z
  .object({
    pump: z.number().int().min(1).max(5).nullable().optional(),
    soreness: z.number().int().min(1).max(5).nullable().optional(),
    fatigue: z.number().int().min(1).max(5).nullable().optional(),
    pain: z.boolean().nullable().optional(),
    reported: z.boolean().optional(),
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
    muscleFeedback: z
      .array(
        z
          .object({
            muscle: z.enum(muscles),
            pump: z.number().int().min(1).max(5).nullable().optional(),
            soreness: z.number().int().min(1).max(5).nullable().optional(),
            fatigue: z.number().int().min(1).max(5).nullable().optional(),
            pain: z.boolean().nullable().optional(),
            recovered: z.enum(["yes", "just", "no", "unknown"]).optional(),
            recordedAt: z.number().finite().min(0).optional(),
          })
          .strict(),
      )
      .max(muscles.length)
      .refine(
        (rows) => new Set(rows.map((r) => r.muscle)).size === rows.length,
        "Duplicate muscle feedback",
      )
      .optional(),
    programId: id.optional(),
    workoutId: id.optional(),
    week: z.number().int().min(1).max(16).optional(),
    phase: z.enum(phases).optional(),
    exercises: z.array(entrySchema).max(60),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export const targetSchema = z
  .object({
    id,
    exerciseId: id,
    setup: equipmentSetupSchema.optional(),
    ...techniqueFields,
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
    phase: z.enum(phases).optional(),
    effort: z
      .object({
        mode: z.enum(["fixed", "ramp"]),
        startRir: z.number().min(0).max(5),
        endRir: z.number().min(0).max(5),
      })
      .strict()
      .optional(),
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
    exerciseVideos: z
      .array(
        z
          .object({
            exerciseId: id,
            url: z
              .string()
              .max(300)
              .refine(
                (url) => videoId(url) !== null,
                "Use a specific HTTPS YouTube video.",
              ),
          })
          .strict(),
      )
      .max(500)
      .optional(),
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
  for (const link of s.exerciseVideos || [])
    if (!ids.has(link.exerciseId))
      ctx.addIssue({
        code: "custom",
        message: "Unknown video exercise reference",
      });
  if (
    new Set((s.exerciseVideos || []).map((v) => v.exerciseId)).size !==
    (s.exerciseVideos || []).length
  )
    ctx.addIssue({
      code: "custom",
      message: "Duplicate video exercise reference",
    });
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
  settings: { unit: "kg", theme: "light", timerSound: false, reminders: false },
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
export type Experience = "New" | "Intermediate" | "Advanced";
export const trainingPolicyVersion = "neoform-book-2026-10-v3";
export function programPhase(p: Program): Phase {
  return (
    p.phase ?? (p.currentWeek === p.deloadWeek ? "deload" : "accumulation")
  );
}
// Original conservative recipes, based on physical PDF pp.166–170,277.
// They are not measured maintenance volume or a biological reset.
function phaseTarget(t: Target, p: Program, experience?: Experience): Target {
  const phase = programPhase(p);
  const progress = Math.max(
    0,
    Math.min(1, (p.currentWeek - 1) / Math.max(1, p.deloadWeek - 2)),
  );
  let rir = p.effort
    ? p.effort.mode === "fixed"
      ? p.effort.startRir
      : Math.round(
          (p.effort.startRir +
            (p.effort.endRir - p.effort.startRir) * progress) *
            10,
        ) / 10
    : t.rir;
  if (experience === "New") rir = Math.max(2, rir);
  if (phase === "deload")
    return {
      ...t,
      sets: Math.max(1, Math.ceil(t.sets / 2)),
      min: Math.max(1, Math.floor(t.min / 2)),
      max: Math.max(1, Math.floor(t.max / 2)),
      rir: Math.max(5, rir),
      technique: "straight",
      techniqueGroup: undefined,
      repGoal: undefined,
      tempo: undefined,
      superset: "",
      kind: t.kind === "warmup" ? "warmup" : "working",
    };
  if (phase === "maintenance" || phase === "resensitization")
    return {
      ...t,
      sets: Math.max(1, Math.ceil(t.sets / 2)),
      rir: Math.max(3, rir),
      technique: "straight",
      techniqueGroup: undefined,
      repGoal: undefined,
      tempo: undefined,
      superset: "",
      kind: t.kind === "warmup" ? "warmup" : "working",
    };
  return { ...t, rir };
}
export function weeklyTarget(
  p: Program,
  week: number,
  experience?: Experience,
) {
  const current = { ...p, currentWeek: week };
  const phase = programPhase(current);
  const targets =
    phase === "active-rest"
      ? []
      : p.workouts.flatMap((w) =>
          w.exercises
            .filter((t) => t.kind !== "warmup")
            .map((t) => phaseTarget(t, current, experience)),
        );
  const rirs = targets.map((t) => t.rir);
  return {
    sets: targets.reduce((n, t) => n + t.sets, 0),
    rir: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : 5,
    rirMin: rirs.length ? Math.min(...rirs) : 5,
    rirMax: rirs.length ? Math.max(...rirs) : 5,
    deload: phase === "deload",
    phase,
    sourcePages: [166, 169, 170, 277, 315, 316],
    policyVersion: trainingPolicyVersion,
  };
}
export function prepareWorkout(
  workout: Workout,
  program: Program,
  exercises: Exercise[],
  sessions: Session[],
  experience?: Experience,
): Entry[] {
  const phase = programPhase(program);
  if (phase === "active-rest") return [];
  const late =
    program.workouts.findIndex((w) => w.id === workout.id) >=
    Math.ceil(program.workouts.length / 2);
  return workout.exercises.flatMap((t) => {
    const x = exercises.find((x) => x.id === t.exerciseId);
    if (!x) return [];
    const adjusted = phaseTarget(t, program, experience);
    const entry = createEntry(x, adjusted);
    const previous = [...sessions]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
      .reverse()
      .filter((s) => !s.phase || s.phase === "accumulation")
      .filter((s) => !(s.programId === program.id && s.week === program.deloadWeek && !s.phase))
      .flatMap((s) => s.exercises.map((e) => ({e, confirmed: s.phase === "accumulation"})))
      .find(
        ({e, confirmed}) =>
          e.exerciseId === x.id &&
          e.target !== undefined && e.target.rir < (phase === "deload" && !confirmed ? 4 : 5) &&
          comparableKey(e, x) === comparableKey(entry, x) &&
          e.sets.some((s) => s.done && s.kind === "working"),
      )?.e;
    const load =
      previous?.sets.find((s) => s.done && s.kind === "working")?.weight ?? 0;
    entry.sets = entry.sets.map((s) => ({
      ...s,
      weight: phase === "deload" && late && x.convention !== "machine-label" ? load / 2 : load,
    }));
    return [entry];
  });
}
export function createEntry(e: Exercise, t?: Target, deload = false): Entry {
  return {
    id: uid(),
    exerciseId: e.id,
    ...(t ? { sourceTargetId: t.id } : {}),
    ...(t?.setup ? { setup: structuredClone(t.setup) } : {}),
    notes: "",
    plannedWorkingSets: (t?.kind ?? "working") === "working"
      ? (t ? (deload ? Math.max(1, Math.ceil(t.sets / 2)) : t.sets) : 3) : 0,
    convention: e.convention,
    equipment: e.equipment,
    superset: t?.superset || "",
    ...(t?.technique ? { technique: t.technique } : {}),
    ...(t?.techniqueGroup !== undefined
      ? { techniqueGroup: t.techniqueGroup }
      : {}),
    ...(t?.repGoal !== undefined ? { repGoal: t.repGoal } : {}),
    ...(t?.tempo ? { tempo: { ...t.tempo } } : {}),
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
        effortReported: false,
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
  workout?: Workout,
): Session {
  return {
    id: uid(),
    name,
    date: today(),
    startedAt: Date.now(),
    duration: 0,
    notes: "",
    feedback: {
      pump: null,
      soreness: null,
      fatigue: null,
      pain: null,
      reported: false,
    },
    exercises: entries,
    ...(workout ? { workoutId: workout.id } : {}),
    ...(program ? { programId: program.id, week: program.currentWeek, phase: programPhase(program) } : {}),
  };
}
export function nextWorkout(program: Program, sessions: Session[]): Workout {
  const latest = [...sessions].filter(s => s.programId === program.id)
    .sort((a,b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt).at(-1);
  let index = program.workouts.findIndex(w => w.id === latest?.workoutId);
  // Legacy history may establish identity only when its name is unambiguous.
  if (index < 0 && latest && program.workouts.filter(w => w.name === latest.name).length === 1)
    index = program.workouts.findIndex(w => w.name === latest.name);
  return program.workouts[(index + 1) % program.workouts.length];
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
export const hard = (s: SetLog) => s.done && s.kind !== "warmup" && s.effortReported !== false && s.rir <= 4;
export type MuscleExposure = {
  directHardSets: number;
  indirectHardSets: number;
  advancedBouts: number;
  rawBouts: number;
  exposures: number;
  sourcePages: number[];
  assumptions: string[];
  policyVersion: string;
};
export function muscleExposure(
  sessions: Session[],
  exercises: Exercise[],
): Record<string, MuscleExposure> {
  const result: Record<string, MuscleExposure> = {};
  for (const session of sessions) {
    const seen = new Set<string>();
    for (const entry of session.exercises) {
      const x = exercises.find((x) => x.id === entry.exerciseId);
      if (!x) continue;
      const completed = entry.sets.filter((s) => s.done && s.kind !== "warmup");
      if (!completed.length) continue;
      const advanced = (s: SetLog) =>
        s.kind === "drop" ||
        (s.bout !== undefined && !["straight", "down"].includes(s.bout)) ||
        ["myoreps", "drop-set", "giant-set"].includes(entry.technique ?? "");
      for (const muscle of new Set([x.muscle, ...x.secondary])) {
        const row = (result[muscle] ??= {
          directHardSets: 0,
          indirectHardSets: 0,
          advancedBouts: 0,
          rawBouts: 0,
          exposures: 0,
          sourcePages: [43, 59, 60, 169, 223, 257],
          assumptions: [
            "Completed raw bouts and declared catalog involvement, not measured growth or equivalent muscle doses.",
            "Hard-set qualification uses the original app RIR <=4 heuristic; advanced bouts have no fractional straight-set conversion. Indirect involvement is reported separately, never added to direct sets.",
            "New unconfirmed effort is excluded. Legacy numeric effort remains a historical estimate with unknown reporting provenance; it cannot justify positive coaching decisions.",
          ],
          policyVersion: trainingPolicyVersion,
        });
        row.rawBouts += completed.length;
        row.advancedBouts += completed.filter(advanced).length;
        const hardCount = completed.filter(
          (s) => !advanced(s) && hard(s),
        ).length;
        if (muscle === x.muscle) row.directHardSets += hardCount;
        else row.indirectHardSets += hardCount;
        seen.add(muscle);
      }
    }
    for (const muscle of seen) result[muscle].exposures++;
  }
  return result;
}
export function directVolume(sessions: Session[], exercises: Exercise[]) {
  return Object.fromEntries(Object.entries(muscleExposure(sessions, exercises))
    .map(([muscle, row]) => [muscle, row.directHardSets]));
}
// Deliberately a raw-bout timeline, not a comparable strength trend. Each
// point's load and repetitions belong to the same actual completed bout.
export function performanceTimeline(exerciseId: string, sessions: Session[], exercises: Exercise[]) {
  const x = exercises.find((x) => x.id === exerciseId);
  if (!x) return [];
  return [...sessions].sort((a,b) => a.date.localeCompare(b.date) || a.startedAt-b.startedAt)
    .flatMap((session) => session.exercises.filter((e) => e.exerciseId === exerciseId &&
      (e.equipment ?? x.equipment) === x.equipment && (e.convention ?? x.convention) === x.convention)
      .flatMap((e) => e.sets.filter((set) => set.done && set.kind !== "warmup").map((set) => ({
        date: session.date, weight: set.weight, reps: set.reps,
        context: executionContext(e, set, session.phase),
      }))));
}
// Legacy API: raw completed direct hard bouts, not equivalent growth sets.
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
  const base = `${x.id}|${e.convention || x.convention}|${e.equipment || x.equipment}` +
    (e.setup ? "|setup:" + JSON.stringify([e.setup.label, e.setup.execution]) : "");
  // Preserve old straight-set keys, but never merge cadence/group/advanced contexts.
  const technique = e.technique ?? (e.superset ? "superset" : "straight");
  // Instance IDs group raw bouts; only a semantic pair protocol belongs in
  // cross-session comparison. Legacy unknown pairs stay deliberately distinct.
  const groupContext = ["myoreps", "drop-set", "giant-set"].includes(technique)
    ? "sequence"
    : e.protocol ?? e.techniqueGroup ?? e.superset ?? "";
  return technique === "straight" && !e.tempo && !e.techniqueGroup && !e.repGoal
    ? base
    : base + "|" + JSON.stringify([technique, groupContext, e.repGoal ?? null, e.tempo ?? null]);
}
export function executionContext(e: Entry, set?: SetLog, phase?: Phase) {
  const method = e.technique ?? (e.superset ? "superset" : "straight");
  return [method, e.protocol, e.tempo ? `tempo ${e.tempo.eccentric}/${e.tempo.pause}/${e.tempo.concentric}s` : undefined,
    e.setup ? `setup ${e.setup.label}${e.setup.execution ? ": " + e.setup.execution : ""}` : undefined,
    e.repGoal ? `goal ${e.repGoal} reps` : undefined, set?.bout ?? set?.kind,
    phase ?? "unrecorded phase"].filter(Boolean).join(" · ");
}
export function records(sessions: Session[], exercises: Exercise[]) {
  const result = new Map<
    string,
    {
      key: string;
      context: string;
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
      for (const set of e.sets.filter((t) => t.done && t.kind !== "warmup")) {
        const key =
          comparableKey(e, x) + `|phase:${s.phase ?? "unrecorded"}` +
          (set.kind === "drop" || (set.bout && set.bout !== "straight")
            ? `|bout:${set.bout ?? set.kind}`
            : "");
        const old = result.get(key);
        const est =
          x.e1rm &&
          (!e.technique || e.technique === "straight") &&
          !e.tempo &&
          !e.superset &&
          set.kind === "working" &&
          (!set.bout || set.bout === "straight") &&
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
            context: executionContext(e, set, s.phase),
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
export type CoachingOptions = {
  experience?: Experience;
  now?: number;
  phase?: Phase;
  entry?: Entry;
};
export type Recommendation = {
  action: "hold" | "load" | "reps" | "recover";
  reason: string;
  weight?: number;
  reps?: number;
  setTargets?: { weight: number; reps: number }[];
  evidence?: string[];
  assumptions?: string[];
  sourcePages?: number[];
  policyVersion?: string;
};
const chronological = (sessions: Session[]) =>
  [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt,
  );
const sessionTime = (s: Session) => Date.parse(s.date + "T12:00:00Z");
const fresh = (s: Session, now: number, days: number) =>
  now - sessionTime(s) <= days * 86400000 && now - sessionTime(s) >= -86400000;
const involves = (
  s: Session,
  muscle: Exercise["muscle"],
  exercises: Exercise[],
) =>
  s.exercises.some((e) => {
    const x = exercises.find((x) => x.id === e.exerciseId);
    return (
      x &&
      (x.muscle === muscle || x.secondary.includes(muscle)) &&
      e.sets.some((s) => s.done && s.kind !== "warmup")
    );
  });
function recoveryStatus(
  muscle: Exercise["muscle"],
  sessions: Session[],
  exercises: Exercise[],
  now: number,
) {
  const ordered = chronological(sessions),
    latest = ordered.at(-1);
  const localSession = ordered
    .filter((s) => s.muscleFeedback?.some((r) => r.muscle === muscle))
    .at(-1);
  const local = localSession?.muscleFeedback?.find((r) => r.muscle === muscle);
  const evidence: string[] = [];
  const painReport = [...ordered]
    .reverse()
    .find(
      (s) =>
        s.feedback.pain === true ||
        (s.feedback.reported === true && s.feedback.pain === false),
    );
  const localPainReport = [...ordered]
    .reverse()
    .flatMap((s) => s.muscleFeedback ?? [])
    .find((r) => r.muscle === muscle && typeof r.pain === "boolean");
  if (painReport?.feedback.pain === true || localPainReport?.pain === true) {
    evidence.push(
      `${muscle}: unresolved reported pain; missing/unreported feedback does not clear a prior pain flag.`,
    );
    return { blocked: true, positive: false, evidence };
  }
  // Follow the latest actual systemic observation, not the last unrelated
  // workout. Unknown reports cannot establish that a previous flag resolved.
  const systemic = [...ordered].reverse().find((s) =>
    typeof s.feedback.fatigue === "number" &&
    (s.feedback.reported === true || s.feedback.fatigue >= 4),
  );
  if (systemic && (systemic.feedback.fatigue ?? 0) >= 4) {
    const recent = fresh(systemic, now, 7);
    evidence.push(recent
      ? `${systemic.date}: unresolved high systemic fatigue; later unknown feedback does not clear it.`
      : `${systemic.date}: old systemic fatigue report needs current confirmation; it is not a diagnosis of present fatigue.`);
    return { blocked: recent, positive: false, evidence };
  }
  if (
    local &&
    (local.pain === true ||
      (localSession &&
        fresh(localSession, now, 7) &&
        (local.recovered === "no" ||
          (local.fatigue ?? 0) >= 4 ||
          (local.soreness ?? 0) >= 4)))
  ) {
    evidence.push(
      `${localSession!.date}: ${muscle} pain or incomplete local recovery.`,
    );
    return { blocked: true, positive: false, evidence };
  }
  const relevant = ordered.filter((s) => involves(s, muscle, exercises)).at(-1);
  if (
    relevant &&
    fresh(relevant, now, 7) &&
    (relevant.feedback.soreness ?? 0) >= 4
  ) {
    evidence.push(
      `${relevant.date}: high unscoped soreness after ${muscle} involvement.`,
    );
    return { blocked: true, positive: false, evidence };
  }
  const localFresh =
    localSession &&
    (!relevant || ordered.indexOf(localSession) >= ordered.indexOf(relevant)) &&
    fresh(localSession, now, 7) &&
    (local?.recordedAt === undefined ||
      (now - local.recordedAt >= -86400000 &&
        now - local.recordedAt <= 7 * 86400000));
  const positive =
    !!(localFresh && local?.recovered === "yes" && local.pain === false) ||
    !!(
      !local &&
      relevant &&
      fresh(relevant, now, 7) &&
      relevant.feedback.reported === true &&
      relevant.feedback.pain === false &&
      relevant.feedback.fatigue != null &&
      relevant.feedback.fatigue <= 2 &&
      relevant.feedback.soreness != null &&
      relevant.feedback.soreness <= 2
    );
  evidence.push(
    positive
      ? `${(localSession ?? relevant)!.date}: explicit recovery reported for ${muscle}.`
      : `${muscle}: recovery unknown, stale, unreported, or only just in time.`,
  );
  return { blocked: false, positive, evidence };
}
const coachingMeta = (
  evidence: string[] = [],
  sourcePages = [98, 99, 134, 165, 175, 316],
) => ({
  evidence,
  assumptions: [
    "Original conservative NEOFORM heuristics, not measured MEV/MRV or a growth diagnosis.",
    "Favorable recovery reports expire after 7 days; performance comparisons after 21 days. Pain requires an explicit clear report. Technique/ROM and equipment setup must remain repeatable.",
  ],
  sourcePages,
  policyVersion: trainingPolicyVersion,
});
export function recommend(
  exerciseId: string,
  sessions: Session[],
  exercises: Exercise[],
  range: { min: number; max: number },
  options: CoachingOptions = {},
): Recommendation {
  const x = exercises.find((x) => x.id === exerciseId);
  const result = (
    action: Recommendation["action"],
    reason: string,
    evidence: string[] = [],
    extra: Partial<Recommendation> = {},
  ): Recommendation => ({
    action,
    reason,
    ...coachingMeta(evidence),
    ...extra,
  });
  if (!x) return result("hold", "Exercise unavailable.");
  const now = options.now ?? Date.now();
  const recovery = recoveryStatus(x.muscle, sessions, exercises, now);
  const support = x.secondary
    .map((m) => recoveryStatus(m, sessions, exercises, now))
    .find((r) => r.blocked);
  if (support)
    return result(
      "recover",
      "An assisting muscle has a recovery/pain flag; review this movement without blanket-blocking unrelated work.",
      support.evidence,
    );
  if (recovery.blocked)
    return result(
      "recover",
      "Defer progression; review local recovery or unscoped pain/systemic fatigue. Stop painful work and seek qualified advice for persistent pain.",
      recovery.evidence,
    );
  if (options.phase && options.phase !== "accumulation")
    return result(
      "hold",
      `The ${options.phase} phase prioritizes recovery or retention, not escalation.`,
      recovery.evidence,
    );
  const recent = chronological(sessions).filter(s => fresh(s, now, 21));
  const exposures = recent.filter(s => s.exercises.some(e =>
    e.exerciseId === exerciseId && e.sets.some(t => t.done && t.kind !== "warmup")));
  const latestExposure = exposures.at(-1);
  if (latestExposure?.phase && latestExposure.phase !== "accumulation")
    return result("hold", "Re-establish accumulation performance after a recovery phase before progressing.", recovery.evidence);
  const contextPhase = options.phase ?? latestExposure?.phase;
  const boundary = exposures.map(s => s.phase === contextPhase).lastIndexOf(false);
  const contextual = exposures.slice(boundary + 1);
  const latestEntry = contextual
    .flatMap((s) => s.exercises)
    .filter(
      (e) =>
        e.exerciseId === exerciseId &&
        e.sets.some((t) => t.done && t.kind !== "warmup"),
    )
    .at(-1);
  if (
    !latestEntry ||
    (latestEntry.convention ?? x.convention) !== x.convention ||
    (latestEntry.equipment ?? x.equipment) !== x.equipment
  )
    return result(
      "hold",
      "Log recent work in the intended equipment and convention context.",
      recovery.evidence,
    );
  if (
    latestEntry.sets.some(
      (t) =>
        t.done &&
        t.kind !== "warmup" &&
        (t.kind !== "working" || (t.bout && t.bout !== "straight")),
    )
  )
    return result(
      "hold",
      "The latest exposure contains non-straight bouts; review its whole sequence rather than selecting older straight work.",
      recovery.evidence,
    );
  const wantedKey = comparableKey(latestEntry, x);
  if (options.entry && (comparableKey(options.entry, x) !== wantedKey ||
      options.entry.target?.rir !== latestEntry.target?.rir ||
      options.entry.target?.rest !== latestEntry.target?.rest ||
      options.entry.plannedWorkingSets !== latestEntry.plannedWorkingSets))
    return result("hold", "Current equipment, method, effort, rest or set dose differs from history. Establish a new comparable baseline.", recovery.evidence);
  const matchingEntries = (s: Session) =>
    s.exercises.filter(
      (e) => e.exerciseId === exerciseId && comparableKey(e, x) === wantedKey,
    );
  const workingSets = (s: Session) =>
    matchingEntries(s).flatMap((e) =>
      e.sets.filter((t) => t.done && t.kind === "working"),
    );
  const comparable = contextual
    .filter((s) => workingSets(s).length > 0)
    .slice(-2);
  const evidence = [
    ...recovery.evidence,
    ...comparable.map(
      (s) =>
        `${s.date}: ${workingSets(s).length} comparable completed working sets.`,
    ),
  ];
  if (comparable.length < 2 || new Set(comparable.map((s) => s.id)).size < 2)
    return result(
      "hold",
      "Log two recent comparable exposures before progression suggestions.",
      evidence,
    );
  if (!recovery.positive)
    return result(
      "hold",
      "Confirm current recovery; unknown or unreported feedback is not evidence of good recovery.",
      evidence,
    );
  const sets = comparable.flatMap(workingSets),
    latestSets = workingSets(comparable[1]);
  const entries = comparable.flatMap(matchingEntries);
  if (sets.some(s => s.effortReported !== true))
    return result("hold", "Actual effort is unconfirmed. Report observed RIR rather than using prescribed defaults as evidence.", evidence);
  if (entries.some((e) => !e.target))
    return result("hold", "Historical prescriptions are unknown; confirm intended effort, rest and rep context before progression.", evidence);
  if (entries.some(e => e.plannedWorkingSets === undefined ||
      e.plannedWorkingSets !== e.sets.filter(t => t.done && t.kind === "working").length))
    return result("hold", "The planned set dose is unknown or incomplete. Review skipped or changed sets before progression.", evidence);
  if (
    entries.some(
      (e) =>
        (e.technique && !["straight", "superset"].includes(e.technique)) ||
        e.tempo ||
        e.sets.some(
          (t) =>
            t.done &&
            t.kind !== "warmup" &&
            (t.kind === "drop" || (t.bout && t.bout !== "straight")),
        ),
    )
  )
    return result(
      "hold",
      "Advanced sequences need a whole-sequence manual review; do not equate activation, mini, drop or down bouts to straight sets.",
      evidence,
    );
  if (
    entries.some(
      (e) =>
        e.target &&
        (e.target.rir >= 5 ||
          e.target.min !== range.min ||
          e.target.max !== range.max ||
          e.sets.some(
            (t) => t.done && t.kind === "working" && t.rir < e.target!.rir,
          )),
    )
  )
    return result(
      "hold",
      "Prescribed effort or rep context was missed or is recovery-oriented; repeat before escalating.",
      evidence,
    );
  const counts = comparable.map((s) => workingSets(s).length);
  if (
    counts[0] !== counts[1] ||
    new Set(entries.map((e) => e.target?.rest ?? null)).size > 1 ||
    new Set(entries.map((e) => e.target?.rir ?? null)).size > 1
  )
    return result(
      "hold",
      "Set dose or prescribed rest changed; establish comparable exposures.",
      evidence,
    );
  if (!sets.every((s) => Math.abs(s.weight - latestSets[0].weight) < 0.01))
    return result(
      "hold",
      "Loads changed across sets or exposures; establish a repeatable load context.",
      evidence,
    );
  const means = comparable.map(
    (s) =>
      workingSets(s).reduce((sum, t) => sum + t.reps, 0) /
      workingSets(s).length,
  );
  if (means[1] < means[0])
    return result(
      "hold",
      "Mean comparable performance declined; do not escalate from a cherry-picked best set.",
      evidence,
    );
  const floor = options.experience === "New" ? 2 : 1;
  if (sets.some((s) => s.rir < floor))
    return result(
      "hold",
      `Repeat controlled work with at least ${floor} RIR before escalating.`,
      evidence,
    );
  const weight = latestSets[0].weight;
  const available = (options.entry ?? latestEntry).setup?.availableLoads ?? [];
  if (available.length && !available.some(load => Math.abs(load - weight) < 0.000001))
    return result("hold", "The baseline load is not in the selected available loads. Review equipment and establish a repeatable available load before progressing.", evidence);
  if (
    sets.every((s) => s.reps >= range.max) &&
    weight > 0 &&
    !["machine-label", "added-bodyweight"].includes(x.convention) &&
    sets.every((s) => Math.abs(s.weight - weight) < 0.01)
  ) {
    const cap = weight + Math.min(2.5, weight * 0.025);
    const nextWeight = available.find(load => load > weight + 0.000001 && load <= cap + 0.000000001);
    if (nextWeight === undefined)
      return result(
        "hold",
        available.length
          ? "No selected available load fits the smaller of 2.5% or 2.5 kg. Keep the load and reserve; do not force an equipment jump."
          : "Rep ceiling reached. Select available loads in Equipment setup before accepting a load increase; equipment availability is unknown.",
        evidence,
      );
    return result(
      "load",
      "Both comparable exposures met the ceiling with reserve. Use the smallest selected available load within the smaller of 2.5% or 2.5 kg; preserve setup and intended reserve.",
      evidence,
      { weight: nextWeight, reps: range.min,
        setTargets: latestSets.map(() => ({ weight: nextWeight, reps: range.min })) },
    );
  }
  if (latestSets.every((s) => s.reps >= range.max))
    return result(
      "hold",
      "Rep ceiling reached; no inferred increment for machine labels or added-bodyweight work. Review available equipment manually.",
      evidence,
    );
  if (sets.every((s) => s.reps >= range.min))
    return result(
      "reps",
      "Keep load stable and try one additional total rep on the lowest-rep eligible set. Preserve the other rows and intended reserve; machine labels remain raw labels.",
      evidence,
      {
        weight,
        reps: Math.min(
          range.max,
          Math.min(...latestSets.map((s) => s.reps)) + 1,
        ),
        setTargets: latestSets.map((s, index) => ({
          weight: s.weight,
          reps: s.reps + (index === latestSets.map(t => t.reps)
            .lastIndexOf(Math.min(...latestSets.map(t => t.reps))) ? 1 : 0),
        })),
      },
    );
  return result(
    "hold",
    "Keep targets stable until all comparable working sets meet the lower rep target.",
    evidence,
  );
}
export type MuscleReview = ReturnType<typeof coachingMeta> & {
  action: "hold" | "volume-review" | "recover" | "deload-review";
  reason: string;
};
// Performance is relative to the saved prescription, never a pump/growth score.
function musclePerformance(
  muscle: Exercise["muscle"],
  sessions: Session[],
  exercises: Exercise[],
  now: number,
) {
  const groups = new Map<string, { entry: Entry; session: Session }[]>();
  for (const session of chronological(sessions).filter((s) =>
    fresh(s, now, 21),
  ))
    for (const entry of session.exercises) {
      const x = exercises.find((x) => x.id === entry.exerciseId);
      if (
        !x ||
        x.muscle !== muscle ||
        !entry.sets.some((s) => s.done && s.kind !== "warmup")
      )
        continue;
      const rows = groups.get(x.id) ?? [];
      rows.push({ entry, session });
      groups.set(x.id, rows);
    }
  const rows = [...groups.values()];
  const evidence: string[] = [];
  let repeatedMiss = false,
    favorable = rows.length > 0;
  for (const exposures of rows) {
    const pair = exposures.slice(-2);
    if (pair.length < 2 || pair[0].session.id === pair[1].session.id ||
        pair.some(p => p.session.phase !== undefined && p.session.phase !== "accumulation") ||
        pair[0].session.phase !== pair[1].session.phase) {
      favorable = false;
      continue;
    }
    const [a, b] = pair.map((p) => p.entry),
      x = exercises.find((x) => x.id === a.exerciseId)!;
    const valid = (e: Entry) =>
      !!e.target &&
      e.plannedWorkingSets !== undefined &&
      e.plannedWorkingSets === e.sets.filter(s => s.done && s.kind === "working").length &&
      e.sets.filter(s => s.done && s.kind === "working").every(s => s.effortReported === true) &&
      e.target.rir < 5 &&
      (!e.technique || ["straight", "superset"].includes(e.technique)) &&
      !e.tempo &&
      !e.sets.some(
        (s) =>
          s.done &&
          s.kind !== "warmup" &&
          (s.kind !== "working" || (s.bout && s.bout !== "straight")),
      );
    const sets = (e: Entry) =>
      e.sets.filter((s) => s.done && s.kind === "working");
    if (
      !valid(a) ||
      !valid(b) ||
      comparableKey(a, x) !== comparableKey(b, x) ||
      a.target!.rest !== b.target!.rest ||
      a.target!.rir !== b.target!.rir ||
      a.target!.min !== b.target!.min ||
      a.target!.max !== b.target!.max ||
      sets(a).length !== sets(b).length
    ) {
      favorable = false;
      continue;
    }
    const misses = (e: Entry) =>
      sets(e).some((s) => s.reps < e.target!.min || s.rir < e.target!.rir);
    const missed = misses(a) && misses(b);
    repeatedMiss ||= missed;
    const easy = (e: Entry) =>
      sets(e).every(
        (s) => s.reps >= e.target!.min && s.rir >= e.target!.rir + 1,
      );
    const nonDeclining = sets(b).every(
      (s, i) =>
        s.weight >= sets(a)[i].weight &&
        s.reps >= sets(a)[i].reps &&
        s.rir >= sets(a)[i].rir,
    );
    favorable &&= easy(a) && easy(b) && nonDeclining;
    evidence.push(
      `${x.name}: two ${sets(b).length}-set comparable exposures; ${missed ? "both below prescribed reps/effort" : easy(a) && easy(b) && nonDeclining ? "targets exceeded with extra reserve" : "no clear favorable performance margin"}.`,
    );
  }
  return { repeatedMiss, favorable, evidence };
}
export function muscleReview(
  muscle: Exercise["muscle"],
  sessions: Session[],
  exercises: Exercise[],
  options: CoachingOptions = {},
): MuscleReview {
  const now = options.now ?? Date.now(),
    recovery = recoveryStatus(muscle, sessions, exercises, now);
  const performance = musclePerformance(muscle, sessions, exercises, now);
  const evidence = [...recovery.evidence, ...performance.evidence];
  const result = (
    action: MuscleReview["action"],
    reason: string,
  ): MuscleReview => ({
    action,
    reason,
    ...coachingMeta(evidence, [98, 99, 165, 166, 168, 169, 175, 277, 316]),
  });
  const trained = muscles.filter((m) =>
    sessions.some(
      (s) =>
        fresh(s, now, 14) &&
        s.exercises.some(
          (e) =>
            exercises.find((x) => x.id === e.exerciseId)?.muscle === m &&
            e.sets.some((t) => t.done && t.kind !== "warmup"),
        ),
    ),
  );
  const struggling = trained.filter(
    (m) => musclePerformance(m, sessions, exercises, now).repeatedMiss,
  );
  if (
    performance.repeatedMiss &&
    struggling.length >= 2 &&
    struggling.length > trained.length / 2
  ) {
    evidence.push(
      `${struggling.join(", ")}: repeated below-target performance across more than half of recently trained primary muscles.`,
    );
    return result(
      "deload-review",
      "Review broader fatigue reduction, not a diagnosis of MRV. Multiple muscles repeatedly missed prescribed performance.",
    );
  }
  if (recovery.blocked || performance.repeatedMiss)
    return result(
      "recover",
      "Review a localized recovery session before escalation. Repeated missed effort/reps or pain/recovery flags veto extra work; seek qualified advice for persistent pain.",
    );
  if (options.phase && options.phase !== "accumulation")
    return result(
      "hold",
      `The ${options.phase} goal is recovery/retention; do not infer a biological sensitivity reset or add growth work.`,
    );
  if (recovery.positive && performance.favorable)
    return result(
      "volume-review",
      "Optional small volume review, not an automatic addition: repeated targets exceeded with reserve and explicit early recovery. Check schedule, technique and current dose before accepting any edit.",
    );
  return result(
    "hold",
    "Keep volume stable. Require repeated comparable above-target performance and explicit early recovery; pump, soreness absence or just-in-time recovery alone cannot justify additions.",
  );
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
    ...(remote.exerciseVideos || local.exerciseVideos
      ? {
          exerciseVideos: [
            ...new Map(
              [
                ...(remote.exerciseVideos || []),
                ...(local.exerciseVideos || []),
              ].map((v) => [v.exerciseId, v]),
            ).values(),
          ],
        }
      : {}),
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
