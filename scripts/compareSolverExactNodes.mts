import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import {
  canonicalSolverSetupJson,
  compareSolverExactNodes,
  type ExactSolverComparisonOptions,
  type ExactSolverComparisonReport,
  type SolverExactNodeExport,
} from "../src/core/solverComparison.ts";

const REPORT_SCHEMA_VERSION = "PKRTRAINER_SOLVER_EXACT_COMPARE_REPORT_V1";

interface CliArgs {
  json: boolean;
  leftPath: string;
  markdownPath: string;
  options: Partial<ExactSolverComparisonOptions>;
  outputPath: string;
  rightPath: string;
  summary: boolean;
}

interface ReportEnvelope {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAt: string;
  valid: boolean;
  strategyValuesGenerated: "none";
  productionPromotion: "none";
  sources: {
    left: SourceSummary;
    right: SourceSummary;
  };
  setupFingerprintMatch: boolean | null;
  comparison: ExactSolverComparisonReport;
}

interface SourceSummary {
  path: string;
  sha256: string;
  setupSha256: string | null;
  solverId: string | null;
  solverVersion: string | null;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  mkdirSync(dirname(args.markdownPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(args.markdownPath, renderMarkdown(report), "utf8");
  console.log(args.json ? JSON.stringify(report, null, 2) : renderSummary(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let leftPath = "";
  let markdownPath = resolve("artifacts/range-cross-check/exact-node-report.md");
  let outputPath = resolve("artifacts/range-cross-check/exact-node-report.json");
  let rightPath = "";
  let summary = false;
  const options: Partial<ExactSolverComparisonOptions> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item === "--left") { leftPath = resolve(requiredValue(argv, index, "--left")); index += 1; continue; }
    if (item === "--right") { rightPath = resolve(requiredValue(argv, index, "--right")); index += 1; continue; }
    if (item === "--output") { outputPath = resolve(requiredValue(argv, index, "--output")); index += 1; continue; }
    if (item === "--markdown") { markdownPath = resolve(requiredValue(argv, index, "--markdown")); index += 1; continue; }
    if (item.startsWith("--left=")) { leftPath = resolve(inlineValue(item, "--left")); continue; }
    if (item.startsWith("--right=")) { rightPath = resolve(inlineValue(item, "--right")); continue; }
    if (item.startsWith("--output=")) { outputPath = resolve(inlineValue(item, "--output")); continue; }
    if (item.startsWith("--markdown=")) { markdownPath = resolve(inlineValue(item, "--markdown")); continue; }
    if (item.startsWith("--max-row-strategy-distance-pct=")) {
      options.maxRowStrategyDistancePct = numberValue(item, "--max-row-strategy-distance-pct");
      continue;
    }
    if (item.startsWith("--max-mean-strategy-distance-pct=")) {
      options.maxMeanStrategyDistancePct = numberValue(item, "--max-mean-strategy-distance-pct");
      continue;
    }
    if (item.startsWith("--max-action-ev-delta-bb=")) {
      options.maxActionEvDeltaBb = numberValue(item, "--max-action-ev-delta-bb");
      continue;
    }
    if (item.startsWith("--equivalent-ev-threshold-bb=")) {
      options.equivalentEvThresholdBb = numberValue(item, "--equivalent-ev-threshold-bb");
      continue;
    }
    if (item.startsWith("--max-disjoint-best-action-pct=")) {
      options.maxDisjointBestActionPct = numberValue(item, "--max-disjoint-best-action-pct");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (leftPath.length === 0) throw new Error(`--left is required.\n\n${usage()}`);
  if (rightPath.length === 0) throw new Error(`--right is required.\n\n${usage()}`);
  if (!existsSync(leftPath)) throw new Error(`Left solver export does not exist: ${leftPath}`);
  if (!existsSync(rightPath)) throw new Error(`Right solver export does not exist: ${rightPath}`);
  if (samePath(leftPath, rightPath)) throw new Error("--left and --right must be different files.");
  if (samePath(outputPath, markdownPath)) throw new Error("--output and --markdown must be different files.");
  for (const reportPath of [outputPath, markdownPath]) {
    if (samePath(reportPath, leftPath) || samePath(reportPath, rightPath)) {
      throw new Error("Comparison reports must not overwrite either solver export.");
    }
  }
  return { json, leftPath, markdownPath, options, outputPath, rightPath, summary };
}

function run(args: CliArgs): ReportEnvelope {
  const leftBytes = readFileSync(args.leftPath);
  const rightBytes = readFileSync(args.rightPath);
  const leftInput: unknown = JSON.parse(leftBytes.toString("utf8"));
  const rightInput: unknown = JSON.parse(rightBytes.toString("utf8"));
  const comparison = compareSolverExactNodes(leftInput, rightInput, args.options);
  const left = sourceSummary(args.leftPath, leftBytes, leftInput, comparison.leftErrors);
  const right = sourceSummary(args.rightPath, rightBytes, rightInput, comparison.rightErrors);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    valid: comparison.valid,
    strategyValuesGenerated: "none",
    productionPromotion: "none",
    sources: { left, right },
    setupFingerprintMatch: left.setupSha256 === null || right.setupSha256 === null
      ? null
      : left.setupSha256 === right.setupSha256,
    comparison,
  };
}

function sourceSummary(
  path: string,
  bytes: Buffer,
  input: unknown,
  errors: readonly string[],
): SourceSummary {
  if (errors.length > 0 || !isRecord(input)) {
    return {
      path: sourceSafePath(path),
      sha256: sha256(bytes),
      setupSha256: null,
      solverId: null,
      solverVersion: null,
    };
  }
  const document = input as unknown as SolverExactNodeExport;
  return {
    path: sourceSafePath(path),
    sha256: sha256(bytes),
    setupSha256: sha256(Buffer.from(canonicalSolverSetupJson(document), "utf8")),
    solverId: document.solver.id,
    solverVersion: document.solver.version,
  };
}

function renderSummary(report: ReportEnvelope, args: CliArgs): string {
  const metrics = report.comparison.metrics;
  const lines = [
    "Exact solver node comparison",
    `valid: ${report.valid}`,
    `comparable: ${report.comparison.comparable}`,
    `evidence level: ${report.comparison.evidenceLevel}`,
    `setup fingerprint match: ${report.setupFingerprintMatch}`,
    `left: ${report.sources.left.solverId ?? "invalid"} ${report.sources.left.solverVersion ?? ""}`.trimEnd(),
    `right: ${report.sources.right.solverId ?? "invalid"} ${report.sources.right.solverVersion ?? ""}`.trimEnd(),
    `rows: ${metrics?.rows ?? 0}`,
    `mean/max strategy distance: ${metrics?.meanStrategyDistancePct ?? "n/a"}/${metrics?.maxStrategyDistancePct ?? "n/a"} pct`,
    `frequency outliers: ${metrics?.frequencyOutliers ?? "n/a"}`,
    `max action-EV delta: ${metrics?.maxActionEvDeltaBb ?? "n/a"} bb`,
    `disjoint best-action rows: ${metrics?.disjointBestActionRows ?? "n/a"}`,
    `disjoint best-action range weight: ${metrics?.disjointBestActionRangeWeightPct ?? "n/a"} pct`,
    `strategy values generated: ${report.strategyValuesGenerated}`,
    `production promotion: ${report.productionPromotion}`,
    `json: ${args.outputPath}`,
    `markdown: ${args.markdownPath}`,
  ];
  if (!args.summary) {
    lines.push(...report.comparison.blockers.map((blocker) => `blocker: ${blocker}`));
    lines.push(...report.comparison.warnings.map((warning) => `warning: ${warning}`));
  }
  return lines.join("\n");
}

function renderMarkdown(report: ReportEnvelope): string {
  const metrics = report.comparison.metrics;
  const outliers = [...report.comparison.rows]
    .filter((row) => !row.pass)
    .sort((left, right) => (
      right.strategyDistancePct - left.strategyDistancePct ||
      (right.maxActionEvDeltaBb ?? 0) - (left.maxActionEvDeltaBb ?? 0) ||
      left.key.localeCompare(right.key)
    ));
  return [
    "# Exact solver node comparison",
    "",
    `- Valid: ${report.valid}`,
    `- Comparable: ${report.comparison.comparable}`,
    `- Evidence level: ${report.comparison.evidenceLevel}`,
    `- Setup fingerprint match: ${report.setupFingerprintMatch}`,
    `- Left solver: ${report.sources.left.solverId ?? "invalid"} ${report.sources.left.solverVersion ?? ""}`.trimEnd(),
    `- Right solver: ${report.sources.right.solverId ?? "invalid"} ${report.sources.right.solverVersion ?? ""}`.trimEnd(),
    `- Rows: ${metrics?.rows ?? 0}`,
    `- Mean strategy distance: ${metrics?.meanStrategyDistancePct ?? "n/a"} pct`,
    `- Max strategy distance: ${metrics?.maxStrategyDistancePct ?? "n/a"} pct`,
    `- Max action-EV delta: ${metrics?.maxActionEvDeltaBb ?? "n/a"} bb`,
    `- Disjoint best-action rows: ${metrics?.disjointBestActionRows ?? "n/a"}`,
    `- Disjoint best-action range weight: ${metrics?.disjointBestActionRangeWeightPct ?? "n/a"} pct`,
    "",
    "## Blockers",
    "",
    report.comparison.blockers.length === 0
      ? "None."
      : report.comparison.blockers.map((blocker) => `- ${blocker}`).join("\n"),
    "",
    "## Warnings",
    "",
    report.comparison.warnings.length === 0
      ? "None."
      : report.comparison.warnings.map((warning) => `- ${warning}`).join("\n"),
    "",
    "## Rows needing review",
    "",
    outliers.length === 0
      ? "No row exceeded the configured tolerances."
      : outliers.slice(0, 100).map((row) => (
          `- ${row.key}: strategyDistance=${row.strategyDistancePct} pct, ` +
          `maxEvDelta=${row.maxActionEvDeltaBb ?? "n/a"} bb, ${row.reasons.join(" ")}`
        )).join("\n"),
    "",
    "This report is comparison evidence only. It does not promote or generate strategy content.",
    "",
  ].join("\n");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run range:cross-check-exact -- --left=<texas-solver.json> --right=<other-solver.json> [--summary]",
    "",
    "Both files must use PKRTRAINER_SOLVER_EXACT_NODE_V1 and describe the same canonical profile, ranges, board, node and action tree.",
    "The report compares combo frequencies, action EV, equivalent best-action sets and solver accuracy without promoting content.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const result = argv[index + 1]?.trim() ?? "";
  if (result.length === 0 || result.startsWith("-")) throw new Error(`${flag} requires a value.`);
  return result;
}

function inlineValue(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function numberValue(item: string, flag: string): number {
  const parsed = Number(inlineValue(item, flag));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number.`);
  return parsed;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase("en-US") === resolve(right).toLocaleLowerCase("en-US");
}

function sourceSafePath(path: string): string {
  const local = relative(process.cwd(), path).replace(/\\/g, "/");
  return local.startsWith("../") || local === ".." ? basename(path) : local;
}

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
