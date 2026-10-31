import { describe, expect, it } from "vitest";
import {
  healthContext,
  normalizeHealthSnapshot,
  confirmHealthFactor,
  type HealthRecord,
  type HealthSnapshot,
} from "../src/healthConnectPolicy";
import {
  readinessSchema,
  emptyState,
  stateSchema,
  type State,
} from "../src/domain";
import { buildCoachContext } from "../src/aiCoach";
import { exportHistoryBackup } from "../src/historyBackup";

const now = Date.parse("2026-10-31T12:00:00Z");
const row = (patch: Partial<HealthRecord> = {}): HealthRecord => ({
  id: "sleep-1",
  kind: "sleep",
  source: "ring",
  sourceName: "Ring",
  startAt: now - 10 * 3600000,
  endAt: now - 2 * 3600000,
  day: "2026-10-31",
  value: 480,
  unit: "min",
  ...patch,
});
const snapshot = (
  records: HealthRecord[],
  patch: Partial<HealthSnapshot> = {},
): HealthSnapshot => ({
  version: 1,
  syncedAt: now,
  permissions: ["sleep", "steps", "nutrition", "weight", "resting-heart-rate"],
  records,
  sources: {},
  enabled: true,
  ...patch,
});

describe("private Health Connect observations", () => {
  it("rejects corrupt calendar dates and impossible sleep spans without crashing", () => {
    expect(
      normalizeHealthSnapshot(
        snapshot([
          row({ day: "2026-99-99" }),
          row({ id: "bad-day", day: "2026-02-31" }),
          row({ id: "bad-sleep", startAt: now - 3 * 86400000 }),
        ]),
        now,
      ).records,
    ).toEqual([]);
  });
  it("keeps raw health observations outside the workout wire schema, backups and Gemini context", async () => {
    const raw = snapshot([row({ source: "health-private-marker" })]);
    const state = { ...emptyState(), healthSnapshot: raw };
    expect(stateSchema.safeParse(state).success).toBe(false);
    const plain = emptyState();
    expect(await exportHistoryBackup(plain)).not.toContain(
      "health-private-marker",
    );
    expect(
      JSON.stringify(buildCoachContext(state as State, now)),
    ).not.toContain("health-private-marker");
  });
  it("deduplicates record identity without merging distinct sources", () => {
    const s = normalizeHealthSnapshot(
      snapshot([row(), row(), row({ source: "fit" })]),
      now,
    );
    expect(s.records).toHaveLength(2);
    expect(
      healthContext(s, now).metrics.find((m) => m.kind === "sleep")?.value,
    ).toBe(480);
  });
  it("selects one source and unions overlapping sleep intervals without doubling", () => {
    const s = snapshot(
      [
        row(),
        row({ id: "overlap", startAt: now - 5 * 3600000, value: 180 }),
        row({ source: "mirror", id: "mirror", value: 600 }),
      ],
      { sources: { sleep: "ring" } },
    );
    expect(
      healthContext(s, now).metrics.find((m) => m.kind === "sleep")?.value,
    ).toBe(480);
  });
  it("keeps an overnight sleep record on its supplied local wake date", () => {
    const s = snapshot([row({ day: "2026-11-01" })]);
    expect(
      healthContext(s, now).metrics.find((m) => m.kind === "sleep")?.day,
    ).toBe("2026-11-01");
  });
  it("treats revoked, missing, future and stale observations as unavailable", () => {
    expect(
      healthContext(snapshot([row()], { permissions: [] }), now).metrics,
    ).toHaveLength(0);
    expect(healthContext(snapshot([]), now).metrics).toHaveLength(0);
    expect(
      healthContext(snapshot([row({ endAt: now + 1 })]), now).metrics,
    ).toHaveLength(0);
    expect(
      healthContext(snapshot([row()], { syncedAt: now - 25 * 3600000 }), now)
        .stale,
    ).toBe(true);
    expect(
      healthContext(snapshot([row()], { enabled: false }), now).metrics,
    ).toHaveLength(0);
  });
  it("does not replace a selected missing source with another provider", () => {
    const s = snapshot([row({ source: "mirror" })], {
      sources: { sleep: "ring" },
    });
    expect(healthContext(s, now).metrics).toHaveLength(0);
  });
  it("requires seven distinct prior days for a descriptive baseline", () => {
    const history = Array.from({ length: 7 }, (_, i) =>
      row({
        id: `past-${i}`,
        day: `2026-10-${30 - i}`,
        startAt: now - (i + 1) * 86400000 - 8 * 3600000,
        endAt: now - (i + 1) * 86400000,
      }),
    );
    const c = healthContext(
      snapshot([row({ startAt: now - 6 * 3600000, value: 240 }), ...history]),
      now,
    );
    expect(c.metrics.find((m) => m.kind === "sleep")?.baseline).toBe(480);
    expect(c.reviews).toContain("poor-sleep");
    expect(
      healthContext(snapshot([row(), ...history.slice(0, 6)]), now).metrics[0]
        .baseline,
    ).toBeUndefined();
  });
  it("never interprets nutrition entries as complete intake or a deficit", () => {
    const c = healthContext(
      snapshot([row({ kind: "nutrition", unit: "kcal", value: 650 })]),
      now,
    );
    expect(c.metrics[0].value).toBe(650);
    expect(c.metrics[0].partial).toBe(true);
    expect(c.reviews).toEqual([]);
    expect(c).not.toHaveProperty("deficit");
  });
  it("replaces a snapshot so deleted records cannot survive a refresh", () => {
    expect(normalizeHealthSnapshot(snapshot([]), now).records).toEqual([]);
  });
  it("rejects corrupt units, impossible values and non-aggregate step sources", () => {
    const s = normalizeHealthSnapshot(
      snapshot([
        row({ value: -1 }),
        row({ id: "x", unit: "kg" }),
        row({
          id: "s",
          kind: "steps",
          unit: "count",
          value: 100,
          source: "mirror",
        }),
      ]),
      now,
    );
    expect(s.records).toEqual([]);
  });
  it("confirmation adds only context, preserving pain, effort and unknown recovery", () => {
    const r = readinessSchema.parse({
      recordedAt: now - 1000,
      pain: true,
      fatigue: null,
      context: "unknown",
      factors: [],
      muscles: [
        { muscle: "Chest", recovered: "unknown", pain: null, soreness: null },
      ],
    });
    const result = confirmHealthFactor(r, "poor-sleep");
    expect(result.pain).toBe(true);
    expect(result.fatigue).toBeNull();
    expect(result.recordedAt).toBe(r.recordedAt);
    expect(result.muscles).toEqual(r.muscles);
    expect(result.context).toBe("changed");
    expect(result.factors).toEqual(["poor-sleep"]);
    expect(readinessSchema.safeParse(result).success).toBe(true);
  });
});
