import { ALL_HAND_CLASSES } from "../../core/poker.ts";
import { STACK_BUCKETS } from "../../core/types.ts";
import { positionsForFormat } from "../../core/trainingProfile.ts";
import { mttProductionImportIdentityFromPackId } from "./mttImportSlotNaming.ts";

export const MTT_PREFLOP_ACTION_CONTEXTS = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
] as const;

export const MTT_PREFLOP_CSV_SCAFFOLD_NOTE =
  "fill strictActions and lenientActions from reviewed source";

export const MTT_PREFLOP_CSV_SCAFFOLD_HEADER = [
  "rowKind",
  "packId",
  "tableFormat",
  "blindSpeed",
  "ante",
  "evModel",
  "position",
  "sourceStackBB",
  "bucket",
  "context",
  "handClass",
  "strictActions",
  "lenientActions",
  "actionEvsBb",
  "equivalentThresholdBb",
  "acceptableThresholdBb",
  "sourceReferenceId",
  "reviewer",
  "reviewedAt",
  "notes",
] as const;

export const MTT_PREFLOP_CSV_LEGACY_HEADER = [
  "rowKind",
  "packId",
  "tableFormat",
  "blindSpeed",
  "ante",
  "evModel",
  "position",
  "sourceStackBB",
  "bucket",
  "context",
  "handClass",
  "strictActions",
  "lenientActions",
  "sourceReferenceId",
  "reviewer",
  "reviewedAt",
  "notes",
] as const;

const MTT_PREFLOP_CSV_IMMUTABLE_COLUMNS = 11;

export type MttPreflopCsvScaffoldSchema =
  | "CURRENT_ACTION_EV"
  | "LEGACY_NO_ACTION_EV"
  | "UNKNOWN";

interface ScaffoldBuildOptions {
  maxRows?: number | null;
  reviewer?: string;
  reviewedAt?: string;
  sourceReferenceId?: string;
}

interface ScaffoldInspectOptions {
  expectedRows?: number;
}

type ScaffoldMergeOptions = ScaffoldInspectOptions;

export interface MttPreflopCsvScaffoldDocument {
  completeSlotRows: number;
  document: string;
  rows: number;
}

export interface MttPreflopCsvScaffoldProgress {
  actionEvCompleteRows: number;
  actionEvPartialRows: number;
  contentTouchedRows: number;
  measurable: boolean;
  notesEditedRows: number;
  reviewCompleteRows: number;
  reviewPartialRows: number;
  sourceReferenceRows: number;
  strategyCompleteRows: number;
  strategyPartialRows: number;
}

export interface MttPreflopCsvScaffoldInspection {
  actionEvColumnsPresent: boolean;
  bodyRows: number;
  current: boolean;
  errors: string[];
  expectedRows: number;
  progress: MttPreflopCsvScaffoldProgress;
  refreshableBlank: boolean;
  schema: MttPreflopCsvScaffoldSchema;
  sourceSafeBlank: boolean;
  stale: boolean;
  structuralErrors: string[];
  structureSafe: boolean;
}

export interface MttPreflopCsvChunkMergeResult {
  afterProgress: MttPreflopCsvScaffoldProgress | null;
  beforeProgress: MttPreflopCsvScaffoldProgress;
  chunkRows: number;
  conflictRows: number;
  document: string | null;
  errors: string[];
  matchedRows: number;
  plannedChangedRows: number;
  unchangedRows: number;
  valid: boolean;
}

