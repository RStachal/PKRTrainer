import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
  type AnteMode,
  type Position,
  type StackBucket,
} from "../../core/types";
import {
  SIX_MAX_POSITION_ORDER,
  type BlindSpeed,
  type TableFormat,
  type TrainingProfile,
} from "../../core/trainingProfile";
import {
  allMttPreflopRangePacks,
  mttPreflopRangePackForProfile,
} from "./mttPreflopRangePacks";
import { buildRangePackImportReport } from "./rangePackImport";
import type { RangePack } from "./rangePack";

export type MttPreflopReadinessStatus = "PRODUCTION" | "CANDIDATE" | "MISSING";
export type MttPreflopRecommendationPolicy =
  | "DEDICATED_HAND_RECOMMENDATIONS"
  | "SPEED_METADATA_ONLY"
  | "MISSING_DEDICATED_PACK";

export interface MttPreflopTurboStrategyPolicy {
  productionRequirement: string;
  legalInputRequirement: string;
  forbiddenShortcut: string;
  currentStatus: string;
}

export interface MttPreflopReadinessProfile {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  ante: AnteMode;
}

export interface MttPreflopReadinessRow extends MttPreflopReadinessProfile {
  status: MttPreflopReadinessStatus;
  packId: string | null;
  confidence: RangePack["confidence"] | null;
  recordCount: number;
  sourceCount: number;
  searchQueryCount: number;
  recommendationPolicy: MttPreflopRecommendationPolicy;
  coverage: MttPreflopCoverage;
  missingReasons: string[];
}

export interface MttPreflopReadinessReport {
  rows: MttPreflopReadinessRow[];
  productionRows: number;
  candidateRows: number;
  missingRows: number;
}

export interface MttPreflopPackImportReadinessRow {
  packId: string;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  ante: AnteMode;
  status: MttPreflopReadinessStatus;
  productionReady: boolean;
  confidence: RangePack["confidence"];
  recordCount: number;
  sourceCount: number;
  searchQueryCount: number;
  totalExplicitHands: number;
  totalImpliedFolds: number;
  warnings: string[];
}

export interface MttPreflopPackImportReadinessReport {
  rows: MttPreflopPackImportReadinessRow[];
  productionReadyRows: number;
  candidateRows: number;
  lowConfidenceRows: number;
  emptyRecordRows: number;
  missingExpectedProfiles: MttPreflopReadinessRow[];
}

export interface MttPreflopCoverage {
  positions: Position[];
  stackBuckets: StackBucket[];
  contexts: ActionContext[];
  missingPositions: Position[];
  missingStackBuckets: StackBucket[];
  missingContexts: ActionContext[];
}

export const MTT_PREFLOP_TURBO_STRATEGY_POLICY: MttPreflopTurboStrategyPolicy = {
  productionRequirement:
    "Turbo production requires dedicated turbo hand recommendations or an explicit reviewed reuse policy.",
  legalInputRequirement:
    "Allowed inputs are owned solver exports, public charts with permission, or explicit written permission.",
  forbiddenShortcut:
    "Changing blind speed metadata alone must not enable production scoring.",
  currentStatus:
    "Current full-ring turbo MTT preflop is missing production hand recommendations.",
};

const TABLE_FORMATS: readonly TableFormat[] = ["FULL_RING_9", "SIX_MAX"];
const BLIND_SPEEDS: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const ANTE_MODES: readonly AnteMode[] = ["ON", "OFF"];
const REQUIRED_CONTEXTS: readonly ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

export function buildMttPreflopReadinessReport(): MttPreflopReadinessReport {
  const rows = expectedProfiles().map(readinessRowForProfile);
  return {
    rows,
    productionRows: rows.filter((row) => row.status === "PRODUCTION").length,
    candidateRows: rows.filter((row) => row.status === "CANDIDATE").length,
    missingRows: rows.filter((row) => row.status === "MISSING").length,
  };
}

