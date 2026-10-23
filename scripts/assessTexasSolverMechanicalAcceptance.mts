import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { OWNER_DECISION_SCHEMA_VERSION, ownerEvidenceFromFamilyDir } from "./texasSolverOwnerEvidence.mts";

/**
 * Mechanical acceptance for TexasSolver families.
 *
 * This is deliberately NOT a human poker verdict. It grades each family only on
 * objective solver evidence already present on disk:
 *   1. structural completeness (every expected board present, parseable, no
 *      missing per-board log, no invalid JSON);
 *   2. convergence, meaning every board's recorded exploitability is at or below
 *      the solver's own declared accuracy target.
 *
 * A family that passes both is emitted as a `scoped` beta-field-review decision
 * whose reviewer id and caveats make the mechanical, non-human basis explicit.
 * A family with any over-target or structurally incomplete board is emitted as
 * `no` until it is re-solved and re-assessed. The output is a decisions file for
 * the existing, audited `mtt:texas-solver-owner-review-batch` writer, so no new
 * write path or schema is introduced and the whole step is repeatable.
 *
 * It never reads raw solver strategy JSON and never infers a poker decision.
 */

const DEFAULT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_REVIEWER_ID = "PKRTRAINER_MECHANICAL_ACCEPTANCE_V1";
// The solver parameter files pin `set_accuracy 0.5`; a board is converged when
// its recorded exploitability is at or below that same target.
const DEFAULT_EXPLOITABILITY_TARGET = 0.5;
const BETA_FIELD_SCOPE = "beta-field-review";

type Disposition = "ACCEPTED" | "WITHHELD";
type Decision = "yes" | "no" | "scoped";

interface BoardEvidence {
  boardId: string;
  rawFileName: string;
  exploitability: number;
  source: string;
}

interface FamilyAssessment {
  familyId: string;
  disposition: Disposition;
  decision: Decision;
  boards: number;
  maxExploitability: number | null;
  meanExploitability: number | null;
  exploitabilityTarget: number;
  overTargetBoards: BoardEvidence[];
  structurallyComplete: boolean;
  evidenceFingerprint: string;
  scope: string;
  caveats: string;
  reasons: string[];
}

interface ReviewDecisionEntry {
  familyId: string;
  evidenceFingerprint: string;
  reviewer: string;
  reviewedAt: string;
  decision: string;
  scope: string;
  caveats: string;
}

