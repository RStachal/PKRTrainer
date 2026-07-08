import { hashStr } from "../core/rng";
import type { TrainingProfile } from "../core/trainingProfile";
import { trainingCapabilityForProfile } from "../data/ranges/trainingCapability";
import type { ResultRecordV2 } from "./statsRecordV2";

export type MttUtilitySourceQuality =
  | "PRODUCTION"
  | "PREVIEW"
  | "FALLBACK"
  | "LEGACY_UNKNOWN";

export type MttTournamentPhase =
  | "UNKNOWN"
  | "EARLY"
  | "MIDDLE"
  | "LATE"
  | "BUBBLE"
  | "FINAL_TABLE";

export type MttPayoutModel =
  | "UNKNOWN"
  | "CHIP_EV"
  | "STANDARD_PAYOUT"
  | "SATELLITE"
  | "FINAL_TABLE";

export type MttBountyModel =
  | "UNKNOWN"
  | "NONE"
  | "KO"
  | "PKO"
  | "MYSTERY_BOUNTY";

export type MttCoveringStatus =
  | "UNKNOWN"
  | "COVERS_ALL"
  | "COVERS_MAIN_VILLAIN"
  | "COVERED_BY_MAIN_VILLAIN"
  | "MIXED";

export interface MttUtilityStatsMetadata {
  tournamentPhase?: MttTournamentPhase;
  payoutModel?: MttPayoutModel;
  bountyModel?: MttBountyModel;
  coveringStatus?: MttCoveringStatus;
  tableSize?: number;
  actionNode?: string;
  sizing?: string;
  sourceQuality?: MttUtilitySourceQuality;
  evLossBb?: number;
  criticality?: number;
}

export type MttUtilityStatsRecord = ResultRecordV2 & MttUtilityStatsMetadata;

export type MttUtilityStatsDim =
  | "profileId"
  | "scenarioId"
  | "rangePackId"
  | "rangePackVersion"
  | "gameVariant"
  | "tableFormat"
  | "blindSpeed"
  | "street"
  | "evModel"
  | "ante"
  | "position"
  | "bucket"
  | "context"
  | "tournamentPhase"
  | "payoutModel"
  | "bountyModel"
  | "coveringStatus"
  | "tableSize"
  | "actionNode"
  | "sizing"
  | "sourceQuality";

export interface MttUtilityStatsGroup {
  dim: MttUtilityStatsDim;
  key: string;
  total: number;
  correct: number;
  rate: number | null;
  evLossBbTotal: number;
  avgEvLossBb: number | null;
}

export interface MttUtilitySpacedRepetitionItem {
  scenarioId: string;
  profileId: string;
  qid: string;
  attempts: number;
  misses: number;
  lastTs: number;
  sourceQuality: MttUtilitySourceQuality;
  evLossBbTotal: number;
  criticality: number;
  priority: number;
  reason: string;
}

export interface MttUtilityPackDriftWarning {
  scenarioId: string;
  profileIds: readonly string[];
  rangePackVersions: readonly string[];
  message: string;
}

export interface MttUtilityStatsReport {
  valid: boolean;
  total: number;
  sourceQualityCounts: Record<MttUtilitySourceQuality, number>;
  groups: readonly MttUtilityStatsGroup[];
  repetitionQueue: readonly MttUtilitySpacedRepetitionItem[];
  packDriftWarnings: readonly MttUtilityPackDriftWarning[];
  errors: readonly string[];
}

export interface MttUtilityStatsReportOptions {
  dimensions?: readonly MttUtilityStatsDim[];
  repetitionLimit?: number;
  seed?: number;
}

const DEFAULT_DIMS: readonly MttUtilityStatsDim[] = [
  "profileId",
  "scenarioId",
  "rangePackVersion",
  "street",
  "evModel",
  "tournamentPhase",
  "payoutModel",
  "bountyModel",
  "coveringStatus",
  "actionNode",
  "sizing",
  "sourceQuality",
];

export function buildMttUtilityStatsReport(
  records: readonly MttUtilityStatsRecord[],
  options: MttUtilityStatsReportOptions = {},
): MttUtilityStatsReport {
  const mttRecords = records.filter((record) => record.gameVariant === "MTT");
  const dimensions = options.dimensions ?? DEFAULT_DIMS;
  const errors = validateRecords(mttRecords);
  const sourceQualityCounts = emptySourceQualityCounts();
  for (const record of mttRecords) {
    sourceQualityCounts[inferMttSourceQuality(record)] += 1;
  }

  return {
    valid: errors.length === 0,
    total: mttRecords.length,
    sourceQualityCounts,
    groups: dimensions.flatMap((dim) => breakdownMttUtilityStats(mttRecords, dim)),
    repetitionQueue: buildMttUtilitySpacedRepetitionQueue(mttRecords, {
      limit: options.repetitionLimit ?? 12,
      seed: options.seed ?? 0,
    }),
    packDriftWarnings: findMttPackDriftWarnings(mttRecords),
    errors,
  };
}

