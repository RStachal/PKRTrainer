import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Decision = "yes" | "no" | "scoped";

interface ReviewDecision {
  familyId: string;
  reviewer: string;
  reviewedAt: string;
  decision: string;
  scope: string;
  caveats: string;
}

interface DecisionFile {
  schemaVersion: "pkrtrainer-texas-solver-owner-decisions-v1";
  decisions: ReviewDecision[];
}

interface CliArgs {
  rootDir: string;
  templateOut: string | null;
  decisionsFile: string | null;
  write: boolean;
  confirm: string | null;
  json: boolean;
}

const CONFIRM_TOKEN = "RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH";
const SCHEMA_VERSION = "pkrtrainer-texas-solver-owner-decisions-v1";

try {
  const args = parseArgs(process.argv.slice(2));
  const result = run(args);
  console.log(args.json ? JSON.stringify(result, null, 2) : render(result));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-owner-review-batch -- --write-template --out=<decisions.json>",
    "  npm run mtt:texas-solver-owner-review-batch -- --decisions=<decisions.json>",
    "  npm run mtt:texas-solver-owner-review-batch -- --decisions=<decisions.json> --write --confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH",
    "",
    "The template lists existing review families with blank human decision fields.",
    "Only entries with a non-empty decision are processed. Dry-run is the default.",
    "This command never reads solver raw JSON, creates strategy data, or infers poker decisions.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let rootDir = resolve("Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver");
  let templateOut: string | null = null;
  let decisionsFile: string | null = null;
  let write = false;
  let confirm: string | null = null;
  let json = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write-template") { templateOut = resolve("artifacts/texas-solver-review-protocol/owner-review-decisions.template.json"); continue; }
    if (item === "--write") { write = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item.startsWith("--root=")) { rootDir = resolve(value(item, "--root")); continue; }
    if (item.startsWith("--out=")) { templateOut = resolve(value(item, "--out")); continue; }
    if (item.startsWith("--decisions=")) { decisionsFile = resolve(value(item, "--decisions")); continue; }
    if (item.startsWith("--confirm=")) { confirm = value(item, "--confirm"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if ((templateOut === null) === (decisionsFile === null)) {
    throw new Error(`Provide exactly one of --write-template or --decisions=<file>.\n\n${usage()}`);
  }
  if (write && decisionsFile === null) throw new Error("--write requires --decisions=<file>.");
  if (write && confirm !== CONFIRM_TOKEN) throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.`);
  return { rootDir, templateOut, decisionsFile, write, confirm, json };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function run(args: CliArgs) {
  const families = listFamilies(args.rootDir);
  if (args.templateOut !== null) {
    const document: DecisionFile = {
      schemaVersion: SCHEMA_VERSION,
      decisions: families.map((familyId) => ({ familyId, reviewer: "", reviewedAt: "", decision: "", scope: "", caveats: "" })),
    };
    mkdirSync(resolve(args.templateOut, ".."), { recursive: true });
    writeFileSync(args.templateOut, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return { valid: true, mode: "template", templateOut: args.templateOut, familyCount: families.length, errors: [] as string[] };
  }

  const parsed = readDecisionFile(args.decisionsFile!);
  const selected = parsed.decisions.filter((entry) => entry.decision.trim().length > 0);
  const errors = validateSelected(selected, families, args.rootDir);
  if (errors.length > 0) return { valid: false, mode: "record", writePerformed: false, selectedCount: selected.length, changes: [], errors };

  const changes = selected.map((entry) => previewChange(entry, args.rootDir));
  if (args.write) {
    for (const change of changes) writeFileSync(change.notesPath, change.after, "utf8");
  }
  return {
    valid: true,
    mode: "record",
    writePerformed: args.write,
    selectedCount: selected.length,
    changedCount: changes.filter((change) => change.before !== change.after).length,
    changes: changes.map(({ familyId, notesPath, changedFields }) => ({ familyId, notesPath, changedFields })),
    errors: [] as string[],
  };
}

function listFamilies(rootDir: string): string[] {
  if (!existsSync(rootDir)) throw new Error(`TexasSolver review root is missing: ${rootDir}`);
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(rootDir, entry.name, "review-notes.md")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function readDecisionFile(path: string): DecisionFile {
  if (!existsSync(path)) throw new Error(`Decision file is missing: ${path}`);
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`Decision file is not valid JSON: ${path}`); }
  if (!isDecisionFile(parsed)) throw new Error(`Decision file must use schemaVersion ${SCHEMA_VERSION} and string fields for every decision entry.`);
  return parsed;
}

function isDecisionFile(value: unknown): value is DecisionFile {
  return typeof value === "object" && value !== null
    && (value as { schemaVersion?: unknown }).schemaVersion === SCHEMA_VERSION
    && Array.isArray((value as { decisions?: unknown }).decisions)
    && (value as { decisions: unknown[] }).decisions.every(isReviewDecision);
}

function isReviewDecision(value: unknown): value is ReviewDecision {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return ["familyId", "reviewer", "reviewedAt", "decision", "scope", "caveats"]
    .every((field) => typeof entry[field] === "string");
}

function validateSelected(entries: readonly ReviewDecision[], families: readonly string[], rootDir: string): string[] {
  const errors: string[] = [];
  if (entries.length === 0) errors.push("No human decision was selected. Fill decision with yes, no, or scoped for at least one family.");
  const ids = new Set<string>();
  for (const entry of entries) {
    const prefix = entry.familyId?.trim() || "<missing familyId>";
    if (!entry.familyId?.trim()) errors.push("Decision entry is missing familyId.");
    else if (ids.has(entry.familyId)) errors.push(`${prefix}: duplicate familyId.`);
    else ids.add(entry.familyId);
    if (!families.includes(entry.familyId)) errors.push(`${prefix}: family does not have an existing review-notes.md.`);
    if (!isDecision(entry.decision)) errors.push(`${prefix}: decision must be yes, no, or scoped.`);
    if (!entry.reviewer?.trim()) errors.push(`${prefix}: reviewer is required.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt?.trim() ?? "")) errors.push(`${prefix}: reviewedAt must use YYYY-MM-DD.`);
    if (!entry.caveats?.trim()) errors.push(`${prefix}: caveats are required.`);
    if ((entry.decision === "yes" || entry.decision === "scoped") && !entry.scope?.trim()) errors.push(`${prefix}: scope is required for yes or scoped.`);
    if (entry.familyId && !existsSync(join(rootDir, entry.familyId, "review-notes.md"))) errors.push(`${prefix}: review-notes.md is missing.`);
  }
  return errors;
}

