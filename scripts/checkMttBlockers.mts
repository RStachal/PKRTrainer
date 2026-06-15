import { existsSync } from "node:fs";
import {
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessFilters,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
}

interface MttBlockerRow {
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
  console.log(args.json ? JSON.stringify(report, null, 2) : renderMttBlockerReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, json };
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
    },
    rows,
  };
}

function blockerRowFromCompletionRow(row: MttCompletionReadinessRow): MttBlockerRow {
  const intake = intakeState(row.importSlot);
  return {
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

function renderMttBlockerReport(report: MttBlockerReport): string {
  const lines = [
    "MTT production blockers",
    `total rows in filter: ${report.counts.totalRows}`,
    `blocker rows: ${report.counts.blockerRows}`,
    `candidate blocker rows: ${report.counts.candidateRows}`,
    `missing blocker rows: ${report.counts.missingRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
  ];

  for (const row of report.rows) {
    lines.push(
      [
        row.slotId,
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
