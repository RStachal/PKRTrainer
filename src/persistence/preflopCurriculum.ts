import {
  type ActionContext,
  type AnteMode,
  type Filters,
  type Position,
  type ScoringMode,
  type StackBucket,
} from "../core/types";
import { hashStr } from "../core/rng";
import type { ResultRecordV2 } from "./statsRecordV2";
import {
  buildStatsV2KpiModel,
  type StatsV2BreakdownDim,
  type StatsV2LeakCandidate,
} from "./statsV2Analytics";

export interface PreflopCurriculumOptions {
  minLeakSample?: number;
  leakRateThreshold?: number;
  targetSpots?: number;
  targetAccuracy?: number;
  streakTarget?: number;
  scoringMode?: ScoringMode;
  seed?: number;
  repetitionLimit?: number;
}

export interface PreflopCurriculumFocus {
  dim: Extract<StatsV2BreakdownDim, "context" | "position" | "bucket">;
  key: string;
  total: number;
  correct: number;
  rate: number | null;
  filters: Filters;
  label: string;
}

export interface PreflopSessionGoal {
  targetSpots: number;
  targetAccuracy: number;
  streakTarget: number;
  leakCleanupTarget: number;
}

export interface PreflopSpacedRepetitionItem {
  qid: string;
  attempts: number;
  misses: number;
  lastTs: number;
  priority: number;
}

export interface PreflopCurriculumPlan {
  available: boolean;
  reason: string;
  focus: PreflopCurriculumFocus | null;
  alternates: readonly PreflopCurriculumFocus[];
  sessionGoal: PreflopSessionGoal;
  repetitionQueue: readonly PreflopSpacedRepetitionItem[];
}

const CURRICULUM_DIMS = ["context", "position", "bucket"] as const;

export function buildPreflopCurriculumPlan(
  records: readonly ResultRecordV2[],
  options: PreflopCurriculumOptions = {},
): PreflopCurriculumPlan {
  const preflopRecords = records.filter((record) => record.street === "PREFLOP");
  const sessionGoal = buildSessionGoal(options);
  if (preflopRecords.length === 0) {
    return {
      available: false,
      reason: "No preflop answers yet.",
      focus: null,
      alternates: [],
      sessionGoal,
      repetitionQueue: [],
    };
  }

  const kpi = buildStatsV2KpiModel(preflopRecords, {
    minLeakSample: options.minLeakSample ?? 5,
    leakRateThreshold: options.leakRateThreshold ?? 70,
    leakDimensions: CURRICULUM_DIMS,
  });
  const focuses = kpi.leakCandidates
    .filter(isCurriculumLeakCandidate)
    .map((candidate) => focusFromLeakCandidate(candidate, preflopRecords, options.scoringMode ?? "LENIENT"));
  const repetitionQueue = buildPreflopSpacedRepetitionQueue(preflopRecords, {
    seed: options.seed ?? 0,
    limit: options.repetitionLimit ?? 8,
  });

  if (focuses.length === 0) {
    return {
      available: false,
      reason: `No leak with ${kpi.minLeakSample}+ samples below ${kpi.leakRateThreshold}%.`,
      focus: null,
      alternates: [],
      sessionGoal,
      repetitionQueue,
    };
  }

  return {
    available: true,
    reason: "Target the weakest sample-qualified preflop bucket.",
    focus: focuses[0],
    alternates: focuses.slice(1, 4),
    sessionGoal: {
      ...sessionGoal,
      leakCleanupTarget: Math.max(sessionGoal.leakCleanupTarget, Math.min(90, (focuses[0].rate ?? 0) + 20)),
    },
    repetitionQueue,
  };
}

