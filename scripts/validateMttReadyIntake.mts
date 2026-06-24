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
import {
  MTT_INTAKE_PRIORITY_KEYS,
  mttIntakePriorityForProfile,
  parseMttIntakePriority,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";
import { buildRangeModuleDryRunCommand } from "../src/data/ranges/rangeImportCommands.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  failOnEmpty: boolean;
  json: boolean;
  priority: MttIntakePriorityKey | null;
}

interface ReadyValidationRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  packId: string;
  kind: RangeModuleBuildKind;
  normalizedInputPath: string;
  permissionManifestPath: string;
  buildCommand: string;
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
  priority: MttIntakePriorityKey | null;
  valid: boolean;
  counts: {
    readyRows: number;
    waitingRows: number;
    missingNormalized: number;
    missingPermission: number;
    validRows: number;
    failedRows: number;
  };
  nextActionCommand: string;
  rows: readonly ReadyValidationRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:validate-ready-intake",
    "  npm run mtt:validate-ready-intake -- --json",
    "  npm run mtt:validate-ready-intake -- --fail-on-empty",
    "  npm run mtt:validate-ready-intake -- --priority=P1_PREFLOP_CHIP_EV --json",
    "  npm run mtt:validate-ready-intake -- --priority=P2_PREFLOP_DOLAR_EV --json",
    "  npm run mtt:validate-ready-intake -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --json",
    "  --fail-on-empty",
    `  --priority=${MTT_INTAKE_PRIORITY_KEYS.join("|")}`,
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
  let priority: MttIntakePriorityKey | null = null;

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
    if (item.startsWith("--priority=")) {
      priority = parseMttIntakePriority(item.slice("--priority=".length), usage);
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, failOnEmpty, json, priority };
}

function buildReadyValidationReport(args: CliArgs): ReadyValidationReport {
  const readiness = filterMttCompletionReadinessReport(
    buildMttCompletionReadinessReport(),
    args.filters,
  );
  const queueRows = readiness.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .filter((row) => matchesPriority(row, args.priority));
  const readyRows = queueRows
    .filter((row) => isReady(row.importSlot as MttCompletionImportSlotHint));
  const rows = readyRows
    .map(validateReadyRow);
  const failedRows = rows.filter((row) => !row.valid).length;
  const valid = failedRows === 0 && (!args.failOnEmpty || rows.length > 0);
  const missingNormalized = queueRows.filter((row) => {
    const importSlot = row.importSlot as MttCompletionImportSlotHint;
    return !existsSync(importSlot.normalizedInputPath);
  }).length;
  const missingPermission = queueRows.filter((row) => {
    const importSlot = row.importSlot as MttCompletionImportSlotHint;
    return !existsSync(importSlot.permissionManifestPath);
  }).length;

  return {
    filters: args.filters,
    priority: args.priority,
    valid,
    counts: {
      readyRows: rows.length,
      waitingRows: queueRows.length - readyRows.length,
      missingNormalized,
      missingPermission,
      validRows: rows.length - failedRows,
      failedRows,
    },
    nextActionCommand: "npm run mtt:next-action",
    rows,
  };
}

function matchesPriority(
  row: MttCompletionReadinessRow,
  priority: MttIntakePriorityKey | null,
): boolean {
  if (priority === null || priority === "P0_READY_FOR_VALIDATION") return true;
  return mttIntakePriorityForProfile(row, false) === priority;
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
      priority: mttIntakePriorityForProfile(row, false),
      slotId: importSlot.slotId,
      packId: importSlot.packId,
      kind: importSlot.kind,
      normalizedInputPath: importSlot.normalizedInputPath,
      permissionManifestPath: importSlot.permissionManifestPath,
      buildCommand: buildRangeModuleDryRunCommand(importSlot),
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
      priority: mttIntakePriorityForProfile(row, false),
      slotId: importSlot.slotId,
      packId: importSlot.packId,
      kind: importSlot.kind,
      normalizedInputPath: importSlot.normalizedInputPath,
      permissionManifestPath: importSlot.permissionManifestPath,
      buildCommand: buildRangeModuleDryRunCommand(importSlot),
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
    `priority: ${report.priority ?? "all"}`,
    `valid: ${report.valid}`,
    `ready rows: ${report.counts.readyRows}`,
    `waiting rows: ${report.counts.waitingRows}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `valid rows: ${report.counts.validRows}`,
    `failed rows: ${report.counts.failedRows}`,
    `next action: ${report.nextActionCommand}`,
  ];

  for (const row of report.rows) {
    lines.push(`${row.priority} | ${row.slotId} | ${row.kind} | ${row.writeReady ? "WRITE_READY" : "BLOCKED"}`);
    lines.push(`  pack: ${row.packId}`);
    lines.push(`  input: ${row.normalizedInputPath}`);
    lines.push(`  permission: ${row.permissionManifestPath}`);
    lines.push(`  build dry-run: ${row.buildCommand}`);
    lines.push(`  productionReady: ${row.productionReady}`);
    lines.push(`  permissionReady: ${row.permissionReady}`);
    lines.push(`  matched import slots: ${row.matchedImportSlots}`);
    if (row.error !== null) lines.push(`  error: ${row.error}`);
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