export function breakdownMttUtilityStats(
  records: readonly MttUtilityStatsRecord[],
  dim: MttUtilityStatsDim,
): MttUtilityStatsGroup[] {
  const groups = new Map<string, { total: number; correct: number; evLossBbTotal: number; evLossSamples: number }>();
  const order: string[] = [];

  for (const record of records.filter((item) => item.gameVariant === "MTT")) {
    const key = mttUtilityDimKey(record, dim);
    let group = groups.get(key);
    if (group === undefined) {
      group = { total: 0, correct: 0, evLossBbTotal: 0, evLossSamples: 0 };
      groups.set(key, group);
      order.push(key);
    }
    group.total += 1;
    if (record.correct) group.correct += 1;
    if (isFiniteNonNegative(record.evLossBb)) {
      group.evLossBbTotal += record.evLossBb;
      group.evLossSamples += 1;
    }
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    return {
      dim,
      key,
      total: group.total,
      correct: group.correct,
      rate: successRate(group.total, group.correct),
      evLossBbTotal: roundTwo(group.evLossBbTotal),
      avgEvLossBb: group.evLossSamples === 0
        ? null
        : roundTwo(group.evLossBbTotal / group.evLossSamples),
    };
  });
}

export function buildMttUtilitySpacedRepetitionQueue(
  records: readonly MttUtilityStatsRecord[],
  options: { limit?: number; seed?: number } = {},
): MttUtilitySpacedRepetitionItem[] {
  const groups = new Map<string, {
    profileId: string;
    qid: string;
    attempts: number;
    misses: number;
    lastTs: number;
    lastCorrect: boolean;
    sourceQuality: MttUtilitySourceQuality;
    evLossBbTotal: number;
    criticality: number;
  }>();

  for (const record of records.filter((item) => item.gameVariant === "MTT")) {
    const group = groups.get(record.scenarioId) ?? {
      profileId: record.profileId,
      qid: record.qid,
      attempts: 0,
      misses: 0,
      lastTs: Number.NEGATIVE_INFINITY,
      lastCorrect: true,
      sourceQuality: inferMttSourceQuality(record),
      evLossBbTotal: 0,
      criticality: 1,
    };
    group.attempts += 1;
    if (!record.correct) group.misses += 1;
    if (isFiniteNonNegative(record.evLossBb)) group.evLossBbTotal += record.evLossBb;
    group.criticality = Math.max(group.criticality, recordCriticality(record));
    group.sourceQuality = strongestSourceQuality(group.sourceQuality, inferMttSourceQuality(record));
    if (record.ts >= group.lastTs) {
      group.lastTs = record.ts;
      group.lastCorrect = record.correct;
      group.qid = record.qid;
      group.profileId = record.profileId;
    }
    groups.set(record.scenarioId, group);
  }

  const maxTs = Math.max(0, ...[...groups.values()].map((group) => group.lastTs));
  const seed = options.seed ?? 0;
  return [...groups.entries()]
    .map(([scenarioId, group]) => {
      const missRate = group.attempts === 0 ? 0 : group.misses / group.attempts;
      const ageBonus = Math.min(24, Math.max(0, Math.round((maxTs - group.lastTs) / 86_400_000)));
      const lastMissBonus = group.lastCorrect ? 0 : 28;
      const evLossScore = Math.min(90, group.evLossBbTotal * 22);
      const criticalityScore = (group.criticality - 1) * 28;
      const deterministicTieBreak = (hashStr(`${seed}|${scenarioId}`) % 1000) / 1000;
      const priority = roundThree(
        group.misses * 45 +
        missRate * 55 +
        lastMissBonus +
        ageBonus +
        evLossScore +
        criticalityScore +
        sourceQualityWeight(group.sourceQuality) +
        deterministicTieBreak,
      );
      return {
        scenarioId,
        profileId: group.profileId,
        qid: group.qid,
        attempts: group.attempts,
        misses: group.misses,
        lastTs: group.lastTs,
        sourceQuality: group.sourceQuality,
        evLossBbTotal: roundTwo(group.evLossBbTotal),
        criticality: group.criticality,
        priority,
        reason: repetitionReason(group),
      };
    })
    .filter((item) => item.misses > 0 || item.evLossBbTotal > 0)
    .sort((a, b) => b.priority - a.priority || a.scenarioId.localeCompare(b.scenarioId))
    .slice(0, options.limit ?? 12);
}

export function inferMttSourceQuality(record: MttUtilityStatsRecord): MttUtilitySourceQuality {
  if (record.sourceQuality) return record.sourceQuality;
  if (record.profileStatus === "LEGACY_UNKNOWN") return "LEGACY_UNKNOWN";
  const capability = trainingCapabilityForProfile(profileFromRecord(record));
  if (capability.status === "PRODUCTION") return "PRODUCTION";
  if (capability.status === "PREVIEW") return "PREVIEW";
  return "FALLBACK";
}

