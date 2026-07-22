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

export interface MttPreflopCsvScaffoldDocument {
  completeSlotRows: number;
  document: string;
  rows: number;
}

export interface MttPreflopCsvScaffoldInspection {
  actionEvColumnsPresent: boolean;
  bodyRows: number;
  current: boolean;
  errors: string[];
  expectedRows: number;
  refreshableBlank: boolean;
  schema: MttPreflopCsvScaffoldSchema;
  sourceSafeBlank: boolean;
  stale: boolean;
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
  let schema: MttPreflopCsvScaffoldSchema = "UNKNOWN";
  let bodyRows = 0;
  let sourceSafeBlank = true;
  let headerSeen = false;

  const parser = forEachCsvRow(input, (rawRow) => {
    const row = headerSeen ? rawRow : removeBom(rawRow);
    if (!headerSeen) {
      headerSeen = true;
      if (sameRow(row, MTT_PREFLOP_CSV_SCAFFOLD_HEADER)) schema = "CURRENT_ACTION_EV";
      else if (sameRow(row, MTT_PREFLOP_CSV_LEGACY_HEADER)) schema = "LEGACY_NO_ACTION_EV";
      else {
        sourceSafeBlank = false;
        addError(errors, "CSV header is not a supported current or legacy blank scaffold header.");
      }
      return;
    }

    const expected = expectedBlankRow(packId, identity, positions, bodyRows, schema);
    if (expected === null || !sameRow(row, expected)) {
      sourceSafeBlank = false;
      addError(errors, `row ${bodyRows + 2} differs from the generated blank scaffold.`);
    }
    bodyRows += 1;
  });

  if (!headerSeen) {
    sourceSafeBlank = false;
    addError(errors, "CSV is empty.");
  }
  if (parser.unclosedQuote) {
    sourceSafeBlank = false;
    addError(errors, "CSV contains an unclosed quoted cell.");
  }
  if (bodyRows !== expectedRows) {
    sourceSafeBlank = false;
    addError(errors, `blank scaffold row count is ${bodyRows}; expected ${expectedRows}.`);
  }
  if (schema === "UNKNOWN") sourceSafeBlank = false;

  const finalSchema = schema as MttPreflopCsvScaffoldSchema;
  const current = finalSchema === "CURRENT_ACTION_EV";
  const stale = !current;
  return {
    actionEvColumnsPresent: current,
    bodyRows,
    current,
    errors,
    expectedRows,
    refreshableBlank: finalSchema === "LEGACY_NO_ACTION_EV" && sourceSafeBlank,
    schema: finalSchema,
    sourceSafeBlank,
    stale,
  };
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
