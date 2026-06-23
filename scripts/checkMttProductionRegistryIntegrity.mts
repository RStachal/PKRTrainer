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
import { validateProductionStrategySemantics } from "../src/data/ranges/productionStrategySemanticValidation.ts";
import { buildProductionStrategyRuntimeSmokeReport } from "../src/data/ranges/productionStrategyRuntimeSmoke.ts";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
} from "../src/data/ranges/mttProductionReadiness.ts";

interface CliArgs {
  json: boolean;
  rangeDir: string;
}

interface RegistryPackSummary {
  packId: string;
  kind: "mtt-preflop" | "flop-production" | "turn-production" | "river-production";
  registered: boolean;
  legalImportSlot: boolean;
  registryStatus: "LEGAL_SLOT" | "PREVIEW_ONLY" | "UNKNOWN";
  generatedModulePath: string | null;
  permissionManifestPath: string | null;
}

interface RegisteredRuntimePack {
  packId: string;
  kind: RegistryPackSummary["kind"];
  profileKeys: readonly string[];
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
  const report = buildRegistryIntegrityReport(args.rangeDir);
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
    "  npm run mtt:registry-integrity -- --range-dir=src/data/ranges",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let rangeDir = "src/data/ranges";
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--range-dir=")) {
      const value = item.slice("--range-dir=".length).trim();
      if (value.length === 0) throw new Error(`--range-dir requires a path.\n\n${usage()}`);
      rangeDir = value;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, rangeDir };
}

function buildRegistryIntegrityReport(rangeDir: string): RegistryIntegrityReport {
  const completionRows = buildMttCompletionReadinessReport().rows
    .filter((row) => row.importSlot !== null);
  const legalSlots = completionRows.map((row) => row.importSlot as MttCompletionImportSlotHint);
  const legalPackIds = new Map(legalSlots.map((slot) => [slot.packId, slot]));
  const legalProfileKeys = new Map(completionRows.map((row) => [
    (row.importSlot as MttCompletionImportSlotHint).packId,
    profileKey(row.tableFormat, row.blindSpeed, row.evModel, row.street, row.ante),
  ]));
  const registeredPacks = registeredRuntimePacks();
  const registeredPackIds = new Set(registeredPacks.map((pack) => pack.packId));
  const generatedModules = generatedProductionModules(rangeDir);
  const permissionManifests = permissionManifestPackIds(legalSlots);
  const errors = [
    ...duplicateErrors("registered runtime pack", registeredPacks.map((pack) => pack.packId)),
    ...duplicateErrors("generated production module", generatedModules.map((module) => module.packId)),
    ...duplicateRegisteredProfileErrors(registeredPacks),
    ...registeredProductionSlotErrors(registeredPacks, legalPackIds, legalProfileKeys),
    ...registeredProductionSemanticErrors(),
    ...generatedModuleErrors(
      generatedModules,
      legalPackIds,
      registeredPackIds,
      new Set(permissionManifests.map((manifest) => manifest.packId)),
    ),
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
    packs: packIds.map((packId) => {
      const registered = registeredPackIds.has(packId);
      const legalImportSlot = legalPackIds.has(packId);
      return {
        packId,
        kind: packKindFor(packId, registeredPacks, legalPackIds),
        registered,
        legalImportSlot,
        registryStatus: legalImportSlot
          ? "LEGAL_SLOT"
          : registered
            ? "PREVIEW_ONLY"
            : "UNKNOWN",
        generatedModulePath: generatedByPackId.get(packId) ?? null,
        permissionManifestPath: permissionByPackId.get(packId) ?? null,
      };
    }),
    errors,
  };
}

function registeredProductionSemanticErrors(): string[] {
  return [
    ...flopProductionStrategyPacks,
    ...turnProductionStrategyPacks,
    ...riverProductionStrategyPacks,
  ].flatMap((pack) => [
    ...validateProductionStrategySemantics(pack),
    ...buildProductionStrategyRuntimeSmokeReport(pack).errors,
  ].map((error) => `${pack.id}: ${error}`));
}

function registeredRuntimePacks(): RegisteredRuntimePack[] {
  return [
    ...allMttPreflopRangePacks.map((pack) => ({
      packId: pack.id,
      kind: "mtt-preflop" as const,
      profileKeys: [
        profileKey(
          pack.dimensions.tableFormat,
          pack.dimensions.blindSpeed,
          pack.dimensions.evModel,
          "PREFLOP",
          pack.dimensions.ante,
        ),
      ],
    })),
    ...flopProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "flop-production" as const,
      profileKeys: postflopProfileKeys(pack.dimensions),
    })),
    ...turnProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "turn-production" as const,
      profileKeys: postflopProfileKeys(pack.dimensions),
    })),
    ...riverProductionStrategyPacks.map((pack) => ({
      packId: pack.id,
      kind: "river-production" as const,
      profileKeys: postflopProfileKeys(pack.dimensions),
    })),
  ];
}