export function buildMttPreflopCsvScaffoldDocument(
  packId: string,
  options: ScaffoldBuildOptions = {},
): MttPreflopCsvScaffoldDocument {
  const identity = requiredPreflopIdentity(packId);
  const positions = positionsForFormat(identity.tableFormat);
  const completeSlotRows = positions.length
    * STACK_BUCKETS.length
    * MTT_PREFLOP_ACTION_CONTEXTS.length
    * ALL_HAND_CLASSES.length;
  const maxRows = options.maxRows ?? null;
  const rows: string[][] = [[...MTT_PREFLOP_CSV_SCAFFOLD_HEADER]];
  let emitted = 0;

  for (const position of positions) {
    for (const bucket of STACK_BUCKETS) {
      for (const context of MTT_PREFLOP_ACTION_CONTEXTS) {
        for (const handClass of ALL_HAND_CLASSES) {
          if (maxRows !== null && emitted >= maxRows) break;
          rows.push(currentBlankRow(packId, identity, position, bucket, context, handClass, options));
          emitted += 1;
        }
        if (maxRows !== null && emitted >= maxRows) break;
      }
      if (maxRows !== null && emitted >= maxRows) break;
    }
    if (maxRows !== null && emitted >= maxRows) break;
  }

  return {
    completeSlotRows,
    document: `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    rows: emitted,
  };
}

export function inspectMttPreflopCsvScaffold(
  input: string,
  packId: string,
  options: ScaffoldInspectOptions = {},
): MttPreflopCsvScaffoldInspection {
  const identity = requiredPreflopIdentity(packId);
  const positions = positionsForFormat(identity.tableFormat);
  const completeSlotRows = positions.length
    * STACK_BUCKETS.length
    * MTT_PREFLOP_ACTION_CONTEXTS.length
    * ALL_HAND_CLASSES.length;
  const expectedRows = options.expectedRows ?? completeSlotRows;
  const errors: string[] = [];
  const structuralErrors: string[] = [];
  let schema: MttPreflopCsvScaffoldSchema = "UNKNOWN";
  let bodyRows = 0;
  let sourceSafeBlank = true;
  let structureSafe = true;
  let headerSeen = false;
  const progress = emptyProgress();

  const parser = forEachCsvRow(input, (rawRow) => {
    const row = headerSeen ? rawRow : removeBom(rawRow);
    if (!headerSeen) {
      headerSeen = true;
      if (sameRow(row, MTT_PREFLOP_CSV_SCAFFOLD_HEADER)) schema = "CURRENT_ACTION_EV";
      else if (sameRow(row, MTT_PREFLOP_CSV_LEGACY_HEADER)) schema = "LEGACY_NO_ACTION_EV";
      else {
        sourceSafeBlank = false;
        structureSafe = false;
        addError(errors, "CSV header is not a supported current or legacy blank scaffold header.");
        addError(structuralErrors, "CSV header is not a supported current or legacy scaffold header.");
      }
      return;
    }

    if (schema !== "UNKNOWN") {
      progress.measurable = true;
      measureProgressRow(progress, row, schema);
    }
    const expected = expectedBlankRow(packId, identity, positions, bodyRows, schema);
    if (
      expected === null || row.length !== expected.length ||
      !sameRow(
        row.slice(0, MTT_PREFLOP_CSV_IMMUTABLE_COLUMNS),
        expected.slice(0, MTT_PREFLOP_CSV_IMMUTABLE_COLUMNS),
      )
    ) {
      structureSafe = false;
      addError(structuralErrors, `row ${bodyRows + 2} differs from the immutable scaffold structure.`);
    }
    if (expected === null || !sameRow(row, expected)) {
      sourceSafeBlank = false;
      addError(errors, `row ${bodyRows + 2} differs from the generated blank scaffold.`);
    }
    bodyRows += 1;
  });

  if (!headerSeen) {
    sourceSafeBlank = false;
    structureSafe = false;
    addError(errors, "CSV is empty.");
    addError(structuralErrors, "CSV is empty.");
  }
  if (parser.unclosedQuote) {
    sourceSafeBlank = false;
    structureSafe = false;
    addError(errors, "CSV contains an unclosed quoted cell.");
    addError(structuralErrors, "CSV contains an unclosed quoted cell.");
  }
  if (bodyRows !== expectedRows) {
    sourceSafeBlank = false;
    structureSafe = false;
    addError(errors, `blank scaffold row count is ${bodyRows}; expected ${expectedRows}.`);
    addError(structuralErrors, `scaffold row count is ${bodyRows}; expected ${expectedRows}.`);
  }
  if (schema === "UNKNOWN") {
    sourceSafeBlank = false;
    structureSafe = false;
  }

  const finalSchema = schema as MttPreflopCsvScaffoldSchema;
  const current = finalSchema === "CURRENT_ACTION_EV";
  const stale = !current;
  return {
    actionEvColumnsPresent: current,
    bodyRows,
    current,
    errors,
    expectedRows,
    progress,
    refreshableBlank: finalSchema === "LEGACY_NO_ACTION_EV" && sourceSafeBlank,
    schema: finalSchema,
    sourceSafeBlank,
    stale,
    structuralErrors,
    structureSafe,
  };
}

export function mergeMttPreflopCsvScaffoldChunk(
  workbenchInput: string,
  chunkInput: string,
  packId: string,
  options: ScaffoldMergeOptions = {},
): MttPreflopCsvChunkMergeResult {
  const workbenchInspection = inspectMttPreflopCsvScaffold(workbenchInput, packId, options);
  const result: MttPreflopCsvChunkMergeResult = {
    afterProgress: null,
    beforeProgress: workbenchInspection.progress,
    chunkRows: 0,
    conflictRows: 0,
    document: null,
    errors: [],
    matchedRows: 0,
    plannedChangedRows: 0,
    unchangedRows: 0,
    valid: false,
  };
  if (!workbenchInspection.current) {
    result.errors.push("Workbench must use the current action-EV scaffold header.");
  }
  if (!workbenchInspection.structureSafe) {
    result.errors.push(...workbenchInspection.structuralErrors);
  }
  if (result.errors.length > 0) return result;

  const workbench = parseCsvTable(workbenchInput);
  const chunk = parseCsvTable(chunkInput);
  if (workbench.unclosedQuote) result.errors.push("Workbench contains an unclosed quoted cell.");
  if (chunk.unclosedQuote) result.errors.push("Chunk contains an unclosed quoted cell.");
  if (chunk.rows.length === 0) result.errors.push("Chunk CSV is empty.");
  else if (!sameRow(removeBom(chunk.rows[0]), MTT_PREFLOP_CSV_SCAFFOLD_HEADER)) {
    result.errors.push("Chunk must use the exact current action-EV scaffold header.");
  }
  const chunkBody = chunk.rows.slice(1);
  result.chunkRows = chunkBody.length;
  if (chunkBody.length === 0) result.errors.push("Chunk has no decision rows.");
  if (result.errors.length > 0) return result;

  const mergedRows = workbench.rows.map((row) => [...row]);
  const workbenchRowByKey = new Map<string, number>();
  for (let index = 1; index < mergedRows.length; index += 1) {
    workbenchRowByKey.set(immutableRowKey(mergedRows[index]), index);
  }
  const seenChunkKeys = new Set<string>();

  for (let chunkIndex = 0; chunkIndex < chunkBody.length; chunkIndex += 1) {
    const row = chunkBody[chunkIndex];
    const rowNumber = chunkIndex + 2;
    if (row.length !== MTT_PREFLOP_CSV_SCAFFOLD_HEADER.length) {
      addError(result.errors, `chunk row ${rowNumber} has ${row.length} cells; expected ${MTT_PREFLOP_CSV_SCAFFOLD_HEADER.length}.`);
      continue;
    }
    const key = immutableRowKey(row);
    if (seenChunkKeys.has(key)) {
      addError(result.errors, `chunk row ${rowNumber} duplicates an immutable decision key.`);
      continue;
    }
    seenChunkKeys.add(key);
    const workbenchIndex = workbenchRowByKey.get(key);
    if (workbenchIndex === undefined) {
      addError(result.errors, `chunk row ${rowNumber} does not match an immutable workbench decision.`);
      continue;
    }

    const strategyFields = populatedFields(row, [11, 12]);
    const actionEvFields = populatedFields(row, [13, 14, 15]);
    const reviewFields = populatedFields(row, [17, 18]);
    if (strategyFields === 1) {
      addError(result.errors, `chunk row ${rowNumber} must populate strictActions and lenientActions together.`);
      continue;
    }
    if (actionEvFields > 0 && actionEvFields < 3) {
      addError(result.errors, `chunk row ${rowNumber} must populate all three action-EV cells together.`);
      continue;
    }
    if (reviewFields === 1) {
      addError(result.errors, `chunk row ${rowNumber} must populate reviewer and reviewedAt together.`);
      continue;
    }
    if (strategyFields === 0 && actionEvFields === 0) {
      addError(result.errors, `chunk row ${rowNumber} has no complete strategy or action-EV payload.`);
      continue;
    }

    result.matchedRows += 1;
    const target = mergedRows[workbenchIndex];
    let changed = false;
    let conflict = false;
    for (let columnIndex = MTT_PREFLOP_CSV_IMMUTABLE_COLUMNS; columnIndex < MTT_PREFLOP_CSV_SCAFFOLD_HEADER.length; columnIndex += 1) {
      const column = MTT_PREFLOP_CSV_SCAFFOLD_HEADER[columnIndex];
      const incoming = mergeValue(column, row[columnIndex]);
      if (incoming.length === 0) continue;
      const existing = mergeValue(column, target[columnIndex]);
      if (existing.length === 0) {
        target[columnIndex] = incoming;
        changed = true;
      } else if (existing !== incoming) {
        conflict = true;
        addError(result.errors, `chunk row ${rowNumber} conflicts with existing ${column}.`);
      }
    }
    if (conflict) result.conflictRows += 1;
    else if (changed) result.plannedChangedRows += 1;
    else result.unchangedRows += 1;
  }

  if (result.errors.length > 0) return result;
  const document = serializeCsvRows(mergedRows);
  const afterInspection = inspectMttPreflopCsvScaffold(document, packId, options);
  if (!afterInspection.current || !afterInspection.structureSafe) {
    result.errors.push("Merged workbench failed its immutable current-scaffold invariant.");
    return result;
  }
  result.afterProgress = afterInspection.progress;
  result.document = document;
  result.valid = true;
  return result;
}

function emptyProgress(): MttPreflopCsvScaffoldProgress {
  return {
    actionEvCompleteRows: 0,
    actionEvPartialRows: 0,
    contentTouchedRows: 0,
    measurable: false,
    notesEditedRows: 0,
    reviewCompleteRows: 0,
    reviewPartialRows: 0,
    sourceReferenceRows: 0,
    strategyCompleteRows: 0,
    strategyPartialRows: 0,
  };
}

function measureProgressRow(
  progress: MttPreflopCsvScaffoldProgress,
  row: readonly string[],
  schema: Exclude<MttPreflopCsvScaffoldSchema, "UNKNOWN">,
): void {
  const header: readonly string[] = schema === "CURRENT_ACTION_EV"
    ? MTT_PREFLOP_CSV_SCAFFOLD_HEADER
    : MTT_PREFLOP_CSV_LEGACY_HEADER;
  const value = (column: string) => {
    const index = header.indexOf(column);
    return index < 0 ? "" : (row[index] ?? "").trim();
  };
  const strategyValues = [value("strictActions"), value("lenientActions")];
  const strategyFields = strategyValues.filter(Boolean).length;
  if (strategyFields === strategyValues.length) progress.strategyCompleteRows += 1;
  else if (strategyFields > 0) progress.strategyPartialRows += 1;

  const actionEvValues = schema === "CURRENT_ACTION_EV"
    ? [value("actionEvsBb"), value("equivalentThresholdBb"), value("acceptableThresholdBb")]
    : [];
  const actionEvFields = actionEvValues.filter(Boolean).length;
  if (actionEvValues.length > 0 && actionEvFields === actionEvValues.length) {
    progress.actionEvCompleteRows += 1;
  } else if (actionEvFields > 0) {
    progress.actionEvPartialRows += 1;
  }

  const reviewValues = [value("reviewer"), value("reviewedAt")];
  const reviewFields = reviewValues.filter(Boolean).length;
  if (reviewFields === reviewValues.length) progress.reviewCompleteRows += 1;
  else if (reviewFields > 0) progress.reviewPartialRows += 1;

  const sourceReferencePresent = value("sourceReferenceId").length > 0;
  if (sourceReferencePresent) progress.sourceReferenceRows += 1;
  const notesEdited = value("notes") !== MTT_PREFLOP_CSV_SCAFFOLD_NOTE;
  if (notesEdited) progress.notesEditedRows += 1;

  if (
    strategyFields > 0 || actionEvFields > 0 || reviewFields > 0 ||
    sourceReferencePresent || notesEdited
  ) {
    progress.contentTouchedRows += 1;
  }
}

function currentBlankRow(
  packId: string,
  identity: ReturnType<typeof requiredPreflopIdentity>,
  position: string,
  bucket: number,
  context: string,
  handClass: string,
  options: ScaffoldBuildOptions,
): string[] {
  return [
    "HAND_CLASS_DECISION",
    packId,
    identity.tableFormat,
    identity.blindSpeed,
    identity.ante,
    identity.evModel,
    position,
    String(bucket),
    String(bucket),
    context,
    handClass,
    "",
    "",
    "",
    "",
    "",
    options.sourceReferenceId ?? "",
    options.reviewer ?? "",
    options.reviewedAt ?? "",
    MTT_PREFLOP_CSV_SCAFFOLD_NOTE,
  ];
}

function expectedBlankRow(
  packId: string,
  identity: ReturnType<typeof requiredPreflopIdentity>,
  positions: readonly string[],
  rowIndex: number,
  schema: MttPreflopCsvScaffoldSchema,
): string[] | null {
  if (schema === "UNKNOWN") return null;
  const handsPerContext = ALL_HAND_CLASSES.length;
  const rowsPerBucket = MTT_PREFLOP_ACTION_CONTEXTS.length * handsPerContext;
  const rowsPerPosition = STACK_BUCKETS.length * rowsPerBucket;
  const position = positions[Math.floor(rowIndex / rowsPerPosition)];
  const withinPosition = rowIndex % rowsPerPosition;
  const bucket = STACK_BUCKETS[Math.floor(withinPosition / rowsPerBucket)];
  const withinBucket = withinPosition % rowsPerBucket;
  const context = MTT_PREFLOP_ACTION_CONTEXTS[Math.floor(withinBucket / handsPerContext)];
  const handClass = ALL_HAND_CLASSES[withinBucket % handsPerContext];
  if (position === undefined || bucket === undefined || context === undefined || handClass === undefined) {
    return null;
  }
  const current = currentBlankRow(packId, identity, position, bucket, context, handClass, {});
  return schema === "CURRENT_ACTION_EV"
    ? current
    : current.filter((_, index) => index < 13 || index > 15);
}

function requiredPreflopIdentity(packId: string) {
  const identity = mttProductionImportIdentityFromPackId(packId);
  if (identity === null || identity.street !== "PREFLOP") {
    throw new Error(`Pack id is not a legal MTT preflop production slot: ${packId}`);
  }
  return identity;
}

interface CsvTable {
  rows: string[][];
  unclosedQuote: boolean;
}

function parseCsvTable(input: string): CsvTable {
  const rows: string[][] = [];
  const parser = forEachCsvRow(input, (row) => rows.push(row));
  if (rows.length > 0) rows[0] = removeBom(rows[0]);
  return { rows, unclosedQuote: parser.unclosedQuote };
}

function immutableRowKey(row: readonly string[]): string {
  return JSON.stringify(row.slice(0, MTT_PREFLOP_CSV_IMMUTABLE_COLUMNS));
}

function populatedFields(row: readonly string[], indexes: readonly number[]): number {
  return indexes.filter((index) => (row[index] ?? "").trim().length > 0).length;
}

function mergeValue(column: string, rawValue: string | undefined): string {
  const value = (rawValue ?? "").trim();
  if (column === "notes" && (value.length === 0 || value === MTT_PREFLOP_CSV_SCAFFOLD_NOTE)) {
    return "";
  }
  return value;
}

function serializeCsvRows(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function forEachCsvRow(input: string, visit: (row: string[]) => void): { unclosedQuote: boolean } {
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;

  const finishRow = () => {
    row.push(cellValue);
    if (row.some((cell) => cell.length > 0)) visit(row);
    row = [];
    cellValue = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === '"' && next === '"') {
      cellValue += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cellValue);
      cellValue = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      finishRow();
      continue;
    }
    cellValue += char;
  }
  if (row.length > 0 || cellValue.length > 0) finishRow();
  return { unclosedQuote: quoted };
}

function removeBom(row: string[]): string[] {
  if (row.length === 0 || !row[0].startsWith("\uFEFF")) return row;
  return [row[0].slice(1), ...row.slice(1)];
}

function sameRow(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((cell, index) => cell === expected[index]);
}

function addError(errors: string[], error: string): void {
  if (errors.length < 8) errors.push(error);
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
