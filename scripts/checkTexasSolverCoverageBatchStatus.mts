import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json";

type CoverageFamilyStatus = "RAW_COMPLETE" | "RAW_PARTIAL" | "WAITING_FOR_RAW";

interface CliArgs {
  json: boolean;
  manifestPath: string;
  outputPath: string | null;
  summary: boolean;
}

interface CoverageManifest {
  packId: string;
  generatedAt: string;
  parameterDir: string;
  outputBase: string;
  scenarios: CoverageScenario[];
  files: CoverageFile[];
}

interface CoverageScenario {
  familyId: string;
  pot: number;
  effectiveStack: number;
  boards: string[];
  purpose: string;
  coverageTags: string[];
}

interface CoverageFile {
  fileName: string;
  path: string;
  familyId: string;
  boardId: string;
  written: boolean;
}

interface CoverageFamilyRow {
  familyId: string;
  status: CoverageFamilyStatus;
  purpose: string;
  coverageTags: readonly string[];
  expectedBoards: readonly string[];
  solvedBoards: readonly string[];
  missingBoards: readonly string[];
  rawDir: string;
  rawJsonCount: number;
  latestRawWrite: string | null;
  staged: {
    strategyExport: boolean;
    checkReview: boolean;
    reviewNotes: boolean;
  };
  normalizedDraft: boolean;
  nextCommands: readonly string[];
}

