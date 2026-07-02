import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json";
const DEFAULT_OUTPUT =
  "artifacts/texas-solver-coverage-v2-ingest/report.json";
const NORMALIZED_DRAFT_ROOT =
  "artifacts/texas-solver-review-integration/normalized-drafts";
const MIDSPR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_50BB_BTN_BB_SRP-CHECK");
const LOWSPR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_20BB_BTN_BB_SRP_LOWSPR-CHECK");
const HIGHSPR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_80BB_BTN_BB_SRP_HIGHSPR-CHECK");
const UTG_BB_SRP_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_40BB_UTG_BB_SRP-CHECK");
const CO_BTN_3BP_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_35BB_CO_BTN_3BP-CHECK");
const CO_BTN_3BP_REPAIR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK");
const CO_BTN_3BP_MIDSPR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_80BB_CO_BTN_3BP_MIDSPR-CHECK");
const CO_BTN_3BP_HIGHSPR_DRAFT_DIR = join(NORMALIZED_DRAFT_ROOT, "MTT9_150BB_CO_BTN_3BP_HIGHSPR-CHECK");

type FamilyStatus = "RAW_COMPLETE" | "RAW_PARTIAL" | "WAITING_FOR_RAW";

interface CliArgs {
  dryRun: boolean;
  familyFilter: string | null;
  manifestPath: string;
  outputPath: string;
  summary: boolean;
}

interface CoverageManifest {
  outputBase: string;
  scenarios: Array<{
    familyId: string;
    boards: string[];
    coverageTags: string[];
  }>;
}

interface FamilyRow {
  familyId: string;
  status: FamilyStatus;
  expectedBoards: string[];
  solvedBoards: string[];
  missingBoards: string[];
  commands: string[];
  processed: boolean;
  skippedReason: string | null;
}

