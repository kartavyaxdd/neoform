import * as D from "./domain";
// Hevy export compatibility and provenance: .planning/HEVY-IMPORT-RESULT.md.
export const MAX_HEVY_BYTES = 2_000_000;
export type HevyRow = Record<string, string>;
export type HevyWorkout = {
  id: string;
  fingerprint: string;
  offset: string;
  title: string;
  date: string;
  startedAt: number;
  duration: number;
  description: string;
  rows: HevyRow[];
};
export type HevyPreview = {
  workouts: HevyWorkout[];
  unit: "kg" | "lb";
  distanceUnit: "km" | "miles";
  sourceSets: number;
  warnings: string[];
};

function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === '"') {
      if (value || closed) throw Error("Malformed CSV quote.");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(value);
      value = "";
      closed = false;
      if (c !== ",") {
        rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else {
      if (closed) throw Error("Unexpected text after CSV quote.");
      value += c;
    }
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  if (value || closed || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function time(
  raw: string,
  offset: string,
): { timestamp: number; date: string } {
  const m = raw.match(
    /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m)
    throw Error(
      "Unsupported date. Use an English Hevy export (e.g. 18 Oct 2026, 09:00).",
    );
  const month =
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(m[2].toLowerCase()) + 1;
  const date = `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const timestamp = Date.parse(
    `${date}T${m[4]}:${m[5]}:${m[6] || "00"}${offset}`,
  );
  if (
    !month ||
    !Number.isFinite(timestamp) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date ||
    Number(m[4]) > 23 ||
    Number(m[5]) > 59 ||
    Number(m[6] || 0) > 59
  )
    throw Error("Invalid workout date.");
  return { timestamp, date };
}

export async function parseHevyCsv(
  text: string,
  offset: string,
): Promise<HevyPreview> {
  if (new TextEncoder().encode(text).length > MAX_HEVY_BYTES)
    throw Error("CSV exceeds 2 MB.");
  if (
    !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) ||
    (offset.slice(1, 3) === "14" && offset.slice(4) !== "00")
  )
    throw Error("Choose an explicit UTC offset.");
  const rows = csv(text.replace(/^\uFEFF/, "")),
    headers = rows.shift() || [];
  const unit = headers.includes("weight_lbs") ? "lb" : "kg";
  const distanceUnit = headers.includes("distance_miles") ? "miles" : "km";
  const required = [
    "title",
    "start_time",
    "end_time",
    "description",
    "exercise_title",
    "superset_id",
    "exercise_notes",
    "set_index",
    "set_type",
    unit === "kg" ? "weight_kg" : "weight_lbs",
    "reps",
    distanceUnit === "km" ? "distance_km" : "distance_miles",
    "duration_seconds",
    "rpe",
  ];
  if (
    headers.length !== required.length ||
    new Set(headers).size !== headers.length ||
    required.some((h) => !headers.includes(h))
  )
    throw Error(
      "Unsupported Hevy CSV headers. Expected English kg/lbs weight and km/miles distance columns.",
    );
  if (!rows.length) throw Error("CSV contains no set rows.");
  const groups = new Map<string, HevyWorkout>();
  for (const cells of rows) {
    if (cells.length !== headers.length)
      throw Error("CSV row has the wrong number of columns.");
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    if (
      !r.title.trim() ||
      r.title.length > 120 ||
      !r.exercise_title.trim() ||
      r.exercise_title.length > 120
    )
      throw Error("Missing or overlong workout/exercise title.");
    for (const h of [
      "set_index",
      "weight_kg",
      "weight_lbs",
      "reps",
      "distance_km",
      "distance_miles",
      "duration_seconds",
      "rpe",
    ]) {
      if (
        r[h] &&
        (!/^\d+(?:\.\d+)?$/.test(r[h]) ||
          !Number.isFinite(Number(r[h])) ||
          Number(r[h]) < 0)
      )
        throw Error("Invalid numeric field: " + h);
    }
    if (
      !/^\d+$/.test(r.set_index) ||
      (r.reps && !/^\d+$/.test(r.reps)) ||
      Number(r.rpe) > 10 ||
      !r.set_type
    )
      throw Error("Invalid set index, reps, type or RPE.");
    const start = time(r.start_time, offset),
      end = time(r.end_time, offset);
    if (
      end.timestamp < start.timestamp ||
      end.timestamp - start.timestamp > 86400000
    )
      throw Error("Workout duration must be between 0 and 24 hours.");
    const key = JSON.stringify([r.title, r.start_time]);
    const prior = groups.get(key);
    if (
      prior &&
      (prior.description !== r.description ||
        prior.rows[0].end_time !== r.end_time)
    )
      throw Error(
        "Conflicting metadata for the same workout title/start time. Split the source export and review manually.",
      );
    if (!groups.has(key))
      groups.set(key, {
        id: "",
        fingerprint: "",
        offset,
        title: r.title,
        date: start.date,
        startedAt: start.timestamp,
        duration: (end.timestamp - start.timestamp) / 1000,
        description: r.description,
        rows: [],
      });
    groups.get(key)!.rows.push(r);
  }
  for (const [key, w] of groups) {
    w.id = "hevy-" + (await sha256(key));
    w.fingerprint = await sha256(
      JSON.stringify([
        offset,
        w.rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      ]),
    );
  }
  const sourceRows = [...groups.values()].flatMap((w) => w.rows);
  const warnings = [
    "Default: source-notes only. Hevy exports no RIR or prescriptions. Optional supported-set import requires explicit acceptance of NEOFORM’s RIR = 10 − exported RPE convention; missing effort is never filled in. Source-only rows receive no set, PR, volume or progression credit.",
    "Hevy timestamps have no timezone. Confirm the original UTC offset; split exports across daylight-saving changes. Keep the original CSV.",
  ];
  if (
    sourceRows.some(
      (r) => r.duration_seconds || r.distance_km || r.distance_miles,
    )
  )
    warnings.push(
      "Timed/distance records are retained in source notes only, not as timed/distance charts or logged sets.",
    );
  const unknown = [
    ...new Set(
      sourceRows
        .map((r) => r.set_type)
        .filter(
          (t) =>
            ![
              "normal",
              "warmup",
              "drop",
              "dropset",
              "drop_set",
              "failure",
            ].includes(t),
        ),
    ),
  ];
  if (unknown.length)
    warnings.push(
      "Unrecognized set types retained verbatim in notes: " +
        unknown.join(", "),
    );
  return {
    workouts: [...groups.values()],
    unit,
    distanceUnit,
    sourceSets: rows.length,
    warnings,
  };
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export type HevyChoices = Record<string, string | D.Exercise>;

/** Add-only import. Original rows always remain in notes. Numeric effort is
 * materialized only with the user's explicit RPE-convention opt-in and an
 * actual exported RPE; unknown effort and prescriptions are never invented. */
export function mergeHevyImport(
  state: D.State,
  preview: HevyPreview,
  choices: HevyChoices,
  acknowledged: boolean,
  importRpeSets = false,
): { state: D.State; added: number; duplicates: number } {
  if (!acknowledged)
    throw Error("Acknowledge the source-notes limitations before merging.");
  const sessions = [...state.sessions],
    customExercises = [...state.customExercises];
  let added = 0,
    duplicates = 0;
  for (const w of preview.workouts) {
    const marker = `Hevy source archive v1 ${w.fingerprint}`;
    const existing = sessions.find((s) => s.id === w.id);
    if (existing) {
      if (!existing.notes.startsWith(marker + "\n"))
        throw Error(
          `Changed or ambiguous Hevy workout: ${w.title}. Nothing merged. Keep your original CSV and review manually.`,
        );
      duplicates++;
      continue;
    }
    const entries: D.Entry[] = [];
    for (const row of w.rows) {
      const choice = Object.hasOwn(choices, row.exercise_title)
        ? choices[row.exercise_title]
        : undefined;
      if (!choice)
        throw Error(
          "Choose a mapping or custom exercise for " + row.exercise_title,
        );
      let ex: D.Exercise | undefined;
      if (typeof choice === "string")
        ex = [...D.catalog, ...customExercises].find((e) => e.id === choice);
      else {
        ex = D.exerciseSchema.parse(choice);
        if (
          ex.name !== row.exercise_title ||
          !ex.id.startsWith("custom-hevy-") ||
          ex.e1rm
        )
          throw Error(
            "A Hevy custom exercise must preserve its source name, use a new custom-hevy ID and disable 1RM estimates.",
          );
        const old = [...D.catalog, ...customExercises].find(
          (e) => e.id === ex!.id,
        );
        if (old && JSON.stringify(old) !== JSON.stringify(ex))
          throw Error("Custom exercise ID collision.");
        if (!old) customExercises.push(ex);
      }
      if (!ex) throw Error("Unknown exercise mapping.");
      const source = JSON.stringify(row);
      if (source.length + 40 > 2000)
        throw Error(
          "Source row exceeds the 2000-character note limit. Nothing merged.",
        );
      const last = entries.at(-1);
      if (
        last &&
        last.exerciseId === ex.id &&
        (last.superset || "") === row.superset_id &&
        last.notes.length + source.length + 1 <= 2000
      )
        last.notes += "\n" + source;
      else
        entries.push({
          id: D.uid(),
          exerciseId: ex.id,
          notes: `Hevy source rows (${preview.unit}; original fields):\n${source}`,
          sets: [],
          equipment: ex.equipment,
          convention: ex.convention,
          ...(row.superset_id.length <= 20 && row.superset_id
            ? {
                superset: row.superset_id,
                protocol: "Hevy source superset group " + row.superset_id,
              }
            : {}),
        });
      const weight = row[preview.unit === "kg" ? "weight_kg" : "weight_lbs"];
      const kind: D.SetLog["kind"] | undefined =
        row.set_type === "warmup"
          ? "warmup"
          : ["drop", "dropset", "drop_set"].includes(row.set_type)
            ? "drop"
            : ["normal", "failure"].includes(row.set_type)
              ? "working"
              : undefined;
      if (
        importRpeSets &&
        row.superset_id.length <= 20 &&
        row.rpe !== "" &&
        weight !== "" &&
        row.reps !== "" &&
        Number(row.reps) >= 1 &&
        Number(row.reps) <= 100 &&
        !row.distance_km &&
        !row.distance_miles &&
        !row.duration_seconds &&
        kind
      ) {
        const set = D.setSchema.safeParse({
          id: D.uid(),
          weight:
            ex.convention === "machine-label"
              ? Number(weight)
              : D.convertWeight(Number(weight), preview.unit, "kg"),
          reps: Number(row.reps),
          rir: 10 - Number(row.rpe),
          kind,
          done: true,
        });
        if (!set.success)
          throw Error(
            "Set exceeds supported limits; choose source-notes only. Nothing merged.",
          );
        entries.at(-1)!.sets.push(set.data);
      }
    }
    const notes = `${marker}\n${importRpeSets ? "Explicit RPE conversion: NEOFORM RIR = 10 − exported RPE; missing/unsupported sets remain source notes." : "Source-only: no inferred RIR, targets or progression."} No prescriptions imported. Original timestamps: ${w.rows[0].start_time} → ${w.rows[0].end_time}; UTC${w.offset}.\n${w.description}`;
    sessions.push({
      id: w.id,
      name: w.title,
      date: w.date,
      startedAt: w.startedAt,
      duration: w.duration,
      notes,
      feedback: { reported: false },
      exercises: entries,
    });
    added++;
  }
  const next = { ...state, sessions, customExercises };
  // Check the exact merge before Zod's name normalization. This includes all
  // existing program/history/draft data; MAX_STATE_BYTES reserves 256 bytes
  // for sync/backup envelopes beneath the 2 MB transport/D1 row ceiling.
  if (new TextEncoder().encode(JSON.stringify(next)).length > D.MAX_STATE_BYTES)
    throw Error(
      "Merged account exceeds the 2 MB sync/backup budget; nothing merged. Export a backup and reduce the import or stored history.",
    );
  const valid = D.stateSchema.safeParse(next);
  if (!valid.success)
    throw Error(
      "Import exceeds account/schema limits; nothing merged. " +
        valid.error.issues[0]?.message,
    );
  return { state: next, added, duplicates };
}
