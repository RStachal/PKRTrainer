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
  SIX_MAX_POSITION_ORDER,
  type TableFormat,
  type TrainingProfile,
  profileWith,
  DEFAULT_TRAINING_PROFILE,
} from "../../core/trainingProfile";
import {
  buildRangePackImportReport,
  normalizeRangeRecord,
} from "./rangePackImport";
import {
  mttPreflopRangePackForProfile,
  mttPreflopRangePacks,
} from "./mttPreflopRangePacks";
import type { RangePack } from "./rangePack";
import { validateRangePack } from "./rangePack";
import { mttPreflopReadinessRowForProfile } from "./mttProductionReadiness";

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
  /**
   * Kolik záznamů je zpřesněných na otvírající sedačku nebo rozložení stacků.
   *
   * **Druhé číslo, ne druhá podmínka.** Úplnost se počítá dál z obecných
   * záznamů, protože pack, který má jen zpřesněné, na obecnou otázku
   * neodpoví - a prohlásit ho za pokrytý by tvrdilo odpověď, kterou hráč
   * nedostane.
   *
   * Kdyby se zpřesnění stalo požadavkem, mřížka by se u six-max zvětšila z 702
   * buněk na 1 287 a **každý slot by se od produkce vzdálil**. To je past, do
   * které ten rozměr umí spadnout, a tohle je místo, kde se jí vyhýbá.
   */
  refinedRecords: number;
  /** Kolik buněk má vedle obecné odpovědi i aspoň jednu zpřesněnou. */
  refinedCells: number;
}

export interface MttPreflopSpeedDiffReport {
  rows: readonly MttPreflopSpeedDiffRow[];
  comparableRows: number;
  blockedRows: number;
}

export interface MttPreflopSpeedDiffRow {
  tableFormat: TableFormat;
  ante: AnteMode;
  status: "COMPARABLE" | "BLOCKED";
  regularPackId: string | null;
  turboPackId: string | null;
  regularRecordCount: number;
  turboRecordCount: number;
  regularCoverage: MttPreflopRangeAuditCoverage | null;
  turboCoverage: MttPreflopRangeAuditCoverage | null;
  actionDiffs: readonly MttPreflopActionDiff[];
  suspiciousIdenticalActions: boolean;
  blockers: readonly string[];
}

export interface MttPreflopActionDiff {
  action: ActionKey;
  regular: number;
  turbo: number;
  delta: number;
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
  // JAM belongs here now: between 15 and 30BB the owner's charts make re-jamming
  // over an open a real branch, and listing it means the audit notices if that
  // data ever silently stops reaching the packs.
  VS_OPEN: ["3BET", "CALL", "JAM"],
  VS_3BET: ["4BET", "CALL"],
  VS_4BET: ["JAM", "CALL"],
  SQUEEZE: ["SQUEEZE", "CALL"],
  BVB: ["OPEN_2X", "OPEN_25X", "3BET", "CALL"],
  PUSH_FOLD: ["JAM"],
  VS_ALLIN: ["CALL_JAM"],
};

const HAND_CLASS_SET: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);
// 487 before the calling-rejam sheets added VS_ALLIN at 15, 20, 25 and 30BB for
// the five seats they cover.
const EXPECTED_RECORD_COUNT = 507;
const EXPECTED_NORMALIZED_CELL_COUNT = EXPECTED_RECORD_COUNT * ALL_HAND_CLASSES.length;

export function auditCurrentMttPreflopProductionPacks(): MttPreflopRangeAuditReport[] {
  return mttPreflopRangePacks.map(auditMttPreflopRangePack);
}

export function buildMttPreflopSpeedDiffReport(): MttPreflopSpeedDiffReport {
  const rows: MttPreflopSpeedDiffRow[] = [];
  for (const tableFormat of ["FULL_RING_9", "SIX_MAX"] as const satisfies readonly TableFormat[]) {
    for (const ante of ["ON", "OFF"] as const satisfies readonly AnteMode[]) {
      rows.push(buildSpeedDiffRow(tableFormat, ante));
    }
  }

  return {
    rows,
    comparableRows: rows.filter((row) => row.status === "COMPARABLE").length,
    blockedRows: rows.filter((row) => row.status === "BLOCKED").length,
  };
}

