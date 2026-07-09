import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1";
const DEFAULT_OUTPUT = "artifacts/texas-solver-coverage-overview/report.json";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  rootDir: string;
  summary: boolean;
}

interface CoverageManifest {
  packId: string;
  outputBase: string;
  scenarios: Array<{ familyId: string }>;
  files: Array<{ familyId: string; boardId: string }>;
}

interface ManifestOverviewRow {
  manifest: string;
  packId: string;
  families: number;
  expectedBoards: number;
  solvedBoards: number;
  missingBoards: number;
  rawComplete: number;
  rawPartial: number;
  waitingForRaw: number;
  complete: boolean;
}

interface CoverageOverviewReport {
  valid: boolean;
  rootDir: string;
  counts: {
    manifests: number;
    complete: number;
    partial: number;
    waiting: number;
    expectedBoards: number;
    solvedBoards: number;
    missingBoards: number;
  };
  rows: readonly ManifestOverviewRow[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  let rootDir = resolve(DEFAULT_ROOT);
  let summary = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(DEFAULT_OUTPUT);
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    if (item === "--root") {
      rootDir = resolve(requiredValue(argv, index, "--root"));
      index += 1;
      continue;
    }
    if (item.startsWith("--root=")) {
      rootDir = resolve(inlineValue(item, "--root"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, outputPath, rootDir, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-coverage-overview",
    "  npm run mtt:texas-solver-coverage-overview -- --summary",
    "  npm run mtt:texas-solver-coverage-overview -- --json",
    "  npm run mtt:texas-solver-coverage-overview -- --output=artifacts/texas-solver-coverage-overview/report.json",
    "",
    "Prints source-safe solved/missing board counts for all TexasSolver coverage manifests in one pass.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReport(args: CliArgs): CoverageOverviewReport {
  if (!existsSync(args.rootDir)) throw new Error(`Missing TexasSolver coverage root: ${args.rootDir}`);
  const manifests = readdirSync(args.rootDir)
    .filter((name) => /^coverage-.+-manifest\.json$/.test(name))
    .sort()
    .map((name) => join(args.rootDir, name));
  const rows = manifests.map(buildRow);
  return {
    valid: rows.length > 0,
    rootDir: args.rootDir,
    counts: {
      manifests: rows.length,
      complete: rows.filter((row) => row.complete).length,
      partial: rows.filter((row) => !row.complete && row.solvedBoards > 0).length,
      waiting: rows.filter((row) => row.solvedBoards === 0).length,
      expectedBoards: sum(rows, "expectedBoards"),
      solvedBoards: sum(rows, "solvedBoards"),
      missingBoards: sum(rows, "missingBoards"),
    },
    rows,
  };
}

function buildRow(manifestPath: string): ManifestOverviewRow {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;
  const outputBase = resolve(manifest.outputBase);
  const familyIds = [...new Set(manifest.scenarios.map((scenario) => scenario.familyId))].sort();
  const familyRows = familyIds.map((familyId) => {
    const expectedBoards = manifest.files
      .filter((file) => file.familyId === familyId)
      .map((file) => file.boardId);
    const rawDir = join(outputBase, familyId, "raw");
    const rawNames = existsSync(rawDir)
      ? readdirSync(rawDir).filter((name) => name.toLowerCase().endsWith(".json"))
      : [];
    const solvedBoards = expectedBoards.filter((board) => rawNames.some((name) => name.includes(`_${board}.json`)));
    return { expectedBoards: expectedBoards.length, solvedBoards: solvedBoards.length };
  });
  const rawComplete = familyRows.filter((row) => row.expectedBoards > 0 && row.solvedBoards === row.expectedBoards).length;
  const rawPartial = familyRows.filter((row) => row.solvedBoards > 0 && row.solvedBoards < row.expectedBoards).length;
  const waitingForRaw = familyRows.filter((row) => row.solvedBoards === 0).length;
  const expectedBoards = familyRows.reduce((total, row) => total + row.expectedBoards, 0);
  const solvedBoards = familyRows.reduce((total, row) => total + row.solvedBoards, 0);
  return {
    manifest: basename(manifestPath),
    packId: manifest.packId,
    families: familyRows.length,
    expectedBoards,
    solvedBoards,
    missingBoards: expectedBoards - solvedBoards,
    rawComplete,
    rawPartial,
    waitingForRaw,
    complete: expectedBoards > 0 && solvedBoards === expectedBoards,
  };
}

function sum(rows: readonly ManifestOverviewRow[], key: "expectedBoards" | "solvedBoards" | "missingBoards"): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

function renderReport(report: CoverageOverviewReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver coverage overview",
    `valid: ${report.valid}`,
    `manifests: ${report.counts.manifests}`,
    `complete: ${report.counts.complete}`,
    `partial: ${report.counts.partial}`,
    `waiting: ${report.counts.waiting}`,
    `boards solved: ${report.counts.solvedBoards}/${report.counts.expectedBoards}`,
  ];
  if (summaryOnly) {
    const blockingRows = report.rows.filter((row) => !row.complete);
    if (blockingRows.length > 0) {
      lines.push(
        `blocking manifests: ${blockingRows
          .map((row) => `${row.manifest} ${row.solvedBoards}/${row.expectedBoards}`)
          .join(", ")}`,
      );
    }
  } else {
    for (const row of report.rows) {
      lines.push(`${row.complete ? "COMPLETE" : row.solvedBoards > 0 ? "PARTIAL" : "WAITING"} ${row.manifest}: boards ${row.solvedBoards}/${row.expectedBoards}, families complete/partial/waiting ${row.rawComplete}/${row.rawPartial}/${row.waitingForRaw}`);
    }
  }
  return lines.join("\n");
}