export function buildMttPreflopPackImportReadinessReport():
  MttPreflopPackImportReadinessReport {
  const rows = allMttPreflopRangePacks.map((pack) => {
    const importReport = buildRangePackImportReport(pack);
    const readiness = readinessRowForProfile({
      tableFormat: pack.dimensions.tableFormat,
      blindSpeed: pack.dimensions.blindSpeed,
      ante: pack.dimensions.ante,
    });
    const warnings = [...importReport.warnings, ...readiness.missingReasons];
    return {
      packId: pack.id,
      tableFormat: pack.dimensions.tableFormat,
      blindSpeed: pack.dimensions.blindSpeed,
      ante: pack.dimensions.ante,
      status: readiness.status,
      productionReady:
        readiness.status === "PRODUCTION" && importReport.valid && warnings.length === 0,
      confidence: pack.confidence,
      recordCount: pack.records.length,
      sourceCount: pack.sourceEvidence.length,
      searchQueryCount: pack.searchQueries.length,
      totalExplicitHands: importReport.totalExplicitHands,
      totalImpliedFolds: importReport.totalImpliedFolds,
      warnings,
    };
  });
  return {
    rows,
    productionReadyRows: rows.filter((row) => row.productionReady).length,
    candidateRows: rows.filter((row) => row.status === "CANDIDATE").length,
    lowConfidenceRows: rows.filter((row) => row.confidence === "LOW").length,
    emptyRecordRows: rows.filter((row) => row.recordCount === 0).length,
    missingExpectedProfiles: buildMttPreflopReadinessReport().rows.filter((row) => (
      row.status === "MISSING"
    )),
  };
}

export function mttPreflopProductionReady(profile: MttPreflopReadinessProfile): boolean {
  return readinessRowForProfile(profile).status === "PRODUCTION";
}

export function mttPreflopProductionReadyForTrainingProfile(
  profile: TrainingProfile,
  ante: AnteMode = profile.ante,
): boolean {
  return mttPreflopReadinessRowForTrainingProfile(profile, ante)?.status === "PRODUCTION";
}

export function mttPreflopReadinessRowForProfile(
  profile: MttPreflopReadinessProfile,
): MttPreflopReadinessRow {
  return readinessRowForProfile(profile);
}

export function mttPreflopReadinessRowForTrainingProfile(
  profile: TrainingProfile,
  ante: AnteMode = profile.ante,
): MttPreflopReadinessRow | null {
  if (!isMttPreflopChipEvProfile(profile)) return null;
  return readinessRowForProfile({
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    ante,
  });
}

function readinessRowForProfile(
  profile: MttPreflopReadinessProfile,
): MttPreflopReadinessRow {
  const pack = mttPreflopRangePackForProfile({
    gameVariant: "MTT",
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: "PREFLOP",
    evModel: "CHIP_EV",
    ante: profile.ante,
    rakeMode: "NONE",
  });

  if (!pack) {
    const missingReasons = [
      "No dedicated hand-recommendation RangePack is registered for this MTT preflop profile.",
    ];
    if (profile.blindSpeed === "TURBO") {
      missingReasons.push(MTT_PREFLOP_TURBO_STRATEGY_POLICY.productionRequirement);
      missingReasons.push(MTT_PREFLOP_TURBO_STRATEGY_POLICY.forbiddenShortcut);
    }

    return {
      ...profile,
      status: "MISSING",
      packId: null,
      confidence: null,
      recordCount: 0,
      sourceCount: 0,
      searchQueryCount: 0,
      recommendationPolicy: "MISSING_DEDICATED_PACK",
      coverage: emptyCoverage(profile.tableFormat),
      missingReasons,
    };
  }

  const coverage = coverageForPack(pack);
  const recommendationPolicy = recommendationPolicyForPack(pack);
  const missingReasons = productionMissingReasons(pack, coverage, recommendationPolicy);
  return {
    ...profile,
    status: missingReasons.length === 0 ? "PRODUCTION" : "CANDIDATE",
    packId: pack.id,
    confidence: pack.confidence,
    recordCount: pack.records.length,
    sourceCount: pack.sourceEvidence.length,
    searchQueryCount: pack.searchQueries.length,
    recommendationPolicy,
    coverage,
    missingReasons,
  };
}

