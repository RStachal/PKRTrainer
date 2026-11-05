import type { BlindSpeed, EvModel } from "../../core/trainingProfile";
import { findPlaceholderStringPaths } from "./placeholderText";

export type ProductionPermissionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION";

export type ProductionPermissionRedistributionScope =
  | "PKRTRAINER_RUNTIME_BUNDLE"
  | "PKRTRAINER_INTERNAL_REVIEW_ONLY"
  | "NO_REDISTRIBUTION";

export type ProductionPermissionReuseDimension = "BLIND_SPEED" | "EV_MODEL";

export interface ProductionPermissionEvidence {
  referenceId: string;
  storedAt: string;
  reviewer: string;
  description: string;
  containsRangeValues: boolean;
}

export interface ProductionPermissionReusePolicy {
  allowedDimensions: readonly ProductionPermissionReuseDimension[];
  reviewedAt: string;
  reviewer: string;
  rationale: string;
  sourceMaterialReferenceIds: readonly string[];
}

/**
 * Zdroj, ze kterého jsou **jen některé záznamy** packu (`RangePackRecord.provenance`).
 *
 * Pack má jeden `licenseKind` a ten platí pro jeho hlavní zdroj. Záznam z
 * jiného zdroje - koupené charty vlastníka vedle vlastního exportu - musí
 * manifest jmenovat zvlášť, jinak by povolení tvrdilo o původu dat něco, co
 * pro část packu neplatí (pravidlo dvě: pravda o původu dat se neohýbá).
 */
export interface ProductionPermissionAdditionalSource {
  /** Přesně ten text, kterým záznamy zdroj jmenují (před první čárkou `provenance`). */
  source: string;
  reviewedAt: string;
  reviewer: string;
  rationale: string;
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
  reusePolicy?: ProductionPermissionReusePolicy;
  additionalSources?: readonly ProductionPermissionAdditionalSource[];
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
  reusePolicyDimensions: readonly ProductionPermissionReuseDimension[];
}

