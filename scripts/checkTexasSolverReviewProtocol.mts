import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type UsableForProduction = "YES" | "NO" | "SCOPED" | "UNKNOWN";
type ReviewProtocolStatus =
  | "MISSING_REVIEW"
  | "NEEDS_REVIEW"
  | "REVIEWED_NOT_USABLE"
  | "REVIEWED_SCOPED"
  | "REVIEWED_PRODUCTION";

interface CliArgs {
  familyId: string | null;
  json: boolean;
  outputPath: string | null;
  requireProductionUsable: boolean;
  rootDir: string;
  summary: boolean;
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
    "  npm run mtt:texas-solver-review-protocol -- --require-production-usable",
    "  npm run mtt:texas-solver-review-protocol -- --root=<output/texas-solver>",
    "",
    "Checks human poker review sign-off for TexasSolver family outputs.",
    "It does not read raw solver JSON and does not create production range files.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReviewProtocolReport(args);
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
  let familyId: string | null = null;
  let json = false;
  let outputPath: string | null = null;
  let requireProductionUsable = false;
  let rootDir = resolve("Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver");
  let summary = false;

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
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { familyId, json, outputPath, requireProductionUsable, rootDir, summary };
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
  const accuracyEvidence = accuracyEvidenceText(accuracyReportPath);
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
  } else if (accuracyEvidence.length === 0 || /not parsed|needs_review/i.test(accuracyEvidence)) {
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
    && accuracyEvidence.length > 0
    && !/not parsed|needs_review/i.test(accuracyEvidence);

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
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, "im"));
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

function accuracyEvidenceText(path: string): string {
  if (!existsSync(path)) return "";
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return [
      stringValue(parsed.status),
      stringValue(parsed.accuracySource),
      stringValue(parsed.exploitability),
      stringValue(parsed.warning),
    ].filter(Boolean).join(" | ");
  } catch {
    return "";
  }
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
