import type { ResultRecordV2 } from "./statsRecordV2";

export type StatsV2BreakdownDim =
  | "gameVariant"
  | "tableFormat"
  | "blindSpeed"
  | "street"
  | "evModel"
  | "ante"
  | "rakeMode"
  | "rangePackId"
  | "position"
  | "bucket"
  | "context";

export interface StatsV2Summary {
  total: number;
  correct: number;
  rate: number | null;
}

export interface StatsV2Group {
  key: string;
  total: number;
  correct: number;
  rate: number | null;
}

export interface StatsV2KpiOptions {
  recentWindowSize?: number;
  minLeakSample?: number;
  leakRateThreshold?: number;
  leakDimensions?: readonly StatsV2BreakdownDim[];
  /**
   * Restricts leak detection to one training profile. The lifetime and recent
   * figures stay whole-store - "how am I doing" is a fair thing to pool - but a
   * leak is a thing to act on, and acting on it means training in one profile.
   */
  leakProfileId?: string;
}

export interface StatsV2LeakCandidate extends StatsV2Group {
  dim: StatsV2BreakdownDim;
}

export interface StatsV2KpiModel {
  total: number;
  correct: number;
  lifetimeRate: number | null;
  currentStreak: number;
  bestStreak: number;
  recentWindowSize: number;
  recentTotal: number;
  recentCorrect: number;
  recentRate: number | null;
  avgResponseMs: number | null;
  recentAvgResponseMs: number | null;
  minLeakSample: number;
  leakRateThreshold: number;
  leakCandidates: readonly StatsV2LeakCandidate[];
}

export function summarizeStatsV2(records: readonly ResultRecordV2[]): StatsV2Summary {
  const total = records.length;
  const correct = records.filter((record) => record.correct).length;
  return {
    total,
    correct,
    rate: successRate(total, correct),
  };
}

export function breakdownStatsV2(
  records: readonly ResultRecordV2[],
  dim: StatsV2BreakdownDim,
): StatsV2Group[] {
  const groups = new Map<string, { total: number; correct: number }>();
  const order: string[] = [];

  for (const record of records) {
    const key = String(record[dim]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { total: 0, correct: 0 };
      groups.set(key, group);
      order.push(key);
    }

    group.total += 1;
    if (record.correct) group.correct += 1;
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    return {
      key,
      total: group.total,
      correct: group.correct,
      rate: successRate(group.total, group.correct),
    };
  });
}

export function buildStatsV2KpiModel(
  records: readonly ResultRecordV2[],
  options: StatsV2KpiOptions = {},
): StatsV2KpiModel {
  const recentWindowSize = normalizePositiveInt(options.recentWindowSize, 20);
  const minLeakSample = normalizePositiveInt(options.minLeakSample, 5);
  const leakRateThreshold = normalizeRateThreshold(options.leakRateThreshold, 60);
  const summary = summarizeStatsV2(records);
  const recentRecords = records.slice(-recentWindowSize);
  const recent = summarizeStatsV2(recentRecords);

  return {
    total: summary.total,
    correct: summary.correct,
    lifetimeRate: summary.rate,
    currentStreak: currentCorrectStreak(records),
    bestStreak: bestCorrectStreak(records),
    recentWindowSize,
    recentTotal: recent.total,
    recentCorrect: recent.correct,
    recentRate: recent.rate,
    avgResponseMs: averageResponseMs(records),
    recentAvgResponseMs: averageResponseMs(recentRecords),
    minLeakSample,
    leakRateThreshold,
    leakCandidates: findLeakCandidates(records, {
      minLeakSample,
      leakRateThreshold,
      leakDimensions: options.leakDimensions,
      leakProfileId: options.leakProfileId,
    }),
  };
}

export function availableStatsV2Dimensions(): StatsV2BreakdownDim[] {
  return [
    "gameVariant",
    "tableFormat",
    "blindSpeed",
    "street",
    "evModel",
    "ante",
    "rakeMode",
    "rangePackId",
    "position",
    "bucket",
    "context",
  ];
}

function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

function currentCorrectStreak(records: readonly ResultRecordV2[]): number {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (!records[index].correct) break;
    streak += 1;
  }
  return streak;
}

function bestCorrectStreak(records: readonly ResultRecordV2[]): number {
  let best = 0;
  let current = 0;
  for (const record of records) {
    if (record.correct) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function averageResponseMs(records: readonly ResultRecordV2[]): number | null {
  let count = 0;
  let total = 0;
  for (const record of records) {
    if (typeof record.responseMs !== "number" || !Number.isFinite(record.responseMs)) continue;
    if (record.responseMs < 0) continue;
    count += 1;
    total += record.responseMs;
  }
  if (count === 0) return null;
  return Math.round(total / count);
}

function findLeakCandidates(
  records: readonly ResultRecordV2[],
  options: Required<Pick<StatsV2KpiOptions, "minLeakSample" | "leakRateThreshold">> &
    Pick<StatsV2KpiOptions, "leakDimensions" | "leakProfileId">,
): StatsV2LeakCandidate[] {
  const dimensions = options.leakDimensions ?? ["context", "position", "bucket"];
  const scoped = options.leakProfileId === undefined
    ? records
    : records.filter((record) => record.profileId === options.leakProfileId);
  const candidates = dimensions.flatMap((dim) => (
    breakdownStatsV2(scoped, dim)
      .filter((group) => (
        group.total >= options.minLeakSample &&
        group.rate !== null &&
        group.rate < options.leakRateThreshold
      ))
      .map((group) => ({ ...group, dim }))
  ));

  return candidates.sort((a, b) => (
    (a.rate ?? 101) - (b.rate ?? 101) ||
    b.total - a.total ||
    a.dim.localeCompare(b.dim) ||
    a.key.localeCompare(b.key)
  ));
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function normalizeRateThreshold(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}
