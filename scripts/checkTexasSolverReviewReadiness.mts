import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  classifySolverBoardId,
  isSupportedSolverBoardId,
  TEXAS_SOLVER_BOARD_CATALOG_VERSION,
} from "../src/core/texasSolverBoardCatalog.ts";

const DEFAULT_REVIEWS_DIR = "artifacts/texas-solver-review-only-owner-depth/reviews";
const DEFAULT_PROTOCOL_REPORT = "artifacts/texas-solver-review-protocol/report.json";
const MIN_BOARDS = 12;
const MIN_COHORTS = 6;
const MAX_LARGEST_COHORT_SHARE = 0.5;

interface CliArgs {
  json: boolean;
  markdownOutputPath: string | null;
  outputPath: string | null;
  protocolReportPath: string;
  reviewsDir: string;
  summary: boolean;
}

interface ProtocolRow {
  familyId?: unknown;
  status?: unknown;
  protocolReady?: unknown;
  productionEligible?: unknown;
  blockers?: unknown;
}

interface ProtocolReport {
  rows?: unknown;
}

interface EvidenceReport {
  valid?: unknown;
  status?: unknown;
  familyId?: unknown;
  requestedBoards?: unknown;
  reviewOnlyTreeProfile?: unknown;
  blockers?: unknown;
  anomalies?: unknown;
}

