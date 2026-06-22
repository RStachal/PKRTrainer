import { existsSync } from "node:fs";
import {
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessFilters,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";
import {
  emptyMttIntakePriorityCounts,
  MTT_INTAKE_PRIORITY_KEYS,
  mttIntakePriorityForProfile,
  mttIntakePriorityRank,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";
import {
  buildRangeModuleDryRunCommand,
  validateRangeImportCommand,
} from "../src/data/ranges/rangeImportCommands.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
}

interface NextMttActionRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  currentPackId: string | null;
  packId: string;
  rawInputFolder: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
  missingFiles: readonly string[];
  blockers: readonly string[];
  commands: {
    validate: string;
    buildDryRun: string;
  };
}

interface NextMttActionReport {
  valid: boolean;
  state: "COMPLETE" | "READY_FOR_VALIDATION" | "WAITING_FOR_FILES";
  filters: MttCompletionReadinessFilters;
  counts: {
    blockerRows: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<MttIntakePriorityKey, number>;
  };
  nextAction: NextMttActionRow | null;
  followUpCommands: readonly string[];
  sourceReports: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildNextMttActionReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderNextMttActionReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:next-action",
    "  npm run mtt:next-action -- --json",
    "  npm run mtt:next-action -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER",
    "",
    "Filters:",
    "  --format=FULL_RING_9|SIX_MAX",
    "  --speed=REGULAR|TURBO",
    "  --ev=CHIP_EV|DOLAR_EV",
    "  --street=PREFLOP|FLOP|TURN|RIVER",
    "  --ante=ON|OFF",
    "  --status=candidate|missing|non-production|preview|blocked",
    "",
    "Output:",
    "  --json",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, json };
}

function buildNextMttActionReport(args: CliArgs): NextMttActionReport {
  const filtered = filterMttCompletionReadinessReport(buildMttCompletionReadinessReport(), args.filters);
  const rows = filtered.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .map((row) => nextMttActionRow(row, row.importSlot as MttCompletionImportSlotHint))
    .sort(compareRows);
  const nextAction = rows.find((row) => row.missingFiles.length === 0) ?? rows[0] ?? null;
  const readyForValidation = rows.filter((row) => row.missingFiles.length === 0).length;

  return {
    valid: rows.length === 0,
    state: nextAction === null ? "COMPLETE" : nextAction.missingFiles.length === 0 ? "READY_FOR_VALIDATION" : "WAITING_FOR_FILES",
    filters: args.filters,
    counts: {
      blockerRows: rows.length,
      readyForValidation,
      missingNormalized: rows.filter((row) => row.missingFiles.includes(row.normalizedInputPath)).length,
      missingPermission: rows.filter((row) => row.missingFiles.includes(row.permissionManifestPath)).length,
      byPriority: countByPriority(rows),
    },
    nextAction,
    followUpCommands: [
      "npm run mtt:validate-ready-intake",
      "npm run mtt:intake-plan -- --summary",
      "npm run mtt:acceptance",
      "npm run mtt:release-gates",
      "npm run release:check",
    ],
    sourceReports: [
      "npm run mtt:intake-plan -- --json",
      "npm run mtt:blockers -- --json",
      "npm run mtt:release-gates -- --json",
    ],
  };
}

function nextMttActionRow(
  row: MttCompletionReadinessRow,
  importSlot: MttCompletionImportSlotHint,
): NextMttActionRow {
  const missingFiles = [
    existsSync(importSlot.normalizedInputPath) ? null : importSlot.normalizedInputPath,
    existsSync(importSlot.permissionManifestPath) ? null : importSlot.permissionManifestPath,
  ].filter((path): path is string => path !== null);

  return {
    priority: mttIntakePriorityForProfile(row, missingFiles.length === 0),
    slotId: [
      row.tableFormat,
      row.blindSpeed,
      row.evModel,
      row.street,
      row.ante,
    ].join("|"),
    status: row.status,
    coverageKind: row.coverageKind,
    currentPackId: row.packId,
    packId: importSlot.packId,
    rawInputFolder: importSlot.rawInputFolder,
    normalizedInputPath: importSlot.normalizedInputPath,
    permissionManifestPath: importSlot.permissionManifestPath,
    missingFiles,
    blockers: row.missingReasons,
    commands: {
      validate: validateRangeImportCommand(importSlot),
      buildDryRun: buildRangeModuleDryRunCommand(importSlot),
    },
  };
}

function countByPriority(rows: readonly NextMttActionRow[]): Record<MttIntakePriorityKey, number> {
  const counts = emptyMttIntakePriorityCounts();
  for (const row of rows) counts[row.priority] += 1;
  return counts;
}

function compareRows(a: NextMttActionRow, b: NextMttActionRow): number {
  return (
    mttIntakePriorityRank(a.priority) - mttIntakePriorityRank(b.priority) ||
    readinessRank(a) - readinessRank(b) ||
    statusRank(a.status) - statusRank(b.status) ||
    a.slotId.localeCompare(b.slotId, "en")
  );
}

function readinessRank(row: NextMttActionRow): number {
  return row.missingFiles.length === 0 ? 0 : 1;
}

function statusRank(status: MttCompletionReadinessRow["status"]): number {
  if (status === "MISSING") return 0;
  if (status === "CANDIDATE") return 1;
  return 2;
}

function renderNextMttActionReport(report: NextMttActionReport): string {
  const lines = [
    "Next MTT action",
    `valid: ${report.valid}`,
    `state: ${report.state}`,
    `blocker rows: ${report.counts.blockerRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];

  if (report.nextAction === null) {
    lines.push("next action: none");
    lines.push("MTT completion matrix is production-ready for the selected filters.");
  } else {
    const action = report.nextAction;
    lines.push(`priority: ${action.priority}`);
    lines.push(`slot: ${action.slotId}`);
    lines.push(`pack: ${action.packId}`);
    lines.push(`status: ${action.status}`);
    lines.push(`coverage: ${action.coverageKind}`);
    lines.push(`raw folder: ${action.rawInputFolder}`);
    if (action.currentPackId !== null) lines.push(`current pack: ${action.currentPackId}`);
    for (const missingFile of action.missingFiles) lines.push(`missing file: ${missingFile}`);
    lines.push(`validate: ${action.commands.validate}`);
    lines.push(`build dry-run: ${action.commands.buildDryRun}`);
    for (const blocker of action.blockers) lines.push(`blocker: ${blocker}`);
  }

  lines.push("follow-up commands:");
  for (const command of report.followUpCommands) lines.push(`  ${command}`);
  lines.push("source reports:");
  for (const command of report.sourceReports) lines.push(`  ${command}`);

  return lines.join("\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
