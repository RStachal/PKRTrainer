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
  parseMttIntakePriority,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";
import {
  buildRangeModuleDryRunCommand,
  validateRangeImportCommand,
} from "../src/data/ranges/rangeImportCommands.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
  limit: number | null;
  priority: MttIntakePriorityKey | null;
  summary: boolean;
  visibility: "all" | "ready-only" | "waiting-only";
}

interface IntakePlanRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  blockers: readonly string[];
  importSlot: MttCompletionImportSlotHint;
  intake: {
    normalizedPresent: boolean;
    permissionPresent: boolean;
    readyForValidation: boolean;
  };
  nextCommand: string;
  buildCommand: string;
}

interface IntakePlanReport {
  filters: MttCompletionReadinessFilters;
  counts: {
    totalQueueRows: number;
    shownRows: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<MttIntakePriorityKey, number>;
  };
  rows: readonly IntakePlanRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:intake-plan",
    "  npm run mtt:intake-plan -- --limit=20",
    "  npm run mtt:intake-plan -- --all",
    "  npm run mtt:intake-plan -- --summary",
    "  npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all",
    "  npm run mtt:intake-plan -- --priority=P2_PREFLOP_DOLAR_EV --all",
    "  npm run mtt:intake-plan -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --json",
    "  --all",
    "  --limit=<positive integer>",
    `  --priority=${MTT_INTAKE_PRIORITY_KEYS.join("|")}`,
    "  --summary",
    "  --ready-only",
    "  --waiting-only",
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
  const report = buildMttIntakePlanReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderMttIntakePlanReport(report, args.limit, args.summary));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;
  let limit: number | null = 12;
  let priority: MttIntakePriorityKey | null = null;
  let summary = false;
  let visibility: CliArgs["visibility"] = "all";

  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--all") {
      limit = null;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item.startsWith("--limit=")) {
      limit = parseLimit(item.slice("--limit=".length));
      continue;
    }
    if (item.startsWith("--priority=")) {
      priority = parseMttIntakePriority(item.slice("--priority=".length), usage);
      continue;
    }
    if (item === "--ready-only") {
      visibility = setVisibility(visibility, "ready-only");
      continue;
    }
    if (item === "--waiting-only") {
      visibility = setVisibility(visibility, "waiting-only");
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, json, limit, priority, summary, visibility };
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Unsupported --limit value: ${value}\n\n${usage()}`);
  }
  return parsed;
}

function setVisibility(
  current: CliArgs["visibility"],
  next: Exclude<CliArgs["visibility"], "all">,
): CliArgs["visibility"] {
  if (current !== "all" && current !== next) {
    throw new Error(`Use only one of --ready-only or --waiting-only.\n\n${usage()}`);
  }
  return next;
}

function buildMttIntakePlanReport(args: CliArgs): IntakePlanReport {
  const filtered = filterMttCompletionReadinessReport(
    buildMttCompletionReadinessReport(),
    args.filters,
  );
  const allRows = filtered.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .map((row) => planRowFromReadinessRow(row, row.importSlot as MttCompletionImportSlotHint))
    .filter((row) => args.priority === null || row.priority === args.priority)
    .filter((row) => matchesVisibility(row, args.visibility))
    .sort(comparePlanRows);
  const rows = args.limit === null ? allRows : allRows.slice(0, args.limit);

  return {
    filters: args.filters,
    counts: {
      totalQueueRows: allRows.length,
      shownRows: rows.length,
      readyForValidation: allRows.filter((row) => row.intake.readyForValidation).length,
      missingNormalized: allRows.filter((row) => !row.intake.normalizedPresent).length,
      missingPermission: allRows.filter((row) => !row.intake.permissionPresent).length,
      byPriority: countByPriority(allRows),
    },
    rows,
  };
}

function matchesVisibility(row: IntakePlanRow, visibility: CliArgs["visibility"]): boolean {
  if (visibility === "ready-only") return row.intake.readyForValidation;
  if (visibility === "waiting-only") return !row.intake.readyForValidation;
  return true;
}

function countByPriority(rows: readonly IntakePlanRow[]): Record<MttIntakePriorityKey, number> {
  const counts = emptyMttIntakePriorityCounts();
  for (const row of rows) counts[row.priority] += 1;
  return counts;
}

function planRowFromReadinessRow(
  row: MttCompletionReadinessRow,
  importSlot: MttCompletionImportSlotHint,
): IntakePlanRow {
  const intake = intakeState(importSlot);
  return {
    priority: priorityFor(row, intake.readyForValidation),
    slotId: [row.tableFormat, row.blindSpeed, row.evModel, row.street, row.ante].join("|"),
    status: row.status,
    coverageKind: row.coverageKind,
    blockers: row.missingReasons,
    importSlot,
    intake,
    nextCommand: validateRangeImportCommand(importSlot),
    buildCommand: buildRangeModuleDryRunCommand(importSlot),
  };
}

function intakeState(importSlot: MttCompletionImportSlotHint): IntakePlanRow["intake"] {
  const normalizedPresent = existsSync(importSlot.normalizedInputPath);
  const permissionPresent = existsSync(importSlot.permissionManifestPath);
  return {
    normalizedPresent,
    permissionPresent,
    readyForValidation: normalizedPresent && permissionPresent,
  };
}

function priorityFor(row: MttCompletionReadinessRow, readyForValidation: boolean): MttIntakePriorityKey {
  return mttIntakePriorityForProfile(row, readyForValidation);
}

function comparePlanRows(a: IntakePlanRow, b: IntakePlanRow): number {
  return (
    mttIntakePriorityRank(a.priority) - mttIntakePriorityRank(b.priority) ||
    statusRank(a.status) - statusRank(b.status) ||
    stringRank(a.slotId, b.slotId)
  );
}

function statusRank(status: MttCompletionReadinessRow["status"]): number {
  if (status === "MISSING") return 0;
  if (status === "CANDIDATE") return 1;
  return 2;
}

function stringRank(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function renderMttIntakePlanReport(report: IntakePlanReport, limit: number | null, summaryOnly = false): string {
  const lines = [
    "MTT intake priority plan",
    `queue rows: ${report.counts.totalQueueRows}`,
    `${summaryOnly ? "detail rows available" : "shown rows"}: ${report.counts.shownRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];
  if (summaryOnly) return lines.join("\n");

  if (limit !== null && report.counts.totalQueueRows > report.counts.shownRows) {
    lines.push(`showing first ${limit} rows; use --all to show the full queue`);
  }

  report.rows.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.priority} | ${row.slotId} | ${row.status} | ${row.intake.readyForValidation ? "READY" : "WAITING"}`,
    );
    lines.push(`   import pack: ${row.importSlot.packId}`);
    if (!row.intake.normalizedPresent) lines.push(`   missing input: ${row.importSlot.normalizedInputPath}`);
    if (!row.intake.permissionPresent) lines.push(`   missing permission: ${row.importSlot.permissionManifestPath}`);
    lines.push(`   next: ${row.nextCommand}`);
    lines.push(`   build dry-run: ${row.buildCommand}`);
    for (const blocker of row.blockers) lines.push(`   blocker: ${blocker}`);
  });

  return lines.join("\n");
}
