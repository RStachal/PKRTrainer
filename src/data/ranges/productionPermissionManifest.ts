export type ProductionPermissionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION";

export type ProductionPermissionRedistributionScope =
  | "PKRTRAINER_RUNTIME_BUNDLE"
  | "PKRTRAINER_INTERNAL_REVIEW_ONLY"
  | "NO_REDISTRIBUTION";

export interface ProductionPermissionEvidence {
  referenceId: string;
  storedAt: string;
  reviewer: string;
  description: string;
  containsRangeValues: boolean;
}

export interface ProductionPermissionManifest {
  packId: string;
  version: string;
  reviewedAt: string;
  reviewer: string;
  rightsOwner: string;
  licenseKind: ProductionPermissionLicenseKind;
  allowedRedistributionScope: ProductionPermissionRedistributionScope;
  sourceMaterialLocation: string;
  evidence: readonly ProductionPermissionEvidence[];
  notes: readonly string[];
}

export interface ProductionPermissionManifestReport {
  manifestPresent: boolean;
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
  targetPackId: string;
  manifestPackId: string;
  licenseKind: string;
  allowedRedistributionScope: string;
  rightsOwner: string;
  reviewer: string;
  reviewedAt: string;
  evidenceCount: number;
}

interface PermissionManifestTarget {
  packId: string;
  licenseKind: string;
}

const LEGAL_LICENSE_KINDS: readonly ProductionPermissionLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];

const PRODUCTION_SCOPES: readonly ProductionPermissionRedistributionScope[] = [
  "PKRTRAINER_RUNTIME_BUNDLE",
];

const KNOWN_SCOPES: readonly ProductionPermissionRedistributionScope[] = [
  "PKRTRAINER_RUNTIME_BUNDLE",
  "PKRTRAINER_INTERNAL_REVIEW_ONLY",
  "NO_REDISTRIBUTION",
];

const FORBIDDEN_SOURCE_KEYS = new Set(["url", "href", "sourceUrl", "providerUrl"]);

export function buildProductionPermissionManifestReport(
  manifest: ProductionPermissionManifest | null,
  target: PermissionManifestTarget,
): ProductionPermissionManifestReport {
  if (manifest === null) {
    return {
      manifestPresent: false,
      valid: false,
      errors: ["Production permission manifest is required for range promotion."],
      warnings: [],
      targetPackId: target.packId,
      manifestPackId: "",
      licenseKind: "",
      allowedRedistributionScope: "",
      rightsOwner: "",
      reviewer: "",
      reviewedAt: "",
      evidenceCount: 0,
    };
  }

  const errors = validateProductionPermissionManifest(manifest, target);
  const warnings = warningMessages(manifest);

  return {
    manifestPresent: true,
    valid: errors.length === 0,
    errors,
    warnings,
    targetPackId: target.packId,
    manifestPackId: manifest.packId,
    licenseKind: manifest.licenseKind,
    allowedRedistributionScope: manifest.allowedRedistributionScope,
    rightsOwner: manifest.rightsOwner,
    reviewer: manifest.reviewer,
    reviewedAt: manifest.reviewedAt,
    evidenceCount: manifest.evidence.length,
  };
}

