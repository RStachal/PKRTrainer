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
  buildTurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "./turnProductionStrategyPack";
import {
  buildRiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "./riverProductionStrategyPack";
import {
  buildProductionPermissionManifestReport,
  type ProductionPermissionManifest,
  type ProductionPermissionManifestReport,
} from "./productionPermissionManifest";
import {
  buildMttPostflopImportSlotValidationReport,
  buildMttPreflopImportSlotValidationReport,
  type MttImportSlotSummary,
} from "./mttImportSlotValidation";
import {
  type MttPostflopProductionPack,
} from "./mttPostflopImportSlots";

export type RangeModuleBuildKind = "mtt-preflop" | "flop-production" | "turn-production" | "river-production";

export type RangeModuleMatchedImportSlot = MttImportSlotSummary;

export interface RangeModuleBuildInput {
  kind: RangeModuleBuildKind;
  input:
    | MttPreflopRangePackImportInput
    | FlopProductionStrategyPack
    | TurnProductionStrategyPack
    | RiverProductionStrategyPack;
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
  matchedImportSlots: readonly RangeModuleMatchedImportSlot[];
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

  if (input.kind === "flop-production") {
    return buildFlopProductionRangeModule(
      input.input as FlopProductionStrategyPack,
      input.permissionManifest,
      input.exportName,
    );
  }

  if (input.kind === "turn-production") {
    return buildTurnProductionRangeModule(
      input.input as TurnProductionStrategyPack,
      input.permissionManifest,
      input.exportName,
    );
  }

  return buildRiverProductionRangeModule(
    input.input as RiverProductionStrategyPack,
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
    `matched import slots: ${result.matchedImportSlots.length}`,
  ];

  for (const slot of result.matchedImportSlots) {
    lines.push(
      `- ${slot.slotId}: ${slot.packId} ` +
      `input=${slot.normalizedInputPath} permission=${slot.permissionManifestPath}`,
    );
  }

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
    blindSpeeds: [input.dimensions.blindSpeed],
    evModels: [input.dimensions.evModel],
  });
  const slotReport = buildMttPreflopImportSlotValidationReport(input);
  const blockers = [
    ...readiness.errors,
    ...readiness.warnings,
    ...slotReport.errors,
    ...permissionReport.errors,
  ];
  const writeReady = readiness.productionReady && slotReport.valid && permissionReport.valid;
  const pack = normalizeMttPreflopRangePackImport(input);

  return {
    kind: "mtt-preflop",
    packId: input.id,
    exportName,
    productionReady: readiness.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    matchedImportSlots: slotReport.matchedSlots,
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
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "Flop");
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing board textures", coverage.missingBoardTextures),
    ...coverageBlockers("missing SPR bands", coverage.missingSprBands),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...permissionReport.errors,
  ];
  const writeReady = coverage.productionReady && slotReport.valid && permissionReport.valid;

  return {
    kind: "flop-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    moduleText: writeReady ? renderFlopProductionStrategyPackModule(pack, exportName) : null,
  };
}

function buildTurnProductionRangeModule(
  pack: TurnProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildTurnProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "Turn");
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing prior flop actions", coverage.missingPriorFlopActions),
    ...coverageBlockers("missing turn card classes", coverage.missingTurnCardClasses),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...permissionReport.errors,
  ];
  const writeReady = coverage.productionReady && slotReport.valid && permissionReport.valid;

  return {
    kind: "turn-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    moduleText: writeReady ? renderTurnProductionStrategyPackModule(pack, exportName) : null,
  };
}

function buildRiverProductionRangeModule(
  pack: RiverProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildRiverProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "River");
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing prior turn actions", coverage.missingPriorTurnActions),
    ...coverageBlockers("missing river runout classes", coverage.missingRiverRunoutClasses),
    ...coverageBlockers("missing blocker relevance", coverage.missingBlockerRelevance),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...permissionReport.errors,
  ];
  const writeReady = coverage.productionReady && slotReport.valid && permissionReport.valid;

  return {
    kind: "river-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    moduleText: writeReady ? renderRiverProductionStrategyPackModule(pack, exportName) : null,
  };
}

function coverageBlockers(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}: ${values.join(",")}`];
}

function buildPostflopSlotReport(
  pack: MttPostflopProductionPack,
  streetLabel: "Flop" | "Turn" | "River",
): ReturnType<typeof buildMttPostflopImportSlotValidationReport> {
  return buildMttPostflopImportSlotValidationReport(pack, {
    gameVariantError: `${streetLabel} production module must target MTT gameVariant.`,
    noSlotError: `${streetLabel} production pack must match at least one legal MTT postflop import slot.`,
    stopAfterGameVariantError: true,
  });
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

function renderTurnProductionStrategyPackModule(
  pack: TurnProductionStrategyPack,
  exportName: string,
): string {
  return [
    'import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies TurnProductionStrategyPack;`,
    "",
  ].join("\n");
}

function renderRiverProductionStrategyPackModule(
  pack: RiverProductionStrategyPack,
  exportName: string,
): string {
  return [
    'import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies RiverProductionStrategyPack;`,
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
