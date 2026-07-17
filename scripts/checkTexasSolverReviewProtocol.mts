import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type UsableForProduction = "YES" | "NO" | "SCOPED" | "UNKNOWN";
type ReviewProtocolStatus =
  | "MISSING_REVIEW"
  | "NEEDS_REVIEW"
  | "REVIEWED_NOT_USABLE"
  | "REVIEWED_SCOPED"
  | "REVIEWED_PRODUCTION";

const REVIEW_WAVE_SIZE = 5;
const OWNER_REVIEW_PRIORITY = [
  ["MTT9_50BB_BTN_BB_SRP", "current BTN vs BB SRP pilot source"],
  ["MTT9_40BB_UTG_BB_SRP", "current UTG vs BB SRP pilot source"],
  ["MTT9_35BB_CO_BTN_3BP_REPAIR", "current BTN vs CO 3bet pilot repair source"],
  ["MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR", "current BTN vs BB facing-bet pilot source"],
  ["MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR", "current BTN vs CO 3bet facing-bet candidate"],
  ["MTT9_20BB_BTN_BB_SRP_LOWSPR", "BTN vs BB SRP low-SPR companion"],
  ["MTT9_80BB_BTN_BB_SRP_HIGHSPR", "BTN vs BB SRP high-SPR companion"],
  ["MTT9_25BB_CO_BB_SRP_CBET_LOWSPR", "CO vs BB SRP low-SPR companion"],
  ["MTT9_50BB_CO_BB_SRP_CBET_MIDSPR", "CO vs BB SRP mid-SPR companion"],
  ["MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR", "SB vs BB OOP low-SPR companion"],
  ["MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR", "SB vs BB OOP mid-SPR companion"],
  ["MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR", "SB vs BB OOP high-SPR companion"],
  ["MTT9_80BB_CO_BTN_3BP_MIDSPR", "BTN vs CO 3bet mid-SPR companion"],
  ["MTT9_150BB_CO_BTN_3BP_HIGHSPR", "BTN vs CO 3bet high-SPR companion"],
  ["MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR", "BTN vs CO 3bet facing-bet low-SPR companion"],
  ["MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR", "BTN vs BB facing-bet low-SPR companion"],
  ["MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR", "BTN vs BB facing-bet high-SPR companion"],
  ["MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH", "BTN vs CO 3bet facing-bet high-SPR companion"],
  ["MTT9_35BB_CO_BTN_3BP", "legacy 3bet family after its repair source"],
  ["MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR", "CO vs BB SRP high-SPR companion"],
] as const;
const OWNER_REVIEW_PRIORITY_BY_FAMILY = new Map<string, { index: number; focus: string }>(
  OWNER_REVIEW_PRIORITY.map(([familyId, focus], index) => [familyId, { index, focus }]),
);

interface CliArgs {
  familyId: string | null;
  json: boolean;
  outputPath: string | null;
  packetDir: string | null;
  requireProductionUsable: boolean;
  rootDir: string;
  summary: boolean;
  writeReviewTemplates: boolean;
}

interface ReviewProtocolRow {
  familyId: string;
  familyDir: string;
  reviewNotesPath: string;
  accuracyReportPath: string;
  reviewNotesPresent: boolean;
  accuracyReportPresent: boolean;
  status: ReviewProtocolStatus;
  statusText: string;
  reviewer: string;
  reviewedAt: string;
  usableForProduction: UsableForProduction;
  usableScope: string;
  productionCaveats: string;
  accuracyEvidence: string;
  protocolReady: boolean;
  productionEligible: boolean;
  blockers: string[];
  warnings: string[];
}

