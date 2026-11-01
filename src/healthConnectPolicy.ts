import type { Readiness } from "./domain";
export const HEALTH_KINDS = [
  "steps",
  "sleep",
  "weight",
  "nutrition",
  "resting-heart-rate",
  "hrv-rmssd",
  "respiratory-rate",
  "skin-temperature",
  "protein",
] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];
export type HealthRecord = {
  id: string;
  kind: HealthKind;
  source: string;
  sourceName: string;
  startAt: number;
  endAt: number;
  day: string;
  value: number;
  unit:
    "count" | "min" | "kg" | "kcal" | "bpm" | "ms" | "breaths/min" | "°C" | "g";
  device?: string;
  recordingMethod?: number;
  context?: string;
  asleepMinutes?: number;
  awakeMinutes?: number;
  stageCoverage?: number;
};
export type HealthSnapshot = {
  version: 1 | 2;
  syncedAt: number;
  enabled: boolean;
  permissions: HealthKind[];
  records: HealthRecord[];
  sources: Partial<Record<HealthKind, string>>;
  clipped?: boolean;
  metricStatus?: Partial<
    Record<
      HealthKind,
      "imported" | "empty" | "denied" | "unsupported" | "partial"
    >
  >;
};
export type HealthMetric = {
  kind: HealthKind;
  value: number;
  unit: HealthRecord["unit"];
  day: string;
  source: string;
  sourceName: string;
  endAt: number;
  baseline?: number;
  observations: number;
  partial: boolean;
};
export type HealthContext = {
  stale: boolean;
  metrics: HealthMetric[];
  reviews: ("poor-sleep" | "unusual-activity")[];
};
const DAY = 86400000;
function validDay(day: string) {
  const date = new Date(day + "T12:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day
  );
}
const units = {
  steps: "count",
  sleep: "min",
  weight: "kg",
  nutrition: "kcal",
  "resting-heart-rate": "bpm",
  "hrv-rmssd": "ms",
  "respiratory-rate": "breaths/min",
  "skin-temperature": "°C",
  protein: "g",
};
const limits = {
  steps: 200000,
  sleep: 1440,
  weight: 500,
  nutrition: 30000,
  "resting-heart-rate": 250,
  "hrv-rmssd": 300,
  "respiratory-rate": 100,
  "skin-temperature": 20,
  protein: 1500,
};
export function normalizeHealthSnapshot(
  input: HealthSnapshot,
  now = Date.now(),
): HealthSnapshot {
  const seen = new Set<string>();
  const permissions = [
    ...new Set(input.permissions.filter((k) => HEALTH_KINDS.includes(k))),
  ];
  const records = input.records
    .filter((r) => {
      const key = `${r.kind}:${r.source}:${r.id}`;
      if (
        !HEALTH_KINDS.includes(r.kind) ||
        !permissions.includes(r.kind) ||
        !r.id ||
        !r.source ||
        r.id.length > 200 ||
        r.source.length > 200 ||
        r.sourceName.length > 200 ||
        r.unit !== units[r.kind] ||
        !Number.isFinite(r.value) ||
        (r.kind === "skin-temperature" ? r.value < -20 : r.value < 0) ||
        r.value > limits[r.kind] ||
        !Number.isFinite(r.startAt) ||
        r.startAt < 0 ||
        !Number.isFinite(r.endAt) ||
        r.startAt > r.endAt ||
        r.endAt > now ||
        r.endAt < now - 31 * DAY ||
        !validDay(r.day) ||
        (r.kind === "sleep" && r.endAt - r.startAt > DAY) ||
        ((r.kind === "weight" ||
          r.kind === "resting-heart-rate" ||
          r.kind === "hrv-rmssd" ||
          r.kind === "respiratory-rate") &&
          r.value === 0) ||
        (r.kind === "steps" && r.source !== "health-connect-aggregate") ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10000);
  return {
    version: 2,
    enabled: input.enabled === true,
    syncedAt: input.syncedAt,
    permissions,
    records,
    sources: { ...input.sources },
    clipped: input.clipped === true || input.records.length > 10000,
    metricStatus: Object.fromEntries(
      HEALTH_KINDS.map((k) => [
        k,
        input.metricStatus?.[k] === "unsupported"
          ? "unsupported"
          : !permissions.includes(k)
            ? "denied"
            : !records.some((r) => r.kind === k)
              ? "empty"
              : input.clipped || input.records.length > 10000
                ? "partial"
                : "imported",
      ]),
    ),
  };
}
const median = (values: number[]) => {
  const a = [...values].sort((a, b) => a - b),
    i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
};
function dailyValue(kind: HealthKind, rows: HealthRecord[]) {
  if (kind === "sleep") {
    // Union intervals rather than summing mirrored or overlapping sessions.
    const intervals = rows
      .map((r) => [r.startAt, r.endAt])
      .sort((a, b) => a[0] - b[0]);
    let total = 0,
      end = -Infinity;
    for (const [start, stop] of intervals) {
      total += Math.max(0, stop - Math.max(start, end));
      end = Math.max(end, stop);
    }
    return total / 60000;
  }
  if (kind === "steps" || kind === "nutrition" || kind === "protein")
    return rows.reduce((n, r) => n + r.value, 0);
  if (kind === "weight")
    return [...rows].sort((a, b) => b.endAt - a.endAt)[0].value;
  return median(rows.map((r) => r.value));
}
export function healthContext(
  input: HealthSnapshot | null,
  now = Date.now(),
): HealthContext {
  if (!input?.enabled) return { stale: true, metrics: [], reviews: [] };
  const s = normalizeHealthSnapshot(input, now),
    metrics: HealthMetric[] = [];
  const stale =
    !Number.isFinite(s.syncedAt) ||
    s.syncedAt > now ||
    now - s.syncedAt > DAY ||
    !!s.clipped;
  for (const kind of HEALTH_KINDS) {
    const all = s.records.filter((r) => r.kind === kind);
    // Deterministic source choice; once explicitly chosen it never silently falls back.
    const source =
      s.sources[kind] ??
      [...new Set(all.map((r) => r.source))].sort(
        (a, b) =>
          all.filter((r) => r.source === b).length -
            all.filter((r) => r.source === a).length || a.localeCompare(b),
      )[0];
    const rows = all.filter((r) => r.source === source);
    if (!rows.length) continue;
    const latest = [...rows].sort((a, b) => b.endAt - a.endAt)[0];
    if (now - latest.endAt > 2 * DAY) continue;
    const days = new Map<string, HealthRecord[]>();
    for (const r of rows)
      if (r.endAt >= now - 21 * DAY)
        days.set(r.day, [...(days.get(r.day) ?? []), r]);
    const history = [...days]
      .filter(([d]) => d < latest.day)
      .map(([, rs]) => dailyValue(kind, rs));
    metrics.push({
      kind,
      value: dailyValue(kind, days.get(latest.day) ?? [latest]),
      unit: latest.unit,
      day: latest.day,
      endAt: latest.endAt,
      source: latest.source,
      sourceName: latest.sourceName,
      baseline: history.length >= 7 ? median(history) : undefined,
      observations: history.length,
      partial: kind === "nutrition" || kind === "protein" || kind === "steps",
    });
  }
  const reviews: HealthContext["reviews"] = [];
  if (!stale)
    for (const m of metrics) {
      // Original software review cues, never physiological readiness thresholds.
      if (m.kind === "sleep" && m.baseline && m.value < m.baseline - 60)
        reviews.push("poor-sleep");
      if (
        m.kind === "steps" &&
        m.baseline &&
        m.value > Math.max(m.baseline * 1.5, m.baseline + 3000)
      )
        reviews.push("unusual-activity");
    }
  return { stale, metrics, reviews };
}
export function confirmHealthFactor(
  report: Readiness,
  factor: HealthContext["reviews"][number],
): Readiness {
  return {
    ...report,
    context: "changed",
    factors: [...new Set([...report.factors, factor])],
  };
}
