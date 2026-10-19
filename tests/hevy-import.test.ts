import { describe, expect, it } from "vitest";
import { parseHevyCsv, mergeHevyImport } from "../src/hevyImport";
import * as D from "../src/domain";
export const header =
  "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe";
export const sample =
  header +
  '\r\n"Push, A","18 Oct 2026, 09:00","18 Oct 2026, 10:00","Good ""day""","Bench Press (Barbell)",,"Setup\r\ncarefully",0,warmup,20,10,,,6';
describe("Hevy CSV", () => {
  it("previews quoted BOM/CRLF exports without changing source notes or units", async () => {
    const p = await parseHevyCsv("\uFEFF" + sample, "+05:30");
    expect(p.workouts).toHaveLength(1);
    expect(p.workouts[0]).toMatchObject({
      title: "Push, A",
      date: "2026-10-18",
      startedAt: Date.parse("2026-10-18T09:00:00+05:30"),
      duration: 3600,
      description: 'Good "day"',
    });
    expect(p.workouts[0].rows[0]).toMatchObject({
      exercise_title: "Bench Press (Barbell)",
      exercise_notes: "Setup\r\ncarefully",
      set_type: "warmup",
      weight_kg: "20",
      rpe: "6",
    });
    expect(p.unit).toBe("kg");
    expect(p.sourceSets).toBe(1);
  });
  it("merges only explicitly mapped source archives without inventing RIR or targets, preserving existing state", async () => {
    const state = D.emptyState();
    state.programs = [D.starterProgram("balanced")];
    state.draft = D.startSession("Keep my draft", [
      D.createEntry(D.catalog[0]),
    ]);
    state.sessions = [D.startSession("Keep history", [])];
    const before = structuredClone(state),
      p = await parseHevyCsv(sample, "+05:30");
    expect(() => mergeHevyImport(state, p, {}, false)).toThrow(/acknowledge/i);
    expect(() => mergeHevyImport(state, p, {}, true)).toThrow(/choose/i);
    const result = mergeHevyImport(
      state,
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
    );
    expect(state).toEqual(before);
    expect(result.state.programs).toEqual(before.programs);
    expect(result.state.draft).toEqual(before.draft);
    expect(result.state.sessions[0]).toEqual(before.sessions[0]);
    expect(result.added).toBe(1);
    const imported = result.state.sessions[1];
    expect(imported.notes).toContain('Good "day"');
    expect(imported.exercises[0].sets).toEqual([]);
    expect(imported.exercises[0].target).toBeUndefined();
    expect(imported.exercises[0].notes).toContain('"set_type":"warmup"');
    expect(imported.exercises[0].notes).toContain('"rpe":"6"');
    expect(D.stateSchema.safeParse(result.state).success).toBe(true);
    const again = mergeHevyImport(
      result.state,
      await parseHevyCsv("\uFEFF" + sample, "+05:30"),
      {},
      true,
    );
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(again.state).toEqual(result.state);
  });
  it("warns explicitly about timed/distance and unknown set types while preserving lbs/miles verbatim", async () => {
    const text = sample
      .replace("weight_kg", "weight_lbs")
      .replace("distance_km", "distance_miles")
      .replace("20,10,,,6", "20,10,1,60,6")
      .replace("warmup", "future_type");
    const p = await parseHevyCsv(text, "+00:00");
    expect(p.unit).toBe("lb");
    expect(p.warnings.join(" ")).toMatch(/timed|distance/i);
    expect(p.warnings.join(" ")).toContain("future_type");
    const merged = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
    );
    expect(merged.state.sessions[0].exercises[0].notes).toContain(
      '"weight_lbs":"20"',
    );
    expect(merged.state.sessions[0].exercises[0].notes).toContain(
      '"distance_miles":"1"',
    );
    expect(merged.state.sessions[0].exercises[0].sets).toEqual([]);
  });
  it("blocks conflicting workout metadata, changed repeated exports and oversized source notes atomically", async () => {
    const extra = sample
      .slice(sample.indexOf("\r\n") + 2)
      .replace('Good ""day""', "Different notes");
    await expect(
      parseHevyCsv(sample + "\r\n" + extra, "+05:30"),
    ).rejects.toThrow(/conflicting/i);
    const first = await parseHevyCsv(sample, "+05:30");
    const merged = mergeHevyImport(
      D.emptyState(),
      first,
      { "Bench Press (Barbell)": "bench" },
      true,
    ).state;
    const before = structuredClone(merged);
    const changed = await parseHevyCsv(
      sample.replace("20,10", "30,10"),
      "+05:30",
    );
    expect(() =>
      mergeHevyImport(
        merged,
        changed,
        { "Bench Press (Barbell)": "bench" },
        true,
      ),
    ).toThrow(/Changed or ambiguous/);
    expect(merged).toEqual(before);
    const long = await parseHevyCsv(
      sample.replace("Setup\r\ncarefully", "x".repeat(2001)),
      "+05:30",
    );
    expect(() =>
      mergeHevyImport(merged, long, { "Bench Press (Barbell)": "bench" }, true),
    ).toThrow();
    const fresh = D.emptyState();
    expect(() =>
      mergeHevyImport(fresh, long, { "Bench Press (Barbell)": "bench" }, true),
    ).toThrow(/limit/);
    expect(fresh.sessions).toEqual([]);
  });
  it("creates unresolved exercises only with explicit source-preserving custom metadata", async () => {
    const p = await parseHevyCsv(sample, "+05:30");
    const custom: D.Exercise = {
      ...D.catalog[0],
      id: "custom-hevy-test",
      name: "Bench Press (Barbell)",
      e1rm: false,
    };
    expect(() =>
      mergeHevyImport(
        D.emptyState(),
        p,
        { "Bench Press (Barbell)": { ...custom, name: "Wrong exercise" } },
        true,
      ),
    ).toThrow(/source name/);
    const r = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": custom },
      true,
    );
    expect(r.state.customExercises).toEqual([custom]);
    expect(r.state.sessions[0].exercises[0].exerciseId).toBe(custom.id);
    expect(r.state.sessions[0].exercises[0].sets).toEqual([]);
    expect(
      D.recommend(custom.id, r.state.sessions, r.state.customExercises, {
        min: 8,
        max: 12,
      }).action,
    ).toBe("hold");
  });
  it("imports only supported explicitly opted-in RPE sets using the app effort convention, never absent effort or targets", async () => {
    const p = await parseHevyCsv(
      sample
        .replace("weight_kg", "weight_lbs")
        .replace("distance_km", "distance_miles"),
      "+05:30",
    );
    const archived = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
    );
    expect(archived.state.sessions[0].exercises[0].sets).toEqual([]);
    const r = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
      true,
    );
    expect(r.state.sessions[0].exercises[0].sets[0]).toMatchObject({
      reps: 10,
      rir: 4,
      kind: "warmup",
      done: true,
    });
    expect(r.state.sessions[0].exercises[0].sets[0].weight).toBeCloseTo(
      D.convertWeight(20, "lb", "kg"),
    );
    expect(r.state.sessions[0].exercises[0].target).toBeUndefined();
    const missing = await parseHevyCsv(sample.replace(",,,6", ",,,"), "+05:30");
    expect(
      mergeHevyImport(
        D.emptyState(),
        missing,
        { "Bench Press (Barbell)": "bench" },
        true,
        true,
      ).state.sessions[0].exercises[0].sets,
    ).toEqual([]);
    const timed = await parseHevyCsv(
      sample.replace("20,10,,,6", "20,10,1,60,6"),
      "+05:30",
    );
    expect(
      mergeHevyImport(
        D.emptyState(),
        timed,
        { "Bench Press (Barbell)": "bench" },
        true,
        true,
      ).state.sessions[0].exercises[0].sets,
    ).toEqual([]);
  });
  it("preserves source superset/drop context instead of mislabelling imported advanced work as straight sets", async () => {
    const csv = sample
      .replace('"Bench Press (Barbell)",,', '"Bench Press (Barbell)",1,')
      .replace("warmup", "drop_set");
    const p = await parseHevyCsv(csv, "+05:30");
    const r = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
      true,
    );
    const e = r.state.sessions[0].exercises[0];
    expect(e.superset).toBe("1");
    expect(e.sets[0].kind).toBe("drop");
    expect(D.comparableKey(e, D.catalog[0])).not.toBe("bench|total|Barbell");
  });
  it("uses independent explicit weight/distance headers rather than assuming pounds means miles", async () => {
    const p = await parseHevyCsv(
      sample.replace("weight_kg", "weight_lbs"),
      "+05:30",
    );
    expect(p.unit).toBe("lb");
    expect(p.distanceUnit).toBe("km");
  });
  it("preflights the exact UTF-8 merged account and sync envelope, not just uploaded CSV size", async () => {
    const bytes = (value: unknown) =>
      new TextEncoder().encode(JSON.stringify(value)).length;
    const state = D.emptyState();
    state.programs = [D.starterProgram("balanced")];
    state.draft = D.startSession("Unicode draft", []);
    let oldSize = bytes(state);
    while (true) {
      const session = D.startSession("Existing Unicode history", []);
      // Appending one JSON array member adds its bytes and, after the first,
      // one comma. Avoid serializing a growing 2 MB fixture on every iteration.
      const overhead = bytes(session) + (state.sessions.length ? 1 : 0);
      const room = D.MAX_STATE_BYTES - oldSize - overhead - 2200;
      if (room < 3) break;
      session.notes = "界".repeat(Math.min(600, Math.floor(room / 3)));
      state.sessions.push(session);
      oldSize += overhead + new TextEncoder().encode(session.notes).length;
    }
    expect(bytes(state)).toBe(oldSize);
    expect(D.stateSchema.safeParse(state).success).toBe(true);
    const before = structuredClone(state);
    const csv = sample.replace("Setup\r\ncarefully", "界".repeat(900));
    expect(new TextEncoder().encode(csv).length).toBeLessThan(10_000);
    const p = await parseHevyCsv(csv, "+05:30");
    expect(() =>
      mergeHevyImport(state, p, { "Bench Press (Barbell)": "bench" }, true),
    ).toThrow(/2 MB|storage|budget/i);
    expect(state).toEqual(before);
    // Zod trims names. The importer must still budget the exact returned raw
    // account, not accidentally pass an over-budget object via normalization.
    const spaced = await parseHevyCsv(
      sample.replace('"Push, A"', '"' + " ".repeat(119) + 'X"'),
      "+05:30",
    );
    const imported = mergeHevyImport(
      D.emptyState(),
      spaced,
      { "Bench Press (Barbell)": "bench" },
      true,
    ).state.sessions[0];
    const edge = structuredClone(state);
    const delta =
      bytes({ ...edge, sessions: [...edge.sessions, imported] }) - bytes(edge);
    const padding = D.MAX_STATE_BYTES - delta + 50 - bytes(edge);
    expect(padding).toBeGreaterThan(0);
    edge.sessions.at(-1)!.notes += "x".repeat(padding);
    expect(D.stateSchema.safeParse(edge).success).toBe(true);
    expect(() =>
      mergeHevyImport(edge, spaced, { "Bench Press (Barbell)": "bench" }, true),
    ).toThrow(/budget/i);
    const fits = mergeHevyImport(
      D.emptyState(),
      p,
      { "Bench Press (Barbell)": "bench" },
      true,
    ).state;
    expect(bytes(fits)).toBeLessThanOrEqual(D.MAX_STATE_BYTES);
    expect(
      bytes({ revision: Number.MAX_SAFE_INTEGER, data: fits }),
    ).toBeLessThan(D.MAX_BACKUP);
  }, 20_000);
  it("rejects malformed or ambiguous inputs before preview", async () => {
    for (const text of [
      "",
      header,
      header + ",rpe\n",
      sample.replace("weight_kg", "weight"),
      sample + ",extra",
      sample.replace("20,10,,,6", "-1,10,,,6"),
      sample.replace("18 Oct", "32 Oct"),
      sample.replace("09:00", "25:00"),
      sample + '\n"unclosed',
      "x".repeat(2_000_001),
    ]) {
      await expect(parseHevyCsv(text, "+05:30")).rejects.toThrow();
    }
    await expect(parseHevyCsv(sample, "")).rejects.toThrow(/offset/i);
  });
});
