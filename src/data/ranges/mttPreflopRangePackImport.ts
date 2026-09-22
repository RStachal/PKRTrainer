import { ALL_HAND_CLASSES } from "../../core/poker";
import {
  cloneActionEvSet,
  isActionEvSetComplete,
  validateActionEvSet,
  type ActionEvSet,
} from "../../core/actionEv";
import { offeredPreflopActionKeysForContext } from "../../core/preflopActionOptions";
import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
  type StackBucket,
} from "../../core/types";
import { positionsForFormat } from "../../core/trainingProfile";
import type {
  RangePack,
  RangePackDimensions,
  RangePackRecord,
  RangeSourceEvidence,
} from "./rangePack";
import { validateRangePack, type RangeStackSetup } from "./rangePack";
import { findPlaceholderStringPaths } from "./placeholderText";

export type MttPreflopImportLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export interface MttPreflopImportRecord {
  position: Position;
  sourceStackBB: number;
  bucket: StackBucket;
  context: ActionContext;
  /**
   * Zpřesnění (osa otvírače, bod 234): sedačka, která jednala proti hrdinovi,
   * a rozložení stacků. Do 16. 9. 2026 je produkční cesta při normalizaci
   * **zahazovala** a dva záznamy téže buňky lišící se otvíračem hlásila jako
   * duplicitu - přesně to, co bod 234 naměřil. Zpřesněný záznam je nadstavba
   * nad obecným: do úplnosti packu se nepočítá a obecný záznam téže buňky
   * musí existovat dál.
   */
  vsSeat?: Position;
  stackSetupId?: string;
  /**
   * Odkud záznam je, když to není odkud je celý pack. Pack má jeden
   * `licenseKind`; záznam z jiného zdroje (koupené charty vlastníka) to musí
   * říct sám, jinak by pack tvrdil o jeho původu něco jiného.
   */
  provenance?: string;
  lenient: Partial<Record<HandLabel, readonly ActionKey[]>>;
  strict: Partial<Record<HandLabel, readonly ActionKey[]>>;
  actionEvs?: Partial<Record<HandLabel, ActionEvSet<ActionKey>>>;
}

export interface MttPreflopRangePackImportInput {
  contentLanguage?: string;
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  dimensions: RangePackDimensions;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  licenseKind: MttPreflopImportLicenseKind;
  licenseNote: string;
  assumptions: readonly string[];
  searchQueries: readonly string[];
  sourceEvidence: readonly RangeSourceEvidence[];
  /** Scénáře (rozložení stacků), na které se záznamy odkazují přes `stackSetupId`. */
  stackSetups?: Readonly<Record<string, RangeStackSetup>>;
  records: readonly MttPreflopImportRecord[];
}

export interface MttPreflopImportRecordReport {
  position: Position;
  sourceStackBB: number;
  bucket: StackBucket;
  context: ActionContext;
  explicitHands: number;
  actionEvHands: number;
  missingHands: readonly HandLabel[];
  strictActionDistribution: readonly MttPreflopImportActionCount[];
  lenientActionDistribution: readonly MttPreflopImportActionCount[];
}

export interface MttPreflopImportActionCount {
  action: ActionKey;
  count: number;
  pct: number;
}

export interface MttPreflopImportReadinessReport {
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
  actionEvHands: number;
  actionEvCoveragePct: number;
  evReady: boolean;
  positions: readonly Position[];
  contexts: readonly ActionContext[];
  buckets: readonly StackBucket[];
  missingPositions: readonly Position[];
  missingContexts: readonly ActionContext[];
  missingBuckets: readonly StackBucket[];
  stackBucketMapping: readonly { sourceStackBB: number; bucket: StackBucket }[];
  duplicateRecordKeys: readonly string[];
  records: readonly MttPreflopImportRecordReport[];
}

