import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
import {
  MTT_INTAKE_PRIORITY_KEYS,
  mttIntakePriorityForProfile,
  mttIntakePriorityRank,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";

type MatrixState = "WAITING" | "READY" | "PRODUCTION";
type PostflopStreet = Extract<MttCompletionReadinessRow["street"], "FLOP" | "TURN" | "RIVER">;

interface CliArgs {
  json: boolean;
  outputPath: string | null;
}

interface PostflopMatrixRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  state: MatrixState;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  kind: MttCompletionImportSlotHint["kind"] | "production";
  tableFormat: MttCompletionReadinessRow["tableFormat"];
  blindSpeed: MttCompletionReadinessRow["blindSpeed"];
  evModel: MttCompletionReadinessRow["evModel"];
  street: PostflopStreet;
  ante: MttCompletionReadinessRow["ante"];
  packId: string | null;
  importSlot: MttCompletionImportSlotHint | null;
  intake: {
    normalizedPresent: boolean;
    permissionPresent: boolean;
    readyForValidation: boolean;
  };
  blockers: readonly string[];
}

interface PostflopMatrixReport {
  counts: {
    totalRows: number;
    waitingRows: number;
    readyRows: number;
    productionRows: number;
    byPriority: Record<MttIntakePriorityKey, number>;
    byStreet: Record<PostflopStreet, number>;
    byState: Record<MatrixState, number>;
    byKind: Record<PostflopMatrixRow["kind"], number>;
  };
  rows: readonly PostflopMatrixRow[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-matrix",
    "  npm run mtt:postflop-matrix -- --json",
    "  npm run mtt:postflop-matrix -- --output=artifacts/mtt-postflop-matrix-report.json",
    "",
    "Output:",
    "  --json",
    "  --output=artifacts/mtt-postflop-matrix-report.json",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  await loadCompleteMttProductionRegistry();
  const report = buildPostflopMatrixReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderPostflopMatrixReport(report));
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

function buildPostflopMatrixReport(): PostflopMatrixReport {
  const rows = buildMttCompletionReadinessReport().rows
    .filter((row): row is MttCompletionReadinessRow & { street: PostflopStreet } => row.street !== "PREFLOP")
    .map(matrixRowFromCompletionRow)
    .sort(compareMatrixRows);

  return {
    counts: {
      totalRows: rows.length,
      waitingRows: rows.filter((row) => row.state === "WAITING").length,
      readyRows: rows.filter((row) => row.state === "READY").length,
      productionRows: rows.filter((row) => row.state === "PRODUCTION").length,
      byPriority: countByPriority(rows),
      byStreet: countByStreet(rows),
      byState: countByState(rows),
      byKind: countByKind(rows),
    },
    rows,
  };
}

function matrixRowFromCompletionRow(
  row: MttCompletionReadinessRow & { street: PostflopStreet },
): PostflopMatrixRow {
  const intake = intakeState(row.importSlot);
  const state = row.productionReady ? "PRODUCTION" : intake.readyForValidation ? "READY" : "WAITING";
  const priority = mttIntakePriorityForProfile(row, intake.readyForValidation);
  return {
    priority,
    slotId: [row.tableFormat, row.blindSpeed, row.evModel, row.street, row.ante].join("|"),
    state,
    status: row.status,
    coverageKind: row.coverageKind,
    kind: row.importSlot?.kind ?? "production",
    tableFormat: row.tableFormat,
    blindSpeed: row.blindSpeed,
    evModel: row.evModel,
    street: row.street,
    ante: row.ante,
    packId: row.packId,
    importSlot: row.importSlot,
    intake,
    blockers: row.missingReasons,
  };
}

function intakeState(importSlot: MttCompletionImportSlotHint | null): PostflopMatrixRow["intake"] {
  const normalizedPresent = importSlot !== null && existsSync(importSlot.normalizedInputPath);
  const permissionPresent = importSlot !== null && existsSync(importSlot.permissionManifestPath);
  return {
    normalizedPresent,
    permissionPresent,
    readyForValidation: normalizedPresent && permissionPresent,
  };
}

function countByPriority(rows: readonly PostflopMatrixRow[]): Record<MttIntakePriorityKey, number> {
  const counts = Object.fromEntries(MTT_INTAKE_PRIORITY_KEYS.map((priority) => [priority, 0])) as Record<
    MttIntakePriorityKey,
    number
  >;
  for (const row of rows) counts[row.priority] += 1;
  return counts;
}

function countByStreet(rows: readonly PostflopMatrixRow[]): Record<PostflopStreet, number> {
  return {
    FLOP: rows.filter((row) => row.street === "FLOP").length,
    TURN: rows.filter((row) => row.street === "TURN").length,
    RIVER: rows.filter((row) => row.street === "RIVER").length,
  };
}

function countByState(rows: readonly PostflopMatrixRow[]): Record<MatrixState, number> {
  return {
    WAITING: rows.filter((row) => row.state === "WAITING").length,
    READY: rows.filter((row) => row.state === "READY").length,
    PRODUCTION: rows.filter((row) => row.state === "PRODUCTION").length,
  };
}

function countByKind(rows: readonly PostflopMatrixRow[]): Record<PostflopMatrixRow["kind"], number> {
  return {
    "flop-production": rows.filter((row) => row.kind === "flop-production").length,
    "turn-production": rows.filter((row) => row.kind === "turn-production").length,
    "river-production": rows.filter((row) => row.kind === "river-production").length,
    "mtt-preflop": rows.filter((row) => row.kind === "mtt-preflop").length,
    production: rows.filter((row) => row.kind === "production").length,
  };
}

function compareMatrixRows(a: PostflopMatrixRow, b: PostflopMatrixRow): number {
  return (
    mttIntakePriorityRank(a.priority) - mttIntakePriorityRank(b.priority) ||
    stringRank(a.slotId, b.slotId)
  );
}

function stringRank(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function renderPostflopMatrixReport(report: PostflopMatrixReport): string {
  const lines = [
    "MTT postflop production matrix",
    `total rows: ${report.counts.totalRows}`,
    `waiting rows: ${report.counts.waitingRows}`,
    `ready rows: ${report.counts.readyRows}`,
    `production rows: ${report.counts.productionRows}`,
    `street counts: FLOP=${report.counts.byStreet.FLOP}, TURN=${report.counts.byStreet.TURN}, RIVER=${report.counts.byStreet.RIVER}`,
    `state counts: WAITING=${report.counts.byState.WAITING}, READY=${report.counts.byState.READY}, PRODUCTION=${report.counts.byState.PRODUCTION}`,
    `kind counts: flop-production=${report.counts.byKind["flop-production"]}, turn-production=${report.counts.byKind["turn-production"]}, river-production=${report.counts.byKind["river-production"]}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];

  for (const row of report.rows) {
    lines.push(`${row.priority} | ${row.slotId} | ${row.kind} | ${row.state}`);
    if (row.importSlot !== null) {
      lines.push(`  import pack: ${row.importSlot.packId}`);
      if (!row.intake.normalizedPresent) lines.push(`  missing input: ${row.importSlot.normalizedInputPath}`);
      if (!row.intake.permissionPresent) lines.push(`  missing permission: ${row.importSlot.permissionManifestPath}`);
    }
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
}