interface PermissionManifestTarget {
  packId: string;
  licenseKind: string;
  blindSpeeds?: readonly BlindSpeed[];
  evModels?: readonly EvModel[];
  /** Zdroje jmenované na úrovni záznamů (`provenance`); každý musí manifest uznat. */
  additionalSources?: readonly string[];
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

const KNOWN_REUSE_DIMENSIONS: readonly ProductionPermissionReuseDimension[] = [
  "BLIND_SPEED",
  "EV_MODEL",
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
      reusePolicyDimensions: [],
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
    reusePolicyDimensions: manifest.reusePolicy?.allowedDimensions ?? [],
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
  if (manifest.evidence.length === 0 && manifest.licenseKind !== "OWNED_SOLVER_EXPORT") {
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

  const reuseDimensions = new Set(manifest.reusePolicy?.allowedDimensions ?? []);
  if (uniqueCount(target.blindSpeeds ?? []) > 1 && !reuseDimensions.has("BLIND_SPEED")) {
    errors.push(
      "Permission manifest must include reviewed BLIND_SPEED reuse policy when target covers multiple blind speeds.",
    );
  }
  if (uniqueCount(target.evModels ?? []) > 1 && !reuseDimensions.has("EV_MODEL")) {
    errors.push(
      "Permission manifest must include reviewed EV_MODEL reuse policy when target covers multiple EV models.",
    );
  }
  if (manifest.reusePolicy !== undefined) {
    errors.push(...validateReusePolicy(manifest));
  }

  // Zdroj na úrovni záznamů bez uznání v manifestu je tichá změna původu dat.
  // Poprvé to nastalo 16. 9. 2026: schválené mřížky z koupených chartů
  // vedle vlastního exportu, a manifest packu říkal „žádné hodnoty z chartů
  // třetí strany“. Uznání je krok člověka, ne skriptu.
  const acknowledged = new Set((manifest.additionalSources ?? []).map((item) => item.source));
  for (const source of target.additionalSources ?? []) {
    if (!acknowledged.has(source)) {
      errors.push(
        `Permission manifest must acknowledge record-level source "${source}" in additionalSources before promotion.`,
      );
    }
  }
  for (const [index, item] of (manifest.additionalSources ?? []).entries()) {
    const tag = `additionalSources[${index}]`;
    if (item.source.trim().length === 0) errors.push(`${tag}.source is required.`);
    if (item.reviewedAt.trim().length === 0) errors.push(`${tag}.reviewedAt is required.`);
    if (item.reviewer.trim().length === 0) errors.push(`${tag}.reviewer is required.`);
    if (item.rationale.trim().length === 0) errors.push(`${tag}.rationale is required.`);
  }

  const forbiddenPaths = findForbiddenSourceKeyPaths(manifest);
  if (forbiddenPaths.length > 0) {
    errors.push(
      `Permission manifest must use internal reference IDs instead of URL fields: ${forbiddenPaths.join(",")}.`,
    );
  }

  const placeholderPaths = findPlaceholderStringPaths(manifest);
  if (placeholderPaths.length > 0) {
    errors.push(
      `Permission manifest must replace placeholder text before promotion: ${placeholderPaths.join(",")}.`,
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
    `reusePolicy: ${report.reusePolicyDimensions.length > 0 ? report.reusePolicyDimensions.join(",") : "none"}`,
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
  if (
    manifest.licenseKind !== "OWNED_SOLVER_EXPORT" &&
    !manifest.evidence.some((item) => item.containsRangeValues)
  ) {
    warnings.push("Permission manifest evidence does not mark where range values are stored.");
  }

  return warnings;
}

function validateReusePolicy(manifest: ProductionPermissionManifest): string[] {
  const policy = manifest.reusePolicy;
  if (policy === undefined) return [];

  const errors: string[] = [];
  const evidenceReferenceIds = new Set(manifest.evidence.map((item) => item.referenceId));
  const seenDimensions = new Set<ProductionPermissionReuseDimension>();

  if (policy.allowedDimensions.length === 0) {
    errors.push("Permission manifest reusePolicy.allowedDimensions needs at least one dimension.");
  }
  for (const [index, dimension] of policy.allowedDimensions.entries()) {
    if (!KNOWN_REUSE_DIMENSIONS.includes(dimension)) {
      errors.push(`Permission manifest reusePolicy.allowedDimensions[${index}] is not supported.`);
      continue;
    }
    if (seenDimensions.has(dimension)) {
      errors.push(`Permission manifest reusePolicy.allowedDimensions[${index}] is duplicated.`);
    }
    seenDimensions.add(dimension);
  }

  if (policy.reviewedAt.trim().length === 0) {
    errors.push("Permission manifest reusePolicy.reviewedAt is required.");
  }
  if (policy.reviewer.trim().length === 0) {
    errors.push("Permission manifest reusePolicy.reviewer is required.");
  }
  if (policy.rationale.trim().length === 0) {
    errors.push("Permission manifest reusePolicy.rationale is required.");
  }
  if (
    policy.sourceMaterialReferenceIds.length === 0 &&
    manifest.licenseKind !== "OWNED_SOLVER_EXPORT"
  ) {
    errors.push("Permission manifest reusePolicy.sourceMaterialReferenceIds needs at least one evidence reference.");
  }
  for (const [index, referenceId] of policy.sourceMaterialReferenceIds.entries()) {
    if (referenceId.trim().length === 0) {
      errors.push(`Permission manifest reusePolicy.sourceMaterialReferenceIds[${index}] is required.`);
    } else if (!evidenceReferenceIds.has(referenceId)) {
      errors.push(
        `Permission manifest reusePolicy.sourceMaterialReferenceIds[${index}] must reference an evidence referenceId.`,
      );
    }
  }

  return errors;
}

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
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