function generatedProductionModules(
  rangeDir: string,
): Array<{ packId: string; path: string; provenanceFingerprint: string | null }> {
  if (!existsSync(rangeDir)) return [];
  return readdirSync(rangeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(rangeDir, entry.name).replace(/\\/g, "/"))
    .map((path) => ({
      path,
      packId: readGeneratedModulePackId(path),
      provenanceFingerprint: readGeneratedModuleFingerprint(path),
    }))
    .filter((item): item is {
      packId: string;
      path: string;
      provenanceFingerprint: string | null;
    } => item.packId !== null)
    .filter((item) => item.packId.includes("-production-"));
}

function readGeneratedModuleFingerprint(path: string): string | null {
  const content = readFileSync(path, "utf8");
  return content.match(/provenance-fingerprint:\s*sha256:([a-f0-9]{64})/i)?.[1] ?? null;
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

function duplicateRegisteredProfileErrors(
  registeredPacks: readonly RegisteredRuntimePack[],
): string[] {
  const packIdsByProfile = new Map<string, Set<string>>();
  for (const pack of registeredPacks) {
    for (const key of pack.profileKeys) {
      const packIds = packIdsByProfile.get(key) ?? new Set<string>();
      packIds.add(pack.packId);
      packIdsByProfile.set(key, packIds);
    }
  }

  return [...packIdsByProfile.entries()]
    .filter(([, packIds]) => packIds.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, packIds]) => (
      `Duplicate registered MTT production profile ${key}: ${[...packIds].sort().join(", ")}`
    ));
}

function registeredProductionSlotErrors(
  registeredPacks: readonly RegisteredRuntimePack[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
  legalProfileKeys: ReadonlyMap<string, string>,
): string[] {
  const errors: string[] = [];
  for (const pack of registeredPacks.filter((item) => item.packId.includes("-production-"))) {
    if (!legalPackIds.has(pack.packId)) {
      errors.push(`Registered production pack is outside legal MTT import slots: ${pack.packId}`);
      continue;
    }
    const expectedProfileKey = legalProfileKeys.get(pack.packId);
    if (
      expectedProfileKey === undefined ||
      pack.profileKeys.length !== 1 ||
      pack.profileKeys[0] !== expectedProfileKey
    ) {
      errors.push(
        `Registered production pack covers unsupported MTT dimensions: ${pack.packId}`,
      );
    }
  }
  return errors;
}

function generatedModuleErrors(
  generatedModules: readonly {
    packId: string;
    path: string;
    provenanceFingerprint: string | null;
  }[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
  registeredPackIds: ReadonlySet<string>,
  permissionPackIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  for (const module of generatedModules) {
    if (module.provenanceFingerprint === null) {
      errors.push(`Generated production module has no provenance fingerprint: ${module.path}`);
    }
    if (!legalPackIds.has(module.packId)) {
      errors.push(`Generated production module is outside legal MTT import slots: ${module.path}`);
    }
    if (!registeredPackIds.has(module.packId)) {
      errors.push(`Generated production module is not registered in runtime resolver: ${module.path}`);
    }
    if (!permissionPackIds.has(module.packId)) {
      errors.push(`Generated production module has no permission manifest: ${module.path}`);
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
  registeredPacks: readonly RegisteredRuntimePack[],
  legalPackIds: ReadonlyMap<string, MttCompletionImportSlotHint>,
): RegistryPackSummary["kind"] {
  return registeredPacks.find((pack) => pack.packId === packId)?.kind ??
    legalPackIds.get(packId)?.kind ??
    "mtt-preflop";
}

function postflopProfileKeys(dimensions: {
  tableFormat: string;
  blindSpeeds: readonly string[];
  evModel: string;
  street: string;
  antes: readonly string[];
}): string[] {
  return dimensions.blindSpeeds.flatMap((blindSpeed) => (
    dimensions.antes.map((ante) => profileKey(
      dimensions.tableFormat,
      blindSpeed,
      dimensions.evModel,
      dimensions.street,
      ante,
    ))
  ));
}

function profileKey(
  tableFormat: string,
  blindSpeed: string,
  evModel: string,
  street: string,
  ante: string,
): string {
  return [tableFormat, blindSpeed, evModel, street, ante].join("|");
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
        pack.registryStatus,
      ].join(" | "),
    );
    if (pack.generatedModulePath !== null) lines.push(`  module: ${pack.generatedModulePath}`);
    if (pack.permissionManifestPath !== null) lines.push(`  permission: ${pack.permissionManifestPath}`);
  }
  for (const error of report.errors) lines.push(`error: ${error}`);

  return lines.join("\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
