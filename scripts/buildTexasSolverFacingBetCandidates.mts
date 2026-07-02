import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_FAMILY = "MTT9_80BB_CO_BTN_3BP_MIDSPR";
const DEFAULT_OUTPUT = "artifacts/texas-solver-facing-bet-candidates/report.json";
const DEFAULT_SOLVER_OUTPUT_DIR = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_OUTPUT_ROOT = "artifacts/texas-solver-review-integration/normalized-drafts";
const VITE_NODE_ENTRY = resolve("node_modules/vite-node/vite-node.mjs");

interface CliArgs {
  familyId: string;
  sourceNode: string;
  betActions: string[];
  outputPath: string;
  outputRoot: string;
  potType: "SINGLE_RAISED" | "THREE_BET_POT";
  positionPattern: string;
  scope: string;
  sprMin: number;
  sprMax: number;
  summary: boolean;
  write: boolean;
}

interface ReviewReport {
  valid: boolean;
  files?: Array<{
    actions?: Array<{ normalized?: string }>;
  }>;
  blockers?: string[];
}

interface CandidateRow {
  betAction: string;
  nodeHistory: string;
  reviewValid: boolean;
  normalizeValid: boolean;
  gateValid: boolean;
  outputDir: string;
  reviewPath: string;
  normalizedPath: string;
  permissionPath: string;
  rules: number;
  buckets: number;
  byLane: Record<string, number>;
  byAction: Record<string, number>;
  errors: string[];
  warnings: string[];
}