type NextGate =
  | "EVIDENCE_REPAIR"
  | "MORE_REVIEW_ONLY_EVIDENCE"
  | "HUMAN_POKER_REVIEW"
  | "SEPARATE_PRODUCTION_CANDIDATE_GATE";

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.outputPath !== null) writeText(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (args.markdownOutputPath !== null) writeText(args.markdownOutputPath, renderMarkdown(report));
  console.log(args.json ? JSON.stringify(report, null, 2) : renderSummary(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let markdownOutputPath: string | null = null;
  let outputPath: string | null = null;
  let protocolReportPath = resolve(DEFAULT_PROTOCOL_REPORT);
  let reviewsDir = resolve(DEFAULT_REVIEWS_DIR);
  let summary = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item === "--reviews-dir") { reviewsDir = resolve(nextArg(argv, index, item)); index += 1; continue; }
    if (item.startsWith("--reviews-dir=")) { reviewsDir = resolve(inlineArg(item, "--reviews-dir")); continue; }
    if (item === "--protocol-report") { protocolReportPath = resolve(nextArg(argv, index, item)); index += 1; continue; }
    if (item.startsWith("--protocol-report=")) { protocolReportPath = resolve(inlineArg(item, "--protocol-report")); continue; }
    if (item === "--output") { outputPath = resolve(nextArg(argv, index, item)); index += 1; continue; }
    if (item.startsWith("--output=")) { outputPath = resolve(inlineArg(item, "--output")); continue; }
    if (item === "--markdown-output") { markdownOutputPath = resolve(nextArg(argv, index, item)); index += 1; continue; }
    if (item.startsWith("--markdown-output=")) { markdownOutputPath = resolve(inlineArg(item, "--markdown-output")); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, markdownOutputPath, outputPath, protocolReportPath, reviewsDir, summary };
}

function buildReport(args: CliArgs) {
  if (!existsSync(args.reviewsDir)) throw new Error(`Review-only evidence directory is missing: ${args.reviewsDir}`);
  if (!existsSync(args.protocolReportPath)) throw new Error(`Review protocol report is missing: ${args.protocolReportPath}`);

  const errors: string[] = [];
  const protocol = readJson<ProtocolReport>(args.protocolReportPath);
  if (!Array.isArray(protocol.rows)) throw new Error("Review protocol report has no rows array.");
  const protocolRows = new Map<string, ProtocolRow>();
  for (const raw of protocol.rows) {
    if (!isRecord(raw) || typeof raw.familyId !== "string" || !isSafeFamilyId(raw.familyId)) {
      errors.push("Review protocol contains an invalid family row.");
      continue;
    }
    if (protocolRows.has(raw.familyId)) {
      errors.push(`Review protocol contains duplicate family ${raw.familyId}.`);
      continue;
    }
    protocolRows.set(raw.familyId, raw);
  }

  const evidenceReports = new Map<string, { path: string; report: EvidenceReport }>();
  const reportPaths = readdirSync(args.reviewsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".review.json"))
    .map((entry) => join(args.reviewsDir, entry.name))
    .sort();
  for (const path of reportPaths) {
    let evidence: EvidenceReport;
    try {
      evidence = readJson<EvidenceReport>(path);
    } catch (error) {
      errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (typeof evidence.familyId !== "string" || !isSafeFamilyId(evidence.familyId)) {
      errors.push(`${path}: invalid familyId.`);
      continue;
    }
    if (evidenceReports.has(evidence.familyId)) {
      errors.push(`Duplicate review-only evidence report for ${evidence.familyId}.`);
      continue;
    }
    evidenceReports.set(evidence.familyId, { path, report: evidence });
  }

  const familyIds = [...new Set([...protocolRows.keys(), ...evidenceReports.keys()])].sort();
  const rows = familyIds.map((familyId) => {
    const protocolRow = protocolRows.get(familyId);
    const evidenceEntry = evidenceReports.get(familyId);
    const evidence = evidenceEntry?.report;
    const rawBoards = asStringArray(evidence?.requestedBoards);
    const uniqueBoards = [...new Set(rawBoards)].sort();
    const boardErrors: string[] = [];
    if (rawBoards.length !== uniqueBoards.length) boardErrors.push("requestedBoards contains duplicates.");
    for (const boardId of uniqueBoards) {
      if (!isSupportedSolverBoardId(boardId)) boardErrors.push(`Unsupported board ID ${boardId}.`);
    }
    const supportedBoards = uniqueBoards.filter(isSupportedSolverBoardId);
    const cohortCounts = new Map<string, number>();
    for (const boardId of supportedBoards) {
      const cohortId = classifySolverBoardId(boardId).cohortId;
      cohortCounts.set(cohortId, (cohortCounts.get(cohortId) ?? 0) + 1);
    }
    const cohorts = [...cohortCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cohortId, boardCount]) => ({ cohortId, boardCount }));
    const largestCohortCount = Math.max(0, ...cohorts.map((row) => row.boardCount));
    const largestCohortShare = supportedBoards.length === 0
      ? 0
      : Math.round((largestCohortCount / supportedBoards.length) * 1_000) / 1_000;
    const reportBlockers = asStringArray(evidence?.blockers);
    const reportWarnings = asStringArray(evidence?.anomalies);
    const evidenceValid = evidence !== undefined && evidence.valid === true &&
      evidence.status === "REVIEW_ONLY_EVIDENCE" &&
      evidence.reviewOnlyTreeProfile === "MEMORY_SAFE_REVIEW_ONLY" &&
      rawBoards.length > 0 && boardErrors.length === 0 && reportBlockers.length === 0;
    if (evidence !== undefined && !evidenceValid) {
      errors.push(`${familyId}: review-only evidence is malformed or invalid.`);
    }
    if (evidence !== undefined && protocolRow === undefined) {
      errors.push(`${familyId}: review-only evidence has no review protocol row.`);
    }
    const checks = {
      minimumBoards: supportedBoards.length >= MIN_BOARDS,
      minimumCohorts: cohorts.length >= MIN_COHORTS,
      balancedCohorts: largestCohortShare <= MAX_LARGEST_COHORT_SHARE,
    };
    const mechanicalShapeReady = evidenceValid && Object.values(checks).every(Boolean);
    const ownerProtocolReady = protocolRow?.protocolReady === true;
    const productionEligible = protocolRow?.productionEligible === true;
    const nextGate: NextGate = evidence !== undefined && !evidenceValid
      ? "EVIDENCE_REPAIR"
      : !mechanicalShapeReady
        ? "MORE_REVIEW_ONLY_EVIDENCE"
        : !ownerProtocolReady
          ? "HUMAN_POKER_REVIEW"
          : "SEPARATE_PRODUCTION_CANDIDATE_GATE";
    return {
      familyId,
      evidencePath: evidenceEntry?.path ?? null,
      evidencePresent: evidence !== undefined,
      evidenceValid,
      boardCount: supportedBoards.length,
      cohortCount: cohorts.length,
      largestCohortCount,
      largestCohortShare,
      cohorts,
      checks,
      mechanicalShapeReady,
      ownerStatus: typeof protocolRow?.status === "string" ? protocolRow.status : "MISSING_PROTOCOL_ROW",
      ownerProtocolReady,
      productionEligible,
      protocolBlockers: asStringArray(protocolRow?.blockers).length,
      evidenceIssues: [...boardErrors, ...reportBlockers],
      evidenceWarnings: reportWarnings.length,
      nextGate,
    };
  });

  return {
    valid: errors.length === 0 && rows.length > 0,
    generatedAt: new Date().toISOString(),
    basis: "REVIEW_ONLY_EVIDENCE_NOT_POKER_APPROVAL",
    catalogVersion: TEXAS_SOLVER_BOARD_CATALOG_VERSION,
    reviewsDir: args.reviewsDir,
    protocolReportPath: args.protocolReportPath,
    thresholds: {
      minimumBoards: MIN_BOARDS,
      minimumCohorts: MIN_COHORTS,
      maximumLargestCohortShare: MAX_LARGEST_COHORT_SHARE,
    },
    counts: {
      families: rows.length,
      evidenceReports: rows.filter((row) => row.evidencePresent).length,
      validEvidenceReports: rows.filter((row) => row.evidenceValid).length,
      mechanicalShapeReady: rows.filter((row) => row.mechanicalShapeReady).length,
      needsMoreEvidence: rows.filter((row) => row.nextGate === "MORE_REVIEW_ONLY_EVIDENCE").length,
      ownerProtocolReady: rows.filter((row) => row.ownerProtocolReady).length,
      productionEligible: rows.filter((row) => row.productionEligible).length,
    },
    rows,
    errors,
    guardrails: [
      "Mechanical shape readiness measures solved board diversity only; it is not a poker verdict.",
      "MEMORY_SAFE_REVIEW_ONLY evidence cannot become normalized strategy or action EV automatically.",
      "Owner review and a separate production-candidate gate remain mandatory.",
    ],
  };
}

