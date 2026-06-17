import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks.ts";
import { flopProductionStrategyPacks } from "../src/data/ranges/flopProductionStrategyResolver.ts";
import { turnProductionStrategyPacks } from "../src/data/ranges/turnProductionStrategyResolver.ts";
import { riverProductionStrategyPacks } from "../src/data/ranges/riverProductionStrategyResolver.ts";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
} from "../src/data/ranges/mttProductionReadiness.ts";

interface CliArgs {
  json: boolean;
}

interface RegistryPackSummary {
  packId: string;
  kind: "mtt-preflop" | "flop-production" | "turn-production" | "river-production";
  registered: boolean;
  legalImportSlot: boolean;
  generatedModulePath: string | null;
  permissionManifestPath: string | null;
}

interface RegistryIntegrityReport {
  valid: boolean;
  counts: {
    legalImportSlots: number;
    registeredRuntimePacks: number;
    generatedProductionModules: number;
    permissionManifests: number;
    errors: number;
  };
  packs: readonly RegistryPackSummary[];
  errors: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildRegistryIntegrityReport();
  console.log(args.json ? JSON.stringify(report, null, 2) : renderRegistryIntegrityReport(report));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:registry-integrity",
    "  npm run mtt:registry-integrity -- --json",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json };
}

function buildRegistryIntegrityReport(): RegistryIntegrityReport {
  const legalSlots = legalImportSlots();
  const legalPackIds = new Map(legalSlots.map((slot) => [slot.packId, slot]));
  const registeredPacks = registeredRuntimePacks();
  const registeredPackIds = new Set(registeredPacks.map((pack) => pack.packId));
  const generatedModules = generatedProductionModules();
  const permissionManifests = permissionManifestPackIds(legalSlots);
  const errors = [
    ...duplicateErrors("registered runtime pack", registeredPacks.map((pack) => pack.packId)),
    ...duplicateErrors("generated production module", generatedModules.map((module) => module.packId)),
    ...registeredProductionSlotErrors(registeredPacks, legalPackIds),
    ...generatedModuleErrors(generatedModules, legalPackIds, registeredPackIds),
    ...permissionManifestErrors(permissionManifests, legalPackIds),
  ];
  const generatedByPackId = new Map(generatedModules.map((module) => [module.packId, module.path]));
  const permissionByPackId = new Map(permissionManifests.map((manifest) => [manifest.packId, manifest.path]));
  const packIds = [...new Set([
    ...registeredPacks.map((pack) => pack.packId),
    ...generatedModules.map((module) => module.packId),
    ...permissionManifests.map((manifest) => manifest.packId),
  ])].sort();

  return {
    valid: errors.length === 0,
    counts: {
      legalImportSlots: legalSlots.length,
      registeredRuntimePacks: registeredPacks.length,
      generatedProductionModules: generatedModules.length,
      permissionManifests: permissionManifests.length,
      errors: errors.length,
    },
    packs: packIds.map((packId) => ({
      packId,
      kind: packKindFor(packId, registeredPacks, legalPackIds),
      registered: registeredPackIds.has(packId),
      legalImportSlot: legalPackIds.has(packId),
      generatedModulePath: generatedByPackId.get(packId) ?? null,
      permissionManifestPath: permissionByPackId.get(packId) ?? null,
    })),
    errors,
  };
}

function legalImportSlots(): MttCompletionImportSlotHint[] {
  return buildMttCompletionReadinessReport().rows
    .map((row) => row.importSlot)
    .filter((slot): slot is MttCompletionImportSlotHint => slot !== null);
}

function registeredRuntimePacks(): Array<{
  packId: string;
  kind: RegistryPackSummary["kind"];
}> {
  return [
    ...allMttPreflopRangePacks.map((pack) => ({
      packId: pack.id,
      kind: "mtt-preflop" as const,
    })),
    ...flopProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "flop-production" as const,
    })),
    ...turnProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "turn-production" as const,
    })),
    ...riverProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "river-production" as const,
    })),
  ];
}

