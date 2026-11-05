import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export const OWNER_EVIDENCE_SCHEMA_VERSION = "pkrtrainer-texas-solver-owner-evidence-v1";
export const OWNER_DECISION_SCHEMA_VERSION = "pkrtrainer-texas-solver-owner-decisions-v2";

interface EvidenceFile {
  name: string;
  sha256: string;
}

export interface OwnerEvidenceFingerprint {
  familyId: string;
  fingerprint: string;
  reportCount: number;
  accuracyPresent: boolean;
}

export function ownerEvidenceFromFamilyDir(familyDir: string, familyId: string): OwnerEvidenceFingerprint {
  if (!/^[A-Za-z0-9_]+$/.test(familyId)) throw new Error(`Owner evidence familyId is invalid: ${familyId}`);
  if (!existsSync(familyDir)) throw new Error(`Owner evidence family directory is missing: ${familyDir}`);
  const reportPaths = readdirSync(familyDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isReviewReportName(entry.name))
    .map((entry) => join(familyDir, entry.name));
  const accuracyPath = join(familyDir, "accuracy-report.json");
  return ownerEvidenceFromPaths(familyId, reportPaths, existsSync(accuracyPath) ? accuracyPath : null);
}

export function ownerEvidenceFromPaths(
  familyId: string,
  reportPaths: readonly string[],
  accuracyPath: string | null,
): OwnerEvidenceFingerprint {
  if (!/^[A-Za-z0-9_]+$/.test(familyId)) throw new Error(`Owner evidence familyId is invalid: ${familyId}`);
  if (reportPaths.length === 0) throw new Error(`Owner evidence has no review reports for ${familyId}.`);
  const reports = reportPaths.map((path) => evidenceFile(path, familyId, "review report"));
  reports.sort((left, right) => left.name.localeCompare(right.name, "en"));
  if (new Set(reports.map((report) => report.name.toLowerCase())).size !== reports.length) {
    throw new Error(`Owner evidence has duplicate review report names for ${familyId}.`);
  }
  const accuracy = accuracyPath === null ? null : evidenceFile(accuracyPath, familyId, "accuracy report");
  const document = {
    schemaVersion: OWNER_EVIDENCE_SCHEMA_VERSION,
    familyId,
    reports,
    accuracy,
  };
  return {
    familyId,
    fingerprint: `sha256:${createHash("sha256").update(JSON.stringify(document)).digest("hex")}`,
    reportCount: reports.length,
    accuracyPresent: accuracy !== null,
  };
}

export function isOwnerEvidenceFingerprint(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function isReviewReportName(name: string): boolean {
  return name.endsWith(".review.json") || name.endsWith(".review-report.json");
}

function evidenceFile(path: string, familyId: string, label: string): EvidenceFile {
  if (!existsSync(path)) throw new Error(`Owner evidence ${label} is missing for ${familyId}: ${path}`);
  const content = readFileSync(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error(`Owner evidence ${label} is not valid JSON for ${familyId}: ${path}`);
  }
  if (!isRecord(parsed) || parsed.familyId !== familyId) {
    throw new Error(`Owner evidence ${label} family does not match ${familyId}: ${path}`);
  }
  return {
    name: basename(path),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