const ACTION_CONTEXTS: readonly ActionContext[] = [
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

const EXPECTED_NON_FOLD_ACTIONS_BY_CONTEXT: Record<ActionContext, readonly ActionKey[]> = {
  // JAM belongs in RFI for the same reason it belongs in VS_OPEN and VS_LIMP:
  // between ten and twenty big blinds the owner's sheets shove the small pairs
  // rather than opening them, so a pack that says so is correct, not malformed.
  RFI: ["OPEN_2X", "OPEN_25X", "OPEN_3X", "LIMP", "JAM"],
  // JAM belongs here for the same reason it belongs in VS_OPEN: short of thirty
  // big blinds the owner's chart answers a limp with a shove - 20.5 percent of
  // hands at 15-20BB - so a pack that teaches it is correct, not malformed.
  VS_LIMP: ["ISO_2X", "ISO_25X", "ISO_3X", "OVERLIMP", "LIMP", "CALL", "JAM"],
  VS_OPEN: ["CALL", "3BET", "JAM"],
  VS_3BET: ["CALL", "4BET", "JAM"],
  VS_4BET: ["CALL", "CALL_JAM", "JAM"],
  SQUEEZE: ["SQUEEZE", "3BET", "CALL", "JAM"],
  BVB: ["OPEN_2X", "OPEN_25X", "OPEN_3X", "LIMP", "CALL", "3BET", "JAM"],
  PUSH_FOLD: ["JAM", "CALL_JAM"],
  VS_ALLIN: ["CALL", "CALL_JAM"],
};

const LEGAL_ACTIONS_BY_CONTEXT = ACTION_CONTEXTS.reduce(
  (out, context) => {
    out[context] = new Set<ActionKey>([
      "FOLD",
      ...EXPECTED_NON_FOLD_ACTIONS_BY_CONTEXT[context],
    ]);
    return out;
  },
  {} as Record<ActionContext, ReadonlySet<ActionKey>>,
);

const LEGAL_LICENSE_KINDS: readonly MttPreflopImportLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];

/**
 * Zdroje jmenované na úrovni záznamů: text `provenance` před první čárkou.
 *
 * Manifest povolení je musí uznat každý zvlášť
 * (`ProductionPermissionManifest.additionalSources`).
 */
export function recordProvenanceSources(
  records: readonly Pick<MttPreflopImportRecord, "provenance">[],
  ownSource?: string,
): string[] {
  const sources = new Set<string>();
  for (const record of records) {
    if (record.provenance === undefined) continue;
    const source = record.provenance.split(",")[0].trim();
    // Záznam, který jen říká, že je z vlastního zdroje packu (`licenseKind`
    // jako první položka `provenance`), není cizí zdroj: převedený záznam
    // (bod 254, BVB|BB → VS_OPEN z SB) má stejný původ jako celý pack.
    if (ownSource !== undefined && source === ownSource) continue;
    sources.add(source);
  }
  return [...sources].sort();
}

export function normalizeMttPreflopRangePackImport(
  input: MttPreflopRangePackImportInput,
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
    ...(input.stackSetups === undefined ? {} : {
      stackSetups: Object.fromEntries(Object.entries(input.stackSetups)
        .map(([id, setup]) => [id, { label: setup.label, stacksBB: { ...setup.stacksBB } }])),
    }),
    records: input.records.map(normalizeRecord),
  };
}

export function buildMttPreflopImportReadinessReport(
  input: MttPreflopRangePackImportInput,
): MttPreflopImportReadinessReport {
  const pack = normalizeMttPreflopRangePackImport(input);
  const errors = [
    ...validateRangePack(pack),
    ...validateMttPreflopInput(input),
  ];
  const records = input.records.map(reportRecord);
  const positions = uniquePositions(input.records.map((record) => record.position));
  const contexts = uniqueContexts(input.records.map((record) => record.context));
  const buckets = uniqueBuckets(input.records.map((record) => record.bucket));
  const requiredPositions = positionsForFormat(input.dimensions.tableFormat);
  const missingPositions = requiredPositions.filter((position) => !positions.includes(position));
  const missingContexts = ACTION_CONTEXTS.filter((context) => !contexts.includes(context));
  const missingBuckets = STACK_BUCKETS.filter((bucket) => !buckets.includes(bucket));
  const duplicateRecordKeys = duplicateKeys(input.records.map(recordKey));
  const warnings = warningMessages(input, {
    records,
    missingPositions,
    missingContexts,
    missingBuckets,
  });
  const legalLicense = LEGAL_LICENSE_KINDS.includes(input.licenseKind);
  const actionEvHands = records.reduce((sum, record) => sum + record.actionEvHands, 0);
  const totalHands = records.length * ALL_HAND_CLASSES.length;

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
    actionEvHands,
    actionEvCoveragePct: totalHands === 0 ? 0 : roundPct(actionEvHands, totalHands),
    evReady: totalHands > 0 && actionEvHands === totalHands,
    positions,
    contexts,
    buckets,
    missingPositions,
    missingContexts,
    missingBuckets,
    stackBucketMapping: uniqueStackMappings(input.records),
    duplicateRecordKeys,
    records,
  };
}

