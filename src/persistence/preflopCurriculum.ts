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
  recentWindowSize?: number;
  language?: "EN" | "CZ";
  /**
   * The training profile the plan is for. A leak is only worth showing if it was
   * measured where the player will train it, and the leak dimensions - context,
   * position, stack - carry no profile of their own, so the scope has to come
   * from outside. Omitted, the plan follows the profile of the newest answer.
   */
  profileId?: string;
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
  scenarioId: string;
  qid: string;
  attempts: number;
  misses: number;
  lastTs: number;
  priority: number;
}

export interface PreflopStudyRecommendation extends PreflopCurriculumFocus {
  priority: number;
  recentTotal: number;
  recentMistakes: number;
  reason: string;
}

/** Which profile the plan was measured in, and what that left out. */
export interface PreflopCurriculumScope {
  profileId: string | null;
  records: number;
  setAside: number;
}

export interface PreflopCurriculumPlan {
  scope: PreflopCurriculumScope;
  available: boolean;
  reason: string;
  focus: PreflopCurriculumFocus | null;
  alternates: readonly PreflopCurriculumFocus[];
  recommendations: readonly PreflopStudyRecommendation[];
  sessionGoal: PreflopSessionGoal;
  repetitionQueue: readonly PreflopSpacedRepetitionItem[];
}

const CURRICULUM_DIMS = ["context", "position", "bucket"] as const;

export function buildPreflopCurriculumPlan(
  records: readonly ResultRecordV2[],
  options: PreflopCurriculumOptions = {},
): PreflopCurriculumPlan {
  const allPreflop = records.filter((record) => record.street === "PREFLOP");
  // Pooling profiles produced a percentage that was nobody's percentage: a
  // player strong at the ante table and weak away from it was shown the average
  // of the two, attached to a button that drills it wherever they happen to be
  // sitting. So the analysis runs inside exactly one profile.
  const scopeProfileId = options.profileId ?? newestProfileId(allPreflop);
  const preflopRecords = scopeProfileId === null
    ? allPreflop
    : allPreflop.filter((record) => record.profileId === scopeProfileId);
  const scope: PreflopCurriculumScope = {
    profileId: scopeProfileId,
    records: preflopRecords.length,
    setAside: allPreflop.length - preflopRecords.length,
  };
  const language = options.language ?? "CZ";
  const sessionGoal = buildSessionGoal(options);
  if (preflopRecords.length === 0) {
    return {
      scope,
      available: false,
      reason: scope.setAside > 0
        ? localize(
          language,
          `No preflop answers in this profile yet (${scope.setAside} in others).`,
          `V tomto profilu zatím nejsou preflop odpovědi (${scope.setAside} v jiných).`,
        )
        : localize(
          language,
          "No preflop answers yet.",
          "Zatím nejsou žádné preflop odpovědi.",
        ),
      focus: null,
      alternates: [],
      recommendations: [],
      sessionGoal,
      repetitionQueue: [],
    };
  }

  const kpi = buildStatsV2KpiModel(preflopRecords, {
    minLeakSample: options.minLeakSample ?? 5,
    leakRateThreshold: options.leakRateThreshold ?? 70,
    leakDimensions: CURRICULUM_DIMS,
  });
  const repetitionQueue = buildPreflopSpacedRepetitionQueue(preflopRecords, {
    seed: options.seed ?? 0,
    limit: options.repetitionLimit ?? 8,
  });
  if (preflopRecords.length < kpi.minLeakSample) {
    return {
      scope,
      available: false,
      reason: volumeGoalReason(preflopRecords.length, kpi.minLeakSample, language),
      focus: null,
      alternates: [],
      recommendations: [],
      sessionGoal,
      repetitionQueue,
    };
  }

  const focuses = kpi.leakCandidates
    .filter(isCurriculumLeakCandidate)
    .map((candidate) => focusFromLeakCandidate(
      candidate,
      preflopRecords,
      options.scoringMode ?? "LENIENT",
    ));
  const recommendations = buildPreflopStudyRecommendations(focuses, preflopRecords, {
    recentWindowSize: options.recentWindowSize ?? 20,
    language,
  });

  if (focuses.length === 0) {
    return {
      scope,
      available: false,
      reason: localize(
        language,
        `No leak with ${kpi.minLeakSample}+ samples is below ${kpi.leakRateThreshold}%.`,
        `Žádná slabina s ${kpi.minLeakSample}+ vzorky pod ${kpi.leakRateThreshold} %.`,
      ),
      focus: null,
      alternates: [],
      recommendations: [],
      sessionGoal,
      repetitionQueue,
    };
  }

  const focus = recommendations[0] ?? focuses[0];
  return {
    scope,
    available: true,
    reason: localize(
      language,
      "Focus on the highest-priority preflop leak with a sufficient sample.",
      "Zaměřte se na nejdůležitější preflop slabinu s dostatečným vzorkem.",
    ),
    focus,
    alternates: recommendations.slice(1, 4),
    recommendations,
    sessionGoal: {
      ...sessionGoal,
      leakCleanupTarget: Math.max(sessionGoal.leakCleanupTarget, Math.min(90, (focus.rate ?? 0) + 20)),
    },
    repetitionQueue,
  };
}