export function buildPreflopSpacedRepetitionQueue(
  records: readonly ResultRecordV2[],
  options: { seed?: number; limit?: number } = {},
): PreflopSpacedRepetitionItem[] {
  const groups = new Map<string, { attempts: number; misses: number; lastTs: number; lastCorrect: boolean }>();
  for (const record of records.filter((item) => item.street === "PREFLOP")) {
    const group = groups.get(record.qid) ?? {
      attempts: 0,
      misses: 0,
      lastTs: Number.NEGATIVE_INFINITY,
      lastCorrect: true,
    };
    group.attempts += 1;
    if (!record.correct) group.misses += 1;
    if (record.ts >= group.lastTs) {
      group.lastTs = record.ts;
      group.lastCorrect = record.correct;
    }
    groups.set(record.qid, group);
  }

  const maxTs = Math.max(0, ...[...groups.values()].map((group) => group.lastTs));
  const seed = options.seed ?? 0;
  const queue = [...groups.entries()]
    .map(([qid, group]) => {
      const ageBonus = Math.min(40, Math.max(0, Math.round((maxTs - group.lastTs) / 86_400_000)));
      const lastMissBonus = group.lastCorrect ? 0 : 35;
      const missRate = group.attempts === 0 ? 0 : group.misses / group.attempts;
      const deterministicTieBreak = (hashStr(`${seed}|${qid}`) % 1000) / 1000;
      return {
        qid,
        attempts: group.attempts,
        misses: group.misses,
        lastTs: group.lastTs,
        priority: Math.round((group.misses * 100 + missRate * 60 + lastMissBonus + ageBonus) * 1000) / 1000 +
          deterministicTieBreak,
      };
    })
    .filter((item) => item.misses > 0)
    .sort((a, b) => b.priority - a.priority || a.qid.localeCompare(b.qid));

  return queue.slice(0, options.limit ?? 8);
}

function buildSessionGoal(options: PreflopCurriculumOptions): PreflopSessionGoal {
  return {
    targetSpots: normalizePositiveInt(options.targetSpots, 20),
    targetAccuracy: normalizeRate(options.targetAccuracy, 80),
    streakTarget: normalizePositiveInt(options.streakTarget, 5),
    leakCleanupTarget: normalizeRate(options.targetAccuracy, 80),
  };
}

function focusFromLeakCandidate(
  candidate: StatsV2LeakCandidate,
  records: readonly ResultRecordV2[],
  scoringMode: ScoringMode,
): PreflopCurriculumFocus {
  const dim = candidate.dim as PreflopCurriculumFocus["dim"];
  const matchingRecords = records.filter((record) => String(record[dim]) === candidate.key);
  const ante = dominantAnte(matchingRecords);
  return {
    dim,
    key: candidate.key,
    total: candidate.total,
    correct: candidate.correct,
    rate: candidate.rate,
    filters: filtersForFocus(dim, candidate.key, ante, scoringMode),
    label: focusLabel(dim, candidate.key),
  };
}

function filtersForFocus(
  dim: PreflopCurriculumFocus["dim"],
  key: string,
  ante: AnteMode,
  scoringMode: ScoringMode,
): Filters {
  return {
    positions: dim === "position" ? [key as Position] : [],
    buckets: dim === "bucket" ? [Number(key) as StackBucket] : [],
    contexts: dim === "context" ? [key as ActionContext] : [],
    ante,
    scoringMode,
  };
}

function focusLabel(dim: PreflopCurriculumFocus["dim"], key: string): string {
  switch (dim) {
    case "context":
      return `Action spot: ${contextLabel(key)}`;
    case "position":
      return `Position: ${key}`;
    case "bucket":
      return `Stack: ${key} BB`;
  }
}

function contextLabel(key: string): string {
  switch (key) {
    case "RFI":
      return "RFI / Open";
    case "VS_LIMP":
      return "Vs limp";
    case "VS_OPEN":
      return "Vs open";
    case "VS_3BET":
      return "Vs 3-bet";
    case "VS_4BET":
      return "Vs 4-bet";
    case "SQUEEZE":
      return "Squeeze";
    case "BVB":
      return "Blind vs blind";
    case "PUSH_FOLD":
      return "Push / Fold";
    case "VS_ALLIN":
      return "Vs all-in";
    default:
      return key;
  }
}

function dominantAnte(records: readonly ResultRecordV2[]): AnteMode {
  const on = records.filter((record) => record.ante === "ON").length;
  const off = records.length - on;
  return on >= off ? "ON" : "OFF";
}

function isCurriculumLeakCandidate(
  candidate: StatsV2LeakCandidate,
): candidate is StatsV2LeakCandidate & { dim: PreflopCurriculumFocus["dim"] } {
  return candidate.dim === "context" || candidate.dim === "position" || candidate.dim === "bucket";
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function normalizeRate(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}
