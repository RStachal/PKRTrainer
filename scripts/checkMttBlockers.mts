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
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
  summary: boolean;
}

interface MttBlockerRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  packId: string | null;
  blockers: readonly string[];
  importSlot: MttCompletionImportSlotHint | null;
  intake: {
    normalizedPresent: boolean;
    permissionPresent: boolean;
    readyForValidation: boolean;
  };
}

interface MttBlockerReport {
  filters: MttCompletionReadinessFilters;
  counts: {
    totalRows: number;
    blockerRows: number;
    candidateRows: number;
    missingRows: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<MttIntakePriorityKey, number>;
  };
  rows: readonly MttBlockerRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:blockers",
    "  npm run mtt:blockers -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER",
    "  npm run mtt:blockers -- --speed=TURBO --status=missing --json",
    "",
    "Output:",
    "  --json",
    "  --summary",
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
  const report = buildMttBlockerReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderMttBlockerReport(report, args.summary));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;
  let summary = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, json, summary };
}

function buildMttBlockerReport(args: CliArgs): MttBlockerReport {
  const filtered = filterMttCompletionReadinessReport(
    buildMttCompletionReadinessReport(),
    args.filters,
  );
  const rows = filtered.rows
    .filter((row) => !row.productionReady)
    .map(blockerRowFromCompletionRow);

  return {
    filters: args.filters,
    counts: {
      totalRows: filtered.rows.length,
      blockerRows: rows.length,
      candidateRows: rows.filter((row) => row.status === "CANDIDATE").length,
      missingRows: rows.filter((row) => row.status === "MISSING").length,
      readyForValidation: rows.filter((row) => row.intake.readyForValidation).length,
      missingNormalized: rows.filter((row) => !row.intake.normalizedPresent).length,
      missingPermission: rows.filter((row) => !row.intake.permissionPresent).length,
      byPriority: countByPriority(rows),
    },
    rows,
  };
}

function countByPriority(rows: readonly MttBlockerRow[]): Record<MttIntakePriorityKey, number> {
  const counts = emptyMttIntakePriorityCounts();
  for (const row of rows) counts[row.priority] += 1;
  return counts;
}

function blockerRowFromCompletionRow(row: MttCompletionReadinessRow): MttBlockerRow {
  const intake = intakeState(row.importSlot);
  return {
    priority: mttIntakePriorityForProfile(row, intake.readyForValidation),
    slotId: [
      row.tableFormat,
      row.blindSpeed,
      row.evModel,
      row.street,
      row.ante,
    ].join("|"),
    status: row.status,
    coverageKind: row.coverageKind,
    packId: row.packId,
    blockers: row.missingReasons,
    importSlot: row.importSlot,
    intake,
  };
}

function intakeState(importSlot: MttCompletionImportSlotHint | null): MttBlockerRow["intake"] {
  const normalizedPresent = importSlot === null ? false : existsSync(importSlot.normalizedInputPath);
  const permissionPresent = importSlot === null ? false : existsSync(importSlot.permissionManifestPath);
  return {
    normalizedPresent,
    permissionPresent,
    readyForValidation: normalizedPresent && permissionPresent,
  };
}

function renderMttBlockerReport(report: MttBlockerReport, summaryOnly = false): string {
  const lines = [
    "MTT production blockers",
    `total rows in filter: ${report.counts.totalRows}`,
    `blocker rows: ${report.counts.blockerRows}`,
    `candidate blocker rows: ${report.counts.candidateRows}`,
    `missing blocker rows: ${report.counts.missingRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];

  if (summaryOnly) return lines.join("\n");

  for (const row of report.rows) {
    lines.push(
      [
        row.slotId,
        row.priority,
        row.status,
        row.coverageKind,
        row.intake.readyForValidation ? "READY" : "WAITING",
      ].join(" :: "),
    );
    if (row.packId !== null) lines.push(`  current pack: ${row.packId}`);
    if (row.importSlot !== null) {
      lines.push(`  import pack: ${row.importSlot.packId}`);
      if (!row.intake.normalizedPresent) lines.push(`  missing input: ${row.importSlot.normalizedInputPath}`);
      if (!row.intake.permissionPresent) lines.push(`  missing permission: ${row.importSlot.permissionManifestPath}`);
    }
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
}
