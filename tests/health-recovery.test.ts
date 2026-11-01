import { describe, it, expect } from "vitest";
import { recoveryEstimate, recoveryTrend } from "../src/healthRecovery";
import {
  normalizeHealthSnapshot,
  type HealthRecord,
  type HealthSnapshot,
} from "../src/healthConnectPolicy";
const now = Date.parse("2026-11-01T10:00:00Z"),
  day = 86400000;
export function healthFixture(days = 22): HealthSnapshot {
  const records: HealthRecord[] = [];
  for (let i = 0; i <= days; i++)
    for (const kind of ["sleep", "resting-heart-rate", "hrv-rmssd"] as const) {
      const endAt = now - i * day - 3600000;
      records.push({
        id: `${kind}-${i}`,
        kind,
        source: "ring",
        sourceName: "Ring",
        startAt: endAt - (kind === "sleep" ? 8 * 3600000 : 0),
        endAt,
        day: new Date(endAt).toISOString().slice(0, 10),
        value: kind === "sleep" ? 480 : kind === "hrv-rmssd" ? 50 : 60,
        unit: kind === "sleep" ? "min" : kind === "hrv-rmssd" ? "ms" : "bpm",
        asleepMinutes: kind === "sleep" ? 450 : undefined,
        stageCoverage: kind === "sleep" ? 1 : undefined,
        context: "overnight",
        device: "ring-v1",
        recordingMethod: 2,
      });
    }
  return {
    version: 2,
    syncedAt: now,
    enabled: true,
    permissions: ["sleep", "hrv-rmssd", "resting-heart-rate"],
    sources: {},
    records,
  };
}
describe("local recovery policy v1", () => {
  it("calculates a deterministic transparent index, never a biological percentage", () => {
    const s = healthFixture();
    const r = recoveryEstimate(s, now);
    expect(r.score).toBe(100);
    expect(r.confidence).toBe("higher");
    expect(r.components).toHaveLength(3);
    s.records.find((r) => r.id === "sleep-0")!.asleepMinutes = 270;
    s.records.find((r) => r.id === "resting-heart-rate-0")!.value = 72;
    s.records.find((r) => r.id === "hrv-rmssd-0")!.value = 10;
    expect(recoveryEstimate(s, now).score).toBe(0);
    expect(recoveryEstimate(s, now).band).toBe("lower");
  });
  it("requires fourteen prior days, qualified sleep and at least one cardiac metric", () => {
    expect(recoveryEstimate(healthFixture(13), now).score).toBeNull();
    const s = healthFixture(14);
    s.permissions = ["sleep", "resting-heart-rate"];
    expect(recoveryEstimate(s, now).confidence).toBe("moderate");
    s.records
      .filter((r) => r.kind === "sleep")
      .forEach((r) => {
        delete r.asleepMinutes;
        delete r.stageCoverage;
      });
    expect(recoveryEstimate(s, now).score).toBeNull();
  });
  it.each([
    "stale",
    "partial",
    "revoked",
    "source",
    "method",
    "device",
    "missing",
    "future",
  ])("does not score %s observations", (issue) => {
    const s = healthFixture();
    if (issue === "stale") s.syncedAt -= 25 * 3600000;
    if (issue === "partial") s.clipped = true;
    if (issue === "revoked") s.permissions = [];
    if (issue === "source") s.sources.sleep = "missing";
    if (issue === "method")
      s.records.find((r) => r.id === "sleep-0")!.recordingMethod = 3;
    if (issue === "device")
      s.records.find((r) => r.id === "sleep-0")!.device = "new-device";
    if (issue === "missing")
      s.records = s.records.filter((r) => !r.id.endsWith("-0"));
    if (issue === "future") s.syncedAt = now + 1;
    expect(recoveryEstimate(s, now).score).toBeNull();
  });
  it("deduplicates stages and days, rejects impossible qualified durations, and never uses a future baseline", () => {
    const s = healthFixture(13);
    s.records.push(...structuredClone(s.records));
    expect(recoveryEstimate(s, now).score).toBeNull();
    const t = healthFixture();
    t.records.find((r) => r.id === "sleep-0")!.asleepMinutes = 9999;
    expect(recoveryEstimate(t, now).score).toBeNull();
    expect(recoveryTrend(healthFixture(), now).every((r) => r.at <= now)).toBe(
      true,
    );
  });
  it("preserves legacy snapshots without inventing staged sleep or HRV", () => {
    const s = healthFixture();
    s.version = 1;
    for (const r of s.records) {
      delete r.asleepMinutes;
      delete r.stageCoverage;
    }
    expect(normalizeHealthSnapshot(s, now).version).toBe(2);
    expect(recoveryEstimate(s, now).score).toBeNull();
  });
});
it("rejects zero HRV without crashing or manufacturing a cardiac component", () => {
  const s = healthFixture();
  s.records.find((r) => r.id === "hrv-rmssd-0")!.value = 0;
  const r = recoveryEstimate(s, now);
  expect(r.score).toBe(100);
  expect(r.confidence).toBe("moderate");
  expect(r.components.some((c) => c.kind === "hrv-rmssd")).toBe(false);
});
