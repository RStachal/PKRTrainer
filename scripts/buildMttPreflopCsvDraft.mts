import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ActionContext, ActionKey, HandLabel, Position, StackBucket } from "../src/core/types.ts";
import type { BlindSpeed, EvModel, TableFormat } from "../src/core/trainingProfile.ts";
import {
  buildMttPreflopImportReadinessReport,
  type MttPreflopImportLicenseKind,
  type MttPreflopRangePackImportInput,
  type MttPreflopImportRecord,
} from "../src/data/ranges/mttPreflopRangePackImport.ts";
import {
  buildMttPreflopImportSlotValidationReport,
  renderMttImportSlotValidationReport,
} from "../src/data/ranges/mttImportSlotValidation.ts";
import {
  mttProductionImportIdentityFromPackId,
  mttProductionImportSlotPaths,
} from "../src/data/ranges/mttImportSlotNaming.ts";
import {
  buildProductionPermissionManifestReport,
  renderProductionPermissionManifestReport,
  type ProductionPermissionLicenseKind,
  type ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";

type Confidence = "LOW" | "MEDIUM" | "HIGH";

interface CliArgs {
  csvPath: string;
  packId: string | null;
  outPath: string | null;
  permissionOutPath: string | null;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: Confidence;
  licenseKind: MttPreflopImportLicenseKind;
  licenseNote: string;
  reviewer: string;
  rightsOwner: string;
  sourceLocation: string | null;
  assumptions: readonly string[];
  searchQueries: readonly string[];
  json: boolean;
  summary: boolean;
}

interface DraftResult {
  valid: boolean;
  csvReady: boolean;
  productionReady: boolean;
  written: {
    normalized: string | null;
    permission: string | null;
  };
  csvErrors: readonly string[];
  csvWarnings: readonly string[];
  packId: string;
  rowCount: number;
  handDecisionRows: number;
  records: number;
  sourceReferenceIds: readonly string[];
  normalizedInput: MttPreflopRangePackImportInput;
  report: ReturnType<typeof buildMttPreflopImportReadinessReport>;
  slotReport: ReturnType<typeof buildMttPreflopImportSlotValidationReport>;
  permissionReport: ReturnType<typeof buildProductionPermissionManifestReport> | null;
}

type PublicReadinessReport = Omit<
  ReturnType<typeof buildMttPreflopImportReadinessReport>,
  "records"
>;

type PublicDraftResult = Omit<
  DraftResult,
  "normalizedInput" | "sourceReferenceIds" | "report"
> & {
  sourceReferenceCount: number;
  report: PublicReadinessReport;
};

const ACTION_KEYS = new Set<ActionKey>([
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
]);

const CONTEXTS = new Set<ActionContext>([
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
]);

const POSITIONS = new Set<Position>(["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
const STACK_BUCKETS = new Set<StackBucket>([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150]);

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:preflop-csv-draft -- --csv <records.csv> --out artifacts/mtt-preflop-csv-draft/normalized.json",
    "  npm run mtt:preflop-csv-draft -- --csv <records.csv> --pack-id <packId> --json",
    "",
    "Optional production provenance draft:",
    "  --permission-out <permission.json> --reviewer <name> --rights-owner <name> --license-kind OWNED_SOLVER_EXPORT",
    "",
    "The CSV format is documented in Agents/range-intake/templates/mtt-preflop-records-template.README.md.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let csvPath: string | null = null;
  let packId: string | null = null;
  let outPath: string | null = null;
  let permissionOutPath: string | null = null;
  let version = "csv-draft-v1";
  let createdAt = today();
  let verifiedAt = today();
  let confidence: Confidence = "LOW";
  let licenseKind: MttPreflopImportLicenseKind = "UNKNOWN";
  let licenseNote = "CSV draft pending final provenance review.";
  let reviewer = "";
  let rightsOwner = "";
  let sourceLocation: string | null = null;
  const assumptions: string[] = [];
  const searchQueries: string[] = [];
  let json = false;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--csv") {
      csvPath = requiredValue(argv, index, "--csv");
      index += 1;
      continue;
    }
    if (item.startsWith("--csv=")) {
      csvPath = inlineValue(item, "--csv");
      continue;
    }
    if (item === "--pack-id") {
      packId = requiredValue(argv, index, "--pack-id");
      index += 1;
      continue;
    }
    if (item.startsWith("--pack-id=")) {
      packId = inlineValue(item, "--pack-id");
      continue;
    }
    if (item === "--out") {
      outPath = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (item.startsWith("--out=")) {
      outPath = inlineValue(item, "--out");
      continue;
    }
    if (item === "--permission-out") {
      permissionOutPath = requiredValue(argv, index, "--permission-out");
      index += 1;
      continue;
    }
    if (item.startsWith("--permission-out=")) {
      permissionOutPath = inlineValue(item, "--permission-out");
      continue;
    }
    if (item === "--version") {
      version = requiredValue(argv, index, "--version");
      index += 1;
      continue;
    }
    if (item.startsWith("--version=")) {
      version = inlineValue(item, "--version");
      continue;
    }
    if (item === "--created-at") {
      createdAt = requiredValue(argv, index, "--created-at");
      index += 1;
      continue;
    }
    if (item.startsWith("--created-at=")) {
      createdAt = inlineValue(item, "--created-at");
      continue;
    }
    if (item === "--verified-at") {
      verifiedAt = requiredValue(argv, index, "--verified-at");
      index += 1;
      continue;
    }
    if (item.startsWith("--verified-at=")) {
      verifiedAt = inlineValue(item, "--verified-at");
      continue;
    }
    if (item === "--confidence") {
      confidence = parseConfidence(requiredValue(argv, index, "--confidence"));
      index += 1;
      continue;
    }
    if (item.startsWith("--confidence=")) {
      confidence = parseConfidence(inlineValue(item, "--confidence"));
      continue;
    }
    if (item === "--license-kind") {
      licenseKind = parseLicenseKind(requiredValue(argv, index, "--license-kind"));
      index += 1;
      continue;
    }
    if (item.startsWith("--license-kind=")) {
      licenseKind = parseLicenseKind(inlineValue(item, "--license-kind"));
      continue;
    }
    if (item === "--license-note") {
      licenseNote = requiredValue(argv, index, "--license-note");
      index += 1;
      continue;
    }
    if (item.startsWith("--license-note=")) {
      licenseNote = inlineValue(item, "--license-note");
      continue;
    }
    if (item === "--reviewer") {
      reviewer = requiredValue(argv, index, "--reviewer");
      index += 1;
      continue;
    }
    if (item.startsWith("--reviewer=")) {
      reviewer = inlineValue(item, "--reviewer");
      continue;
    }
    if (item === "--rights-owner") {
      rightsOwner = requiredValue(argv, index, "--rights-owner");
      index += 1;
      continue;
    }
    if (item.startsWith("--rights-owner=")) {
      rightsOwner = inlineValue(item, "--rights-owner");
      continue;
    }
    if (item === "--source-location") {
      sourceLocation = requiredValue(argv, index, "--source-location");
      index += 1;
      continue;
    }
    if (item.startsWith("--source-location=")) {
      sourceLocation = inlineValue(item, "--source-location");
      continue;
    }
    if (item === "--assumption") {
      assumptions.push(requiredValue(argv, index, "--assumption"));
      index += 1;
      continue;
    }
    if (item.startsWith("--assumption=")) {
      assumptions.push(inlineValue(item, "--assumption"));
      continue;
    }
    if (item === "--search-query") {
      searchQueries.push(requiredValue(argv, index, "--search-query"));
      index += 1;
      continue;
    }
    if (item.startsWith("--search-query=")) {
      searchQueries.push(inlineValue(item, "--search-query"));
      continue;
    }
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (csvPath === null) throw new Error(usage());

  return {
    csvPath,
    packId,
    outPath,
    permissionOutPath,
    version,
    createdAt,
    verifiedAt,
    confidence,
    licenseKind,
    licenseNote,
    reviewer,
    rightsOwner,
    sourceLocation,
    assumptions,
    searchQueries,
    json,
    summary,
  };
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const rows = parseCsv(readFileSync(args.csvPath, "utf8"));
  const result = buildDraft(args, rows);

  if (args.outPath !== null) {
    writeJson(args.outPath, normalizedFromResult(result));
    result.written.normalized = resolve(args.outPath);
  }

  if (args.permissionOutPath !== null) {
    const permission = buildPermissionManifest(args, result);
    writeJson(args.permissionOutPath, permission);
    result.written.permission = resolve(args.permissionOutPath);
    result.permissionReport = buildProductionPermissionManifestReport(permission, {
      packId: result.packId,
      licenseKind: result.normalizedInput.licenseKind,
      blindSpeeds: [result.normalizedInput.dimensions.blindSpeed],
      evModels: [result.normalizedInput.dimensions.evModel],
    });
    result.valid = result.csvReady && result.productionReady && result.slotReport.valid && result.permissionReport.valid;
  }

  if (args.json) {
    console.log(JSON.stringify(publicResult(result), null, 2));
  } else if (args.summary) {
    console.log(renderSummary(result));
  } else {
    console.log(renderText(result));
  }

  if (!result.valid) process.exitCode = 1;
}

function buildDraft(args: CliArgs, rows: readonly Record<string, string>[]): DraftResult {
  const csvErrors: string[] = [];
  const csvWarnings: string[] = [];
  const decisionRows = rows.filter((row) => {
    const rowKind = cell(row, "rowKind");
    return rowKind.length === 0 || rowKind === "HAND_CLASS_DECISION";
  });
  const ignoredRows = rows.length - decisionRows.length;
  if (ignoredRows > 0) csvWarnings.push(`Ignored ${ignoredRows} non-HAND_CLASS_DECISION rows.`);

  const packIds = unique(decisionRows.map((row) => cell(row, "packId")).filter(Boolean));
  const packId = args.packId ?? (packIds.length === 1 ? packIds[0] : "");
  if (packId.length === 0) {
    csvErrors.push("CSV must contain exactly one packId, or pass --pack-id.");
  }
  if (args.packId !== null && packIds.some((id) => id !== args.packId)) {
    csvErrors.push(`CSV contains packId values outside --pack-id ${args.packId}: ${packIds.filter((id) => id !== args.packId).join(",")}.`);
  }

  const identity = mttProductionImportIdentityFromPackId(packId);
  if (identity === null || identity.street !== "PREFLOP") {
    csvErrors.push(`packId is not a legal MTT preflop production slot: ${packId || "none"}.`);
  }

  const sourceReferenceIds = unique(decisionRows.map((row) => cell(row, "sourceReferenceId")).filter(Boolean));
  if (sourceReferenceIds.length === 0) csvWarnings.push("CSV has no sourceReferenceId values.");

  const records = rowsToRecords(decisionRows, csvErrors, {
    packId,
    tableFormat: identity?.tableFormat ?? null,
    blindSpeed: identity?.blindSpeed ?? null,
    evModel: identity?.evModel ?? null,
    ante: identity?.ante ?? null,
  });
  const input = buildInput(args, packId || "invalid-pack-id", identity, records, sourceReferenceIds);
  const report = buildMttPreflopImportReadinessReport(input);
  const slotReport = buildMttPreflopImportSlotValidationReport(input);

  const result: DraftResult = {
    valid: false,
    csvReady: csvErrors.length === 0,
    productionReady: report.productionReady,
    written: { normalized: null, permission: null },
    csvErrors,
    csvWarnings,
    packId: input.id,
    rowCount: rows.length,
    handDecisionRows: decisionRows.length,
    records: input.records.length,
    sourceReferenceIds,
    normalizedInput: input,
    report,
    slotReport,
    permissionReport: null,
  };
  result.valid = result.csvReady && result.productionReady && result.slotReport.valid;
  return result;
}

function rowsToRecords(
  rows: readonly Record<string, string>[],
  errors: string[],
  expected: {
    packId: string;
    tableFormat: TableFormat | null;
    blindSpeed: BlindSpeed | null;
    evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV"> | null;
    ante: string | null;
  },
): MttPreflopImportRecord[] {
  const groups = new Map<string, {
    position: Position;
    sourceStackBB: number;
    bucket: StackBucket;
    context: ActionContext;
    strict: Record<HandLabel, ActionKey[]>;
    lenient: Record<HandLabel, ActionKey[]>;
    hands: Set<string>;
  }>();

  rows.forEach((row, rowIndex) => {
    const tag = `row ${rowIndex + 2}`;
    if (expected.packId && cell(row, "packId") !== expected.packId) return;
    if (expected.tableFormat !== null) checkCell(row, "tableFormat", expected.tableFormat, tag, errors);
    if (expected.blindSpeed !== null) checkCell(row, "blindSpeed", expected.blindSpeed, tag, errors);
    if (expected.evModel !== null) checkCell(row, "evModel", expected.evModel, tag, errors);
    if (expected.ante !== null) checkCell(row, "ante", expected.ante, tag, errors);

    const position = parsePosition(cell(row, "position"), tag, errors);
    const sourceStackBB = parsePositiveNumber(cell(row, "sourceStackBB"), `${tag}.sourceStackBB`, errors);
    const bucket = parseBucket(cell(row, "bucket"), tag, errors);
    const context = parseContext(cell(row, "context"), tag, errors);
    const handClass = cell(row, "handClass");
    const strict = parseActions(cell(row, "strictActions"), `${tag}.strictActions`, errors);
    const lenient = parseActions(cell(row, "lenientActions"), `${tag}.lenientActions`, errors);

    if (handClass.length === 0) errors.push(`${tag}.handClass is required.`);
    if (position === null || sourceStackBB === null || bucket === null || context === null || handClass.length === 0) return;
    if (strict.length === 0) errors.push(`${tag}.strictActions needs at least one action.`);
    if (lenient.length === 0) errors.push(`${tag}.lenientActions needs at least one action.`);
    for (const action of strict) {
      if (!lenient.includes(action)) errors.push(`${tag}.strictActions ${action} is missing from lenientActions.`);
    }

    const key = `${position}|${bucket}|${context}`;
    const group = groups.get(key) ?? {
      position,
      sourceStackBB,
      bucket,
      context,
      strict: {},
      lenient: {},
      hands: new Set<string>(),
    };
    if (group.sourceStackBB !== sourceStackBB) {
      errors.push(`${tag} uses sourceStackBB ${sourceStackBB} but group ${key} already uses ${group.sourceStackBB}.`);
    }
    if (group.hands.has(handClass)) {
      errors.push(`${tag} duplicates handClass ${handClass} in ${key}.`);
    }
    group.hands.add(handClass);
    group.strict[handClass] = strict;
    group.lenient[handClass] = lenient;
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => ({
    position: group.position,
    sourceStackBB: group.sourceStackBB,
    bucket: group.bucket,
    context: group.context,
    strict: group.strict,
    lenient: group.lenient,
  }));
}

function buildInput(
  args: CliArgs,
  packId: string,
  identity: ReturnType<typeof mttProductionImportIdentityFromPackId>,
  records: readonly MttPreflopImportRecord[],
  sourceReferenceIds: readonly string[],
): MttPreflopRangePackImportInput {
  const dimensions = {
    gameVariant: "MTT" as const,
    tableFormat: identity?.tableFormat ?? "FULL_RING_9",
    blindSpeed: identity?.blindSpeed ?? "REGULAR",
    street: "PREFLOP" as const,
    evModel: identity?.evModel ?? "CHIP_EV",
    ante: identity?.ante ?? "ON",
    rakeMode: "NONE" as const,
  };
  const assumptions = args.assumptions.length > 0
    ? [...args.assumptions]
    : [
      `CSV draft for MTT ${dimensions.tableFormat} ${dimensions.blindSpeed} ${dimensions.evModel} ante ${dimensions.ante}.`,
      "Source stack depths map to explicit PKRTrainer stack buckets.",
    ];

  return {
    contentLanguage: "cs",
    id: packId,
    version: args.version,
    createdAt: args.createdAt,
    verifiedAt: args.verifiedAt,
    dimensions,
    confidence: args.confidence,
    licenseKind: args.licenseKind,
    licenseNote: args.licenseNote,
    assumptions,
    searchQueries: [...args.searchQueries],
    sourceEvidence: sourceReferenceIds.map((referenceId) => ({
      title: `CSV source reference ${referenceId}`,
      url: `https://pkrtrainer.local/range-intake/${encodeURIComponent(referenceId)}`,
      provider: "PKRTrainer private CSV intake",
      verifiedAt: args.verifiedAt,
      licenseNote: args.licenseNote,
      methodologyNote: "Source-free reference id from private CSV intake.",
    })),
    records,
  };
}

function buildPermissionManifest(
  args: CliArgs,
  result: DraftResult,
): ProductionPermissionManifest {
  const sourceLocation = args.sourceLocation ?? mttProductionImportSlotPaths(result.packId).rawInputFolder;
  const reviewedAt = args.verifiedAt;
  const reviewer = args.reviewer || "UNREVIEWED_CSV_DRAFT";
  const rightsOwner = args.rightsOwner || "UNREVIEWED_CSV_DRAFT";
  const licenseKind: ProductionPermissionLicenseKind =
    args.licenseKind === "OWNED_SOLVER_EXPORT" ||
    args.licenseKind === "PUBLIC_CHART_WITH_PERMISSION" ||
    args.licenseKind === "EXPLICIT_WRITTEN_PERMISSION"
      ? args.licenseKind
      : "OWNED_SOLVER_EXPORT";
  return {
    packId: result.packId,
    version: `${args.version}-permission`,
    reviewedAt,
    reviewer,
    rightsOwner,
    licenseKind,
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: sourceLocation,
    evidence: (result.sourceReferenceIds.length > 0 ? result.sourceReferenceIds : ["csv-draft-source"]).map((referenceId) => ({
      referenceId,
      storedAt: sourceLocation,
      reviewer,
      description: `Private CSV source reference ${referenceId}.`,
      containsRangeValues: true,
    })),
    notes: [
      "Generated from MTT preflop CSV draft tooling.",
      "Review the source-free normalized output before production promotion.",
    ],
  };
}

function normalizedFromResult(result: DraftResult): MttPreflopRangePackImportInput {
  return result.normalizedInput;
}

function renderText(result: DraftResult): string {
  return [
    renderSummary(result),
    "",
    renderPublicReadinessReport(publicReadinessReport(result.report)),
    "",
    renderMttImportSlotValidationReport(result.slotReport),
    result.permissionReport ? ["", renderProductionPermissionManifestReport(result.permissionReport)].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function renderSummary(result: DraftResult): string {
  return [
    `MTT preflop CSV draft: ${result.packId}`,
    `valid: ${result.valid}`,
    `csvReady: ${result.csvReady}`,
    `productionReady: ${result.productionReady}`,
    `rows: ${result.handDecisionRows}/${result.rowCount}`,
    `records: ${result.records}`,
    `sources: ${result.sourceReferenceIds.length}`,
    `normalized: ${result.written.normalized ?? "not written"}`,
    `permission: ${result.written.permission ?? "not written"}`,
    ...result.csvErrors.map((error) => `csv error: ${error}`),
    ...result.csvWarnings.map((warning) => `csv warning: ${warning}`),
  ].join("\n");
}

function publicResult(result: DraftResult): PublicDraftResult {
  const {
    normalizedInput: _normalizedInput,
    sourceReferenceIds,
    report,
    ...safe
  } = result;
  return {
    ...safe,
    sourceReferenceCount: sourceReferenceIds.length,
    report: publicReadinessReport(report),
  };
}

function publicReadinessReport(
  report: ReturnType<typeof buildMttPreflopImportReadinessReport>,
): PublicReadinessReport {
  const { records: _records, ...safe } = report;
  return safe;
}

function renderPublicReadinessReport(report: PublicReadinessReport): string {
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

  return lines.join("\n");
}

function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;
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
      row.push(cellValue);
      if (row.some((item) => item.trim().length > 0)) rows.push(row);
      row = [];
      cellValue = "";
      continue;
    }
    cellValue += char;
  }
  row.push(cellValue);
  if (row.some((item) => item.trim().length > 0)) rows.push(row);
  const [header, ...body] = rows;
  if (header === undefined) return [];
  return body.map((line) => Object.fromEntries(header.map((key, index) => [key.trim(), line[index]?.trim() ?? ""])));
}

function writeJson(path: string, value: unknown): void {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cell(row: Record<string, string>, key: string): string {
  return (row[key] ?? "").trim();
}

function checkCell(
  row: Record<string, string>,
  key: string,
  expected: string,
  tag: string,
  errors: string[],
): void {
  const actual = cell(row, key);
  if (actual !== expected) errors.push(`${tag}.${key} expected ${expected}, got ${actual || "empty"}.`);
}

function parsePosition(value: string, tag: string, errors: string[]): Position | null {
  if (POSITIONS.has(value as Position)) return value as Position;
  errors.push(`${tag}.position is not supported: ${value || "empty"}.`);
  return null;
}

function parseBucket(value: string, tag: string, errors: string[]): StackBucket | null {
  const parsed = Number(value);
  if (STACK_BUCKETS.has(parsed as StackBucket)) return parsed as StackBucket;
  errors.push(`${tag}.bucket is not supported: ${value || "empty"}.`);
  return null;
}

function parseContext(value: string, tag: string, errors: string[]): ActionContext | null {
  if (CONTEXTS.has(value as ActionContext)) return value as ActionContext;
  errors.push(`${tag}.context is not supported: ${value || "empty"}.`);
  return null;
}

function parsePositiveNumber(value: string, tag: string, errors: string[]): number | null {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  errors.push(`${tag} must be a positive number.`);
  return null;
}

function parseActions(value: string, tag: string, errors: string[]): ActionKey[] {
  const actions = unique(value.split("|").map((item) => item.trim()).filter(Boolean));
  for (const action of actions) {
    if (!ACTION_KEYS.has(action as ActionKey)) errors.push(`${tag} contains unsupported action ${action}.`);
  }
  return actions.filter((action) => ACTION_KEYS.has(action as ActionKey)) as ActionKey[];
}

function parseConfidence(value: string): Confidence {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") return value;
  throw new Error(`Unsupported --confidence value: ${value}`);
}

function parseLicenseKind(value: string): MttPreflopImportLicenseKind {
  if (
    value === "OWNED_SOLVER_EXPORT" ||
    value === "PUBLIC_CHART_WITH_PERMISSION" ||
    value === "EXPLICIT_WRITTEN_PERMISSION" ||
    value === "PUBLIC_METADATA_ONLY" ||
    value === "UNKNOWN"
  ) return value;
  throw new Error(`Unsupported --license-kind value: ${value}`);
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1] ?? "";
  if (value.length === 0 || value.startsWith("-")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length);
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