export function renderMttPreflopImportReadinessReport(
  report: MttPreflopImportReadinessReport,
): string {
  const lines = [
    `MTT preflop RangePack import: ${report.packId}`,
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
    `action EV: ${report.actionEvHands} hands (${report.actionEvCoveragePct}%), ready=${report.evReady}`,
    `positions: ${report.positions.join(",") || "none"}`,
    `contexts: ${report.contexts.join(",") || "none"}`,
    `buckets: ${report.buckets.join(",") || "none"}`,
    `missing positions: ${report.missingPositions.join(",") || "none"}`,
    `missing contexts: ${report.missingContexts.join(",") || "none"}`,
    `missing buckets: ${report.missingBuckets.join(",") || "none"}`,
    `stack mapping: ${report.stackBucketMapping
      .map((item) => `${item.sourceStackBB}->${item.bucket}`)
      .join(",") || "none"}`,
  ];

  if (report.duplicateRecordKeys.length > 0) {
    lines.push(`duplicate keys: ${report.duplicateRecordKeys.join(",")}`);
  }

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  if (report.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  if (report.records.length > 0) {
    lines.push("action distribution:");
    for (const record of report.records) {
      lines.push(
        `- ${record.position}/${record.bucket}/${record.context}: ` +
        `strict ${renderActionDistribution(record.strictActionDistribution)}; ` +
        `lenient ${renderActionDistribution(record.lenientActionDistribution)}`,
      );
    }
  }

  return lines.join("\n");
}

function normalizeRecord(record: MttPreflopImportRecord): RangePackRecord {
  return {
    position: record.position,
    bucket: record.bucket,
    context: record.context,
    ...(record.vsSeat ? { vsSeat: record.vsSeat } : {}),
    ...(record.stackSetupId ? { stackSetupId: record.stackSetupId } : {}),
    ...(record.provenance ? { provenance: record.provenance } : {}),
    lenient: normalizeActionMap(record.lenient),
    strict: normalizeActionMap(record.strict),
    ...(record.actionEvs ? { actionEvs: normalizeActionEvMap(record.actionEvs) } : {}),
  };
}

function normalizeActionEvMap(
  map: Partial<Record<HandLabel, ActionEvSet<ActionKey>>>,
): Partial<Record<HandLabel, ActionEvSet<ActionKey>>> {
  const out: Partial<Record<HandLabel, ActionEvSet<ActionKey>>> = {};
  for (const hand of ALL_HAND_CLASSES) {
    const set = map[hand];
    if (set !== undefined) out[hand] = cloneActionEvSet(set);
  }
  return out;
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

function validateMttPreflopInput(input: MttPreflopRangePackImportInput): string[] {
  const errors: string[] = [];
  const validPositions = positionsForFormat(input.dimensions.tableFormat);

  if (input.dimensions.gameVariant !== "MTT") {
    errors.push("MTT preflop import must use gameVariant MTT.");
  }
  if (input.dimensions.street !== "PREFLOP") {
    errors.push("MTT preflop import must use street PREFLOP.");
  }
  if (input.dimensions.evModel !== "CHIP_EV" && input.dimensions.evModel !== "DOLAR_EV") {
    errors.push("MTT preflop import must use evModel CHIP_EV or DOLAR_EV.");
  }
  if (input.dimensions.rakeMode !== "NONE") {
    errors.push("MTT preflop tournament import must use rakeMode NONE.");
  }
  if (!LEGAL_LICENSE_KINDS.includes(input.licenseKind)) {
    errors.push("MTT preflop import needs owned export, public permission, or explicit written permission.");
  }
  if (input.licenseNote.trim().length === 0) {
    errors.push("MTT preflop import licenseNote is required.");
  }
  if (input.assumptions.some((item) => item.trim().length === 0)) {
    errors.push("MTT preflop import assumptions must not contain empty entries.");
  }
  if (input.records.length === 0) {
    errors.push("MTT preflop import must contain at least one normalized record.");
  }
  const placeholderPaths = findPlaceholderStringPaths(input);
  if (placeholderPaths.length > 0) {
    errors.push(`MTT preflop import must replace placeholder text before promotion: ${placeholderPaths.join(",")}.`);
  }

  for (const duplicate of duplicateKeys(input.records.map(recordKey))) {
    errors.push(`Duplicate MTT preflop import record key: ${duplicate}.`);
  }

  for (const [index, record] of input.records.entries()) {
    const tag = `records[${index}]`;
    if (!validPositions.includes(record.position)) {
      errors.push(`${tag}.position is not valid for ${input.dimensions.tableFormat}.`);
    }
    if (!Number.isFinite(record.sourceStackBB) || record.sourceStackBB <= 0) {
      errors.push(`${tag}.sourceStackBB must be a positive number.`);
    }
    if (!STACK_BUCKETS.includes(record.bucket)) {
      errors.push(`${tag}.bucket must be a supported PKRTrainer stack bucket.`);
    }
    if (!ACTION_CONTEXTS.includes(record.context)) {
      errors.push(`${tag}.context must be a supported action context.`);
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
          } else if (!LEGAL_ACTIONS_BY_CONTEXT[record.context].has(action)) {
            errors.push(
              `${tag}.${mapName}.${hand} contains action ${action} illegal for ${record.context}.`,
            );
          }
        }
        if (new Set(actions).size !== actions.length) {
          errors.push(`${tag}.${mapName}.${hand} contains duplicate actions.`);
        }
      }
    }

    for (const hand of ALL_HAND_CLASSES) {
      const strict = record.strict[hand] ?? [];
      const lenient = new Set(record.lenient[hand] ?? []);
      for (const action of strict) {
        if (!lenient.has(action)) {
          errors.push(`${tag}.strict.${hand} action ${action} is missing from lenient.`);
        }
      }

      const actionEvs = record.actionEvs?.[hand];
      if (actionEvs !== undefined) {
        const evActions = actionEvs.values.map((item) => item.action);
        const offeredActions = offeredPreflopActionKeysForContext(
          record.context,
          record.position,
          record.bucket,
          strict,
        );
        for (const error of validateActionEvSet(actionEvs, offeredActions)) {
          errors.push(`${tag}.actionEvs.${hand}: ${error}.`);
        }
        for (const action of evActions) {
          if (!ACTION_KEYS.includes(action)) {
            errors.push(`${tag}.actionEvs.${hand} contains unsupported action ${action}.`);
          } else if (!LEGAL_ACTIONS_BY_CONTEXT[record.context].has(action)) {
            errors.push(`${tag}.actionEvs.${hand} contains action ${action} illegal for ${record.context}.`);
          }
        }
        for (const action of new Set<ActionKey>([...strict, ...lenient])) {
          if (!evActions.includes(action)) {
            errors.push(`${tag}.actionEvs.${hand} is missing accepted action ${action}.`);
          }
        }
      }
    }
  }

  return errors;
}