function productionMissingReasons(
  pack: RangePack,
  coverage: MttPreflopCoverage,
  recommendationPolicy: MttPreflopRecommendationPolicy,
): string[] {
  const reasons: string[] = [];

  if (!allMttPreflopRangePacks.includes(pack as (typeof allMttPreflopRangePacks)[number])) {
    reasons.push("RangePack is not part of the MTT preflop registry.");
  }
  if (pack.confidence === "LOW") {
    reasons.push("RangePack confidence is LOW.");
  }
  if (pack.records.length === 0) {
    reasons.push("RangePack has no normalized hand-class records.");
  }
  if (pack.sourceEvidence.length < 2) {
    reasons.push("RangePack needs at least two source evidence entries.");
  }
  if (pack.searchQueries.length < 3) {
    reasons.push("RangePack needs at least three recorded source searches.");
  }
  if (recommendationPolicy === "SPEED_METADATA_ONLY") {
    reasons.push(
      "Blind speed is metadata-only; dedicated hand recommendations are not normalized yet.",
    );
  }
  if (coverage.missingPositions.length > 0) {
    reasons.push(`RangePack is missing positions: ${coverage.missingPositions.join(", ")}.`);
  }
  if (coverage.missingStackBuckets.length > 0) {
    reasons.push(`RangePack is missing stack buckets: ${coverage.missingStackBuckets.join(", ")}.`);
  }
  if (coverage.missingContexts.length > 0) {
    reasons.push(`RangePack is missing action contexts: ${coverage.missingContexts.join(", ")}.`);
  }

  return reasons;
}

function recommendationPolicyForPack(pack: RangePack): MttPreflopRecommendationPolicy {
  if (pack.records.length > 0) return "DEDICATED_HAND_RECOMMENDATIONS";
  if (pack.dimensions.blindSpeed === "TURBO") return "SPEED_METADATA_ONLY";
  return "DEDICATED_HAND_RECOMMENDATIONS";
}

function coverageForPack(pack: RangePack): MttPreflopCoverage {
  const requiredPositions = requiredPositionsForFormat(pack.dimensions.tableFormat);
  const positions = uniqueInRequiredOrder(
    pack.records.map((record) => record.position),
    requiredPositions,
  );
  const stackBuckets = uniqueInRequiredOrder(
    pack.records.map((record) => record.bucket),
    STACK_BUCKETS,
  );
  const contexts = uniqueInRequiredOrder(
    pack.records.map((record) => record.context),
    REQUIRED_CONTEXTS,
  );

  return {
    positions,
    stackBuckets,
    contexts,
    missingPositions: requiredPositions.filter((position) => !positions.includes(position)),
    missingStackBuckets: STACK_BUCKETS.filter((bucket) => !stackBuckets.includes(bucket)),
    missingContexts: REQUIRED_CONTEXTS.filter((context) => !contexts.includes(context)),
  };
}

function emptyCoverage(tableFormat: TableFormat): MttPreflopCoverage {
  return {
    positions: [],
    stackBuckets: [],
    contexts: [],
    missingPositions: [...requiredPositionsForFormat(tableFormat)],
    missingStackBuckets: [...STACK_BUCKETS],
    missingContexts: [...REQUIRED_CONTEXTS],
  };
}

function requiredPositionsForFormat(tableFormat: TableFormat): readonly Position[] {
  return tableFormat === "SIX_MAX" ? SIX_MAX_POSITION_ORDER : POSITION_ORDER;
}

function uniqueInRequiredOrder<T extends string | number>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}

function isMttPreflopChipEvProfile(profile: TrainingProfile): boolean {
  return (
    profile.gameVariant === "MTT" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.rakeMode === "NONE"
  );
}

function expectedProfiles(): MttPreflopReadinessProfile[] {
  const profiles: MttPreflopReadinessProfile[] = [];
  for (const tableFormat of TABLE_FORMATS) {
    for (const blindSpeed of BLIND_SPEEDS) {
      for (const ante of ANTE_MODES) {
        profiles.push({ tableFormat, blindSpeed, ante });
      }
    }
  }
  return profiles;
}
