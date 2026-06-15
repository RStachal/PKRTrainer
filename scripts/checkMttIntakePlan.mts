import { existsSync } from "node:fs";
import {
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessFilters,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";

type PriorityKey =
  | "P0_READY_FOR_VALIDATION"
  | "P1_PREFLOP_CHIP_EV"
  | "P2_PREFLOP_DOLAR_EV"
  | "P3_FLOP_PRODUCTION"
  | "P4_TURN_PRODUCTION"
  | "P5_RIVER_PRODUCTION";

const PRIORITY_KEYS: readonly PriorityKey[] = [
  "P0_READY_FOR_VALIDATION",
  "P1_PREFLOP_CHIP_EV",
  "P2_PREFLOP_DOLAR_EV",
  "P3_FLOP_PRODUCTION",
  "P4_TURN_PRODUCTION",
  "P5_RIVER_PRODUCTION",
];

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
  limit: number | null;
  priority: PriorityKey | null;
  visibility: "all" | "ready-only" | "waiting-only";
}

interface IntakePlanRow {
  priority: PriorityKey;
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
}

interface IntakePlanReport {
  filters: MttCompletionReadinessFilters;
  counts: {
    totalQueueRows: number;
    shownRows: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<PriorityKey, number>;
  };
  rows: readonly IntakePlanRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:intake-plan",
    "  npm run mtt:intake-plan -- --limit=20",
    "  npm run mtt:intake-plan -- --all",
    "  npm run mtt:intake-plan -- --priority=P1_PREFLOP_CHIP_EV --all",
    "  npm run mtt:intake-plan -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --json",
    "  --all",
    "  --limit=<positive integer>",
    `  --priority=${PRIORITY_KEYS.join("|")}`,
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
  console.log(args.json ? JSON.stringify(report, null, 2) : renderMttIntakePlanReport(report, args.limit));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;
  let limit: number | null = 12;
  let priority: PriorityKey | null = null;
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
    if (item.startsWith("--limit=")) {
      limit = parseLimit(item.slice("--limit=".length));
      continue;
    }
    if (item.startsWith("--priority=")) {
      priority = parsePriority(item.slice("--priority=".length));
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

  return { filters, json, limit, priority, visibility };
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Unsupported --limit value: ${value}\n\n${usage()}`);
  }
  return parsed;
}

function parsePriority(value: string): PriorityKey {
  if (PRIORITY_KEYS.includes(value as PriorityKey)) return value as PriorityKey;
  throw new Error(`Unsupported --priority value: ${value}\n\n${usage()}`);
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

function countByPriority(rows: readonly IntakePlanRow[]): Record<PriorityKey, number> {
  const counts = Object.fromEntries(PRIORITY_KEYS.map((priority) => [priority, 0])) as Record<PriorityKey, number>;
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
    nextCommand: validateCommandFor(importSlot),
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

function priorityFor(row: MttCompletionReadinessRow, readyForValidation: boolean): PriorityKey {
  if (readyForValidation) return "P0_READY_FOR_VALIDATION";
  if (row.street === "PREFLOP" && row.evModel === "CHIP_EV") return "P1_PREFLOP_CHIP_EV";
  if (row.street === "PREFLOP" && row.evModel === "DOLAR_EV") return "P2_PREFLOP_DOLAR_EV";
  if (row.street === "FLOP") return "P3_FLOP_PRODUCTION";
  if (row.street === "TURN") return "P4_TURN_PRODUCTION";
  return "P5_RIVER_PRODUCTION";
}

function validateCommandFor(importSlot: MttCompletionImportSlotHint): string {
  return [
    "npm run validate:range-import --",
    `--kind=${importSlot.kind}`,
    `--permission-manifest ${importSlot.permissionManifestPath}`,
    importSlot.normalizedInputPath,
  ].join(" ");
}

function comparePlanRows(a: IntakePlanRow, b: IntakePlanRow): number {
  return (
    priorityRank(a.priority) - priorityRank(b.priority) ||
    statusRank(a.status) - statusRank(b.status) ||
    stringRank(a.slotId, b.slotId)
  );
}

function priorityRank(priority: PriorityKey): number {
  const order: Record<PriorityKey, number> = {
    P0_READY_FOR_VALIDATION: 0,
    P1_PREFLOP_CHIP_EV: 1,
    P2_PREFLOP_DOLAR_EV: 2,
    P3_FLOP_PRODUCTION: 3,
    P4_TURN_PRODUCTION: 4,
    P5_RIVER_PRODUCTION: 5,
  };
  return order[priority];
}

function statusRank(status: MttCompletionReadinessRow["status"]): number {
  if (status === "MISSING") return 0;
  if (status === "CANDIDATE") return 1;
  return 2;
}

function stringRank(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function renderMttIntakePlanReport(report: IntakePlanReport, limit: number | null): string {
  const lines = [
    "MTT intake priority plan",
    `queue rows: ${report.counts.totalQueueRows}`,
    `shown rows: ${report.counts.shownRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];
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
    for (const blocker of row.blockers) lines.push(`   blocker: ${blocker}`);
  });

  return lines.join("\n");
}