function warningMessages(
  input: MttPreflopRangePackImportInput,
  coverage: {
    records: readonly MttPreflopImportRecordReport[];
    missingPositions: readonly Position[];
    missingContexts: readonly ActionContext[];
    missingBuckets: readonly StackBucket[];
  },
): string[] {
  const warnings: string[] = [];
  const assumptions = input.assumptions.join(" ").toLowerCase();

  if (input.confidence === "LOW") {
    warnings.push("MTT preflop import remains candidate/preview while confidence is LOW.");
  }
  if (!assumptions.includes(input.dimensions.blindSpeed.toLowerCase())) {
    warnings.push("MTT preflop import should state regular/turbo assumptions explicitly.");
  }
  if (!assumptions.includes(input.dimensions.ante.toLowerCase())) {
    warnings.push("MTT preflop import should state ante assumptions explicitly.");
  }
  if (input.sourceEvidence.length < 2) {
    warnings.push("MTT preflop import should cite at least 2 source evidence entries.");
  }
  if (input.searchQueries.length < 3) {
    warnings.push("MTT preflop import should record at least 3 independent chart searches.");
  }
  for (const position of coverage.missingPositions) {
    warnings.push(`MTT preflop import has no record for position ${position}.`);
  }
  for (const context of coverage.missingContexts) {
    warnings.push(`MTT preflop import has no record for action context ${context}.`);
  }
  for (const bucket of coverage.missingBuckets) {
    warnings.push(`MTT preflop import has no record for stack bucket ${bucket}.`);
  }
  for (const record of coverage.records) {
    if (record.missingHands.length > 0) {
      warnings.push(`${record.position}/${record.bucket}/${record.context} is missing hand-class values.`);
    }
  }
  for (const record of input.records) {
    warnings.push(...semanticWarningsForRecord(record));
  }

  return warnings;
}