function findMttPackDriftWarnings(
  records: readonly MttUtilityStatsRecord[],
): MttUtilityPackDriftWarning[] {
  const groups = new Map<string, { profileIds: Set<string>; rangePackVersions: Set<string> }>();
  for (const record of records.filter((item) => item.gameVariant === "MTT")) {
    const group = groups.get(record.scenarioId) ?? {
      profileIds: new Set<string>(),
      rangePackVersions: new Set<string>(),
    };
    group.profileIds.add(record.profileId);
    group.rangePackVersions.add(record.rangePackVersion);
    groups.set(record.scenarioId, group);
  }

  return [...groups.entries()]
    .map(([scenarioId, group]) => ({
      scenarioId,
      profileIds: [...group.profileIds].sort(),
      rangePackVersions: [...group.rangePackVersions].sort(),
    }))
    .filter((item) => item.profileIds.length > 1 || item.rangePackVersions.length > 1)
    .map((item) => ({
      ...item,
      message:
        "Same scenarioId was observed with multiple profile ids or pack versions; compare before/after KPIs explicitly.",
    }));
}

function validateRecords(records: readonly MttUtilityStatsRecord[]): string[] {
  const errors: string[] = [];
  for (const record of records) {
    if (record.profileId.trim().length === 0) {
      errors.push(`${record.qid}: profileId is required for MTT utility stats.`);
    }
    if (record.scenarioId.trim().length === 0) {
      errors.push(`${record.qid}: scenarioId is required for MTT utility stats.`);
    }
    if (record.rangePackVersion.trim().length === 0) {
      errors.push(`${record.qid}: rangePackVersion is required for before/after comparison.`);
    }
    if (record.tableSize !== undefined && (!Number.isInteger(record.tableSize) || record.tableSize < 2 || record.tableSize > 10)) {
      errors.push(`${record.qid}: tableSize must be an integer between 2 and 10.`);
    }
    if (record.evLossBb !== undefined && !isFiniteNonNegative(record.evLossBb)) {
      errors.push(`${record.qid}: evLossBb must be a non-negative finite number.`);
    }
  }
  return errors;
}

function mttUtilityDimKey(record: MttUtilityStatsRecord, dim: MttUtilityStatsDim): string {
  if (dim === "sourceQuality") return inferMttSourceQuality(record);
  const value = record[dim];
  if (value === undefined || value === null || value === "") return "UNKNOWN";
  return String(value);
}

function profileFromRecord(record: MttUtilityStatsRecord): TrainingProfile {
  return {
    gameVariant: record.gameVariant,
    tableFormat: record.tableFormat,
    blindSpeed: record.blindSpeed,
    street: record.street,
    evModel: record.evModel,
    ante: record.ante,
    rakeMode: record.rakeMode,
  };
}

function recordCriticality(record: MttUtilityStatsRecord): number {
  const explicit = isFiniteNonNegative(record.criticality) ? record.criticality : 1;
  const phaseMultiplier = record.tournamentPhase === "FINAL_TABLE"
    ? 2.2
    : record.tournamentPhase === "BUBBLE"
      ? 2
      : record.payoutModel === "SATELLITE"
        ? 1.8
        : record.bountyModel === "PKO" || record.bountyModel === "MYSTERY_BOUNTY"
          ? 1.35
          : 1;
  return roundTwo(Math.max(1, explicit) * phaseMultiplier);
}

function repetitionReason(group: {
  misses: number;
  attempts: number;
  evLossBbTotal: number;
  criticality: number;
  sourceQuality: MttUtilitySourceQuality;
}): string {
  const parts = [`${group.misses}/${group.attempts} mistakes`];
  if (group.evLossBbTotal > 0) parts.push(`${roundTwo(group.evLossBbTotal)} BB EV loss`);
  if (group.criticality > 1) parts.push(`criticality ${group.criticality}`);
  parts.push(`source ${group.sourceQuality}`);
  return parts.join(", ");
}

function strongestSourceQuality(
  a: MttUtilitySourceQuality,
  b: MttUtilitySourceQuality,
): MttUtilitySourceQuality {
  return sourceQualityRank(b) > sourceQualityRank(a) ? b : a;
}

function sourceQualityRank(value: MttUtilitySourceQuality): number {
  switch (value) {
    case "PRODUCTION":
      return 4;
    case "PREVIEW":
      return 3;
    case "FALLBACK":
      return 2;
    case "LEGACY_UNKNOWN":
      return 1;
  }
}

function sourceQualityWeight(value: MttUtilitySourceQuality): number {
  switch (value) {
    case "PRODUCTION":
      return 16;
    case "PREVIEW":
      return 8;
    case "FALLBACK":
      return -8;
    case "LEGACY_UNKNOWN":
      return -12;
  }
}

function emptySourceQualityCounts(): Record<MttUtilitySourceQuality, number> {
  return {
    PRODUCTION: 0,
    PREVIEW: 0,
    FALLBACK: 0,
    LEGACY_UNKNOWN: 0,
  };
}

function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
