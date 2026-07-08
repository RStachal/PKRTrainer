export const CONTENT_PACK_MANIFEST_SCHEMA = "pkrtrainer_content_pack_manifest_v1";

export type ContentPackKind =
  | "MTT_PREFLOP"
  | "MTT_FLOP"
  | "MTT_TURN"
  | "MTT_RIVER"
  | "MTT_POSTFLOP_PILOT"
  | "MTT_UTILITY_MODEL";

export type ContentPackInstallMode =
  | "BUNDLED"
  | "OPTIONAL"
  | "REMOTE_DISABLED";

export type ContentPackUpdateAction =
  | "KEEP"
  | "INSTALL"
  | "UPDATE"
  | "REMOVE"
  | "BLOCKED";

export interface ContentPackManifestEntry {
  id: string;
  label: string;
  kind: ContentPackKind;
  releaseTrain: string;
  scenarioId: string;
  version: string;
  installMode: ContentPackInstallMode;
  assetPath: string;
  bytes: number;
  sha256: string;
  dependencies: readonly string[];
  rollbackVersion?: string;
  resumable: boolean;
  chunkBytes: number;
}

export interface ContentPackManifest {
  schema: typeof CONTENT_PACK_MANIFEST_SCHEMA;
  generatedAt: string;
  appShellVersion: string;
  packs: readonly ContentPackManifestEntry[];
}

export interface InstalledContentPack {
  id: string;
  version: string;
  sha256: string;
  bytes: number;
}

export interface ContentPackUpdatePlanItem {
  id: string;
  action: ContentPackUpdateAction;
  reason: string;
  fromVersion: string | null;
  toVersion: string | null;
  bytes: number;
  resumable: boolean;
  rollbackVersion: string | null;
}

export interface ContentPackLibraryReport {
  valid: boolean;
  counts: {
    packs: number;
    bundled: number;
    optional: number;
    remoteDisabled: number;
    totalBytes: number;
    errors: number;
  };
  releaseTrains: readonly string[];
  scenarioIds: readonly string[];
  updatePlan: readonly ContentPackUpdatePlanItem[];
  errors: readonly string[];
}

export function buildContentPackLibraryReport(
  manifest: ContentPackManifest,
  installedPacks: readonly InstalledContentPack[] = [],
): ContentPackLibraryReport {
  const errors = validateContentPackManifest(manifest);
  const releaseTrains = uniqueSorted(manifest.packs.map((pack) => pack.releaseTrain));
  const scenarioIds = uniqueSorted(manifest.packs.map((pack) => pack.scenarioId));
  return {
    valid: errors.length === 0,
    counts: {
      packs: manifest.packs.length,
      bundled: manifest.packs.filter((pack) => pack.installMode === "BUNDLED").length,
      optional: manifest.packs.filter((pack) => pack.installMode === "OPTIONAL").length,
      remoteDisabled: manifest.packs.filter((pack) => pack.installMode === "REMOTE_DISABLED").length,
      totalBytes: manifest.packs.reduce((sum, pack) => sum + pack.bytes, 0),
      errors: errors.length,
    },
    releaseTrains,
    scenarioIds,
    updatePlan: buildContentPackUpdatePlan(manifest, installedPacks),
    errors,
  };
}