function reportRecord(record: MttPreflopImportRecord): MttPreflopImportRecordReport {
  const missingHands = missingHandClasses(record);
  return {
    position: record.position,
    sourceStackBB: record.sourceStackBB,
    bucket: record.bucket,
    context: record.context,
    explicitHands: ALL_HAND_CLASSES.length - missingHands.length,
    actionEvHands: ALL_HAND_CLASSES.filter((hand) => {
      const set = record.actionEvs?.[hand];
      const strict = record.strict[hand] ?? [];
      const offeredActions = offeredPreflopActionKeysForContext(
        record.context,
        record.position,
        record.bucket,
        strict,
      );
      return isActionEvSetComplete(set, offeredActions);
    }).length,
    missingHands,
    strictActionDistribution: actionDistribution(record.strict),
    lenientActionDistribution: actionDistribution(record.lenient),
  };
}

function missingHandClasses(record: MttPreflopImportRecord): HandLabel[] {
  return ALL_HAND_CLASSES.filter((hand) => (
    record.lenient[hand] === undefined || record.strict[hand] === undefined
  ));
}

function recordKey(record: MttPreflopImportRecord): string {
  return `${record.position}|${record.bucket}|${record.context}`
    + `${record.vsSeat ? `|vs${record.vsSeat}` : ""}${record.stackSetupId ? `|#${record.stackSetupId}` : ""}`;
}

function semanticWarningsForRecord(record: MttPreflopImportRecord): string[] {
  const warnings: string[] = [];
  for (const [mapName, map] of [
    ["strict", record.strict],
    ["lenient", record.lenient],
  ] as const) {
    const tag = `${record.position}/${record.bucket}/${record.context}/${mapName}`;
    if (isAllSingleAction(map, "FOLD")) {
      warnings.push(`${tag} is a trivial all-FOLD map and needs explicit review.`);
    }
    if (isAllOpenActionMap(map)) {
      warnings.push(`${tag} is a trivial all-open map and needs explicit review.`);
    }
    if (!hasExpectedContextAction(map, record.context)) {
      warnings.push(`${tag} has no expected non-fold action for ${record.context}.`);
    }
  }
  return warnings;
}

function isAllSingleAction(
  map: Partial<Record<HandLabel, readonly ActionKey[]>>,
  action: ActionKey,
): boolean {
  return ALL_HAND_CLASSES.every((hand) => {
    const actions = map[hand];
    return actions !== undefined && actions.length === 1 && actions[0] === action;
  });
}

function isAllOpenActionMap(map: Partial<Record<HandLabel, readonly ActionKey[]>>): boolean {
  return ALL_HAND_CLASSES.every((hand) => {
    const actions = map[hand];
    return actions !== undefined &&
      actions.length === 1 &&
      ["OPEN_2X", "OPEN_25X", "OPEN_3X"].includes(actions[0]);
  });
}

function hasExpectedContextAction(
  map: Partial<Record<HandLabel, readonly ActionKey[]>>,
  context: ActionContext,
): boolean {
  const expected = EXPECTED_NON_FOLD_ACTIONS_BY_CONTEXT[context];
  return ALL_HAND_CLASSES.some((hand) => {
    const actions = map[hand] ?? [];
    return actions.some((action) => expected.includes(action));
  });
}

function actionDistribution(
  map: Partial<Record<HandLabel, readonly ActionKey[]>>,
): MttPreflopImportActionCount[] {
  const counts = new Map<ActionKey, number>();
  for (const hand of ALL_HAND_CLASSES) {
    for (const action of map[hand] ?? []) {
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
  }

  return ACTION_KEYS
    .map((action) => ({
      action,
      count: counts.get(action) ?? 0,
      pct: Math.round(((counts.get(action) ?? 0) / ALL_HAND_CLASSES.length) * 1000) / 10,
    }))
    .filter((item) => item.count > 0);
}

function roundPct(value: number, total: number): number {
  return Math.round((value / total) * 1000) / 10;
}

function renderActionDistribution(distribution: readonly MttPreflopImportActionCount[]): string {
  if (distribution.length === 0) return "none";
  return distribution
    .map((item) => `${item.action}=${item.count} (${item.pct}%)`)
    .join(",");
}

function duplicateKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function uniquePositions(values: readonly Position[]): Position[] {
  const order = new Map(POSITION_ORDER.map((position, index) => [position, index]));
  return unique(values).sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

function uniqueContexts(values: readonly ActionContext[]): ActionContext[] {
  const order = new Map(ACTION_CONTEXTS.map((context, index) => [context, index]));
  return unique(values).sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

function uniqueBuckets(values: readonly StackBucket[]): StackBucket[] {
  return unique(values).sort((a, b) => a - b);
}

function unique<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function uniqueStackMappings(
  records: readonly MttPreflopImportRecord[],
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