export function buildPreflopSpacedRepetitionQueue(
  records: readonly ResultRecordV2[],
  options: { seed?: number; limit?: number } = {},
): PreflopSpacedRepetitionItem[] {
  const groups = new Map<string, {
    qid: string;
    attempts: number;
    misses: number;
    lastTs: number;
    lastCorrect: boolean;
  }>();
  for (const record of records.filter((item) => item.street === "PREFLOP")) {
    const group = groups.get(record.scenarioId) ?? {
      qid: record.qid,
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
    groups.set(record.scenarioId, group);
  }

  const maxTs = Math.max(0, ...[...groups.values()].map((group) => group.lastTs));
  const seed = options.seed ?? 0;
  const queue = [...groups.entries()]
    .map(([scenarioId, group]) => {
      const ageBonus = Math.min(40, Math.max(0, Math.round((maxTs - group.lastTs) / 86_400_000)));
      const lastMissBonus = group.lastCorrect ? 0 : 35;
      const missRate = group.attempts === 0 ? 0 : group.misses / group.attempts;
      const deterministicTieBreak = (hashStr(`${seed}|${scenarioId}`) % 1000) / 1000;
      return {
        scenarioId,
        qid: group.qid,
        attempts: group.attempts,
        misses: group.misses,
        lastTs: group.lastTs,
        priority: Math.round((group.misses * 100 + missRate * 60 + lastMissBonus + ageBonus) * 1000) / 1000 +
          deterministicTieBreak,
      };
    })
    .filter((item) => item.misses > 0)
    .sort((a, b) => b.priority - a.priority || a.scenarioId.localeCompare(b.scenarioId));

  return queue.slice(0, options.limit ?? 8);
}

/**
 * The profile of the most recent answer. Used when no caller said which profile
 * the plan is for: the newest answer is the table the player last sat at, and
 * following it keeps the plan inside one profile rather than falling back to the
 * pooled behaviour this replaced.
 */
function newestProfileId(records: readonly ResultRecordV2[]): string | null {
  let newest: ResultRecordV2 | null = null;
  for (const record of records) {
    if (newest === null || record.ts >= newest.ts) newest = record;
  }
  return newest === null ? null : newest.profileId;
}

function buildPreflopStudyRecommendations(
  focuses: readonly PreflopCurriculumFocus[],
  records: readonly ResultRecordV2[],
  options: { recentWindowSize: number; language: "EN" | "CZ" },
): PreflopStudyRecommendation[] {
  const recentWindowSize = normalizePositiveInt(options.recentWindowSize, 20);
  const recentRecords = [...records]
    .filter((record) => record.street === "PREFLOP")
    .sort((a, b) => a.ts - b.ts)
    .slice(-recentWindowSize);

  return focuses
    .map((focus, order) => {
      const recentMatches = recentRecords.filter((record) => focusMatchesRecord(focus, record));
      const recentMistakes = recentMatches.filter((record) => !record.correct).length;
      return {
        ...focus,
        priority: recommendationPriority(focus, recentMatches.length, recentMistakes),
        recentTotal: recentMatches.length,
        recentMistakes,
        reason: recommendationReason(
          focus,
          recentMatches.length,
          recentMistakes,
          options.language,
        ),
        order,
      };
    })
    .sort((a, b) => (
      b.priority - a.priority ||
      (a.rate ?? 101) - (b.rate ?? 101) ||
      b.total - a.total ||
      a.order - b.order
    ))
    .slice(0, 3)
    .map(({ order, ...recommendation }) => recommendation);
}

function recommendationPriority(
  focus: PreflopCurriculumFocus,
  recentTotal: number,
  recentMistakes: number,
): number {
  const errorRate = focus.rate === null ? 0 : 100 - focus.rate;
  const sampleScore = Math.min(28, Math.log2(focus.total + 1) * 7);
  const recentMistakeRate = recentTotal <= 0 ? 0 : recentMistakes / recentTotal;
  return roundOne(errorRate * 0.8 + sampleScore + recentMistakes * 22 + recentMistakeRate * 35);
}

function recommendationReason(
  focus: PreflopCurriculumFocus,
  recentTotal: number,
  recentMistakes: number,
  language: "EN" | "CZ",
): string {
  if (recentTotal > 0 && recentMistakes > 0) {
    return localize(
      language,
      `${recentMistakes}/${recentTotal} mistakes in the recent sample, ${formatRateForReason(focus.rate, language)} overall`,
      `${recentMistakes}/${recentTotal} chyb v posledním vzorku, celkem ${formatRateForReason(focus.rate, language)}`,
    );
  }
  if (recentTotal > 0) {
    return localize(
      language,
      `No recent mistake, ${formatRateForReason(focus.rate, language)} over ${focus.total} spots overall`,
      `Bez nedávné chyby, celkem ${formatRateForReason(focus.rate, language)} za ${focus.total} spotů`,
    );
  }
  return localize(
    language,
    `${formatRateForReason(focus.rate, language)} over ${focus.total} spots overall`,
    `Celkem ${formatRateForReason(focus.rate, language)} za ${focus.total} spotů`,
  );
}

function focusMatchesRecord(focus: PreflopCurriculumFocus, record: ResultRecordV2): boolean {
  return String(record[focus.dim]) === focus.key;
}

function formatRateForReason(rate: number | null, language: "EN" | "CZ"): string {
  if (rate === null) return localize(language, "no accuracy available", "bez úspěšnosti");
  return `${rate.toFixed(1)}%`;
}

function buildSessionGoal(options: PreflopCurriculumOptions): PreflopSessionGoal {
  return {
    targetSpots: normalizePositiveInt(options.targetSpots, 20),
    targetAccuracy: normalizeRate(options.targetAccuracy, 80),
    streakTarget: normalizePositiveInt(options.streakTarget, 5),
    leakCleanupTarget: normalizeRate(options.targetAccuracy, 80),
  };
}

function volumeGoalReason(
  currentSample: number,
  minSample: number,
  language: "EN" | "CZ",
): string {
  const remaining = Math.max(0, minSample - currentSample);
  if (remaining === 0) {
    return localize(
      language,
      `Complete at least ${minSample} preflop spots to receive leak recommendations.`,
      `Doplňte alespoň ${minSample} preflop spotů pro doporučení slabin.`,
    );
  }
  return localize(
    language,
    `Complete ${remaining} more preflop spots to receive leak recommendations.`,
    `Doplňte ještě ${remaining} preflop spotů pro doporučení slabin.`,
  );
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
      return `Situation: ${contextLabel(key)}`;
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

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function localize(language: "EN" | "CZ", english: string, czech: string): string {
  return language === "EN" ? english : czech;
}