export function validateContentPackManifest(manifest: ContentPackManifest): string[] {
  const errors: string[] = [];
  if (manifest.schema !== CONTENT_PACK_MANIFEST_SCHEMA) {
    errors.push(`Unsupported content pack manifest schema: ${manifest.schema}.`);
  }
  if (manifest.appShellVersion.trim().length === 0) {
    errors.push("appShellVersion is required.");
  }
  const ids = new Set<string>();
  for (const pack of manifest.packs) {
    const prefix = `${pack.id}:`;
    if (ids.has(pack.id)) errors.push(`${prefix} duplicate content pack id.`);
    ids.add(pack.id);
    if (pack.id.trim().length === 0) errors.push("Content pack id is required.");
    if (pack.label.trim().length === 0) errors.push(`${prefix} label is required.`);
    if (pack.releaseTrain.trim().length === 0) errors.push(`${prefix} releaseTrain is required.`);
    if (pack.scenarioId.trim().length === 0) errors.push(`${prefix} scenarioId is required.`);
    if (pack.version.trim().length === 0) errors.push(`${prefix} version is required.`);
    if (!isRelativeAssetPath(pack.assetPath)) {
      errors.push(`${prefix} assetPath must be a relative offline asset path.`);
    }
    if (!Number.isInteger(pack.bytes) || pack.bytes < 0) {
      errors.push(`${prefix} bytes must be a non-negative integer.`);
    }
    if (!isSha256(pack.sha256)) {
      errors.push(`${prefix} sha256 must use sha256:<64 hex chars> format.`);
    }
    if (!Number.isInteger(pack.chunkBytes) || pack.chunkBytes <= 0) {
      errors.push(`${prefix} chunkBytes must be a positive integer.`);
    }
    if (pack.installMode === "OPTIONAL" && !pack.resumable) {
      errors.push(`${prefix} optional packs must support resumable install.`);
    }
    for (const dependency of pack.dependencies) {
      if (dependency === pack.id) errors.push(`${prefix} pack cannot depend on itself.`);
    }
  }
  const knownIds = new Set(manifest.packs.map((pack) => pack.id));
  for (const pack of manifest.packs) {
    for (const dependency of pack.dependencies) {
      if (!knownIds.has(dependency)) {
        errors.push(`${pack.id}: unknown dependency ${dependency}.`);
      }
    }
  }
  return errors;
}

export function buildContentPackUpdatePlan(
  manifest: ContentPackManifest,
  installedPacks: readonly InstalledContentPack[],
): ContentPackUpdatePlanItem[] {
  const targetById = new Map(manifest.packs.map((pack) => [pack.id, pack]));
  const installedById = new Map(installedPacks.map((pack) => [pack.id, pack]));
  const plan: ContentPackUpdatePlanItem[] = [];

  for (const pack of manifest.packs) {
    const installed = installedById.get(pack.id);
    if (pack.installMode === "REMOTE_DISABLED") {
      plan.push(planItem(pack, installed, "BLOCKED", "Pack is listed but remote install is disabled."));
      continue;
    }
    if (installed === undefined) {
      plan.push(planItem(pack, null, "INSTALL", "Pack is not installed yet."));
      continue;
    }
    if (installed.version === pack.version && installed.sha256 === pack.sha256) {
      plan.push(planItem(pack, installed, "KEEP", "Installed pack matches manifest integrity."));
      continue;
    }
    plan.push(planItem(pack, installed, "UPDATE", "Installed pack differs from manifest version or hash."));
  }

  for (const installed of installedPacks) {
    if (!targetById.has(installed.id)) {
      plan.push({
        id: installed.id,
        action: "REMOVE",
        reason: "Installed pack is not present in the current manifest.",
        fromVersion: installed.version,
        toVersion: null,
        bytes: installed.bytes,
        resumable: false,
        rollbackVersion: null,
      });
    }
  }

  return plan.sort((a, b) => a.id.localeCompare(b.id));
}

function planItem(
  pack: ContentPackManifestEntry,
  installed: InstalledContentPack | null | undefined,
  action: ContentPackUpdateAction,
  reason: string,
): ContentPackUpdatePlanItem {
  return {
    id: pack.id,
    action,
    reason,
    fromVersion: installed?.version ?? null,
    toVersion: pack.version,
    bytes: pack.bytes,
    resumable: pack.resumable,
    rollbackVersion: pack.rollbackVersion ?? null,
  };
}

function isRelativeAssetPath(value: string): boolean {
  if (value.trim().length === 0) return false;
  if (/^[a-z]+:\/\//i.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (value.split(/[\\/]/).includes("..")) return false;
  return true;
}

function isSha256(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