export function validateProductionPermissionManifest(
  manifest: ProductionPermissionManifest,
  target: PermissionManifestTarget,
): string[] {
  const errors: string[] = [];

  if (manifest.packId.trim().length === 0) {
    errors.push("Permission manifest packId is required.");
  }
  if (manifest.packId !== target.packId) {
    errors.push(`Permission manifest packId ${manifest.packId} does not match ${target.packId}.`);
  }
  if (manifest.version.trim().length === 0) {
    errors.push("Permission manifest version is required.");
  }
  if (manifest.reviewedAt.trim().length === 0) {
    errors.push("Permission manifest reviewedAt is required.");
  }
  if (manifest.reviewer.trim().length === 0) {
    errors.push("Permission manifest reviewer is required.");
  }
  if (manifest.rightsOwner.trim().length === 0) {
    errors.push("Permission manifest rightsOwner is required.");
  }
  if (!LEGAL_LICENSE_KINDS.includes(manifest.licenseKind)) {
    errors.push("Permission manifest needs a production legal licenseKind.");
  }
  if (manifest.licenseKind !== target.licenseKind) {
    errors.push(
      `Permission manifest licenseKind ${manifest.licenseKind} does not match ${target.licenseKind}.`,
    );
  }
  if (!KNOWN_SCOPES.includes(manifest.allowedRedistributionScope)) {
    errors.push("Permission manifest allowedRedistributionScope is not supported.");
  }
  if (!PRODUCTION_SCOPES.includes(manifest.allowedRedistributionScope)) {
    errors.push("Permission manifest must allow PKRTrainer runtime bundle redistribution.");
  }
  if (manifest.sourceMaterialLocation.trim().length === 0) {
    errors.push("Permission manifest sourceMaterialLocation is required.");
  }
  if (manifest.evidence.length === 0) {
    errors.push("Permission manifest needs at least one evidence record.");
  }

  for (const [index, item] of manifest.evidence.entries()) {
    const tag = `permissionEvidence[${index}]`;
    if (item.referenceId.trim().length === 0) errors.push(`${tag}.referenceId is required.`);
    if (item.storedAt.trim().length === 0) errors.push(`${tag}.storedAt is required.`);
    if (item.reviewer.trim().length === 0) errors.push(`${tag}.reviewer is required.`);
    if (item.description.trim().length === 0) errors.push(`${tag}.description is required.`);
    if (typeof item.containsRangeValues !== "boolean") {
      errors.push(`${tag}.containsRangeValues must be boolean.`);
    }
  }

  const forbiddenPaths = findForbiddenSourceKeyPaths(manifest);
  if (forbiddenPaths.length > 0) {
    errors.push(
      `Permission manifest must use internal reference IDs instead of URL fields: ${forbiddenPaths.join(",")}.`,
    );
  }

  return errors;
}

export function renderProductionPermissionManifestReport(
  report: ProductionPermissionManifestReport,
): string {
  const lines = [
    `permissionManifest: ${report.manifestPresent ? "present" : "missing"}`,
    `permissionReady: ${report.valid}`,
    `targetPackId: ${report.targetPackId}`,
    `manifestPackId: ${report.manifestPackId || "none"}`,
    `licenseKind: ${report.licenseKind || "none"}`,
    `redistributionScope: ${report.allowedRedistributionScope || "none"}`,
    `rightsOwner: ${report.rightsOwner || "none"}`,
    `reviewer: ${report.reviewer || "none"}`,
    `reviewedAt: ${report.reviewedAt || "none"}`,
    `evidence: ${report.evidenceCount}`,
  ];

  if (report.errors.length > 0) {
    lines.push("permission errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  if (report.warnings.length > 0) {
    lines.push("permission warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  return lines.join("\n");
}

function warningMessages(manifest: ProductionPermissionManifest): string[] {
  const warnings: string[] = [];

  if (manifest.notes.length === 0) {
    warnings.push("Permission manifest has no reviewer notes.");
  }
  if (!manifest.evidence.some((item) => item.containsRangeValues)) {
    warnings.push("Permission manifest evidence does not mark where range values are stored.");
  }

  return warnings;
}

function findForbiddenSourceKeyPaths(value: unknown): string[] {
  const out: string[] = [];
  visitForbiddenSourceKeys(value, "$", out);
  return out;
}

function visitForbiddenSourceKeys(value: unknown, path: string, out: string[]): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitForbiddenSourceKeys(item, `${path}[${index}]`, out));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_SOURCE_KEYS.has(key)) out.push(childPath);
    visitForbiddenSourceKeys(child, childPath, out);
  }
}
