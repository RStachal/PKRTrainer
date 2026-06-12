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
  type EvModel,
  type TableFormat,
  type TrainingStreet,
  type TrainingProfile,
} from "../../core/trainingProfile";
import {
  allMttPreflopRangePacks,
  mttPreflopRangePackForProfile,
} from "./mttPreflopRangePacks";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "./flopProductionStrategyPack";
import { flopProductionStrategyPacks } from "./flopProductionStrategyResolver";
import { buildRangePackImportReport } from "./rangePackImport";
import type { RangePack } from "./rangePack";
import {
  buildRiverProductionCoverageReport,
  type RiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "./riverProductionStrategyPack";
import { riverProductionStrategyPacks } from "./riverProductionStrategyResolver";
import {
  buildTurnProductionCoverageReport,
  type TurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "./turnProductionStrategyPack";
import {
  mttProductionImportPackId,
  mttProductionImportSlotId,
  mttProductionImportSlotKind,
  mttProductionImportSlotPaths,
} from "./mttImportSlotNaming";
import { turnProductionStrategyPacks } from "./turnProductionStrategyResolver";

export type MttPreflopReadinessStatus = "PRODUCTION" | "CANDIDATE" | "MISSING";
export type MttCompletionReadinessStatus = MttPreflopReadinessStatus;
export type MttCompletionCoverageKind =
  | "PREFLOP_RANGE_PACK"
  | "POSTFLOP_PUBLIC_HEURISTIC"
  | "POSTFLOP_PRODUCTION_PACK"
  | "MISSING";
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

export interface MttCompletionReadinessProfile {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  street: TrainingStreet;
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

export interface MttCompletionReadinessRow extends MttCompletionReadinessProfile {
  status: MttCompletionReadinessStatus;
  productionReady: boolean;
  coverageKind: MttCompletionCoverageKind;
  packId: string | null;
  importSlot: MttCompletionImportSlotHint | null;
  missingReasons: string[];
}

export interface MttCompletionReadinessReport {
  rows: MttCompletionReadinessRow[];
  productionRows: number;
  candidateRows: number;
  missingRows: number;
}

export interface MttCompletionReadinessFilters {
  tableFormat?: TableFormat;
  blindSpeed?: BlindSpeed;
  evModel?: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  street?: TrainingStreet;
  ante?: AnteMode;
  status?: MttCompletionReadinessStatus | "NON_PRODUCTION";
}

export interface MttCompletionImportSlotHint {
  slotId: string;
  packId: string;
  kind: "mtt-preflop" | "flop-production" | "turn-production" | "river-production";
  rawInputFolder: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
}

export interface MttCompletionReadinessOptions {
  flopProductionPacks?: readonly FlopProductionStrategyPack[];
  turnProductionPacks?: readonly TurnProductionStrategyPack[];
  riverProductionPacks?: readonly RiverProductionStrategyPack[];
}

export interface MttCompletionReleaseGateReport {
  valid: boolean;
  totalRows: number;
  productionReadyRows: number;
  previewRows: number;
  blockedRows: number;
  errors: readonly string[];
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
const MTT_EV_MODELS = ["CHIP_EV", "DOLAR_EV"] as const satisfies readonly Extract<
  EvModel,
  "CHIP_EV" | "DOLAR_EV"
>[];
const MTT_STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"] as const satisfies readonly TrainingStreet[];
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

export function buildMttCompletionReadinessReport(
  options: MttCompletionReadinessOptions = {},
): MttCompletionReadinessReport {
  const rows = expectedCompletionProfiles().map((profile) => (
    completionReadinessRowForProfile(profile, options)
  ));
  return {
    rows,
    productionRows: rows.filter((row) => row.status === "PRODUCTION").length,
    candidateRows: rows.filter((row) => row.status === "CANDIDATE").length,
    missingRows: rows.filter((row) => row.status === "MISSING").length,
  };
}

export function buildMttCompletionReleaseGateReport(
  report: MttCompletionReadinessReport = buildMttCompletionReadinessReport(),
): MttCompletionReleaseGateReport {
  const errors: string[] = [];
  for (const row of report.rows) {
    const label = completionRowLabel(row);
    if (row.status === "PRODUCTION" && !row.productionReady) {
      errors.push(`${label}: production row is not productionReady.`);
    }
    if (row.status !== "PRODUCTION" && row.missingReasons.length === 0) {
      errors.push(`${label}: non-production row is missing an explicit blocker reason.`);
    }
    if (row.status === "PRODUCTION" && row.coverageKind === "MISSING") {
      errors.push(`${label}: production row cannot use missing coverage.`);
    }
  }

  return {
    valid: errors.length === 0,
    totalRows: report.rows.length,
    productionReadyRows: report.rows.filter((row) => row.productionReady).length,
    previewRows: report.rows.filter((row) => row.status === "CANDIDATE").length,
    blockedRows: report.rows.filter((row) => row.status === "MISSING").length,
    errors,
  };
}

export function renderMttCompletionReleaseGateReport(
  report: MttCompletionReleaseGateReport = buildMttCompletionReleaseGateReport(),
): string {
  const lines = [
    "MTT completion release gate",
    `valid: ${report.valid}`,
    `total rows: ${report.totalRows}`,
    `productionReady rows: ${report.productionReadyRows}`,
    `preview rows: ${report.previewRows}`,
    `blocked rows: ${report.blockedRows}`,
  ];

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}

export function filterMttCompletionReadinessReport(
  report: MttCompletionReadinessReport,
  filters: MttCompletionReadinessFilters,
): MttCompletionReadinessReport {
  const rows = report.rows.filter((row) => (
    matchesOptionalFilter(row.tableFormat, filters.tableFormat) &&
    matchesOptionalFilter(row.blindSpeed, filters.blindSpeed) &&
    matchesOptionalFilter(row.evModel, filters.evModel) &&
    matchesOptionalFilter(row.street, filters.street) &&
    matchesOptionalFilter(row.ante, filters.ante) &&
    matchesStatusFilter(row.status, filters.status)
  ));

  return completionReadinessReportFromRows(rows);
}

export function renderMttCompletionReadinessReport(
  report: MttCompletionReadinessReport = buildMttCompletionReadinessReport(),
): string {
  const lines = [
    "MTT completion readiness",
    `total rows: ${report.rows.length}`,
    `production rows: ${report.productionRows}`,
    `candidate rows: ${report.candidateRows}`,
    `missing rows: ${report.missingRows}`,
  ];
  const nonProductionRows = report.rows.filter((row) => row.status !== "PRODUCTION");
  lines.push(`non-production rows: ${nonProductionRows.length}`);

  for (const row of nonProductionRows) {
    lines.push(
      `- ${completionRowLabel(row)} status=${row.status} coverage=${row.coverageKind}`,
    );
    if (row.packId !== null) lines.push(`  current pack: ${row.packId}`);
    if (row.importSlot !== null) {
      lines.push(`  import kind: ${row.importSlot.kind}`);
      lines.push(`  import pack: ${row.importSlot.packId}`);
      lines.push(`  input: ${row.importSlot.normalizedInputPath}`);
      lines.push(`  permission: ${row.importSlot.permissionManifestPath}`);
    }
    for (const reason of row.missingReasons) lines.push(`  blocker: ${reason}`);
  }

  return lines.join("\n");
}

function completionReadinessReportFromRows(
  rows: MttCompletionReadinessRow[],
): MttCompletionReadinessReport {
  return {
    rows,
    productionRows: rows.filter((row) => row.status === "PRODUCTION").length,
    candidateRows: rows.filter((row) => row.status === "CANDIDATE").length,
    missingRows: rows.filter((row) => row.status === "MISSING").length,
  };
}

function matchesOptionalFilter<T extends string>(
  value: T,
  filter: T | undefined,
): boolean {
  return filter === undefined || value === filter;
}

function matchesStatusFilter(
  status: MttCompletionReadinessStatus,
  filter: MttCompletionReadinessFilters["status"],
): boolean {
  if (filter === undefined) return true;
  if (filter === "NON_PRODUCTION") return status !== "PRODUCTION";
  return status === filter;
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

export function mttCompletionReadinessRowForTrainingProfile(
  profile: TrainingProfile,
  ante: AnteMode = profile.ante,
): MttCompletionReadinessRow | null {
  if (
    profile.gameVariant !== "MTT" ||
    profile.rakeMode !== "NONE" ||
    (profile.evModel !== "CHIP_EV" && profile.evModel !== "DOLAR_EV")
  ) {
    return null;
  }

  return completionReadinessRowForProfile({
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    evModel: profile.evModel,
    street: profile.street,
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

function completionReadinessRowForProfile(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions = {},
): MttCompletionReadinessRow {
  if (profile.street === "PREFLOP") {
    return preflopCompletionReadinessRow(profile);
  }

  return postflopCompletionReadinessRow(profile, options);
}

function preflopCompletionReadinessRow(
  profile: MttCompletionReadinessProfile,
): MttCompletionReadinessRow {
  if (profile.evModel === "CHIP_EV") {
    const row = readinessRowForProfile(profile);
    return {
      ...profile,
      status: row.status,
      productionReady: row.status === "PRODUCTION",
      coverageKind: row.packId === null ? "MISSING" : "PREFLOP_RANGE_PACK",
      packId: row.packId,
      importSlot: row.status === "PRODUCTION" ? null : completionImportSlotHint(profile),
      missingReasons: row.missingReasons,
    };
  }

  const pack = mttPreflopRangePackForProfile({
    gameVariant: "MTT",
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: "PREFLOP",
    evModel: profile.evModel,
    ante: profile.ante,
    rakeMode: "NONE",
  });

  return {
    ...profile,
    status: "MISSING",
    productionReady: false,
    coverageKind: pack ? "PREFLOP_RANGE_PACK" : "MISSING",
    packId: pack?.id ?? null,
    importSlot: completionImportSlotHint(profile),
    missingReasons: [
      "No dedicated DOLAR_EV MTT preflop RangePack is registered for this profile.",
      "Do not reuse chipEV ranges for $EV production scoring without an explicit reviewed reuse policy.",
    ],
  };
}

function postflopCompletionReadinessRow(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions,
): MttCompletionReadinessRow {
  const packReadiness = postflopProductionPackReadiness(profile, options);
  if (!packReadiness) {
    return {
      ...profile,
      status: "CANDIDATE",
      productionReady: false,
      coverageKind: "POSTFLOP_PUBLIC_HEURISTIC",
      packId: null,
      importSlot: completionImportSlotHint(profile),
      missingReasons: [
        `No production ${profile.street} StrategyPack is registered for ${profile.tableFormat}/${profile.evModel}.`,
        "Postflop training currently uses public heuristic or generator fallback for this MTT profile.",
        "Dedicated production StrategyPack coverage is required before production scoring.",
      ],
    };
  }

  return {
    ...profile,
    status: packReadiness.productionReady ? "PRODUCTION" : "CANDIDATE",
    productionReady: packReadiness.productionReady,
    coverageKind: "POSTFLOP_PRODUCTION_PACK",
    packId: packReadiness.packId,
    importSlot: packReadiness.productionReady ? null : completionImportSlotHint(profile),
    missingReasons: packReadiness.productionReady ? [] : packReadiness.missingReasons,
  };
}

function postflopProductionPackReadiness(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions,
): {
  packId: string;
  productionReady: boolean;
  missingReasons: string[];
} | null {
  switch (profile.street) {
    case "FLOP":
      return bestPostflopPackReadiness(
        matchingFlopProductionPacks(profile, options),
        (pack) => ({
          packId: pack.id,
          report: buildFlopProductionCoverageReport(pack),
          missingReasons: flopCoverageMissingReasons(buildFlopProductionCoverageReport(pack)),
        }),
      );
    case "TURN":
      return bestPostflopPackReadiness(
        matchingTurnProductionPacks(profile, options),
        (pack) => ({
          packId: pack.id,
          report: buildTurnProductionCoverageReport(pack),
          missingReasons: turnCoverageMissingReasons(buildTurnProductionCoverageReport(pack)),
        }),
      );
    case "RIVER":
      return bestPostflopPackReadiness(
        matchingRiverProductionPacks(profile, options),
        (pack) => ({
          packId: pack.id,
          report: buildRiverProductionCoverageReport(pack),
          missingReasons: riverCoverageMissingReasons(buildRiverProductionCoverageReport(pack)),
        }),
      );
    case "PREFLOP":
      return null;
  }
}

function bestPostflopPackReadiness<TPack>(
  packs: readonly TPack[],
  build: (pack: TPack) => {
    packId: string;
    report: { productionReady: boolean };
    missingReasons: string[];
  },
): {
  packId: string;
  productionReady: boolean;
  missingReasons: string[];
} | null {
  let firstCandidate: {
    packId: string;
    productionReady: boolean;
    missingReasons: string[];
  } | null = null;

  for (const pack of packs) {
    const row = build(pack);
    const readiness = {
      packId: row.packId,
      productionReady: row.report.productionReady,
      missingReasons: row.missingReasons,
    };
    if (readiness.productionReady) return readiness;
    firstCandidate ??= readiness;
  }

  return firstCandidate;
}

function matchingFlopProductionPacks(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions,
): readonly FlopProductionStrategyPack[] {
  const packs = options.flopProductionPacks ?? flopProductionStrategyPacks;
  return packs.filter((pack) => (
    pack.dimensions.gameVariant === "MTT" &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.street === "FLOP" &&
    pack.dimensions.evModel === profile.evModel &&
    pack.dimensions.blindSpeeds.includes(profile.blindSpeed) &&
    pack.dimensions.antes.includes(profile.ante)
  ));
}

function matchingTurnProductionPacks(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions,
): readonly TurnProductionStrategyPack[] {
  const packs = options.turnProductionPacks ?? turnProductionStrategyPacks;
  return packs.filter((pack) => (
    pack.dimensions.gameVariant === "MTT" &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.street === "TURN" &&
    pack.dimensions.evModel === profile.evModel &&
    pack.dimensions.blindSpeeds.includes(profile.blindSpeed) &&
    pack.dimensions.antes.includes(profile.ante)
  ));
}

function matchingRiverProductionPacks(
  profile: MttCompletionReadinessProfile,
  options: MttCompletionReadinessOptions,
): readonly RiverProductionStrategyPack[] {
  const packs = options.riverProductionPacks ?? riverProductionStrategyPacks;
  return packs.filter((pack) => (
    pack.dimensions.gameVariant === "MTT" &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.street === "RIVER" &&
    pack.dimensions.evModel === profile.evModel &&
    pack.dimensions.blindSpeeds.includes(profile.blindSpeed) &&
    pack.dimensions.antes.includes(profile.ante)
  ));
}

function flopCoverageMissingReasons(report: FlopProductionCoverageReport): string[] {
  return [
    ...report.errors,
    ...missingListReason("Flop production pack is missing pot types", report.missingPotTypes),
    ...missingListReason(
      "Flop production pack is missing position patterns",
      report.missingPositionPatterns,
    ),
    ...missingListReason("Flop production pack is missing board textures", report.missingBoardTextures),
    ...missingListReason("Flop production pack is missing SPR bands", report.missingSprBands),
    ...missingListReason("Flop production pack is missing action nodes", report.missingActionNodes),
    ...missingListReason("Flop production pack is missing range lanes", report.missingRangeLanes),
  ];
}

function turnCoverageMissingReasons(report: TurnProductionCoverageReport): string[] {
  return [
    ...report.errors,
    ...missingListReason("Turn production pack is missing pot types", report.missingPotTypes),
    ...missingListReason(
      "Turn production pack is missing position patterns",
      report.missingPositionPatterns,
    ),
    ...missingListReason(
      "Turn production pack is missing prior flop actions",
      report.missingPriorFlopActions,
    ),
    ...missingListReason(
      "Turn production pack is missing turn card classes",
      report.missingTurnCardClasses,
    ),
    ...missingListReason("Turn production pack is missing action nodes", report.missingActionNodes),
    ...missingListReason("Turn production pack is missing range lanes", report.missingRangeLanes),
  ];
}

function riverCoverageMissingReasons(report: RiverProductionCoverageReport): string[] {
  return [
    ...report.errors,
    ...missingListReason("River production pack is missing pot types", report.missingPotTypes),
    ...missingListReason(
      "River production pack is missing position patterns",
      report.missingPositionPatterns,
    ),
    ...missingListReason(
      "River production pack is missing prior turn actions",
      report.missingPriorTurnActions,
    ),
    ...missingListReason(
      "River production pack is missing runout classes",
      report.missingRiverRunoutClasses,
    ),
    ...missingListReason(
      "River production pack is missing blocker relevance bands",
      report.missingBlockerRelevance,
    ),
    ...missingListReason("River production pack is missing action nodes", report.missingActionNodes),
    ...missingListReason("River production pack is missing range lanes", report.missingRangeLanes),
  ];
}

function missingListReason(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}: ${values.join(", ")}.`];
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

function expectedCompletionProfiles(): MttCompletionReadinessProfile[] {
  const profiles: MttCompletionReadinessProfile[] = [];
  for (const tableFormat of TABLE_FORMATS) {
    for (const blindSpeed of BLIND_SPEEDS) {
      for (const evModel of MTT_EV_MODELS) {
        for (const street of MTT_STREETS) {
          for (const ante of ANTE_MODES) {
            profiles.push({ tableFormat, blindSpeed, evModel, street, ante });
          }
        }
      }
    }
  }
  return profiles;
}

function completionRowLabel(row: MttCompletionReadinessRow): string {
  return [
    row.tableFormat,
    row.blindSpeed,
    row.evModel,
    row.street,
    row.ante,
  ].join("|");
}

function completionImportSlotHint(
  profile: MttCompletionReadinessProfile,
): MttCompletionImportSlotHint {
  const packId = mttProductionImportPackId(profile);
  const paths = mttProductionImportSlotPaths(packId);
  return {
    slotId: mttProductionImportSlotId(profile),
    packId,
    kind: mttProductionImportSlotKind(profile.street),
    rawInputFolder: paths.rawInputFolder,
    normalizedInputPath: paths.normalizedInputPath,
    permissionManifestPath: paths.permissionManifestPath,
  };
}