interface ReviewProtocolReport {
  valid: boolean;
  requireProductionUsable: boolean;
  rootDir: string;
  familyFilter: string | null;
  counts: {
    families: number;
    protocolReady: number;
    productionEligible: number;
    missingReview: number;
    needsReview: number;
    reviewedNotUsable: number;
    reviewedScoped: number;
    reviewedProduction: number;
    blockers: number;
    warnings: number;
  };
  rows: ReviewProtocolRow[];
  nextSteps: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-review-protocol",
    "  npm run mtt:texas-solver-review-protocol -- --summary",
    "  npm run mtt:texas-solver-review-protocol -- --json",
    "  npm run mtt:texas-solver-review-protocol -- --family=MTT9_50BB_BTN_BB_SRP",
    "  npm run mtt:texas-solver-review-protocol -- --packet-dir=artifacts/texas-solver-review-protocol/packet",
    "  npm run mtt:texas-solver-review-protocol -- --write-review-templates --summary",
    "  npm run mtt:texas-solver-review-protocol -- --require-production-usable",
    "  npm run mtt:texas-solver-review-protocol -- --root=<output/texas-solver>",
    "",
    "Checks human poker review sign-off for TexasSolver family outputs.",
    "--write-review-templates only appends missing blank decision fields to existing review-notes.md files.",
    "It does not read raw solver JSON and does not create production range files.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const preparedTemplates = args.writeReviewTemplates ? prepareReviewTemplates(args) : [];
  const report = buildReviewProtocolReport(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (args.packetDir !== null) writeReviewPackets(report, args.packetDir);
  if (preparedTemplates.length > 0) {
    console.log(`Prepared blank owner decision fields: ${preparedTemplates.length}`);
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let familyId: string | null = null;
  let json = false;
  let outputPath: string | null = null;
  let packetDir: string | null = null;
  let requireProductionUsable = false;
  let rootDir = resolve("Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver");
  let summary = false;
  let writeReviewTemplates = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--require-production-usable") {
      requireProductionUsable = true;
      continue;
    }
    if (item === "--write-review-templates") {
      writeReviewTemplates = true;
      continue;
    }
    if (item.startsWith("--family=")) {
      familyId = requiredInlineValue(item, "--family");
      continue;
    }
    if (item.startsWith("--root=")) {
      rootDir = resolve(requiredInlineValue(item, "--root"));
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(requiredInlineValue(item, "--output"));
      continue;
    }
    if (item.startsWith("--packet-dir=")) {
      packetDir = resolve(requiredInlineValue(item, "--packet-dir"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { familyId, json, outputPath, packetDir, requireProductionUsable, rootDir, summary, writeReviewTemplates };
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReviewProtocolReport(args: CliArgs): ReviewProtocolReport {
  const rows = familyDirs(args).map((familyDir) => reviewProtocolRow(familyDir));
  const valid = rows.length > 0 && rows.every((row) =>
    args.requireProductionUsable ? row.productionEligible : row.protocolReady,
  );

  return {
    valid,
    requireProductionUsable: args.requireProductionUsable,
    rootDir: args.rootDir,
    familyFilter: args.familyId,
    counts: {
      families: rows.length,
      protocolReady: rows.filter((row) => row.protocolReady).length,
      productionEligible: rows.filter((row) => row.productionEligible).length,
      missingReview: rows.filter((row) => row.status === "MISSING_REVIEW").length,
      needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
      reviewedNotUsable: rows.filter((row) => row.status === "REVIEWED_NOT_USABLE").length,
      reviewedScoped: rows.filter((row) => row.status === "REVIEWED_SCOPED").length,
      reviewedProduction: rows.filter((row) => row.status === "REVIEWED_PRODUCTION").length,
      blockers: rows.reduce((sum, row) => sum + row.blockers.length, 0),
      warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    },
    rows,
    nextSteps: [
      "Open each family review-notes.md and complete the human poker review checklist.",
      "Use Status: REVIEWED only after checking tree sizing, ranges, stack/pot scaling, board set and accuracy evidence.",
      "Use Usable for production: scoped:<scope> for narrow pilot-only sign-off, not yes.",
      "Run with --require-production-usable before promoting a reviewed family into normalized production imports.",
    ],
  };
}

function familyDirs(args: CliArgs): string[] {
  if (!existsSync(args.rootDir)) return [];
  if (args.familyId !== null) {
    const path = join(args.rootDir, args.familyId);
    return existsSync(path) ? [path] : [];
  }
  return readdirSync(args.rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(args.rootDir, entry.name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function prepareReviewTemplates(args: CliArgs): string[] {
  const prepared: string[] = [];
  for (const familyDir of familyDirs(args)) {
    const reviewNotesPath = join(familyDir, "review-notes.md");
    if (!existsSync(reviewNotesPath)) continue;
    const current = readFileSync(reviewNotesPath, "utf8");
    const requiredFields: Array<[string, string]> = [
      ["Reviewer", ""],
      ["Reviewed at", ""],
      ["Usable for production", ""],
      ["Usable scope", ""],
      ["Production caveats", ""],
    ];
    const missing = requiredFields.filter(([label]) => !hasField(current, label));
    if (missing.length === 0) continue;

    const section = [
      "",
      "## Owner decision",
      "",
      "<!-- Leave these fields blank until the human poker review is complete. -->",
      ...missing.map(([label, value]) => `${label}: ${value}`),
      "",
    ].join("\n");
    writeFileSync(reviewNotesPath, `${current.replace(/\s*$/, "")}\n${section}`, "utf8");
    prepared.push(familyDir.replace(/\\/g, "/").split("/").at(-1) ?? familyDir);
  }
  return prepared;
}

function hasField(text: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[\\t ]*${escaped}[\\t ]*:`, "im").test(text);
}

function reviewProtocolRow(familyDir: string): ReviewProtocolRow {
  const familyId = familyDir.replace(/\\/g, "/").split("/").at(-1) ?? familyDir;
  const reviewNotesPath = join(familyDir, "review-notes.md");
  const accuracyReportPath = join(familyDir, "accuracy-report.json");
  const reviewNotesPresent = existsSync(reviewNotesPath);
  const accuracyReportPresent = existsSync(accuracyReportPath);
  const text = reviewNotesPresent ? readFileSync(reviewNotesPath, "utf8") : "";
  const statusText = fieldValue(text, "Status") || (reviewNotesPresent ? "UNKNOWN" : "MISSING");
  const reviewer = fieldValue(text, "Reviewer");
  const reviewedAt = fieldValue(text, "Reviewed at") || fieldValue(text, "ReviewedAt");
  const usableRaw = fieldValue(text, "Usable for production") || fieldValue(text, "Production usable");
  const usableForProduction = parseUsableForProduction(usableRaw);
  const usableScope = fieldValue(text, "Usable scope") || usableRaw;
  const productionCaveats = fieldValue(text, "Production caveats");
  const accuracy = accuracyEvidenceSummary(accuracyReportPath);
  const accuracyEvidence = accuracy.text;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!reviewNotesPresent) {
    blockers.push("review-notes.md is missing.");
  }
  if (reviewNotesPresent && statusText.toUpperCase() !== "REVIEWED") {
    blockers.push(`Status must be REVIEWED after human poker review; got ${statusText}.`);
  }
  if (reviewer.length === 0) blockers.push("Reviewer is required.");
  if (reviewedAt.length === 0) blockers.push("Reviewed at is required.");
  if (usableForProduction === "UNKNOWN") {
    blockers.push("Usable for production must be yes, no, or scoped:<scope>.");
  }
  if ((usableForProduction === "YES" || usableForProduction === "SCOPED") && usableScope.length === 0) {
    blockers.push("Usable scope is required for yes/scoped decisions.");
  }
  if (productionCaveats.length === 0) warnings.push("Production caveats are empty.");
  if (!accuracyReportPresent) {
    warnings.push("accuracy-report.json is missing; production promotion must provide solver accuracy evidence.");
  } else if (!accuracy.hasParsedEvidence) {
    warnings.push("accuracy-report.json does not contain parsed production-grade accuracy evidence.");
  }

  const reviewed = reviewNotesPresent && statusText.toUpperCase() === "REVIEWED";
  const protocolReady = reviewed
    && reviewer.length > 0
    && reviewedAt.length > 0
    && usableForProduction !== "UNKNOWN";
  const productionEligible = protocolReady
    && (usableForProduction === "YES" || usableForProduction === "SCOPED")
    && accuracyReportPresent
    && accuracy.hasParsedEvidence;

  return {
    familyId,
    familyDir,
    reviewNotesPath,
    accuracyReportPath,
    reviewNotesPresent,
    accuracyReportPresent,
    status: rowStatus(reviewNotesPresent, reviewed, usableForProduction),
    statusText,
    reviewer,
    reviewedAt,
    usableForProduction,
    usableScope,
    productionCaveats,
    accuracyEvidence,
    protocolReady,
    productionEligible,
    blockers,
    warnings,
  };
}

function rowStatus(
  reviewNotesPresent: boolean,
  reviewed: boolean,
  usableForProduction: UsableForProduction,
): ReviewProtocolStatus {
  if (!reviewNotesPresent) return "MISSING_REVIEW";
  if (!reviewed || usableForProduction === "UNKNOWN") return "NEEDS_REVIEW";
  if (usableForProduction === "NO") return "REVIEWED_NOT_USABLE";
  if (usableForProduction === "SCOPED") return "REVIEWED_SCOPED";
  return "REVIEWED_PRODUCTION";
}

function fieldValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use horizontal whitespace only. \s can consume a line break and make an
  // intentionally empty field borrow the next checklist label as its value.
  const match = text.match(new RegExp(`^[\\t ]*${escaped}[\\t ]*:[\\t ]*([^\\r\\n]*)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function parseUsableForProduction(value: string): UsableForProduction {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return "UNKNOWN";
  if (/^(yes|y|true)\b/.test(normalized)) return "YES";
  if (/^(no|n|false)\b/.test(normalized)) return "NO";
  if (/^(scope|scoped|pilot)\b/.test(normalized) || normalized.includes("scope")) return "SCOPED";
  return "UNKNOWN";
}

interface AccuracyEvidenceSummary {
  hasParsedEvidence: boolean;
  text: string;
}

function accuracyEvidenceSummary(path: string): AccuracyEvidenceSummary {
  if (!existsSync(path)) return { hasParsedEvidence: false, text: "" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const accuracySource = stringValue(parsed.accuracySource);
    const exploitability = stringValue(parsed.exploitability);
    const warning = stringValue(parsed.warning);
    const perRawEvidence = parsedSolverLogEvidence(parsed.solverLogCoverage);
    const legacyParsedEvidence = exploitability.length > 0
      && !/not parsed|needs_review|no per-board/i.test(accuracySource);
    return {
      hasParsedEvidence: perRawEvidence.length > 0 || legacyParsedEvidence,
      text: [
        accuracySource,
        exploitability,
        ...perRawEvidence.map((item) => `${item.rawFileName}: ${item.value}`),
        warning,
      ].filter(Boolean).join(" | "),
    };
  } catch {
    return { hasParsedEvidence: false, text: "" };
  }
}

function parsedSolverLogEvidence(value: unknown): Array<{ rawFileName: string; value: string }> {
  if (typeof value !== "object" || value === null) return [];
  const evidence = (value as Record<string, unknown>).evidence;
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const rawFileName = stringValue((item as Record<string, unknown>).rawFileName);
    const source = stringValue((item as Record<string, unknown>).source);
    const capturedValue = finiteNumberText((item as Record<string, unknown>).value);
    const knownSource = source === "PER_BOARD_LOG" || source === "QUEUE_LOG";
    return rawFileName.length > 0 && capturedValue.length > 0 && knownSource
      ? [{ rawFileName, value: capturedValue }]
      : [];
  });
}

function finiteNumberText(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0 || !Number.isFinite(Number(trimmed))) return "";
  return trimmed;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function renderReport(report: ReviewProtocolReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver review protocol",
    `valid: ${report.valid}`,
    `require production usable: ${report.requireProductionUsable}`,
    `families: ${report.counts.families}`,
    `protocol ready: ${report.counts.protocolReady}`,
    `production eligible: ${report.counts.productionEligible}`,
    `missing review: ${report.counts.missingReview}`,
    `needs review: ${report.counts.needsReview}`,
    `reviewed not usable: ${report.counts.reviewedNotUsable}`,
    `reviewed scoped: ${report.counts.reviewedScoped}`,
    `reviewed production: ${report.counts.reviewedProduction}`,
    `blockers: ${report.counts.blockers}`,
    `warnings: ${report.counts.warnings}`,
  ];
  if (summaryOnly) return lines.join("\n");

  for (const row of report.rows) {
    lines.push(`${row.status} ${row.familyId}: reviewed=${row.protocolReady}, productionEligible=${row.productionEligible}, usable=${row.usableForProduction}`);
    lines.push(`  notes: ${row.reviewNotesPath}`);
    for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
    for (const warning of row.warnings) lines.push(`  warning: ${warning}`);
  }
  lines.push("next steps:");
  for (const step of report.nextSteps) lines.push(`  - ${step}`);
  return lines.join("\n");
}

function writeReviewPackets(report: ReviewProtocolReport, packetDir: string): void {
  mkdirSync(packetDir, { recursive: true });
  writeFileSync(join(packetDir, "README.md"), renderPacketReadme(report), "utf8");
  writeFileSync(join(packetDir, "review-protocol-summary.json"), `${JSON.stringify(report.counts, null, 2)}\n`, "utf8");
  writeFileSync(join(packetDir, "OWNER_REVIEW_WAVES.md"), renderReviewWaves(report), "utf8");
  for (const row of report.rows) {
    const dir = join(packetDir, safePathSegment(row.familyId));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "REVIEW_CHECKLIST.md"), renderFamilyChecklist(row), "utf8");
  }
}

function renderPacketReadme(report: ReviewProtocolReport): string {
  return [
    "# TexasSolver review protocol packet",
    "",
    "Source-safe checklist packet for human poker review. It does not contain raw solver JSON, strategy tables or production range imports.",
    "",
    `Families: ${report.counts.families}`,
    `Protocol ready: ${report.counts.protocolReady}`,
    `Production eligible: ${report.counts.productionEligible}`,
    `Needs review: ${report.counts.needsReview}`,
    `Blockers: ${report.counts.blockers}`,
    `Warnings: ${report.counts.warnings}`,
    "",
    "## How to use",
    "",
    "1. Open `OWNER_REVIEW_WAVES.md` and take one logistical wave at a time.",
    "2. Open each family `REVIEW_CHECKLIST.md`.",
    "3. Inspect the referenced review reports, accuracy report and family `review-notes.md`.",
    "4. Update `review-notes.md` only after real poker review.",
    "5. Re-run `npm run mtt:texas-solver-review-protocol -- --summary`.",
    "6. Use `--require-production-usable` only before production promotion dry-runs.",
    "",
  ].join("\n");
}

function renderReviewWaves(report: ReviewProtocolReport): string {
  const rows = [...report.rows].sort((left, right) => {
    const leftPriority = OWNER_REVIEW_PRIORITY_BY_FAMILY.get(left.familyId)?.index ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = OWNER_REVIEW_PRIORITY_BY_FAMILY.get(right.familyId)?.index ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.familyId.localeCompare(right.familyId);
  });
  const lines = [
    "# Owner review waves",
    "",
    "Logistical order for the current source-safe packet. Existing MTT Core pilot sources come first, followed by their missing SPR companions. This order does not imply poker quality, evidence strength or a usability decision.",
    "",
    `Families: ${rows.length}`,
    `Wave size: ${REVIEW_WAVE_SIZE}`,
    "",
  ];
  for (let index = 0; index < rows.length; index += REVIEW_WAVE_SIZE) {
    const wave = rows.slice(index, index + REVIEW_WAVE_SIZE);
    lines.push(`## Wave ${(index / REVIEW_WAVE_SIZE) + 1}`);
    lines.push("");
    for (const row of wave) {
      const focus = OWNER_REVIEW_PRIORITY_BY_FAMILY.get(row.familyId)?.focus ?? "unmapped family; deterministic alphabetical fallback";
      lines.push(`- ${row.familyId}: ${row.status}; blockers=${row.blockers.length}; warnings=${row.warnings.length}; focus=${focus}`);
    }
    lines.push("");
  }
  lines.push("After each wave, update only the reviewed families' `review-notes.md` and re-run the review protocol. No strategy value is implied by this order.", "");
  return lines.join("\n");
}

function renderFamilyChecklist(row: ReviewProtocolRow): string {
  return [
    `# TexasSolver review checklist: ${row.familyId}`,
    "",
    `Status: ${row.status}`,
    `Protocol ready: ${row.protocolReady}`,
    `Production eligible: ${row.productionEligible}`,
    `Usable for production: ${row.usableForProduction}`,
    "",
    "## Files to inspect",
    "",
    `- Review notes: ${row.reviewNotesPath}`,
    `- Accuracy report: ${row.accuracyReportPath}`,
    `- Family directory: ${row.familyDir}`,
    "",
    "## Current accuracy evidence",
    "",
    ...(row.accuracyEvidence.length > 0 ? [`- ${row.accuracyEvidence}`] : ["- No parsed solver accuracy evidence recorded."]),
    "",
    "## Required review-notes.md fields",
    "",
    "```text",
    "Status: REVIEWED",
    "Reviewer: <name or internal reviewer id>",
    "Reviewed at: <YYYY-MM-DD>",
    "Usable for production: no | scoped: <exact scope> | yes",
    "Usable scope: <spot family, node, SPR/board/position limitations>",
    "Production caveats: <tree sizing, accuracy, range and validation caveats>",
    "```",
    "",
    "## Poker review checklist",
    "",
    "- [ ] Confirm intended PKRTrainer spot family, node and player mapping.",
    "- [ ] Confirm IP/OOP ranges and stack/pot/SPR assumptions match the intended training slot.",
    "- [ ] Confirm board list and texture coverage are sufficient for the declared scope.",
    "- [ ] Confirm bet/raise tree and all-in settings are appropriate for the declared scope.",
    "- [ ] Confirm solver accuracy/exploitability evidence is acceptable and traceable.",
    "- [ ] Compare at least a small random sample against another tool or manual poker review for sanity.",
    "- [ ] Decide explicitly: not usable, scoped pilot only, or production candidate.",
    "",
    "## Current blockers",
    "",
    ...(row.blockers.length > 0 ? row.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Current warnings",
    "",
    ...(row.warnings.length > 0 ? row.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_");
}