export function renderMttPreflopSpeedDiffReport(
  report: MttPreflopSpeedDiffReport = buildMttPreflopSpeedDiffReport(),
): string {
  const lines = [
    "MTT preflop regular-vs-turbo diff",
    `comparable rows: ${report.comparableRows}`,
    `blocked rows: ${report.blockedRows}`,
  ];

  for (const row of report.rows) {
    lines.push(
      [
        `${row.tableFormat}/ante-${row.ante}`,
        row.status,
        `regularRecords=${row.regularRecordCount}`,
        `turboRecords=${row.turboRecordCount}`,
        `diffActions=${row.actionDiffs.length}`,
      ].join(" :: "),
    );
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
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

function buildSpeedDiffRow(tableFormat: TableFormat, ante: AnteMode): MttPreflopSpeedDiffRow {
  const regularProfile = mttProfile(tableFormat, "REGULAR", ante);
  const turboProfile = mttProfile(tableFormat, "TURBO", ante);
  const regularPack = mttPreflopRangePackForProfile(regularProfile);
  const turboPack = mttPreflopRangePackForProfile(turboProfile);
  const regularCoverage = regularPack ? coverageForPack(regularPack) : null;
  const turboCoverage = turboPack ? coverageForPack(turboPack) : null;
  const actionDiffs = regularPack && turboPack
    ? actionDiffsForPacks(regularPack, turboPack)
    : [];
  const blockers = speedDiffBlockers({
    tableFormat,
    ante,
    regularPack,
    turboPack,
    actionDiffs,
  });

  return {
    tableFormat,
    ante,
    status: blockers.length === 0 ? "COMPARABLE" : "BLOCKED",
    regularPackId: regularPack?.id ?? null,
    turboPackId: turboPack?.id ?? null,
    regularRecordCount: regularPack?.records.length ?? 0,
    turboRecordCount: turboPack?.records.length ?? 0,
    regularCoverage,
    turboCoverage,
    actionDiffs,
    suspiciousIdenticalActions:
      regularPack !== undefined &&
      turboPack !== undefined &&
      regularPack.records.length > 0 &&
      turboPack.records.length > 0 &&
      actionDiffs.every((diff) => diff.delta === 0) &&
      !hasExplicitReusePolicy(turboPack),
    blockers,
  };
}

function speedDiffBlockers(input: {
  tableFormat: TableFormat;
  ante: AnteMode;
  regularPack: RangePack | undefined;
  turboPack: RangePack | undefined;
  actionDiffs: readonly MttPreflopActionDiff[];
}): string[] {
  const blockers: string[] = [];
  const turboReadiness = mttPreflopReadinessRowForProfile({
    tableFormat: input.tableFormat,
    blindSpeed: "TURBO",
    ante: input.ante,
  });

  if (!input.regularPack) blockers.push("Regular RangePack is missing.");
  if (!input.turboPack) blockers.push("Turbo RangePack is missing.");
  if (input.regularPack && input.regularPack.records.length === 0) {
    blockers.push("Regular RangePack has no records to compare.");
  }
  if (input.turboPack && input.turboPack.records.length === 0) {
    blockers.push("Turbo RangePack has no records to compare.");
  }
  if (input.regularPack && input.turboPack && input.actionDiffs.length === 0) {
    blockers.push("No comparable strict action distribution is available.");
  }
  if (turboReadiness.recommendationPolicy === "SPEED_METADATA_ONLY") {
    blockers.push("Turbo profile is metadata-only; dedicated hand recommendations are not normalized yet.");
  }
  if (turboReadiness.status === "MISSING") {
    blockers.push("Turbo profile has no dedicated production RangePack.");
  }
  if (
    input.regularPack &&
    input.turboPack &&
    input.regularPack.records.length > 0 &&
    input.turboPack.records.length > 0 &&
    input.actionDiffs.every((diff) => diff.delta === 0) &&
    !hasExplicitReusePolicy(input.turboPack)
  ) {
    blockers.push(
      "Regular and turbo strict action distributions are identical without an explicit reviewed reuse policy.",
    );
  }

  return blockers;
}

function actionDiffsForPacks(
  regularPack: RangePack,
  turboPack: RangePack,
): MttPreflopActionDiff[] {
  const regularCounts = aggregateStrictActionCounts(regularPack);
  const turboCounts = aggregateStrictActionCounts(turboPack);
  const actions = [...new Set<ActionKey>([
    ...Object.keys(regularCounts) as ActionKey[],
    ...Object.keys(turboCounts) as ActionKey[],
  ])].sort();

  return actions.map((action) => {
    const regular = regularCounts[action] ?? 0;
    const turbo = turboCounts[action] ?? 0;
    return {
      action,
      regular,
      turbo,
      delta: turbo - regular,
    };
  });
}

function aggregateStrictActionCounts(pack: RangePack): Partial<Record<ActionKey, number>> {
  const counts: Partial<Record<ActionKey, number>> = {};
  for (const record of pack.records) {
    for (const actions of Object.values(record.strict)) {
      for (const action of actions) counts[action] = (counts[action] ?? 0) + 1;
    }
  }
  return counts;
}

function hasExplicitReusePolicy(pack: RangePack): boolean {
  return pack.assumptions.some((assumption) => (
    /explicit/i.test(assumption) &&
    /review/i.test(assumption) &&
    /reuse/i.test(assumption)
  ));
}

function mttProfile(
  tableFormat: TableFormat,
  blindSpeed: TrainingProfile["blindSpeed"],
  ante: AnteMode,
): TrainingProfile {
  return profileWith(DEFAULT_TRAINING_PROFILE, {
    tableFormat,
    blindSpeed,
    ante,
  });
}

function coverageForPack(pack: RangePack): MttPreflopRangeAuditCoverage {
  const requiredPositions = requiredPositionsForFormat(pack.dimensions.tableFormat);
  // Úplnost se měří **jen z obecných záznamů**.
  //
  // Zpřesněný záznam odpovídá na užší otázku („co na BTN proti otevření z UTG"),
  // takže obecnou („co na BTN proti otevření") nezodpoví. Kdyby se do pokrytí
  // počítal, mohl by pack vypadat úplný a hráč by přesto dostal prázdno.
  const general = pack.records.filter(
    (record) => record.vsSeat === undefined && record.scenarioId === undefined,
  );
  const refined = pack.records.length - general.length;
  const generalCells = new Set(
    general.map((record) => `${record.position}|${record.bucket}|${record.context}`),
  );
  const refinedCells = new Set(
    pack.records
      .filter((record) => record.vsSeat !== undefined || record.scenarioId !== undefined)
      .map((record) => `${record.position}|${record.bucket}|${record.context}`)
      .filter((cell) => generalCells.has(cell)),
  );
  const positions = uniqueInOrder(
    general.map((record) => record.position),
    requiredPositions,
  );
  const stackBuckets = uniqueInOrder(
    general.map((record) => record.bucket),
    STACK_BUCKETS,
  );
  const contexts = uniqueInOrder(
    general.map((record) => record.context),
    REQUIRED_CONTEXTS,
  );

  return {
    positions,
    stackBuckets,
    contexts,
    missingPositions: requiredPositions.filter((position) => !positions.includes(position)),
    missingStackBuckets: STACK_BUCKETS.filter((bucket) => !stackBuckets.includes(bucket)),
    missingContexts: REQUIRED_CONTEXTS.filter((context) => !contexts.includes(context)),
    refinedRecords: refined,
    refinedCells: refinedCells.size,
  };
}

function requiredPositionsForFormat(format: TableFormat): readonly Position[] {
  return format === "SIX_MAX" ? SIX_MAX_POSITION_ORDER : POSITION_ORDER;
}

function duplicateKeys(pack: RangePack): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of pack.records) {
    // Zpřesnění patří do klíče: záznam pro BTN proti otevření z UTG a záznam
    // pro BTN proti otevření z CO jsou dvě různé odpovědi, ne jedna zapsaná
    // dvakrát. Bez toho by je audit odmítl jako duplicitu.
    const key = `${record.position}|${record.bucket}|${record.context}`
      + `${record.vsSeat ? `|vs${record.vsSeat}` : ""}`
      + `${record.scenarioId ? `|#${record.scenarioId}` : ""}`;
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
