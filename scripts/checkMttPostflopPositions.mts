import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Position } from "../src/core/types.ts";
import {
  positionsForFormat,
  type TableFormat,
} from "../src/core/trainingProfile.ts";
import {
  MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
  postflopPositionContextsForFormat,
  type PostflopPositionContext,
  type PostflopPositionPattern,
  type PostflopPotType,
} from "../src/core/postflopGenerator.ts";

type CoveredPotType = Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
type CoverageState = "SUPPORTED" | "UNSUPPORTED";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
}

interface PositionCoverageRow {
  tableFormat: TableFormat;
  potType: CoveredPotType;
  aggressorPosition: Position;
  callerPosition: Position;
  state: CoverageState;
  positionPattern: PostflopPositionPattern | null;
  inPosition: boolean | null;
  callerType: PostflopPositionContext["callerType"] | null;
  reason: string | null;
}

interface PositionCoverageReport {
  counts: {
    totalRows: number;
    supportedRows: number;
    unsupportedRows: number;
    byFormat: Record<TableFormat, { total: number; supported: number; unsupported: number }>;
    byPotType: Record<CoveredPotType, { total: number; supported: number; unsupported: number }>;
    byPattern: Record<PostflopPositionPattern, number>;
  };
  rows: readonly PositionCoverageRow[];
}

const TABLE_FORMATS = ["FULL_RING_9", "SIX_MAX"] as const satisfies readonly TableFormat[];
const POT_TYPES = ["SINGLE_RAISED", "THREE_BET_POT"] as const satisfies readonly CoveredPotType[];
const PATTERNS = MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS;

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-positions",
    "  npm run mtt:postflop-positions -- --json",
    "  npm run mtt:postflop-positions -- --output=artifacts/mtt-postflop-positions-report.json",
    "",
    "Output:",
    "  --json",
    "  --output=artifacts/mtt-postflop-positions-report.json",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildPositionCoverageReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderPositionCoverageReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
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
  return { json, outputPath };
}

function buildPositionCoverageReport(): PositionCoverageReport {
  const rows = TABLE_FORMATS.flatMap((tableFormat) => (
    POT_TYPES.flatMap((potType) => matrixRowsFor(tableFormat, potType))
  ));
  return {
    counts: {
      totalRows: rows.length,
      supportedRows: rows.filter((row) => row.state === "SUPPORTED").length,
      unsupportedRows: rows.filter((row) => row.state === "UNSUPPORTED").length,
      byFormat: countByFormat(rows),
      byPotType: countByPotType(rows),
      byPattern: countByPattern(rows),
    },
    rows,
  };
}

function matrixRowsFor(tableFormat: TableFormat, potType: CoveredPotType): PositionCoverageRow[] {
  const positions = positionsForFormat(tableFormat);
  const supportedByPair = new Map<string, PostflopPositionContext>();
  for (const context of postflopPositionContextsForFormat(tableFormat, potType)) {
    supportedByPair.set(pairKey(context.aggressorPosition, context.callerPosition), context);
  }

  const rows: PositionCoverageRow[] = [];
  for (const aggressorPosition of positions) {
    for (const callerPosition of positions) {
      if (aggressorPosition === callerPosition) continue;
      const supported = supportedByPair.get(pairKey(aggressorPosition, callerPosition)) ?? null;
      rows.push(supported === null
        ? unsupportedRow(tableFormat, potType, aggressorPosition, callerPosition)
        : supportedRow(tableFormat, potType, supported));
    }
  }
  return rows;
}

function supportedRow(
  tableFormat: TableFormat,
  potType: CoveredPotType,
  context: PostflopPositionContext,
): PositionCoverageRow {
  return {
    tableFormat,
    potType,
    aggressorPosition: context.aggressorPosition,
    callerPosition: context.callerPosition,
    state: "SUPPORTED",
    positionPattern: context.positionPattern,
    inPosition: context.inPosition,
    callerType: context.callerType,
    reason: null,
  };
}

