import { ALL_HAND_CLASSES } from "../../core/poker";
import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type AnteMode,
  type HandLabel,
  type Position,
  type StackBucket,
} from "../../core/types";
import {
  buildRangePackImportReport,
  normalizeRangeRecord,
} from "./rangePackImport";
import { mttPreflopRangePacks } from "./mttPreflopRangePacks";
import type { RangePack } from "./rangePack";
import { validateRangePack } from "./rangePack";

export interface MttPreflopRangeAuditReport {
  packId: string;
  ante: AnteMode;
  valid: boolean;
  confidence: RangePack["confidence"];
  recordCount: number;
  expectedRecordCount: number;
  sourceCount: number;
  searchQueryCount: number;
  totalExplicitHands: number;
  totalImpliedFolds: number;
  normalizedCellCount: number;
  expectedNormalizedCellCount: number;
  coverage: MttPreflopRangeAuditCoverage;
  duplicateRecordKeys: string[];
  invalidHandLabels: string[];
  emptyStrictCells: number;
  emptyLenientCells: number;
  strictHandsMissingLenient: number;
  actionCountsByContext: Record<ActionContext, Partial<Record<ActionKey, number>>>;
  missingRepresentativeActions: Record<ActionContext, ActionKey[]>;
  errors: string[];
}

export interface MttPreflopRangeAuditCoverage {
  positions: Position[];
  stackBuckets: StackBucket[];
  contexts: ActionContext[];
  missingPositions: Position[];
  missingStackBuckets: StackBucket[];
  missingContexts: ActionContext[];
}

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

const REPRESENTATIVE_ACTIONS: Record<ActionContext, readonly ActionKey[]> = {
  RFI: ["OPEN_2X", "OPEN_25X"],
  VS_LIMP: ["ISO_25X", "OVERLIMP", "LIMP"],
  VS_OPEN: ["3BET", "CALL"],
  VS_3BET: ["4BET", "CALL"],
  VS_4BET: ["JAM", "CALL"],
  SQUEEZE: ["SQUEEZE", "CALL"],
  BVB: ["OPEN_2X", "OPEN_25X", "3BET", "CALL"],
  PUSH_FOLD: ["JAM"],
  VS_ALLIN: ["CALL_JAM"],
};

const HAND_CLASS_SET: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);
const EXPECTED_RECORD_COUNT = 487;
const EXPECTED_NORMALIZED_CELL_COUNT = EXPECTED_RECORD_COUNT * ALL_HAND_CLASSES.length;

export function auditCurrentMttPreflopProductionPacks(): MttPreflopRangeAuditReport[] {
  return mttPreflopRangePacks.map(auditMttPreflopRangePack);
}

export function auditMttPreflopRangePack(pack: RangePack): MttPreflopRangeAuditReport {
  const importReport = buildRangePackImportReport(pack);
  const coverage = coverageForPack(pack);
  const duplicateRecordKeys = duplicateKeys(pack);
  const actionCountsByContext = emptyActionCountsByContext();
  const invalidHandLabels = new Set<string>();
  let normalizedCellCount = 0;
  let emptyStrictCells = 0;
  let emptyLenientCells = 0;
  let strictHandsMissingLenient = 0;

  for (const record of pack.records) {
    normalizedCellCount += normalizeRangeRecord(record).cells.length;

    for (const [hand, actions] of Object.entries(record.strict)) {
      if (!HAND_CLASS_SET.has(hand)) invalidHandLabels.add(hand);
      if (!Array.isArray(actions) || actions.length === 0) emptyStrictCells += 1;
      if (record.lenient[hand] === undefined) strictHandsMissingLenient += 1;
      for (const action of actions) {
        actionCountsByContext[record.context][action] =
          (actionCountsByContext[record.context][action] ?? 0) + 1;
      }
    }

    for (const [hand, actions] of Object.entries(record.lenient)) {
      if (!HAND_CLASS_SET.has(hand)) invalidHandLabels.add(hand);
      if (!Array.isArray(actions) || actions.length === 0) emptyLenientCells += 1;
    }
  }

  const missingRepresentativeActions = representativeActionGaps(actionCountsByContext);
  const errors = auditErrors(pack, {
    coverage,
    duplicateRecordKeys,
    invalidHandLabels: [...invalidHandLabels].sort(),
    emptyStrictCells,
    emptyLenientCells,
    strictHandsMissingLenient,
    missingRepresentativeActions,
    normalizedCellCount,
  });

  return {
    packId: pack.id,
    ante: pack.dimensions.ante,
    valid: errors.length === 0,
    confidence: pack.confidence,
    recordCount: pack.records.length,
    expectedRecordCount: EXPECTED_RECORD_COUNT,
    sourceCount: pack.sourceEvidence.length,
    searchQueryCount: pack.searchQueries.length,
    totalExplicitHands: importReport.totalExplicitHands,
    totalImpliedFolds: importReport.totalImpliedFolds,
    normalizedCellCount,
    expectedNormalizedCellCount: EXPECTED_NORMALIZED_CELL_COUNT,
    coverage,
    duplicateRecordKeys,
    invalidHandLabels: [...invalidHandLabels].sort(),
    emptyStrictCells,
    emptyLenientCells,
    strictHandsMissingLenient,
    actionCountsByContext,
    missingRepresentativeActions,
    errors,
  };
}

