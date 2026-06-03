import { ALL_HAND_CLASSES } from "../../core/poker";
import {
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
  type StackBucket,
} from "../../core/types";
import type { RangePack, RangePackDimensions, RangePackRecord, RangeSourceEvidence } from "./rangePack";
import { validateRangePack } from "./rangePack";

export type MttSixMaxImportLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export interface MttSixMaxImportRecord {
  position: Position;
  sourceStackBB: number;
  bucket: StackBucket;
  context: ActionContext;
  lenient: Partial<Record<HandLabel, readonly ActionKey[]>>;
  strict: Partial<Record<HandLabel, readonly ActionKey[]>>;
}

export interface MttSixMaxRangePackImportInput {
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  dimensions: RangePackDimensions;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  licenseKind: MttSixMaxImportLicenseKind;
  licenseNote: string;
  assumptions: readonly string[];
  searchQueries: readonly string[];
  sourceEvidence: readonly RangeSourceEvidence[];
  records: readonly MttSixMaxImportRecord[];
}

export interface MttSixMaxImportRecordReport {
  position: Position;
  sourceStackBB: number;
  bucket: StackBucket;
  context: ActionContext;
  explicitHands: number;
  missingHands: readonly HandLabel[];
}

export interface MttSixMaxImportReadinessReport {
  packId: string;
  valid: boolean;
  productionReady: boolean;
  errors: readonly string[];
  warnings: readonly string[];
  dimensions: RangePackDimensions;
  legalLicense: boolean;
  sourceCount: number;
  searchQueryCount: number;
  recordCount: number;
  positions: readonly Position[];
  stackBucketMapping: readonly { sourceStackBB: number; bucket: StackBucket }[];
  records: readonly MttSixMaxImportRecordReport[];
}

const SIX_MAX_POSITIONS: readonly Position[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

const LEGAL_LICENSE_KINDS: readonly MttSixMaxImportLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];

const ACTION_KEYS: readonly ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

export function normalizeMttSixMaxRangePackImport(
  input: MttSixMaxRangePackImportInput,
): RangePack {
  return {
    id: input.id,
    version: input.version,
    createdAt: input.createdAt,
    verifiedAt: input.verifiedAt,
    confidence: input.confidence,
    dimensions: { ...input.dimensions },
    assumptions: [...input.assumptions, `License: ${input.licenseKind}. ${input.licenseNote}`],
    searchQueries: [...input.searchQueries],
    sourceEvidence: input.sourceEvidence.map((source) => ({ ...source })),
    records: input.records.map(normalizeRecord),
  };
}

export function buildMttSixMaxImportReadinessReport(
  input: MttSixMaxRangePackImportInput,
): MttSixMaxImportReadinessReport {
  const pack = normalizeMttSixMaxRangePackImport(input);
  const errors = [
    ...validateRangePack(pack),
    ...validateMttSixMaxInput(input),
  ];
  const records = input.records.map(reportRecord);
  const warnings = warningMessages(input, records);
  const positions = unique(input.records.map((record) => record.position));
  const stackBucketMapping = uniqueStackMappings(input.records);
  const legalLicense = LEGAL_LICENSE_KINDS.includes(input.licenseKind);

  return {
    packId: input.id,
    valid: errors.length === 0,
    productionReady: errors.length === 0 && warnings.length === 0,
    errors,
    warnings,
    dimensions: { ...input.dimensions },
    legalLicense,
    sourceCount: input.sourceEvidence.length,
    searchQueryCount: input.searchQueries.length,
    recordCount: input.records.length,
    positions,
    stackBucketMapping,
    records,
  };
}