function isDecision(value: string): value is Decision {
  return value === "yes" || value === "no" || value === "scoped";
}

function previewChange(entry: ReviewDecision, rootDir: string) {
  const notesPath = join(rootDir, entry.familyId, "review-notes.md");
  const before = readFileSync(notesPath, "utf8");
  const usable = entry.decision === "scoped" ? `scoped: ${entry.scope.trim()}` : entry.decision;
  const after = upsertFields(before, [
    ["Status", "REVIEWED"],
    ["Reviewer", entry.reviewer.trim()],
    ["Reviewed at", entry.reviewedAt.trim()],
    ["Usable for production", usable],
    ["Usable scope", entry.scope.trim()],
    ["Production caveats", entry.caveats.trim()],
  ]);
  const labels = ["Status", "Reviewer", "Reviewed at", "Usable for production", "Usable scope", "Production caveats"];
  return { familyId: entry.familyId, notesPath, before, after, changedFields: labels.filter((label) => fieldValue(before, label) !== fieldValue(after, label)) };
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

function fieldValue(text: string, label: string): string {
  const match = text.match(new RegExp(`^[\\t ]*${escapeRegExp(label)}[\\t ]*:[\\t ]*([^\\r\\n]*)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function render(result: ReturnType<typeof run>): string {
  return [
    "TexasSolver owner review batch",
    `valid: ${result.valid}`,
    `mode: ${result.mode}`,
    ...(result.mode === "template" ? [`template: ${result.templateOut}`, `families: ${result.familyCount}`] : [`write performed: ${result.writePerformed}`, `selected decisions: ${result.selectedCount}`, `changed decisions: ${result.changedCount ?? 0}`]),
    ...result.errors.map((error) => `error: ${error}`),
  ].join("\n");
}