interface CliArgs {
  rootDir: string;
  out: string | null;
  reviewerId: string;
  reviewedAt: string;
  exploitabilityTarget: number;
  json: boolean;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = run(args);
  if (args.out !== null) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(result.decisionFile, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(result.report, null, 2) : render(result.report, args));
  process.exitCode = result.report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-mechanical-acceptance -- --summary",
    "  npm run mtt:texas-solver-mechanical-acceptance -- --out=<decisions.json> --summary",
    "  npm run mtt:texas-solver-mechanical-acceptance -- --exploitability-target=0.5 --json",
    "",
    "Grades each TexasSolver family on objective solver evidence only and emits a",
    "decisions file for mtt:texas-solver-owner-review-batch. This is a mechanical",
    "beta-field-review acceptance, not a human poker verdict. It never reads raw",
    "solver strategy JSON and never invents a poker decision.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let rootDir = resolve(DEFAULT_ROOT);
  let out: string | null = null;
  let reviewerId = DEFAULT_REVIEWER_ID;
  let reviewedAt = todayIso();
  let exploitabilityTarget = DEFAULT_EXPLOITABILITY_TARGET;
  let json = false;
  let summary = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item.startsWith("--root=")) { rootDir = resolve(value(item, "--root")); continue; }
    if (item.startsWith("--out=")) { out = resolve(value(item, "--out")); continue; }
    if (item.startsWith("--reviewer-id=")) { reviewerId = value(item, "--reviewer-id"); continue; }
    if (item.startsWith("--reviewed-at=")) { reviewedAt = value(item, "--reviewed-at"); continue; }
    if (item.startsWith("--exploitability-target=")) {
      exploitabilityTarget = Number(value(item, "--exploitability-target"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (!/^[A-Za-z0-9_]+$/.test(reviewerId)) {
    throw new Error("--reviewer-id must be a single [A-Za-z0-9_] token so it is never mistaken for a person.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) throw new Error("--reviewed-at must use YYYY-MM-DD.");
  if (!Number.isFinite(exploitabilityTarget) || exploitabilityTarget <= 0) {
    throw new Error("--exploitability-target must be a positive number.");
  }
  return { rootDir, out, reviewerId, reviewedAt, exploitabilityTarget, json, summary };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function run(args: CliArgs) {
  const families = listFamilies(args.rootDir);
  if (families.length === 0) throw new Error(`No review families found under ${args.rootDir}.`);

  const assessments = families.map((familyId) => assessFamily(familyId, args));
  const decisions: ReviewDecisionEntry[] = assessments.map((assessment) => ({
    familyId: assessment.familyId,
    evidenceFingerprint: assessment.evidenceFingerprint,
    reviewer: args.reviewerId,
    reviewedAt: args.reviewedAt,
    decision: assessment.decision,
    scope: assessment.scope,
    caveats: assessment.caveats,
  }));

  const accepted = assessments.filter((item) => item.disposition === "ACCEPTED");
  const withheld = assessments.filter((item) => item.disposition === "WITHHELD");

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    basis: "MECHANICAL_SOLVER_EVIDENCE_NOT_HUMAN_POKER_VERDICT",
    reviewerId: args.reviewerId,
    reviewedAt: args.reviewedAt,
    exploitabilityTarget: args.exploitabilityTarget,
    valid: true,
    counts: {
      families: assessments.length,
      accepted: accepted.length,
      withheld: withheld.length,
      overTargetBoards: assessments.reduce((sum, item) => sum + item.overTargetBoards.length, 0),
    },
    families: assessments,
  };
  const decisionFile = { schemaVersion: OWNER_DECISION_SCHEMA_VERSION, decisions };
  return { report, decisionFile };
}

function listFamilies(rootDir: string): string[] {
  if (!existsSync(rootDir)) throw new Error(`TexasSolver review root is missing: ${rootDir}`);
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(rootDir, entry.name, "review-notes.md")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function assessFamily(familyId: string, args: CliArgs): FamilyAssessment {
  const familyDir = join(args.rootDir, familyId);
  const evidenceFingerprint = ownerEvidenceFromFamilyDir(familyDir, familyId).fingerprint;
  const accuracyPath = join(familyDir, "accuracy-report.json");
  const reasons: string[] = [];

  if (!existsSync(accuracyPath)) {
    reasons.push("accuracy-report.json is missing.");
    return withheldAssessment(familyId, args, evidenceFingerprint, [], false, reasons);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(accuracyPath, "utf8")) as Record<string, unknown>;
  } catch {
    reasons.push("accuracy-report.json is not valid JSON.");
    return withheldAssessment(familyId, args, evidenceFingerprint, [], false, reasons);
  }

  const coverage = isRecord(parsed.solverLogCoverage) ? parsed.solverLogCoverage : {};
  const expectedLogs = nonNegativeInteger(coverage.expectedLogs);
  const parsedLogs = nonNegativeInteger(coverage.parsedLogs);
  const missingLogs = Array.isArray(coverage.missingLogs) ? coverage.missingLogs.length : null;
  const invalidJson = nonNegativeInteger(parsed.invalidJson);
  const parseableJson = nonNegativeInteger(parsed.parseableJson);
  const rawExportCount = nonNegativeInteger(parsed.rawExportCount);

  const boards = readBoardEvidence(coverage.evidence);

  const structurallyComplete =
    invalidJson === 0 &&
    parseableJson !== null && rawExportCount !== null && parseableJson === rawExportCount &&
    expectedLogs !== null && parsedLogs !== null && expectedLogs === parsedLogs &&
    missingLogs === 0 &&
    boards.length > 0 && boards.length === expectedLogs;

  if (invalidJson !== 0) reasons.push(`Has ${invalidJson} invalid raw export(s).`);
  if (parseableJson !== rawExportCount) reasons.push("Parseable export count does not match raw export count.");
  if (expectedLogs !== parsedLogs) reasons.push("Expected and parsed per-board log counts do not reconcile.");
  if (missingLogs !== 0) reasons.push(`Has ${missingLogs ?? "unknown"} missing per-board log(s).`);
  if (boards.length === 0) reasons.push("No per-board exploitability evidence recorded.");
  else if (boards.length !== expectedLogs) reasons.push("Per-board evidence count does not match expected boards.");

  const overTargetBoards = boards.filter((board) => board.exploitability > args.exploitabilityTarget);
  for (const board of overTargetBoards) {
    reasons.push(`Board ${board.boardId} exploitability ${round(board.exploitability)} exceeds target ${args.exploitabilityTarget}.`);
  }

  const values = boards.map((board) => board.exploitability);
  const maxExploitability = values.length > 0 ? Math.max(...values) : null;
  const meanExploitability = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

  const disposition: Disposition =
    structurallyComplete && overTargetBoards.length === 0 ? "ACCEPTED" : "WITHHELD";

  if (disposition === "ACCEPTED") {
    return {
      familyId,
      disposition,
      decision: "scoped",
      boards: boards.length,
      maxExploitability,
      meanExploitability,
      exploitabilityTarget: args.exploitabilityTarget,
      overTargetBoards,
      structurallyComplete,
      evidenceFingerprint,
      scope: BETA_FIELD_SCOPE,
      caveats: acceptedCaveats(boards.length, maxExploitability, args),
      reasons,
    };
  }

  return withheldAssessment(familyId, args, evidenceFingerprint, overTargetBoards, structurallyComplete, reasons, {
    boards: boards.length,
    maxExploitability,
    meanExploitability,
  });
}

function withheldAssessment(
  familyId: string,
  args: CliArgs,
  evidenceFingerprint: string,
  overTargetBoards: BoardEvidence[],
  structurallyComplete: boolean,
  reasons: string[],
  stats: { boards: number; maxExploitability: number | null; meanExploitability: number | null } = {
    boards: 0,
    maxExploitability: null,
    meanExploitability: null,
  },
): FamilyAssessment {
  return {
    familyId,
    disposition: "WITHHELD",
    decision: "no",
    boards: stats.boards,
    maxExploitability: stats.maxExploitability,
    meanExploitability: stats.meanExploitability,
    exploitabilityTarget: args.exploitabilityTarget,
    overTargetBoards,
    structurallyComplete,
    evidenceFingerprint,
    scope: "",
    caveats: withheldCaveats(overTargetBoards, args),
    reasons,
  };
}

function acceptedCaveats(boards: number, maxExploitability: number | null, args: CliArgs): string {
  const maxText = maxExploitability === null ? "n/a" : round(maxExploitability);
  return [
    `Mechanical solver-accuracy acceptance by ${args.reviewerId}, not a human poker verdict.`,
    `Basis: all ${boards} boards converged at or below the ${args.exploitabilityTarget} exploitability target (max observed ${maxText}).`,
    "Poker correctness is validated by professional-field beta distribution.",
    "Re-run the mechanical assessment if solver evidence changes.",
  ].join(" ");
}

function withheldCaveats(overTargetBoards: BoardEvidence[], args: CliArgs): string {
  const list = overTargetBoards
    .slice()
    .sort((left, right) => right.exploitability - left.exploitability)
    .map((board) => `${board.boardId} (${round(board.exploitability)})`)
    .join(", ");
  const detail = list.length > 0
    ? `Boards above the ${args.exploitabilityTarget} exploitability target: ${list}. Re-solve those boards, then re-run the mechanical assessment.`
    : "Structural evidence is incomplete; re-check solver output before acceptance.";
  return `Withheld by ${args.reviewerId}: not accepted for beta field review. ${detail}`;
}

function readBoardEvidence(value: unknown): BoardEvidence[] {
  if (!Array.isArray(value)) return [];
  const boards: BoardEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const rawFileName = typeof item.rawFileName === "string" ? item.rawFileName : "";
    const source = typeof item.source === "string" ? item.source : "";
    const exploitability = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
    if (rawFileName.length === 0 || exploitability === null) continue;
    boards.push({ rawFileName, source, exploitability, boardId: boardIdFromRawName(rawFileName) });
  }
  return boards;
}

function boardIdFromRawName(rawFileName: string): string {
  const match = /_([AKQJT98765432]{3}(?:r|tt|mono))\.(?:json|log)$/i.exec(rawFileName);
  return match?.[1] ?? rawFileName;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function render(report: ReturnType<typeof run>["report"], args: CliArgs): string {
  const lines = [
    "TexasSolver mechanical acceptance",
    "basis: MECHANICAL_SOLVER_EVIDENCE_NOT_HUMAN_POKER_VERDICT",
    `valid: ${report.valid}`,
    `reviewer id: ${report.reviewerId}`,
    `reviewed at: ${report.reviewedAt}`,
    `exploitability target: ${report.exploitabilityTarget}`,
    `families: ${report.counts.families}`,
    `accepted (scoped beta field review): ${report.counts.accepted}`,
    `withheld (no, pending re-solve): ${report.counts.withheld}`,
    `over-target boards: ${report.counts.overTargetBoards}`,
  ];
  if (args.out !== null) lines.push(`decisions file: ${args.out}`);
  if (args.summary) return lines.join("\n");

  for (const family of report.families) {
    const max = family.maxExploitability === null ? "n/a" : round(family.maxExploitability);
    lines.push(`${family.disposition} ${family.familyId}: decision=${family.decision}, boards=${family.boards}, max=${max}`);
    for (const reason of family.reasons) lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}