export function renderMttSixMaxImportReadinessReport(
  report: MttSixMaxImportReadinessReport,
): string {
  const lines = [
    `MTT 6-max RangePack import: ${report.packId}`,
    `valid: ${report.valid}`,
    `productionReady: ${report.productionReady}`,
    `model: ${report.dimensions.evModel}`,
    `format: ${report.dimensions.gameVariant}/${report.dimensions.tableFormat}`,
    `speed: ${report.dimensions.blindSpeed}`,
    `ante: ${report.dimensions.ante}`,
    `legal license: ${report.legalLicense}`,
    `sources: ${report.sourceCount}`,
    `searches: ${report.searchQueryCount}`,
    `records: ${report.recordCount}`,
    `positions: ${report.positions.join(",") || "none"}`,
    `stack mapping: ${report.stackBucketMapping
      .map((item) => `${item.sourceStackBB}->${item.bucket}`)
      .join(",") || "none"}`,
  ];

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  if (report.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  return lines.join("\n");
}

function normalizeRecord(record: MttSixMaxImportRecord): RangePackRecord {
  return {
    position: record.position,
    bucket: record.bucket,
    context: record.context,
    lenient: normalizeActionMap(record.lenient),
    strict: normalizeActionMap(record.strict),
  };
}

function normalizeActionMap(
  map: Partial<Record<HandLabel, readonly ActionKey[]>>,
): Record<HandLabel, ActionKey[]> {
  const out = {} as Record<HandLabel, ActionKey[]>;
  for (const hand of ALL_HAND_CLASSES) {
    const actions = map[hand];
    if (actions !== undefined) out[hand] = [...actions];
  }
  return out;
}

function validateMttSixMaxInput(input: MttSixMaxRangePackImportInput): string[] {
  const errors: string[] = [];

  if (input.dimensions.gameVariant !== "MTT") {
    errors.push("MTT 6-max import must use gameVariant MTT.");
  }
  if (input.dimensions.tableFormat !== "SIX_MAX") {
    errors.push("MTT 6-max import must use tableFormat SIX_MAX.");
  }
  if (input.dimensions.street !== "PREFLOP") {
    errors.push("MTT 6-max import must use street PREFLOP.");
  }
  if (input.dimensions.evModel !== "CHIP_EV") {
    errors.push("MTT 6-max import must use evModel CHIP_EV.");
  }
  if (input.dimensions.rakeMode !== "NONE") {
    errors.push("MTT 6-max tournament import must use rakeMode NONE.");
  }
  if (!LEGAL_LICENSE_KINDS.includes(input.licenseKind)) {
    errors.push("MTT 6-max import needs owned export, public permission, or explicit written permission.");
  }
  if (input.licenseNote.trim().length === 0) {
    errors.push("MTT 6-max import licenseNote is required.");
  }
  if (input.assumptions.some((item) => item.trim().length === 0)) {
    errors.push("MTT 6-max import assumptions must not contain empty entries.");
  }
  if (input.records.length === 0) {
    errors.push("MTT 6-max import must contain at least one normalized record.");
  }

  for (const [index, record] of input.records.entries()) {
    const tag = `records[${index}]`;
    if (!SIX_MAX_POSITIONS.includes(record.position)) {
      errors.push(`${tag}.position must be one of UTG,HJ,CO,BTN,SB,BB.`);
    }
    if (!Number.isFinite(record.sourceStackBB) || record.sourceStackBB <= 0) {
      errors.push(`${tag}.sourceStackBB must be a positive number.`);
    }
    if (!STACK_BUCKETS.includes(record.bucket)) {
      errors.push(`${tag}.bucket must be a supported PKRTrainer stack bucket.`);
    }

    const missingHands = missingHandClasses(record);
    if (missingHands.length > 0) {
      errors.push(`${tag} is missing ${missingHands.length} hand classes.`);
    }

    for (const [mapName, map] of [
      ["lenient", record.lenient],
      ["strict", record.strict],
    ] as const) {
      for (const hand of ALL_HAND_CLASSES) {
        const actions = map[hand];
        if (actions === undefined) continue;
        if (actions.length === 0) {
          errors.push(`${tag}.${mapName}.${hand} must contain at least one action.`);
        }
        for (const action of actions) {
          if (!ACTION_KEYS.includes(action)) {
            errors.push(`${tag}.${mapName}.${hand} contains unsupported action ${action}.`);
          }
        }
      }
    }
  }

  return errors;
}

function warningMessages(
  input: MttSixMaxRangePackImportInput,
  records: readonly MttSixMaxImportRecordReport[],
): string[] {
  const warnings: string[] = [];
  const assumptions = input.assumptions.join(" ").toLowerCase();
  const coveredPositions = new Set(input.records.map((record) => record.position));

  if (input.confidence === "LOW") {
    warnings.push("MTT 6-max import remains candidate/preview while confidence is LOW.");
  }
  if (!assumptions.includes(input.dimensions.blindSpeed.toLowerCase())) {
    warnings.push("MTT 6-max import should state regular/turbo assumptions explicitly.");
  }
  if (input.sourceEvidence.length < 2) {
    warnings.push("MTT 6-max import should cite at least 2 source evidence entries.");
  }
  if (input.searchQueries.length < 3) {
    warnings.push("MTT 6-max import should record at least 3 independent chart searches.");
  }
  for (const position of SIX_MAX_POSITIONS) {
    if (!coveredPositions.has(position)) {
      warnings.push(`MTT 6-max import has no record for position ${position}.`);
    }
  }
  for (const record of records) {
    if (record.missingHands.length > 0) {
      warnings.push(`${record.position}/${record.bucket}/${record.context} is missing hand-class values.`);
    }
  }

  return warnings;
}

function reportRecord(record: MttSixMaxImportRecord): MttSixMaxImportRecordReport {
  const missingHands = missingHandClasses(record);
  return {
    position: record.position,
    sourceStackBB: record.sourceStackBB,
    bucket: record.bucket,
    context: record.context,
    explicitHands: ALL_HAND_CLASSES.length - missingHands.length,
    missingHands,
  };
}

function missingHandClasses(record: MttSixMaxImportRecord): HandLabel[] {
  return ALL_HAND_CLASSES.filter((hand) => (
    record.lenient[hand] === undefined || record.strict[hand] === undefined
  ));
}

function unique(values: readonly Position[]): Position[] {
  const seen = new Set<Position>();
  const out: Position[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function uniqueStackMappings(
  records: readonly MttSixMaxImportRecord[],
): { sourceStackBB: number; bucket: StackBucket }[] {
  const seen = new Set<string>();
  const out: { sourceStackBB: number; bucket: StackBucket }[] = [];
  for (const record of records) {
    const key = `${record.sourceStackBB}|${record.bucket}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ sourceStackBB: record.sourceStackBB, bucket: record.bucket });
    }
  }
  return out;
}
