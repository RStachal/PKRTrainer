import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
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
import {
  buildRangeModuleDryRunCommand,
  validateRangeImportCommand,
} from "../src/data/ranges/rangeImportCommands.ts";
import { refreshMttProductionRegistry } from "./mttProductionRegistryFile.mts";

const WRITE_CONFIRMATION = "WRITE_READY_MTT_MODULES";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  force: boolean;
  json: boolean;
  mode: "dry-run" | "write";
  priority: MttIntakePriorityKey | null;
  confirmation: string | null;
}

interface PromotionRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  packId: string;
  kind: RangeModuleBuildKind;
  normalizedInputPath: string;
  permissionManifestPath: string;
  outputModulePath: string;
  exportName: string | null;
  validateCommand: string;
  buildCommand: string;
  writeCommand: string;
  writeReady: boolean;
  productionReady: boolean;
  permissionReady: boolean;
  matchedImportSlots: number;
  plannedAction: "WRITE" | "SKIP_BLOCKED" | "SKIP_EXISTS";
  written: boolean;
  blockers: readonly string[];
  error: string | null;
}

interface PromotionReport {
  mode: "dry-run" | "write";
  valid: boolean;
  filters: MttCompletionReadinessFilters;
  priority: MttIntakePriorityKey | null;
  force: boolean;
  registryRefreshed: boolean;
  counts: {
    readyRows: number;
    waitingRows: number;
    missingNormalized: number;
    missingPermission: number;
    writeReadyRows: number;
    blockedRows: number;
    existingOutputRows: number;
    writtenRows: number;
  };
  nextActionCommand: string;
  rows: readonly PromotionRow[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildPromotionReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderPromotionReport(report));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:promote-ready",
    "  npm run mtt:promote-ready -- --json",
    "  npm run mtt:promote-ready -- --priority=P1_PREFLOP_CHIP_EV --dry-run",
    "  npm run mtt:promote-ready -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    `  npm run mtt:promote-ready -- --write --confirm=${WRITE_CONFIRMATION}`,
    `  npm run mtt:promote-ready -- --write --force --confirm=${WRITE_CONFIRMATION}`,
    "",
    "Output:",
    "  --json",
    "  --dry-run",
    "  --write",
    "  --force",
    `  --confirm=${WRITE_CONFIRMATION}`,
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

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let force = false;
  let json = false;
  let mode: CliArgs["mode"] = "dry-run";
  let priority: MttIntakePriorityKey | null = null;
  let confirmation: string | null = null;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--dry-run") {
      mode = setMode(mode, "dry-run");
      continue;
    }
    if (item === "--write") {
      mode = setMode(mode, "write");
      continue;
    }
    if (item === "--force") {
      force = true;
      continue;
    }
    if (item.startsWith("--confirm=")) {
      confirmation = item.slice("--confirm=".length);
      continue;
    }
    if (item.startsWith("--priority=")) {
      priority = parseMttIntakePriority(item.slice("--priority=".length), usage);
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (mode === "write" && confirmation !== WRITE_CONFIRMATION) {
    throw new Error(`Writing ready MTT modules requires --confirm=${WRITE_CONFIRMATION}.\n\n${usage()}`);
  }

  return { filters, force, json, mode, priority, confirmation };
}

function setMode(current: CliArgs["mode"], next: CliArgs["mode"]): CliArgs["mode"] {
  if (current !== "dry-run" && current !== next) {
    throw new Error(`Use only one of --dry-run or --write.\n\n${usage()}`);
  }
  return next;
}

function buildPromotionReport(args: CliArgs): PromotionReport {
  const readiness = filterMttCompletionReadinessReport(buildMttCompletionReadinessReport(), args.filters);
  const queueRows = readiness.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .filter((row) => matchesPriority(row, args.priority));
  const readyRows = queueRows.filter((row) => isReady(row.importSlot as MttCompletionImportSlotHint));
  const rows = readyRows
    .map((row) => buildPromotionRow(row, args));
  const writeReadyRows = rows.filter((row) => row.writeReady);
  const blockedRows = rows.filter((row) => !row.writeReady).length;
  const existingOutputRows = rows.filter((row) => row.plannedAction === "SKIP_EXISTS").length;
  const valid = blockedRows === 0 && existingOutputRows === 0;
  const missingNormalized = queueRows.filter((row) => {
    const importSlot = row.importSlot as MttCompletionImportSlotHint;
    return !existsSync(importSlot.normalizedInputPath);
  }).length;
  const missingPermission = queueRows.filter((row) => {
    const importSlot = row.importSlot as MttCompletionImportSlotHint;
    return !existsSync(importSlot.permissionManifestPath);
  }).length;
  const registryRefreshed = (
    args.mode === "write" &&
    rows.some((row) => row.written) &&
    refreshMttProductionRegistry({ write: true }).changed
  );

  return {
    mode: args.mode,
    valid,
    filters: args.filters,
    priority: args.priority,
    force: args.force,
    registryRefreshed,
    counts: {
      readyRows: rows.length,
      waitingRows: queueRows.length - readyRows.length,
      missingNormalized,
      missingPermission,
      writeReadyRows: writeReadyRows.length,
      blockedRows,
      existingOutputRows,
      writtenRows: rows.filter((row) => row.written).length,
    },
    nextActionCommand: "npm run mtt:next-action",
    rows,
  };
}