function renderSummary(report: ReturnType<typeof buildReport>, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver mechanical review readiness",
    `valid: ${report.valid}`,
    `basis: ${report.basis}`,
    `families: ${report.counts.families}`,
    `valid evidence: ${report.counts.validEvidenceReports}/${report.counts.evidenceReports}`,
    `mechanical shape ready: ${report.counts.mechanicalShapeReady}/${report.counts.families}`,
    `owner protocol ready: ${report.counts.ownerProtocolReady}/${report.counts.families}`,
    `production eligible: ${report.counts.productionEligible}/${report.counts.families}`,
  ];
  if (!summaryOnly) {
    for (const row of report.rows) {
      lines.push(`${row.familyId}: boards=${row.boardCount}, cohorts=${row.cohortCount}, shape=${row.mechanicalShapeReady}, owner=${row.ownerStatus}, next=${row.nextGate}`);
    }
    for (const error of report.errors) lines.push(`error: ${error}`);
  }
  return lines.join("\n");
}

function renderMarkdown(report: ReturnType<typeof buildReport>): string {
  const rows = report.rows.map((row) => (
    `| ${row.familyId} | ${row.boardCount} | ${row.cohortCount} | ${(row.largestCohortShare * 100).toFixed(0)}% | ${row.mechanicalShapeReady ? "YES" : "NO"} | ${row.ownerStatus} | ${row.nextGate} |`
  ));
  return [
    "# TexasSolver Mechanical Review Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Basis: \`${report.basis}\``,
    "",
    "This source-safe report measures solved board diversity. It is not a poker review, production approval or action-EV source.",
    "",
    `- Valid evidence reports: ${report.counts.validEvidenceReports}/${report.counts.evidenceReports}`,
    `- Mechanical shape ready: ${report.counts.mechanicalShapeReady}/${report.counts.families}`,
    `- Owner protocol ready: ${report.counts.ownerProtocolReady}/${report.counts.families}`,
    `- Production eligible: ${report.counts.productionEligible}/${report.counts.families}`,
    "",
    "| Family | Boards | Cohorts | Largest cohort | Shape | Owner status | Next gate |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
    ...rows,
    "",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
  ].join("\n");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-review-readiness -- --summary",
    "  npm run mtt:texas-solver-review-readiness -- --json",
    "  npm run mtt:texas-solver-review-readiness -- --output=<report.json> --markdown-output=<report.md>",
    "",
    "Combines cumulative MEMORY_SAFE_REVIEW_ONLY board diversity with the separate owner-review protocol state.",
    "It never writes strategy, review decisions, normalized.json, permission.json or action EV.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function inlineArg(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.`);
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeFamilyId(value: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(value);
}