interface IngestReport {
  valid: boolean;
  dryRun: boolean;
  manifestPath: string;
  outputPath: string;
  rows: FamilyRow[];
  counts: {
    families: number;
    rawComplete: number;
    processed: number;
    skipped: number;
    commands: number;
  };
  mergePilotCommands: string[];
  errors: string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = ingestCompletedCoverage(args);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let dryRun = false;
  let familyFilter: string | null = null;
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let outputPath = resolve(DEFAULT_OUTPUT);
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--family") {
      familyFilter = nextArg(argv, index, "--family");
      index += 1;
      continue;
    }
    if (item.startsWith("--family=")) {
      familyFilter = inlineValue(item, "--family");
      continue;
    }
    if (item === "--manifest") {
      manifestPath = resolve(nextArg(argv, index, "--manifest"));
      index += 1;
      continue;
    }
    if (item.startsWith("--manifest=")) {
      manifestPath = resolve(inlineValue(item, "--manifest"));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArg(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { dryRun, familyFilter, manifestPath, outputPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-ingest-completed -- --dry-run --summary",
    "  npm run mtt:texas-solver-ingest-completed -- --summary",
    "  npm run mtt:texas-solver-ingest-completed -- --family=MTT9_80BB_BTN_BB_SRP_HIGHSPR",
    "",
    "Stages, reviews and normalizes only completed TexasSolver coverage-v2 families.",
    "It writes review/artifact candidates only; it never promotes production runtime packs.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function ingestCompletedCoverage(args: CliArgs): IngestReport {
  if (!existsSync(args.manifestPath)) throw new Error(`Missing coverage manifest: ${args.manifestPath}`);
  const manifest = JSON.parse(readFileSync(args.manifestPath, "utf8")) as CoverageManifest;
  const outputBase = resolve(manifest.outputBase);
  const rows = manifest.scenarios
    .filter((scenario) => args.familyFilter === null || scenario.familyId === args.familyFilter)
    .map((scenario) => buildFamilyRow(outputBase, scenario.familyId, scenario.boards));
  const errors: string[] = [];

  for (const row of rows) {
    if (row.status !== "RAW_COMPLETE") {
      row.skippedReason = `Not complete yet (${row.solvedBoards.length}/${row.expectedBoards.length}).`;
      continue;
    }
    if (row.commands.length === 0) {
      row.skippedReason = "Already staged/reviewed/normalized for the supported pilot workflow.";
      continue;
    }
    if (!args.dryRun) {
      for (const command of row.commands) runNpmCommand(command, errors);
    }
    row.processed = !args.dryRun && errors.length === 0;
  }

  const mergePilotCommands = mergeCommands(manifest);
  if (mergePilotCommands.length > 0 && !args.dryRun && errors.length === 0) {
    for (const command of mergePilotCommands) runNpmCommand(command, errors);
  }

  return {
    valid: errors.length === 0,
    dryRun: args.dryRun,
    manifestPath: args.manifestPath,
    outputPath: args.outputPath,
    rows,
    counts: {
      families: rows.length,
      rawComplete: rows.filter((row) => row.status === "RAW_COMPLETE").length,
      processed: rows.filter((row) => row.processed).length,
      skipped: rows.filter((row) => row.skippedReason !== null).length,
      commands: rows.reduce((count, row) => count + row.commands.length, 0) + mergePilotCommands.length,
    },
    mergePilotCommands,
    errors,
  };
}

function buildFamilyRow(outputBase: string, familyId: string, expectedBoards: string[]): FamilyRow {
  const rawDir = join(outputBase, familyId, "raw");
  const rawFiles = existsSync(rawDir)
    ? readdirSync(rawDir).filter((name) => name.toLowerCase().endsWith(".json"))
    : [];
  const solvedBoards = expectedBoards.filter((board) => rawFiles.some((name) => name.includes(`_${board}.json`)));
  const status: FamilyStatus =
    solvedBoards.length === expectedBoards.length
      ? "RAW_COMPLETE"
      : solvedBoards.length > 0
        ? "RAW_PARTIAL"
        : "WAITING_FOR_RAW";
  const commands = status === "RAW_COMPLETE" ? missingCommandsForFamily(outputBase, familyId) : [];
  return {
    familyId,
    status,
    expectedBoards,
    solvedBoards,
    missingBoards: expectedBoards.filter((board) => !solvedBoards.includes(board)),
    commands,
    processed: false,
    skippedReason: null,
  };
}

function missingCommandsForFamily(outputBase: string, familyId: string): string[] {
  const familyDir = join(outputBase, familyId);
  const rawDir = join(familyDir, "raw");
  const rawSources = rawJsonPaths(rawDir);
  const commands: string[] = [];
  const shouldStage =
    isMissingOrOlder(join(familyDir, "strategy-export.json"), rawSources) ||
    isMissingOrOlder(join(familyDir, "review-notes.md"), rawSources);
  if (shouldStage) {
    commands.push(`mtt:stage-texas-solver -- --family=${familyId} --write --review-template --summary`);
  }
  const reviewPath = join(familyDir, "strategy-export.CHECK.review.json");
  const shouldReview = shouldStage || isMissingOrOlder(reviewPath, rawSources);
  if (shouldReview) {
    commands.push(`mtt:texas-solver-review -- --family=${familyId} --node-history=CHECK --write --summary`);
  }
  const draftSources = [reviewPath, ...rawSources].filter((path) => existsSync(path));
  if (familyId === "MTT9_20BB_BTN_BB_SRP_LOWSPR" && (shouldReview || isMissingOrOlder(join(LOWSPR_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${LOWSPR_DRAFT_DIR} --spr-min=0 --spr-max=3 --write`);
  }
  if (familyId === "MTT9_80BB_BTN_BB_SRP_HIGHSPR" && (shouldReview || isMissingOrOlder(join(HIGHSPR_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${HIGHSPR_DRAFT_DIR} --spr-min=8 --spr-max=20 --write`);
  }
  if (isFacingBetExpansionFamily(familyId)) {
    const sprRange = sprRangeForFacingBetFamily(familyId);
    commands.push(`mtt:texas-solver-facing-bet-candidates -- --family=${familyId} --spr-min=${sprRange.min} --spr-max=${sprRange.max} --write --summary`);
  }
  if (familyId === "MTT9_40BB_UTG_BB_SRP" && (shouldReview || isMissingOrOlder(join(UTG_BB_SRP_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${UTG_BB_SRP_DRAFT_DIR} --spr-min=3 --spr-max=8 --pot-type=SINGLE_RAISED --action-node=SINGLE_RAISED_POT_CBET --position-pattern=SRP_UTG_VS_BB --write`);
  }
  if (familyId === "MTT9_35BB_CO_BTN_3BP" && (shouldReview || isMissingOrOlder(join(CO_BTN_3BP_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${CO_BTN_3BP_DRAFT_DIR} --spr-min=0 --spr-max=3 --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write`);
  }
  if (familyId === "MTT9_35BB_CO_BTN_3BP_REPAIR" && (shouldReview || isMissingOrOlder(join(CO_BTN_3BP_REPAIR_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${CO_BTN_3BP_REPAIR_DRAFT_DIR} --spr-min=0 --spr-max=3 --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write`);
  }
  if (familyId === "MTT9_80BB_CO_BTN_3BP_MIDSPR" && (shouldReview || isMissingOrOlder(join(CO_BTN_3BP_MIDSPR_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${CO_BTN_3BP_MIDSPR_DRAFT_DIR} --spr-min=3 --spr-max=8 --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write`);
  }
  if (familyId === "MTT9_150BB_CO_BTN_3BP_HIGHSPR" && (shouldReview || isMissingOrOlder(join(CO_BTN_3BP_HIGHSPR_DRAFT_DIR, "normalized.candidate.json"), draftSources))) {
    commands.push(`mtt:texas-solver-normalize-draft -- --review .\\Agents\\solver-input\\gto-plus\\sample-postflop-v1\\output\\texas-solver\\${familyId}\\strategy-export.CHECK.review.json --output-dir .\\${CO_BTN_3BP_HIGHSPR_DRAFT_DIR} --spr-min=8 --spr-max=20 --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write`);
  }
  return commands;
}

function rawJsonPaths(rawDir: string): string[] {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => join(rawDir, name));
}

function isMissingOrOlder(targetPath: string, sourcePaths: readonly string[]): boolean {
  if (!existsSync(targetPath)) return true;
  if (sourcePaths.length === 0) return false;
  const targetMtime = statSync(targetPath).mtimeMs;
  return sourcePaths.some((sourcePath) => existsSync(sourcePath) && statSync(sourcePath).mtimeMs > targetMtime);
}

function isFacingBetExpansionFamily(familyId: string): boolean {
  return familyId.includes("_3BP_FACING_");
}

function sprRangeForFacingBetFamily(familyId: string): { min: number; max: number } {
  if (familyId.includes("LOWSPR")) return { min: 0, max: 3 };
  if (familyId.includes("HIGHSPR")) return { min: 8, max: 20 };
  return { min: 3, max: 8 };
}

function mergeCommands(manifest: CoverageManifest): string[] {
  const tags = new Set(manifest.scenarios.flatMap((scenario) => scenario.coverageTags));
  const commands: string[] = [];
  if (tags.has("SINGLE_RAISED_POT_CBET")) {
    commands.push("mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_BB_SRP_FLOP_CBET --write --summary");
  }
  if (tags.has("THREE_BET_POT_CBET")) {
    commands.push("mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_CO_3BP_FLOP_CBET --write --summary");
  }
  if (tags.has("FLOP_FACING_BET")) {
    commands.push("mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_CO_3BP_FLOP_FACING_BET --write --summary");
  }
  return commands;
}

function runNpmCommand(command: string, errors: string[]): void {
  try {
    execSync(`npm run ${command}`, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function renderReport(report: IngestReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver completed coverage ingest",
    `valid: ${report.valid}`,
    `dryRun: ${report.dryRun}`,
    `families: ${report.counts.families}`,
    `raw complete: ${report.counts.rawComplete}`,
    `processed: ${report.counts.processed}`,
    `skipped: ${report.counts.skipped}`,
    `commands: ${report.counts.commands}`,
    `report: ${report.outputPath}`,
  ];
  for (const row of report.rows) {
    lines.push(`${row.familyId}: ${row.status} (${row.solvedBoards.length}/${row.expectedBoards.length})`);
    if (!summaryOnly && row.commands.length > 0) {
      lines.push("  commands:");
      for (const command of row.commands) lines.push(`  - npm run ${command}`);
    }
    if (!summaryOnly && row.skippedReason !== null) lines.push(`  skipped: ${row.skippedReason}`);
  }
  if (!summaryOnly && report.mergePilotCommands.length > 0) {
    lines.push("merge:");
    for (const command of report.mergePilotCommands) lines.push(`- npm run ${command}`);
  }
  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }
  return lines.join("\n");
}