function isReady(importSlot: MttCompletionImportSlotHint): boolean {
  return existsSync(importSlot.normalizedInputPath) && existsSync(importSlot.permissionManifestPath);
}

function matchesPriority(
  row: MttCompletionReadinessRow,
  priority: MttIntakePriorityKey | null,
): boolean {
  if (priority === null || priority === "P0_READY_FOR_VALIDATION") return true;
  return mttIntakePriorityForProfile(row, false) === priority;
}

function buildPromotionRow(row: MttCompletionReadinessRow, args: CliArgs): PromotionRow {
  const importSlot = row.importSlot as MttCompletionImportSlotHint;
  const outputModulePath = outputPathForPack(importSlot.packId);
  try {
    const input = readJson(importSlot.normalizedInputPath) as RangeModuleBuildInput["input"];
    const permissionManifest = readJson(importSlot.permissionManifestPath) as ProductionPermissionManifest;
    const result = buildRangeModule({
      kind: importSlot.kind,
      input,
      permissionManifest,
    });
    const exists = existsSync(outputModulePath);
    const plannedAction = !result.writeReady
      ? "SKIP_BLOCKED"
      : exists && !args.force
        ? "SKIP_EXISTS"
        : "WRITE";
    const written = args.mode === "write" && plannedAction === "WRITE" && result.moduleText !== null;
    if (written && result.moduleText !== null) writeModule(outputModulePath, result.moduleText);

    return {
      priority: mttIntakePriorityForProfile(row, false),
      slotId: importSlot.slotId,
      packId: importSlot.packId,
      kind: importSlot.kind,
      normalizedInputPath: importSlot.normalizedInputPath,
      permissionManifestPath: importSlot.permissionManifestPath,
      outputModulePath,
      exportName: result.exportName,
      validateCommand: validateRangeImportCommand(importSlot),
      buildCommand: buildRangeModuleDryRunCommand(importSlot),
      writeCommand: writeCommand(importSlot, outputModulePath, args.force),
      writeReady: result.writeReady,
      productionReady: result.productionReady,
      permissionReady: result.permissionReady,
      matchedImportSlots: result.matchedImportSlots.length,
      plannedAction,
      written,
      blockers: plannedAction === "SKIP_EXISTS"
        ? [`Output module already exists: ${outputModulePath}. Use --force to overwrite.`]
        : result.blockers,
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
      outputModulePath,
      exportName: null,
      validateCommand: validateRangeImportCommand(importSlot),
      buildCommand: buildRangeModuleDryRunCommand(importSlot),
      writeCommand: writeCommand(importSlot, outputModulePath, args.force),
      writeReady: false,
      productionReady: false,
      permissionReady: false,
      matchedImportSlots: 0,
      plannedAction: "SKIP_BLOCKED",
      written: false,
      blockers: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function outputPathForPack(packId: string): string {
  return `src/data/ranges/${packId}.ts`;
}

function writeCommand(importSlot: MttCompletionImportSlotHint, outputModulePath: string, force: boolean): string {
  return [
    "npm run build:range-module --",
    `--kind=${importSlot.kind}`,
    `--permission-manifest ${importSlot.permissionManifestPath}`,
    `--out ${outputModulePath}`,
    force ? "--force" : null,
    importSlot.normalizedInputPath,
  ].filter((part): part is string => part !== null).join(" ");
}

function writeModule(path: string, moduleText: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, moduleText, "utf8");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function renderPromotionReport(report: PromotionReport): string {
  const lines = [
    "MTT ready intake promotion",
    `mode: ${report.mode}`,
    `valid: ${report.valid}`,
    `priority: ${report.priority ?? "all"}`,
    `force: ${report.force}`,
    `registry refreshed: ${report.registryRefreshed}`,
    `ready rows: ${report.counts.readyRows}`,
    `waiting rows: ${report.counts.waitingRows}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `writeReady rows: ${report.counts.writeReadyRows}`,
    `blocked rows: ${report.counts.blockedRows}`,
    `existing output rows: ${report.counts.existingOutputRows}`,
    `written rows: ${report.counts.writtenRows}`,
    `next action: ${report.nextActionCommand}`,
  ];

  for (const row of report.rows) {
    lines.push(`${row.priority} | ${row.slotId} | ${row.kind} | ${row.plannedAction}`);
    lines.push(`  pack: ${row.packId}`);
    lines.push(`  output: ${row.outputModulePath}`);
    if (row.exportName !== null) lines.push(`  export: ${row.exportName}`);
    lines.push(`  validate: ${row.validateCommand}`);
    lines.push(`  build dry-run: ${row.buildCommand}`);
    lines.push(`  write: ${row.writeCommand}`);
    lines.push(`  productionReady: ${row.productionReady}`);
    lines.push(`  permissionReady: ${row.permissionReady}`);
    lines.push(`  matched import slots: ${row.matchedImportSlots}`);
    if (row.error !== null) lines.push(`  error: ${row.error}`);
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  if (report.mode === "dry-run") {
    lines.push(`write guard: rerun with --write --confirm=${WRITE_CONFIRMATION} to write planned modules`);
  }

  return lines.join("\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