function generatedProductionModules(): Array<{ packId: string; path: string }> {
  const rangeDir = "src/data/ranges";
  if (!existsSync(rangeDir)) return [];
  return readdirSync(rangeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(rangeDir, entry.name).replace(/\\/g, "/"))
    .map((path) => ({ path, packId: readGeneratedModulePackId(path) }))
    .filter((item): item is { packId: string; path: string } => item.packId !== null)
    .filter((item) => item.packId.includes("-production-"));
}

function readGeneratedModulePackId(path: string): string | null {
  const content = readFileSync(path, "utf8");
  const match = content.match(/"id":\s*"([^"]+-production-[^"]+)"/);
  return match?.[1] ?? null;
}

function permissionManifestPackIds(
  legalSlots: readonly MttCompletionImportSlotHint[],
): Array<{ packId: string; path: string }> {
  const manifests: Array<{ packId: string; path: string }> = [];
  for (const slot of legalSlots) {
    if (!existsSync(slot.permissionManifestPath)) continue;
    const packId = readPermissionPackId(slot.permissionManifestPath);
    if (packId !== null) manifests.push({ packId, path: slot.permissionManifestPath });
  }
  return manifests;
}

function readPermissionPackId(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return typeof parsed.packId === "string" ? parsed.packId : null;
  } catch {
    return null;
  }
}

function duplicateErrors(label: string, values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort().map((value) => `Duplicate ${label}: ${value}`);
}

function registeredProductionSlotErrors(
  registeredPacks: readonly { packId: string; kind: RegistryPackSummary["kind"] }[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
): string[] {
  return registeredPacks
    .filter((pack) => pack.packId.includes("-production-"))
    .filter((pack) => !legalPackIds.has(pack.packId))
    .map((pack) => `Registered production pack is outside legal MTT import slots: ${pack.packId}`);
}

function generatedModuleErrors(
  generatedModules: readonly { packId: string; path: string }[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
  registeredPackIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  for (const module of generatedModules) {
    if (!legalPackIds.has(module.packId)) {
      errors.push(`Generated production module is outside legal MTT import slots: ${module.path}`);
    }
    if (!registeredPackIds.has(module.packId)) {
      errors.push(`Generated production module is not registered in runtime resolver: ${module.path}`);
    }
  }
  return errors;
}

function permissionManifestErrors(
  permissionManifests: readonly { packId: string; path: string }[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
): string[] {
  return permissionManifests
    .filter((manifest) => !legalPackIds.has(manifest.packId))
    .map((manifest) => `Permission manifest packId is outside legal MTT import slots: ${manifest.path}`);
}

function packKindFor(
  packId: string,
  registeredPacks: readonly { packId: string; kind: RegistryPackSummary["kind"] }[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
): RegistryPackSummary["kind"] {
  return registeredPacks.find((pack) => pack.packId === packId)?.kind ??
    legalPackIds.get(packId)?.kind ??
    "mtt-preflop";
}

function renderRegistryIntegrityReport(report: RegistryIntegrityReport): string {
  const lines = [
    "MTT production registry integrity",
    `valid: ${report.valid}`,
    `legal import slots: ${report.counts.legalImportSlots}`,
    `registered runtime packs: ${report.counts.registeredRuntimePacks}`,
    `generated production modules: ${report.counts.generatedProductionModules}`,
    `permission manifests: ${report.counts.permissionManifests}`,
    `errors: ${report.counts.errors}`,
  ];

  for (const pack of report.packs) {
    lines.push(
      [
        pack.packId,
        pack.kind,
        pack.registered ? "REGISTERED" : "UNREGISTERED",
        pack.legalImportSlot ? "LEGAL_SLOT" : "LEGACY_OR_UNKNOWN",
      ].join(" | "),
    );
    if (pack.generatedModulePath !== null) lines.push(`  module: ${pack.generatedModulePath}`);
    if (pack.permissionManifestPath !== null) lines.push(`  permission: ${pack.permissionManifestPath}`);
  }
  for (const error of report.errors) lines.push(`error: ${error}`);

  return lines.join("\n");
}
