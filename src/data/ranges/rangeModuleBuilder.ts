import type { RangePack } from "./rangePack";
import {
  buildMttPreflopImportReadinessReport,
  normalizeMttPreflopRangePackImport,
  type MttPreflopRangePackImportInput,
} from "./mttPreflopRangePackImport";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "./flopProductionStrategyPack";
import {
  buildProductionPermissionManifestReport,
  type ProductionPermissionManifest,
  type ProductionPermissionManifestReport,
} from "./productionPermissionManifest";

export type RangeModuleBuildKind = "mtt-preflop" | "flop-production";

export interface RangeModuleBuildInput {
  kind: RangeModuleBuildKind;
  input: MttPreflopRangePackImportInput | FlopProductionStrategyPack;
  permissionManifest: ProductionPermissionManifest | null;
  exportName?: string;
}

export interface RangeModuleBuildResult {
  kind: RangeModuleBuildKind;
  packId: string;
  exportName: string;
  productionReady: boolean;
  permissionReady: boolean;
  writeReady: boolean;
  blockers: readonly string[];
  permissionReport: ProductionPermissionManifestReport;
  moduleText: string | null;
}

export function buildRangeModule(input: RangeModuleBuildInput): RangeModuleBuildResult {
  if (input.kind === "mtt-preflop") {
    return buildMttPreflopRangeModule(
      input.input as MttPreflopRangePackImportInput,
      input.permissionManifest,
      input.exportName,
    );
  }

  return buildFlopProductionRangeModule(
    input.input as FlopProductionStrategyPack,
    input.permissionManifest,
    input.exportName,
  );
}

export function renderRangeModuleBuildReport(result: RangeModuleBuildResult): string {
  const lines = [
    `Range module build: ${result.packId}`,
    `kind: ${result.kind}`,
    `exportName: ${result.exportName}`,
    `productionReady: ${result.productionReady}`,
    `permissionReady: ${result.permissionReady}`,
    `writeReady: ${result.writeReady}`,
  ];

  if (result.blockers.length > 0) {
    lines.push("blockers:");
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  return lines.join("\n");
}

function buildMttPreflopRangeModule(
  input: MttPreflopRangePackImportInput,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(input.id, "RangePack"),
): RangeModuleBuildResult {
  const readiness = buildMttPreflopImportReadinessReport(input);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: input.id,
    licenseKind: input.licenseKind,
  });
  const blockers = [
    ...readiness.errors,
    ...readiness.warnings,
    ...permissionReport.errors,
  ];
  const writeReady = readiness.productionReady && permissionReport.valid;
  const pack = normalizeMttPreflopRangePackImport(input);

  return {
    kind: "mtt-preflop",
    packId: input.id,
    exportName,
    productionReady: readiness.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    blockers,
    permissionReport,
    moduleText: writeReady ? renderMttPreflopRangePackModule(pack, exportName) : null,
  };
}

function buildFlopProductionRangeModule(
  pack: FlopProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildFlopProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
  });
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing board textures", coverage.missingBoardTextures),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...permissionReport.errors,
  ];
  const writeReady = coverage.productionReady && permissionReport.valid;

  return {
    kind: "flop-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    blockers,
    permissionReport,
    moduleText: writeReady ? renderFlopProductionStrategyPackModule(pack, exportName) : null,
  };
}

function coverageBlockers(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}: ${values.join(",")}`];
}

function renderMttPreflopRangePackModule(pack: RangePack, exportName: string): string {
  return [
    'import type { RangePack } from "./rangePack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies RangePack;`,
    "",
  ].join("\n");
}

function renderFlopProductionStrategyPackModule(
  pack: FlopProductionStrategyPack,
  exportName: string,
): string {
  return [
    'import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies FlopProductionStrategyPack;`,
    "",
  ].join("\n");
}

function jsonForModule(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultExportName(packId: string, suffix: string): string {
  const words = packId
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word.length > 0);
  const [first = "production", ...rest] = words;
  const name = [
    first.toLowerCase(),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
    suffix,
  ].join("");

  return /^[a-zA-Z_$]/.test(name) ? name : `range${name}`;
}