interface CandidateReport {
  valid: boolean;
  write: boolean;
  familyId: string;
  sourceNode: string;
  candidateActions: string[];
  rows: CandidateRow[];
  bestCandidate: CandidateRow | null;
  bestAliasDir: string | null;
  nextCommands: string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildCandidates(args);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let familyId = DEFAULT_FAMILY;
  let sourceNode = "CHECK";
  let betActions: string[] = [];
  let outputPath = resolve(DEFAULT_OUTPUT);
  let outputRoot = resolve(DEFAULT_OUTPUT_ROOT);
  let potType: CliArgs["potType"] = "THREE_BET_POT";
  let positionPattern = "3BP_BTN_VS_CO";
  let scope = "BTN_vs_CO_3BP_FLOP_FACING_BET";
  let sprMin = 3;
  let sprMax = 8;
  let summary = false;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--family") {
      familyId = nextArg(argv, index, "--family");
      index += 1;
      continue;
    }
    if (item.startsWith("--family=")) {
      familyId = inlineValue(item, "--family");
      continue;
    }
    if (item === "--source-node") {
      sourceNode = nextArg(argv, index, "--source-node");
      index += 1;
      continue;
    }
    if (item.startsWith("--source-node=")) {
      sourceNode = inlineValue(item, "--source-node");
      continue;
    }
    if (item === "--bet-actions") {
      betActions = parseList(nextArg(argv, index, "--bet-actions"));
      index += 1;
      continue;
    }
    if (item.startsWith("--bet-actions=")) {
      betActions = parseList(inlineValue(item, "--bet-actions"));
      continue;
    }
    if (item === "--spr-min") {
      sprMin = parseNumber(nextArg(argv, index, "--spr-min"), "--spr-min");
      index += 1;
      continue;
    }
    if (item.startsWith("--spr-min=")) {
      sprMin = parseNumber(inlineValue(item, "--spr-min"), "--spr-min");
      continue;
    }
    if (item === "--spr-max") {
      sprMax = parseNumber(nextArg(argv, index, "--spr-max"), "--spr-max");
      index += 1;
      continue;
    }
    if (item.startsWith("--spr-max=")) {
      sprMax = parseNumber(inlineValue(item, "--spr-max"), "--spr-max");
      continue;
    }
    if (item === "--pot-type") {
      potType = parsePotType(nextArg(argv, index, "--pot-type"));
      index += 1;
      continue;
    }
    if (item.startsWith("--pot-type=")) {
      potType = parsePotType(inlineValue(item, "--pot-type"));
      continue;
    }
    if (item === "--position-pattern") {
      positionPattern = nextArg(argv, index, "--position-pattern");
      index += 1;
      continue;
    }
    if (item.startsWith("--position-pattern=")) {
      positionPattern = inlineValue(item, "--position-pattern");
      continue;
    }
    if (item === "--scope") {
      scope = nextArg(argv, index, "--scope");
      index += 1;
      continue;
    }
    if (item.startsWith("--scope=")) {
      scope = inlineValue(item, "--scope");
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
    if (item === "--output-root") {
      outputRoot = resolve(nextArg(argv, index, "--output-root"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output-root=")) {
      outputRoot = resolve(inlineValue(item, "--output-root"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (sprMin < 0 || sprMax < sprMin) throw new Error(`Invalid SPR range: ${sprMin}-${sprMax}`);
  return {
    familyId,
    sourceNode,
    betActions,
    outputPath,
    outputRoot,
    potType,
    positionPattern,
    scope,
    sprMin,
    sprMax,
    summary,
    write,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-facing-bet-candidates -- --write --summary",
    "  npm run mtt:texas-solver-facing-bet-candidates -- --family=MTT9_150BB_CO_BTN_3BP_HIGHSPR --spr-min=8 --spr-max=20 --write --summary",
    "  npm run mtt:texas-solver-facing-bet-candidates -- --bet-actions=BET_39,BET_79 --write",
    "",
    "Harvests FLOP_FACING_BET candidate drafts from existing TexasSolver trees.",
    "It reviews source-node BET_* children, normalizes them as FOLD/CALL/RAISE candidates, and runs the scoped pilot gate.",
    "Outputs remain review-only artifacts; no production import is promoted.",
  ].join("\n");
}

function buildCandidates(args: CliArgs): CandidateReport {
  const sourceReview = runReview(args.familyId, args.sourceNode, true);
  const candidateActions = args.betActions.length > 0
    ? args.betActions
    : discoverBetActions(sourceReview);
  const rows = candidateActions.map((betAction) => buildCandidate(args, betAction));
  const bestCandidate = [...rows].sort(compareCandidates)[0] ?? null;
  const bestAliasDir = args.write && bestCandidate?.gateValid === true
    ? writeBestAlias(args, bestCandidate)
    : null;
  return {
    valid: rows.some((row) => row.gateValid),
    write: args.write,
    familyId: args.familyId,
    sourceNode: args.sourceNode,
    candidateActions,
    rows,
    bestCandidate,
    bestAliasDir,
    nextCommands: [
      `npm run mtt:texas-solver-facing-bet-candidates -- --family=${args.familyId} --spr-min=${args.sprMin} --spr-max=${args.sprMax} --write --summary`,
      bestCandidate === null
        ? "No candidate generated."
        : `npm run mtt:postflop-pilot-gate -- --scope=${args.scope} --normalized ${quoteArg(bestCandidate.normalizedPath)} --permission-manifest ${quoteArg(bestCandidate.permissionPath)}`,
      bestAliasDir === null
        ? "No READY best alias written."
        : `Best alias: ${quoteArg(bestAliasDir)}`,
    ],
  };
}

function writeBestAlias(args: CliArgs, bestCandidate: CandidateRow): string {
  const aliasDir = resolve(args.outputRoot, `${args.familyId}-FACING-BET-BEST`);
  mkdirSync(aliasDir, { recursive: true });
  copyFileSync(bestCandidate.normalizedPath, resolve(aliasDir, "normalized.candidate.json"));
  copyFileSync(bestCandidate.permissionPath, resolve(aliasDir, "permission.candidate.json"));
  writeFileSync(resolve(aliasDir, "best-candidate.json"), `${JSON.stringify(bestCandidate, null, 2)}\n`, "utf8");
  return aliasDir;
}

function buildCandidate(args: CliArgs, betAction: string): CandidateRow {
  const nodeHistory = `${args.sourceNode}>${betAction}`;
  const outputDir = resolve(args.outputRoot, `${args.familyId}-FACING-${betAction}`);
  const reviewPath = resolve(DEFAULT_SOLVER_OUTPUT_DIR, args.familyId, `strategy-export.${args.sourceNode}-${betAction}.review.json`);
  const normalizedPath = resolve(outputDir, "normalized.candidate.json");
  const permissionPath = resolve(outputDir, "permission.candidate.json");
  const errors: string[] = [];
  const warnings: string[] = [];

  const review = runReview(args.familyId, nodeHistory, args.write);
  if (!review.valid) errors.push(...(review.blockers ?? [`Review failed for ${nodeHistory}.`]));

  let normalizeValid = false;
  let rules = 0;
  let buckets = 0;
  let byLane: Record<string, number> = {};
  let byAction: Record<string, number> = {};
  if (args.write && review.valid) {
    const normalize = runScript("scripts/buildTexasSolverNormalizedDraft.mts", [
      "--review",
      reviewPath,
      "--output-dir",
      outputDir,
      `--spr-min=${args.sprMin}`,
      `--spr-max=${args.sprMax}`,
      `--pot-type=${args.potType}`,
      "--action-node=FLOP_FACING_BET",
      `--position-pattern=${args.positionPattern}`,
      "--write",
    ], false) as { blockers?: string[]; warnings?: string[] };
    normalizeValid = (normalize.blockers ?? []).length === 0;
    errors.push(...(normalize.blockers ?? []));
    warnings.push(...(normalize.warnings ?? []));
    const stats = summarizeNormalized(normalizedPath);
    rules = stats.rules;
    buckets = stats.buckets;
    byLane = stats.byLane;
    byAction = stats.byAction;
  }

  let gateValid = false;
  if (args.write && normalizeValid) {
    const gate = runScript("scripts/checkMttPostflopPilotGate.mts", [
      `--scope=${args.scope}`,
      "--normalized",
      normalizedPath,
      "--permission-manifest",
      permissionPath,
      "--json",
    ], true) as { valid?: boolean; errors?: string[]; warnings?: string[] };
    gateValid = gate.valid === true;
    errors.push(...(gate.errors ?? []));
    warnings.push(...(gate.warnings ?? []));
  }

  return {
    betAction,
    nodeHistory,
    reviewValid: review.valid,
    normalizeValid,
    gateValid,
    outputDir,
    reviewPath,
    normalizedPath,
    permissionPath,
    rules,
    buckets,
    byLane,
    byAction,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function runReview(familyId: string, nodeHistory: string, write: boolean): ReviewReport {
  return runScript("scripts/extractTexasSolverReview.mts", [
    `--family=${familyId}`,
    `--node-history=${nodeHistory}`,
    ...(write ? ["--write"] : []),
    "--json",
  ], true) as ReviewReport;
}

function runScript(scriptPath: string, args: readonly string[], allowFailure: boolean): unknown {
  try {
    return parseJson(execFileSync(process.execPath, [VITE_NODE_ENTRY, scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    const stdout = error !== null && typeof error === "object" && "stdout" in error
      ? String((error as { stdout?: unknown }).stdout ?? "")
      : "";
    if (allowFailure && stdout.trim().length > 0) return parseJson(stdout);
    throw error;
  }
}

function parseJson(stdout: string): unknown {
  const index = stdout.indexOf("{");
  if (index < 0) throw new Error(`Command did not return JSON:\n${stdout}`);
  return JSON.parse(stdout.slice(index));
}

function discoverBetActions(report: ReviewReport): string[] {
  const actions = new Set<string>();
  for (const file of report.files ?? []) {
    for (const action of file.actions ?? []) {
      const normalized = action.normalized ?? "";
      if (normalized.startsWith("BET_")) actions.add(normalized);
    }
  }
  return [...actions].sort(compareActionLabel);
}

function summarizeNormalized(path: string): {
  rules: number;
  buckets: number;
  byLane: Record<string, number>;
  byAction: Record<string, number>;
} {
  const pack = JSON.parse(readFileSync(path, "utf8")) as {
    rules?: Array<{ rangeBuckets?: Array<{ lane?: string; action?: string }> }>;
  };
  const buckets = (pack.rules ?? []).flatMap((rule) => rule.rangeBuckets ?? []);
  return {
    rules: pack.rules?.length ?? 0,
    buckets: buckets.length,
    byLane: countBy(buckets.map((bucket) => bucket.lane ?? "UNKNOWN")),
    byAction: countBy(buckets.map((bucket) => bucket.action ?? "UNKNOWN")),
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function compareCandidates(left: CandidateRow, right: CandidateRow): number {
  if (left.gateValid !== right.gateValid) return left.gateValid ? -1 : 1;
  const leftLaneCount = Object.keys(left.byLane).length;
  const rightLaneCount = Object.keys(right.byLane).length;
  if (leftLaneCount !== rightLaneCount) return rightLaneCount - leftLaneCount;
  if (left.buckets !== right.buckets) return right.buckets - left.buckets;
  return compareActionLabel(left.betAction, right.betAction);
}

function compareActionLabel(left: string, right: string): number {
  return actionAmount(left) - actionAmount(right);
}

function actionAmount(action: string): number {
  const amount = Number(action.replace(/^[A-Z]+_/u, ""));
  return Number.isFinite(amount) ? amount : Number.POSITIVE_INFINITY;
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

function parseList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number.`);
  return parsed;
}

function parsePotType(value: string): CliArgs["potType"] {
  if (value === "SINGLE_RAISED" || value === "THREE_BET_POT") return value;
  throw new Error(`Unsupported --pot-type value: ${value}`);
}

function quoteArg(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function renderReport(report: CandidateReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver facing-bet candidate harvest",
    `valid: ${report.valid}`,
    `write: ${report.write}`,
    `family: ${report.familyId}`,
    `source node: ${report.sourceNode}`,
    `candidate actions: ${report.candidateActions.join(", ") || "none"}`,
  ];
  for (const row of report.rows) {
    lines.push(`${row.gateValid ? "READY" : "BLOCKED"} ${row.nodeHistory}: review=${row.reviewValid}, normalize=${row.normalizeValid}, gate=${row.gateValid}, buckets=${row.buckets}, lanes=${JSON.stringify(row.byLane)}, actions=${JSON.stringify(row.byAction)}`);
    if (!summaryOnly) {
      for (const error of row.errors) lines.push(`  error: ${error}`);
    }
  }
  if (report.bestCandidate !== null) {
    lines.push(`best: ${report.bestCandidate.nodeHistory} (${report.bestCandidate.gateValid ? "READY" : "BLOCKED"})`);
  }
  if (report.bestAliasDir !== null) lines.push(`best alias: ${report.bestAliasDir}`);
  return lines.join("\n");
}
