import { ALL_HAND_CLASSES } from "../../core/poker";
import type { ActionKey, HandLabel } from "../../core/types";
import type { RangePack, RangePackRecord } from "./rangePack";
import { validateRangePack } from "./rangePack";

export interface NormalizedRangeCell {
  hand: HandLabel;
  lenient: readonly ActionKey[];
  strict: readonly ActionKey[];
  impliedFold: boolean;
}

export interface NormalizedRangeRecord {
  source: RangePackRecord;
  cells: readonly NormalizedRangeCell[];
}

export interface RangePackRecordSummary {
  position: RangePackRecord["position"];
  bucket: RangePackRecord["bucket"];
  context: RangePackRecord["context"];
  explicitHands: number;
  impliedFolds: number;
  strictActionCounts: Record<ActionKey, number>;
}

export interface RangePackImportReport {
  packId: string;
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
  sourceCount: number;
  searchQueryCount: number;
  recordCount: number;
  totalExplicitHands: number;
  totalImpliedFolds: number;
  records: readonly RangePackRecordSummary[];
}

const FOLD_ACTION: ActionKey = "FOLD";

export function normalizeRangeRecord(record: RangePackRecord): NormalizedRangeRecord {
  return {
    source: record,
    cells: ALL_HAND_CLASSES.map((hand) => {
      const strict = record.strict[hand];
      const lenient = record.lenient[hand];
      const impliedFold = strict === undefined && lenient === undefined;

      return {
        hand,
        strict: strict ?? [FOLD_ACTION],
        lenient: lenient ?? strict ?? [FOLD_ACTION],
        impliedFold,
      };
    }),
  };
}

export function buildRangePackImportReport(pack: RangePack): RangePackImportReport {
  const errors = validateRangePack(pack);
  const warnings = warningMessages(pack);
  const records = pack.records.map(summarizeRecord);
  const totalExplicitHands = records.reduce((sum, item) => sum + item.explicitHands, 0);
  const totalImpliedFolds = records.reduce((sum, item) => sum + item.impliedFolds, 0);

  return {
    packId: pack.id,
    valid: errors.length === 0,
    errors,
    warnings,
    sourceCount: pack.sourceEvidence.length,
    searchQueryCount: pack.searchQueries.length,
    recordCount: pack.records.length,
    totalExplicitHands,
    totalImpliedFolds,
    records,
  };
}

export function renderRangePackImportReport(report: RangePackImportReport): string {
  const lines = [
    `RangePack: ${report.packId}`,
    `valid: ${report.valid}`,
    `sources: ${report.sourceCount}`,
    `searches: ${report.searchQueryCount}`,
    `records: ${report.recordCount}`,
    `explicit hands: ${report.totalExplicitHands}`,
    `implied folds: ${report.totalImpliedFolds}`,
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

function summarizeRecord(record: RangePackRecord): RangePackRecordSummary {
  const normalized = normalizeRangeRecord(record);
  const strictActionCounts = {} as Record<ActionKey, number>;
  let explicitHands = 0;
  let impliedFolds = 0;

  for (const cell of normalized.cells) {
    if (cell.impliedFold) {
      impliedFolds += 1;
    } else {
      explicitHands += 1;
    }

    for (const action of cell.strict) {
      strictActionCounts[action] = (strictActionCounts[action] ?? 0) + 1;
    }
  }

  return {
    position: record.position,
    bucket: record.bucket,
    context: record.context,
    explicitHands,
    impliedFolds,
    strictActionCounts,
  };
}

function warningMessages(pack: RangePack): string[] {
  const warnings: string[] = [];

  if (pack.assumptions.length === 0) {
    warnings.push("RangePack should describe chart assumptions.");
  }

  if (pack.confidence === "LOW") {
    warnings.push("RangePack confidence is LOW; review before production use.");
  }

  if (pack.records.length === 0) {
    warnings.push("RangePack has no records.");
  }

  return warnings;
}