interface CoverageStatusReport {
  valid: boolean;
  complete: boolean;
  manifestPath: string;
  packId: string;
  generatedAt: string;
  parameterDir: string;
  outputBase: string;
  counts: {
    families: number;
    parameterFiles: number;
    rawComplete: number;
    rawPartial: number;
    waitingForRaw: number;
    expectedBoards: number;
    solvedBoards: number;
    missingBoards: number;
  };
  rows: readonly CoverageFamilyRow[];
  nextCommands: readonly string[];
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
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let outputPath: string | null = null;
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
    if (item === "--manifest") {
      manifestPath = resolve(nextArg(argv, index, "--manifest"));
      index += 1;
      continue;
    }
    if (item.startsWith("--manifest=")) {
      manifestPath = resolve(requiredInlineValue(item, "--manifest"));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArg(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(requiredInlineValue(item, "--output"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, manifestPath, outputPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-coverage-status",
    "  npm run mtt:texas-solver-coverage-status -- --summary",
    "  npm run mtt:texas-solver-coverage-status -- --json",
    "  npm run mtt:texas-solver-coverage-status -- --output=artifacts/texas-solver-coverage-v2-status/report.json",
    "",
    "Reads coverage-v2-manifest.json and filesystem raw outputs, then prints which TexasSolver families are ready for staging/review.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReport(args: CliArgs): CoverageStatusReport {
  if (!existsSync(args.manifestPath)) throw new Error(`Missing coverage manifest: ${args.manifestPath}`);
  const manifest = JSON.parse(readFileSync(args.manifestPath, "utf8")) as CoverageManifest;
  const outputBase = resolve(manifest.outputBase);
  const rows = manifest.scenarios.map((scenario) => buildRow(manifest, outputBase, scenario));
  const solvedBoardCount = rows.reduce((sum, row) => sum + row.solvedBoards.length, 0);
  const missingBoardCount = rows.reduce((sum, row) => sum + row.missingBoards.length, 0);

  return {
    valid: true,
    complete: rows.length > 0 && rows.every((row) => row.status === "RAW_COMPLETE"),
    manifestPath: args.manifestPath,
    packId: manifest.packId,
    generatedAt: manifest.generatedAt,
    parameterDir: resolve(manifest.parameterDir),
    outputBase,
    counts: {
      families: rows.length,
      parameterFiles: manifest.files.length,
      rawComplete: rows.filter((row) => row.status === "RAW_COMPLETE").length,
      rawPartial: rows.filter((row) => row.status === "RAW_PARTIAL").length,
      waitingForRaw: rows.filter((row) => row.status === "WAITING_FOR_RAW").length,
      expectedBoards: rows.reduce((sum, row) => sum + row.expectedBoards.length, 0),
      solvedBoards: solvedBoardCount,
      missingBoards: missingBoardCount,
    },
    rows,
    nextCommands: nextCommandsForReport(rows),
  };
}

function buildRow(
  manifest: CoverageManifest,
  outputBase: string,
  scenario: CoverageScenario,
): CoverageFamilyRow {
  const expectedBoards = manifest.files
    .filter((file) => file.familyId === scenario.familyId)
    .map((file) => file.boardId);
  const rawDir = join(outputBase, scenario.familyId, "raw");
  const rawFiles = readRawFiles(rawDir);
  const solvedBoards = expectedBoards.filter((board) => rawFiles.some((file) => file.name.includes(`_${board}.json`)));
  const missingBoards = expectedBoards.filter((board) => !solvedBoards.includes(board));
  const status: CoverageFamilyStatus =
    solvedBoards.length === expectedBoards.length && expectedBoards.length > 0
      ? "RAW_COMPLETE"
      : solvedBoards.length > 0
        ? "RAW_PARTIAL"
        : "WAITING_FOR_RAW";
  const familyDir = join(outputBase, scenario.familyId);
  const staged = {
    strategyExport: existsSync(join(familyDir, "strategy-export.json")),
    checkReview: existsSync(join(familyDir, "strategy-export.CHECK.review.json")),
    reviewNotes: existsSync(join(familyDir, "review-notes.md")),
  };
  const normalizedDraft = existsSync(join(
    "artifacts",
    "texas-solver-review-integration",
    "normalized-drafts",
    `${scenario.familyId}-CHECK`,
    "normalized.candidate.json",
  ));

  return {
    familyId: scenario.familyId,
    status,
    purpose: scenario.purpose,
    coverageTags: scenario.coverageTags,
    expectedBoards,
    solvedBoards,
    missingBoards,
    rawDir,
    rawJsonCount: rawFiles.length,
    latestRawWrite: rawFiles[0]?.lastWriteTime ?? null,
    staged,
    normalizedDraft,
    nextCommands: nextCommandsForFamily(scenario.familyId, status, staged, normalizedDraft),
  };
}

function readRawFiles(rawDir: string): Array<{ name: string; lastWriteTime: string }> {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => {
      const path = join(rawDir, entry.name);
      return {
        name: entry.name,
        lastWriteTime: statSync(path).mtime.toISOString(),
      };
    })
    .sort((left, right) => right.lastWriteTime.localeCompare(left.lastWriteTime));
}

function nextCommandsForFamily(
  familyId: string,
  status: CoverageFamilyStatus,
  staged: CoverageFamilyRow["staged"],
  normalizedDraft: boolean,
): string[] {
  if (status !== "RAW_COMPLETE") return [];
  const commands: string[] = [];
  if (!staged.strategyExport || !staged.reviewNotes) {
    commands.push(`npm run mtt:stage-texas-solver -- --family=${familyId} --write --review-template --summary`);
  }
  if (!staged.checkReview) {
    commands.push(`npm run mtt:texas-solver-review -- --family=${familyId} --node-history=CHECK --write --summary`);
  }
  if (familyId.includes("LOWSPR") && !normalizedDraft) {
    commands.push(
      `npm run mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\artifacts\\texas-solver-review-integration\\normalized-drafts\\${familyId}-CHECK --spr-min=0 --spr-max=3 --write`,
    );
  }
  if (familyId.includes("HIGHSPR") && !normalizedDraft) {
    commands.push(
      `npm run mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\artifacts\\texas-solver-review-integration\\normalized-drafts\\${familyId}-CHECK --spr-min=8 --spr-max=20 --write`,
    );
  }
  return commands;
}

function nextCommandsForReport(rows: readonly CoverageFamilyRow[]): string[] {
  const commands = rows.flatMap((row) => row.nextCommands);
  const highSprReady = rows.some((row) => row.familyId.includes("HIGHSPR") && row.status === "RAW_COMPLETE");
  const highSprDraftReady = rows.some((row) => row.familyId.includes("HIGHSPR") && row.normalizedDraft);
  if (highSprReady && highSprDraftReady) {
    commands.push("npm run mtt:texas-solver-merge-pilot-drafts -- --input-dir .\\artifacts\\texas-solver-review-integration\\normalized-drafts\\MTT9_20BB_BTN_BB_SRP_LOWSPR-CHECK --input-dir .\\artifacts\\texas-solver-review-integration\\normalized-drafts\\MTT9_50BB_BTN_BB_SRP-CHECK --input-dir .\\artifacts\\texas-solver-review-integration\\normalized-drafts\\MTT9_80BB_BTN_BB_SRP_HIGHSPR-CHECK --write --summary");
  }
  if (commands.length === 0) {
    commands.push("Continue or restart the TexasSolver background batch for this manifest, then rerun this status command.");
  }
  return commands;
}

function renderReport(report: CoverageStatusReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver coverage manifest status",
    `valid: ${report.valid}`,
    `complete: ${report.complete}`,
    `families: ${report.counts.families}`,
    `raw complete: ${report.counts.rawComplete}`,
    `raw partial: ${report.counts.rawPartial}`,
    `waiting for raw: ${report.counts.waitingForRaw}`,
    `boards solved: ${report.counts.solvedBoards}/${report.counts.expectedBoards}`,
  ];
  for (const row of report.rows) {
    lines.push(`${row.familyId}: ${row.status} (${row.solvedBoards.length}/${row.expectedBoards.length})`);
    if (!summaryOnly && row.missingBoards.length > 0) lines.push(`  missing boards: ${row.missingBoards.join(",")}`);
    if (!summaryOnly && row.nextCommands.length > 0) {
      lines.push("  next:");
      for (const command of row.nextCommands) lines.push(`  - ${command}`);
    }
  }
  if (!summaryOnly) {
    lines.push("next commands:");
    for (const command of report.nextCommands) lines.push(`- ${command}`);
  }
  return lines.join("\n");
}
