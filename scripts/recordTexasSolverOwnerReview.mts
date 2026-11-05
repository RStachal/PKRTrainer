import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isOwnerEvidenceFingerprint, ownerEvidenceFromFamilyDir } from "./texasSolverOwnerEvidence.mts";

type Decision = "yes" | "no" | "scoped";

interface CliArgs {
  familyId: string;
  evidenceFingerprint: string;
  reviewer: string;
  reviewedAt: string;
  decision: Decision;
  scope: string;
  caveats: string;
  rootDir: string;
  write: boolean;
  confirm: string | null;
  json: boolean;
}

const CONFIRM_TOKEN = "RECORD_TEXAS_SOLVER_OWNER_REVIEW";

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-owner-review -- --family=<familyId> --evidence-fingerprint=sha256:<64 hex> --reviewer=<name> --reviewed-at=<YYYY-MM-DD> --decision=no --caveats=<text>",
    "  npm run mtt:texas-solver-owner-review -- --family=<familyId> --evidence-fingerprint=sha256:<64 hex> --reviewer=<name> --reviewed-at=<YYYY-MM-DD> --decision=scoped --scope=<exact scope> --caveats=<text> --write --confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW",
    "",
    "Dry-run is the default. The command records an explicit human decision in one existing review-notes.md file.",
    "It never reads raw solver JSON, creates strategy data, or infers a poker decision.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = recordOwnerReview(args);
  console.log(args.json ? JSON.stringify(result, null, 2) : renderResult(result));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const values = new Map<string, string>();
  let rootDir = resolve("Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver");
  let write = false;
  let confirm: string | null = null;
  let json = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item.startsWith("--root=")) { rootDir = resolve(value(item, "--root")); continue; }
    if (item.startsWith("--confirm=")) { confirm = value(item, "--confirm"); continue; }
    let matched = false;
    for (const flag of ["--family", "--evidence-fingerprint", "--reviewer", "--reviewed-at", "--decision", "--scope", "--caveats"]) {
      if (item.startsWith(`${flag}=`)) {
        values.set(flag, value(item, flag));
        matched = true;
        break;
      }
    }
    if (!matched) throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  const familyId = required(values, "--family");
  const evidenceFingerprint = required(values, "--evidence-fingerprint");
  if (!isOwnerEvidenceFingerprint(evidenceFingerprint)) throw new Error("--evidence-fingerprint must use sha256:<64 lowercase hex> format.");
  const reviewer = required(values, "--reviewer");
  const reviewedAt = required(values, "--reviewed-at");
  const decisionRaw = required(values, "--decision").toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) throw new Error("--reviewed-at must use YYYY-MM-DD.");
  if (decisionRaw !== "yes" && decisionRaw !== "no" && decisionRaw !== "scoped") {
    throw new Error("--decision must be yes, no, or scoped.");
  }
  const scope = values.get("--scope")?.trim() ?? "";
  const caveats = required(values, "--caveats");
  if ((decisionRaw === "yes" || decisionRaw === "scoped") && scope.length === 0) {
    throw new Error("--scope is required for yes or scoped decisions.");
  }
  if (write && confirm !== CONFIRM_TOKEN) {
    throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.`);
  }
  return { familyId, evidenceFingerprint, reviewer, reviewedAt, decision: decisionRaw, scope, caveats, rootDir, write, confirm, json };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return result;
}

function required(values: Map<string, string>, flag: string): string {
  const result = values.get(flag)?.trim() ?? "";
  if (result.length === 0) throw new Error(`${flag} is required.\n\n${usage()}`);
  return result;
}

function recordOwnerReview(args: CliArgs) {
  const familyDir = join(args.rootDir, args.familyId);
  const notesPath = join(familyDir, "review-notes.md");
  const errors: string[] = [];
  if (!existsSync(familyDir)) errors.push(`TexasSolver family is missing: ${familyDir}`);
  if (!existsSync(notesPath)) errors.push(`review-notes.md is missing: ${notesPath}`);
  if (errors.length === 0) {
    try {
      const current = ownerEvidenceFromFamilyDir(familyDir, args.familyId).fingerprint;
      if (args.evidenceFingerprint !== current) errors.push("Evidence fingerprint is stale for the current owner evidence.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) return { valid: false, writePerformed: false, notesPath, errors, changedFields: [] as string[] };

  const before = readFileSync(notesPath, "utf8");
  const usable = args.decision === "scoped" ? `scoped: ${args.scope}` : args.decision;
  const after = upsertFields(before, [
    ["Status", "REVIEWED"],
    ["Review evidence fingerprint", args.evidenceFingerprint],
    ["Reviewer", args.reviewer],
    ["Reviewed at", args.reviewedAt],
    ["Usable for production", usable],
    ["Usable scope", args.scope],
    ["Production caveats", args.caveats],
  ]);
  const changedFields = changedLabels(before, after, ["Status", "Review evidence fingerprint", "Reviewer", "Reviewed at", "Usable for production", "Usable scope", "Production caveats"]);
  if (args.write && before !== after) writeFileSync(notesPath, after, "utf8");
  return {
    valid: true,
    writePerformed: args.write && before !== after,
    notesPath,
    familyId: args.familyId,
    decision: args.decision,
    changedFields,
    errors: [],
  };
}

function upsertFields(text: string, fields: ReadonlyArray<readonly [string, string]>): string {
  let result = text.replace(/\s*$/, "");
  const missing: string[] = [];
  for (const [label, fieldValue] of fields) {
    const pattern = new RegExp(`^([\\t ]*${escapeRegExp(label)}[\\t ]*:)[^\\r\\n]*$`, "im");
    if (pattern.test(result)) result = result.replace(pattern, `$1 ${fieldValue}`);
    else missing.push(`${label}: ${fieldValue}`);
  }
  if (missing.length > 0) result = `${result}\n\n## Owner decision\n\n${missing.join("\n")}`;
  return `${result}\n`;
}

function changedLabels(before: string, after: string, labels: readonly string[]): string[] {
  return labels.filter((label) => fieldValue(before, label) !== fieldValue(after, label));
}

function fieldValue(text: string, label: string): string {
  const match = text.match(new RegExp(`^[\\t ]*${escapeRegExp(label)}[\\t ]*:[\\t ]*([^\\r\\n]*)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderResult(result: ReturnType<typeof recordOwnerReview>): string {
  return [
    "TexasSolver owner review record",
    `valid: ${result.valid}`,
    `write performed: ${result.writePerformed}`,
    `review notes: ${result.notesPath}`,
    ...(result.changedFields.length > 0 ? [`changed fields: ${result.changedFields.join(", ")}`] : []),
    ...result.errors.map((error) => `error: ${error}`),
  ].join("\n");
}
