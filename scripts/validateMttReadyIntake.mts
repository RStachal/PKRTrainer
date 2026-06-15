import { existsSync, readFileSync } from "node:fs";
import {
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessFilters,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";
import {
  buildRangeModule,
  type RangeModuleBuildInput,
  type RangeModuleBuildKind,
} from "../src/data/ranges/rangeModuleBuilder.ts";
import type { ProductionPermissionManifest } from "../src/data/ranges/productionPermissionManifest.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  failOnEmpty: boolean;
  json: boolean;
}

interface ReadyValidationRow {
  slotId: string;
  packId: string;
  kind: RangeModuleBuildKind;
  normalizedInputPath: string;
  permissionManifestPath: string;
  valid: boolean;
  productionReady: boolean;
  permissionReady: boolean;
  writeReady: boolean;
  matchedImportSlots: number;
  blockers: readonly string[];
  error: string | null;
}

interface ReadyValidationReport {
  filters: MttCompletionReadinessFilters;
  valid: boolean;
  counts: {
    readyRows: number;
    validRows: number;
    failedRows: number;
  };
  rows: readonly ReadyValidationRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:validate-ready-intake",
    "  npm run mtt:validate-ready-intake -- --json",
    "  npm run mtt:validate-ready-intake -- --fail-on-empty",
    "  npm run mtt:validate-ready-intake -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --json",
    "  --fail-on-empty",
    "",
    "Filters:",
    "  --format=FULL_RING_9|SIX_MAX",
    "  --speed=REGULAR|TURBO",
    "  --ev=CHIP_EV|DOLAR_EV",
    "  --street=PREFLOP|FLOP|TURN|RIVER",
    "  --ante=ON|OFF",
    "  --status=candidate|missing|non-production|preview|blocked",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReadyValidationReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReadyValidationReport(report));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let failOnEmpty = false;
  let json = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--fail-on-empty") {
      failOnEmpty = true;
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, failOnEmpty, json };
}

function buildReadyValidationReport(args: CliArgs): ReadyValidationReport {
  const readiness = filterMttCompletionReadinessReport(
    buildMttCompletionReadinessReport(),
    args.filters,
  );
  const rows = readiness.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .filter((row) => isReady(row.importSlot as MttCompletionImportSlotHint))
    .map(validateReadyRow);
  const failedRows = rows.filter((row) => !row.valid).length;
  const valid = failedRows === 0 && (!args.failOnEmpty || rows.length > 0);

  return {
    filters: args.filters,
    valid,
    counts: {
      readyRows: rows.length,
      validRows: rows.length - failedRows,
      failedRows,
    },
    rows,
  };
}

function isReady(importSlot: MttCompletionImportSlotHint): boolean {
  return existsSync(importSlot.normalizedInputPath) && existsSync(importSlot.permissionManifestPath);
}

function validateReadyRow(row: MttCompletionReadinessRow): ReadyValidationRow {
  const importSlot = row.importSlot as MttCompletionImportSlotHint;
  try {
    const input = readJson(importSlot.normalizedInputPath) as RangeModuleBuildInput["input"];
    const permissionManifest = readJson(importSlot.permissionManifestPath) as ProductionPermissionManifest;
    const result = buildRangeModule({
      kind: importSlot.kind,
      input,
      permissionManifest,
    });

    return {
      slotId: importSlot.slotId,
      packId: importSlot.packId,
      kind: importSlot.kind,
      normalizedInputPath: importSlot.normalizedInputPath,
      permissionManifestPath: importSlot.permissionManifestPath,
      valid: result.writeReady,
      productionReady: result.productionReady,
      permissionReady: result.permissionReady,
      writeReady: result.writeReady,
      matchedImportSlots: result.matchedImportSlots.length,
      blockers: result.blockers,
      error: null,
    };
  } catch (error) {
    return {
      slotId: importSlot.slotId,
      packId: importSlot.packId,
      kind: importSlot.kind,
      normalizedInputPath: importSlot.normalizedInputPath,
      permissionManifestPath: importSlot.permissionManifestPath,
      valid: false,
      productionReady: false,
      permissionReady: false,
      writeReady: false,
      matchedImportSlots: 0,
      blockers: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function renderReadyValidationReport(report: ReadyValidationReport): string {
  const lines = [
    "MTT ready intake validation",
    `valid: ${report.valid}`,
    `ready rows: ${report.counts.readyRows}`,
    `valid rows: ${report.counts.validRows}`,
    `failed rows: ${report.counts.failedRows}`,
  ];

  for (const row of report.rows) {
    lines.push(`${row.slotId} | ${row.kind} | ${row.writeReady ? "WRITE_READY" : "BLOCKED"}`);
    lines.push(`  pack: ${row.packId}`);
    lines.push(`  input: ${row.normalizedInputPath}`);
    lines.push(`  permission: ${row.permissionManifestPath}`);
    lines.push(`  productionReady: ${row.productionReady}`);
    lines.push(`  permissionReady: ${row.permissionReady}`);
    lines.push(`  matched import slots: ${row.matchedImportSlots}`);
    if (row.error !== null) lines.push(`  error: ${row.error}`);
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
}
