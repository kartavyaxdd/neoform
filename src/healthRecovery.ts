import {
  normalizeHealthSnapshot,
  HEALTH_KINDS,
  type HealthRecord,
  type HealthKind,
  type HealthSnapshot,
} from "./healthConnectPolicy";
const DAY = 86400000;
const specs = {
  sleep: { weight: 0.4, floor: 45, direction: -1 },
  "hrv-rmssd": { weight: 0.35, floor: 0.1, direction: -1 },
  "resting-heart-rate": { weight: 0.25, floor: 3, direction: 1 },
} as const;
export type RecoveryComponent = {
  kind: keyof typeof specs;
  value: number;
  baseline: number;
  scale: number;
  score: number;
  days: number;
  sourceName: string;
  at: number;
};
export type RecoveryEstimate = {
  policy: "recovery-v1";
  at: number;
  score: number | null;
  confidence: "insufficient" | "moderate" | "higher";
  band: "usual" | "caution" | "lower" | "unknown";
  components: RecoveryComponent[];
  reason: string;
};
export const healthMedian = (a: number[]) => {
  const s = [...a].sort((a, b) => a - b),
    i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export function selectedHealthRows(s: HealthSnapshot, kind: HealthKind) {
  const all = s.records.filter((r) => r.kind === kind);
  const source =
    s.sources[kind] ??
    [...new Set(all.map((r) => r.source))].sort(
      (a, b) =>
        all.filter((r) => r.source === b).length -
          all.filter((r) => r.source === a).length || a.localeCompare(b),
    )[0];
  return all.filter((r) => r.source === source);
}
const identity = (r: HealthRecord) =>
  JSON.stringify([
    r.source,
    r.device ?? "unknown",
    r.recordingMethod ?? "unknown",
    r.context ?? "provider-unspecified",
  ]);
function qualified(r: HealthRecord) {
  return (
    r.kind !== "sleep" ||
    (Number.isFinite(r.asleepMinutes) &&
      r.asleepMinutes! > 0 &&
      r.asleepMinutes! <= (r.endAt - r.startAt) / 60000 &&
      Number.isFinite(r.stageCoverage) &&
      r.stageCoverage! >= 0.9 &&
      r.stageCoverage! <= 1)
  );
}
export function recoveryEstimate(
  input: HealthSnapshot | null,
  now = Date.now(),
): RecoveryEstimate {
  const result: RecoveryEstimate = {
    policy: "recovery-v1",
    at: now,
    score: null,
    confidence: "insufficient",
    band: "unknown",
    components: [],
    reason: "Insufficient current data",
  };
  if (
    !input?.enabled ||
    !Number.isFinite(input.syncedAt) ||
    input.syncedAt > now ||
    now - input.syncedAt > DAY ||
    input.clipped
  )
    return result;
  const s = normalizeHealthSnapshot(input, now);
  for (const kind of Object.keys(specs) as (keyof typeof specs)[]) {
    const rows = selectedHealthRows(s, kind).sort((a, b) => b.endAt - a.endAt);
    const latest = rows[0];
    if (!latest || now - latest.endAt > DAY || !qualified(latest)) continue;
    const days = new Map<string, number[]>();
    for (const r of rows)
      if (
        identity(r) === identity(latest) &&
        qualified(r) &&
        r.endAt >= latest.endAt - 28 * DAY &&
        r.day <= latest.day
      ) {
        const value =
          kind === "sleep"
            ? r.asleepMinutes!
            : kind === "hrv-rmssd"
              ? Math.log(r.value)
              : r.value;
        if (Number.isFinite(value))
          days.set(r.day, [...(days.get(r.day) ?? []), value]);
      }
    const prior = [...days]
      .filter(([d]) => d < latest.day)
      .map(([, v]) => healthMedian(v));
    if (prior.length < 14) {
      result.reason = "Building your baseline";
      continue;
    }
    const value = healthMedian(days.get(latest.day)!),
      baseline = healthMedian(prior);
    const spec = specs[kind],
      scale = Math.max(
        spec.floor,
        1.4826 * healthMedian(prior.map((v) => Math.abs(v - baseline))),
      );
    const deviation = Math.max(
      0,
      Math.min(4, (spec.direction * (value - baseline)) / scale),
    );
    result.components.push({
      kind,
      value,
      baseline,
      scale,
      score: 100 - 25 * deviation,
      days: prior.length,
      sourceName: latest.sourceName,
      at: latest.endAt,
    });
  }
  if (
    !result.components.some((c) => c.kind === "sleep") ||
    result.components.length < 2
  )
    return result;
  const weight = result.components.reduce(
    (n, c) => n + specs[c.kind].weight,
    0,
  );
  result.score = Math.round(
    result.components.reduce((n, c) => n + c.score * specs[c.kind].weight, 0) /
      weight,
  );
  result.band =
    result.score >= 75 ? "usual" : result.score >= 50 ? "caution" : "lower";
  result.confidence =
    result.components.length === 3 &&
    result.components.every((c) => c.days >= 21)
      ? "higher"
      : "moderate";
  result.reason =
    "Experimental personal-baseline index; not a percentage of muscle recovery.";
  return result;
}
export function recoveryTrend(s: HealthSnapshot | null, now = Date.now()) {
  if (!s?.enabled) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const at = now - (6 - i) * DAY;
    // Reconstruct only observations available at that time, never future baselines.
    return recoveryEstimate(
      { ...s, syncedAt: at, records: s.records.filter((r) => r.endAt <= at) },
      at,
    );
  }).filter((r) => r.score !== null);
}
export const healthLabels: Record<(typeof HEALTH_KINDS)[number], string> = {
  steps: "Steps",
  sleep: "Sleep session time",
  weight: "Body weight",
  nutrition: "Logged calories",
  "resting-heart-rate": "Resting heart rate",
  "hrv-rmssd": "HRV · RMSSD",
  "respiratory-rate": "Respiratory rate",
  "skin-temperature": "Skin temperature deviation",
  protein: "Logged protein",
};