function auditErrors(
  pack: RangePack,
  result: {
    coverage: MttPreflopRangeAuditCoverage;
    duplicateRecordKeys: readonly string[];
    invalidHandLabels: readonly string[];
    emptyStrictCells: number;
    emptyLenientCells: number;
    strictHandsMissingLenient: number;
    missingRepresentativeActions: Record<ActionContext, ActionKey[]>;
    normalizedCellCount: number;
  },
): string[] {
  const errors = validateRangePack(pack);

  if (
    pack.dimensions.gameVariant !== "MTT" ||
    pack.dimensions.tableFormat !== "FULL_RING_9" ||
    pack.dimensions.blindSpeed !== "REGULAR" ||
    pack.dimensions.street !== "PREFLOP" ||
    pack.dimensions.evModel !== "CHIP_EV" ||
    pack.dimensions.rakeMode !== "NONE"
  ) {
    errors.push("Pack dimensions are not the MTT 9-max regular preflop chipEV baseline.");
  }
  if (pack.confidence === "LOW") errors.push("Production baseline cannot have LOW confidence.");
  if (pack.records.length !== EXPECTED_RECORD_COUNT) {
    errors.push(`Expected ${EXPECTED_RECORD_COUNT} records, got ${pack.records.length}.`);
  }
  if (result.normalizedCellCount !== EXPECTED_NORMALIZED_CELL_COUNT) {
    errors.push(
      `Expected ${EXPECTED_NORMALIZED_CELL_COUNT} normalized cells, got ` +
        `${result.normalizedCellCount}.`,
    );
  }
  if (result.coverage.missingPositions.length > 0) {
    errors.push(`Missing positions: ${result.coverage.missingPositions.join(", ")}.`);
  }
  if (result.coverage.missingStackBuckets.length > 0) {
    errors.push(`Missing stack buckets: ${result.coverage.missingStackBuckets.join(", ")}.`);
  }
  if (result.coverage.missingContexts.length > 0) {
    errors.push(`Missing action contexts: ${result.coverage.missingContexts.join(", ")}.`);
  }
  if (result.duplicateRecordKeys.length > 0) {
    errors.push(`Duplicate record keys: ${result.duplicateRecordKeys.join(", ")}.`);
  }
  if (result.invalidHandLabels.length > 0) {
    errors.push(`Invalid hand labels: ${result.invalidHandLabels.join(", ")}.`);
  }
  if (result.emptyStrictCells > 0) {
    errors.push(`Strict hand map contains ${result.emptyStrictCells} empty action cells.`);
  }
  if (result.emptyLenientCells > 0) {
    errors.push(`Lenient hand map contains ${result.emptyLenientCells} empty action cells.`);
  }
  if (result.strictHandsMissingLenient > 0) {
    errors.push(
      `Lenient hand map is missing ${result.strictHandsMissingLenient} strict hand cells.`,
    );
  }

  for (const context of REQUIRED_CONTEXTS) {
    const missing = result.missingRepresentativeActions[context];
    if (missing.length > 0) {
      errors.push(`Missing representative actions for ${context}: ${missing.join(", ")}.`);
    }
  }

  return errors;
}

function coverageForPack(pack: RangePack): MttPreflopRangeAuditCoverage {
  const positions = uniqueInOrder(
    pack.records.map((record) => record.position),
    POSITION_ORDER,
  );
  const stackBuckets = uniqueInOrder(
    pack.records.map((record) => record.bucket),
    STACK_BUCKETS,
  );
  const contexts = uniqueInOrder(
    pack.records.map((record) => record.context),
    REQUIRED_CONTEXTS,
  );

  return {
    positions,
    stackBuckets,
    contexts,
    missingPositions: POSITION_ORDER.filter((position) => !positions.includes(position)),
    missingStackBuckets: STACK_BUCKETS.filter((bucket) => !stackBuckets.includes(bucket)),
    missingContexts: REQUIRED_CONTEXTS.filter((context) => !contexts.includes(context)),
  };
}

function duplicateKeys(pack: RangePack): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of pack.records) {
    const key = `${record.position}|${record.bucket}|${record.context}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function emptyActionCountsByContext(): Record<ActionContext, Partial<Record<ActionKey, number>>> {
  return Object.fromEntries(
    REQUIRED_CONTEXTS.map((context) => [context, {}]),
  ) as Record<ActionContext, Partial<Record<ActionKey, number>>>;
}

function representativeActionGaps(
  counts: Record<ActionContext, Partial<Record<ActionKey, number>>>,
): Record<ActionContext, ActionKey[]> {
  return Object.fromEntries(
    REQUIRED_CONTEXTS.map((context) => [
      context,
      REPRESENTATIVE_ACTIONS[context].filter((action) => (counts[context][action] ?? 0) === 0),
    ]),
  ) as Record<ActionContext, ActionKey[]>;
}

function uniqueInOrder<T extends string | number>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}