function unsupportedRow(
  tableFormat: TableFormat,
  potType: CoveredPotType,
  aggressorPosition: Position,
  callerPosition: Position,
): PositionCoverageRow {
  return {
    tableFormat,
    potType,
    aggressorPosition,
    callerPosition,
    state: "UNSUPPORTED",
    positionPattern: null,
    inPosition: null,
    callerType: null,
    reason: unsupportedReason(potType, aggressorPosition, callerPosition),
  };
}

function unsupportedReason(
  potType: CoveredPotType,
  aggressorPosition: Position,
  callerPosition: Position,
): string {
  if (potType === "THREE_BET_POT") {
    return "3bet pot coverage currently models non-blind opener/caller versus later-position IP three-bettor only.";
  }
  if (aggressorPosition === "BB") {
    return "BB open-raise SRP heads-up pair is not modeled as an aggressor source.";
  }
  if (callerPosition === "SB") {
    return "SB caller SRP pair is unsupported outside explicit SB-vs-BB blind battle.";
  }
  return "No supported SRP heads-up mapping exists for this aggressor/caller pair.";
}

function pairKey(aggressorPosition: Position, callerPosition: Position): string {
  return `${aggressorPosition}|${callerPosition}`;
}

function countByFormat(
  rows: readonly PositionCoverageRow[],
): Record<TableFormat, { total: number; supported: number; unsupported: number }> {
  return {
    FULL_RING_9: countRows(rows, (row) => row.tableFormat === "FULL_RING_9"),
    SIX_MAX: countRows(rows, (row) => row.tableFormat === "SIX_MAX"),
  };
}

function countByPotType(
  rows: readonly PositionCoverageRow[],
): Record<CoveredPotType, { total: number; supported: number; unsupported: number }> {
  return {
    SINGLE_RAISED: countRows(rows, (row) => row.potType === "SINGLE_RAISED"),
    THREE_BET_POT: countRows(rows, (row) => row.potType === "THREE_BET_POT"),
  };
}

function countRows(
  rows: readonly PositionCoverageRow[],
  predicate: (row: PositionCoverageRow) => boolean,
): { total: number; supported: number; unsupported: number } {
  const filtered = rows.filter(predicate);
  return {
    total: filtered.length,
    supported: filtered.filter((row) => row.state === "SUPPORTED").length,
    unsupported: filtered.filter((row) => row.state === "UNSUPPORTED").length,
  };
}

function countByPattern(rows: readonly PositionCoverageRow[]): Record<PostflopPositionPattern, number> {
  return Object.fromEntries(PATTERNS.map((pattern) => [
    pattern,
    rows.filter((row) => row.positionPattern === pattern).length,
  ])) as Record<PostflopPositionPattern, number>;
}

function renderPositionCoverageReport(report: PositionCoverageReport): string {
  const lines = [
    "MTT postflop position coverage",
    `total rows: ${report.counts.totalRows}`,
    `supported rows: ${report.counts.supportedRows}`,
    `unsupported rows: ${report.counts.unsupportedRows}`,
    `format counts: FULL_RING_9=${formatCount(report.counts.byFormat.FULL_RING_9)}, SIX_MAX=${formatCount(report.counts.byFormat.SIX_MAX)}`,
    `pot counts: SINGLE_RAISED=${formatCount(report.counts.byPotType.SINGLE_RAISED)}, THREE_BET_POT=${formatCount(report.counts.byPotType.THREE_BET_POT)}`,
    `pattern counts: ${PATTERNS.map((pattern) => `${pattern}=${report.counts.byPattern[pattern]}`).join(", ")}`,
  ];

  for (const row of report.rows) {
    lines.push([
      row.tableFormat,
      row.potType,
      `${row.aggressorPosition}->${row.callerPosition}`,
      row.state,
      row.positionPattern ?? "UNMAPPED",
    ].join(" | "));
    if (row.reason !== null) lines.push(`  reason: ${row.reason}`);
  }

  return lines.join("\n");
}

function formatCount(count: { total: number; supported: number; unsupported: number }): string {
  return `${count.supported}/${count.total} supported, ${count.unsupported} unsupported`;
}
