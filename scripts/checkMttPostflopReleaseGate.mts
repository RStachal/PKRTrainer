import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { findPlaceholderStringPaths } from "../src/data/ranges/placeholderText.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

interface MttPostflopReleaseGateRow {
  slotId: string;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  packId: string | null;
  productionReady: boolean;
  fallbackRuntime: boolean;
  missingNormalized: boolean;
  missingPermission: boolean;
  placeholderPaths: readonly string[];
  blockers: readonly string[];
}

interface MttPostflopReleaseGateReport {
  valid: boolean;
  counts: {
    totalPostflopRows: number;
    productionReadyRows: number;
    blockerRows: number;
    fallbackRuntimeRows: number;
    missingNormalizedRows: number;
    missingPermissionRows: number;
    placeholderRows: number;
    lowConfidenceRows: number;
    incompleteCoverageRows: number;
  };
  rows: readonly MttPostflopReleaseGateRow[];
  errors: readonly string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-release",
    "  npm run mtt:postflop-release -- --summary",
    "  npm run mtt:postflop-release -- --json",
    "  npm run mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json",
    "",
    "This is the final MTT postflop gate. It fails while any FLOP/TURN/RIVER target",
    "uses fallback runtime, lacks production coverage, lacks legal intake permission,",
    "contains placeholder text, or is not production-ready.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  await loadCompleteMttProductionRegistry();
  const report = buildMttPostflopReleaseGateReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json
    ? JSON.stringify(report, null, 2)
    : renderMttPostflopReleaseGateReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  let summary = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, outputPath, summary };
}

function buildMttPostflopReleaseGateReport(): MttPostflopReleaseGateReport {
  const rows = buildMttCompletionReadinessReport().rows
    .filter((row) => row.street === "FLOP" || row.street === "TURN" || row.street === "RIVER")
    .map(postflopReleaseGateRow);
  const blockerRows = rows.filter((row) => row.blockers.length > 0);
  const errors = blockerRows.map((row) => `${row.slotId}: ${row.blockers.join(" | ")}`);

  return {
    valid: errors.length === 0,
    counts: {
      totalPostflopRows: rows.length,
      productionReadyRows: rows.filter((row) => row.productionReady).length,
      blockerRows: blockerRows.length,
      fallbackRuntimeRows: rows.filter((row) => row.fallbackRuntime).length,
      missingNormalizedRows: rows.filter((row) => row.missingNormalized).length,
      missingPermissionRows: rows.filter((row) => row.missingPermission).length,
      placeholderRows: rows.filter((row) => row.placeholderPaths.length > 0).length,
      lowConfidenceRows: rows.filter((row) => hasLowConfidenceBlocker(row)).length,
      incompleteCoverageRows: rows.filter((row) => hasIncompleteCoverageBlocker(row)).length,
    },
    rows,
    errors,
  };
}

function postflopReleaseGateRow(row: MttCompletionReadinessRow): MttPostflopReleaseGateRow {
  const slotId = completionRowLabel(row);
  const intake = intakeState(row.importSlot);
  const fallbackRuntime = row.coverageKind !== "POSTFLOP_PRODUCTION_PACK";
  const blockers = [
    ...row.missingReasons,
    ...(row.productionReady ? [] : ["Postflop slot is not production-ready."]),
    ...(fallbackRuntime ? ["Production runtime must not fall back to public heuristic or generator logic."] : []),
    ...(intake.missingNormalized ? ["Normalized production import is missing."] : []),
    ...(intake.missingPermission ? ["Permission manifest is missing."] : []),
    ...intake.placeholderPaths.map((path) => `Placeholder text remains in ${path}.`),
  ];

  return {
    slotId,
    status: row.status,
    coverageKind: row.coverageKind,
    packId: row.packId,
    productionReady: row.productionReady && blockers.length === 0,
    fallbackRuntime,
    missingNormalized: intake.missingNormalized,
    missingPermission: intake.missingPermission,
    placeholderPaths: intake.placeholderPaths,
    blockers,
  };
}

function intakeState(importSlot: MttCompletionImportSlotHint | null): {
  missingNormalized: boolean;
  missingPermission: boolean;
  placeholderPaths: string[];
} {
  if (importSlot === null) {
    return {
      missingNormalized: false,
      missingPermission: false,
      placeholderPaths: [],
    };
  }

  const normalizedPresent = existsSync(importSlot.normalizedInputPath);
  const permissionPresent = existsSync(importSlot.permissionManifestPath);
  return {
    missingNormalized: !normalizedPresent,
    missingPermission: !permissionPresent,
    placeholderPaths: [
      ...placeholderPathsInJsonFile(importSlot.normalizedInputPath, "normalized.json"),
      ...placeholderPathsInJsonFile(importSlot.permissionManifestPath, "permission.json"),
    ],
  };
}

function placeholderPathsInJsonFile(path: string, label: string): string[] {
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return findPlaceholderStringPaths(value).map((jsonPath) => `${label}:${jsonPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`${label}:unreadable-json(${message})`];
  }
}

function completionRowLabel(row: MttCompletionReadinessRow): string {
  return [
    row.tableFormat,
    row.blindSpeed,
    row.evModel,
    row.street,
    row.ante,
  ].join("|");
}

function hasLowConfidenceBlocker(row: MttPostflopReleaseGateRow): boolean {
  return row.blockers.some((blocker) => /\bLOW\b/i.test(blocker));
}

function hasIncompleteCoverageBlocker(row: MttPostflopReleaseGateRow): boolean {
  return row.blockers.some((blocker) => (
    /\bcoverage\b/i.test(blocker) ||
    /\bmissing\b/i.test(blocker) ||
    /\brequired\b/i.test(blocker) ||
    /\bnot production-ready\b/i.test(blocker)
  ));
}

function renderMttPostflopReleaseGateReport(
  report: MttPostflopReleaseGateReport,
  summaryOnly = false,
): string {
  const lines = [
    "MTT postflop final release gate",
    `valid: ${report.valid}`,
    `total postflop rows: ${report.counts.totalPostflopRows}`,
    `productionReady rows: ${report.counts.productionReadyRows}`,
    `blocker rows: ${report.counts.blockerRows}`,
    `fallback runtime rows: ${report.counts.fallbackRuntimeRows}`,
    `missing normalized.json rows: ${report.counts.missingNormalizedRows}`,
    `missing permission.json rows: ${report.counts.missingPermissionRows}`,
    `placeholder rows: ${report.counts.placeholderRows}`,
    `LOW confidence rows: ${report.counts.lowConfidenceRows}`,
    `incomplete coverage rows: ${report.counts.incompleteCoverageRows}`,
  ];

  if (summaryOnly) return lines.join("\n");

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}
