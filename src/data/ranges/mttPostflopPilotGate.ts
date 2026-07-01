import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import {
  buildFlopProductionCoverageReport,
  validateFlopProductionStrategyPack,
} from "./flopProductionStrategyPack";
import { buildMttPostflopImportSlotValidationReport } from "./mttImportSlotValidation";
import type { ProductionPermissionManifest } from "./productionPermissionManifest";
import { buildProductionPermissionManifestReport } from "./productionPermissionManifest";
import { validateProductionStrategySemantics } from "./productionStrategySemanticValidation";
import { buildProductionStrategyRuntimeSmokeReport } from "./productionStrategyRuntimeSmoke";

export type MttPostflopPilotScope = "BTN_vs_BB_SRP_FLOP_CBET";

export interface MttPostflopPilotGateReport {
  valid: boolean;
  pilotScope: MttPostflopPilotScope;
  fullProductionReady: boolean;
  permissionReady: boolean;
  legalImportSlot: boolean;
  runtimeSmokeValid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
  counts: {
    rules: number;
    rangeBuckets: number;
    runtimeSmokeSamples: number;
  };
}

export function buildMttPostflopPilotGateReport(
  pack: FlopProductionStrategyPack,
  permission: ProductionPermissionManifest,
  pilotScope: MttPostflopPilotScope = "BTN_vs_BB_SRP_FLOP_CBET",
): MttPostflopPilotGateReport {
  const schemaErrors = validateFlopProductionStrategyPack(pack);
  const slotReport = buildMttPostflopImportSlotValidationReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permission, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const semanticErrors = validateProductionStrategySemantics(pack);
  const runtimeSmoke = buildProductionStrategyRuntimeSmokeReport(pack);
  const coverage = buildFlopProductionCoverageReport(pack);
  const errors = [
    ...schemaErrors,
    ...slotReport.errors,
    ...permissionReport.errors,
    ...semanticErrors,
    ...runtimeSmoke.errors,
    ...pilotScopeErrors(pack, pilotScope),
  ];
  const warnings = [
    ...(coverage.productionReady ? [] : ["Pilot pack is intentionally narrower than full flop-production coverage."]),
    ...coverage.missingPotTypes.map((item) => `Full-production missing pot type: ${item}`),
    ...coverage.missingActionNodes.map((item) => `Full-production missing action node: ${item}`),
    ...coverage.missingSprBands.map((item) => `Full-production missing SPR band: ${item}`),
  ];

  return {
    valid: errors.length === 0,
    pilotScope,
    fullProductionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    legalImportSlot: slotReport.valid,
    runtimeSmokeValid: runtimeSmoke.valid,
    errors,
    warnings,
    counts: {
      rules: pack.rules.length,
      rangeBuckets: pack.rules.reduce((count, rule) => count + rule.rangeBuckets.length, 0),
      runtimeSmokeSamples: runtimeSmoke.sampleCount,
    },
  };
}

function pilotScopeErrors(
  pack: FlopProductionStrategyPack,
  pilotScope: MttPostflopPilotScope,
): string[] {
  switch (pilotScope) {
    case "BTN_vs_BB_SRP_FLOP_CBET":
      return btnVsBbSrpFlopCbetErrors(pack);
  }
}

function btnVsBbSrpFlopCbetErrors(pack: FlopProductionStrategyPack): string[] {
  const errors: string[] = [];
  if (pack.dimensions.gameVariant !== "MTT") errors.push("Pilot pack must be MTT.");
  if (pack.dimensions.tableFormat !== "FULL_RING_9") errors.push("Pilot pack must be FULL_RING_9.");
  if (pack.dimensions.street !== "FLOP") errors.push("Pilot pack must be FLOP.");
  if (!pack.dimensions.blindSpeeds.includes("REGULAR")) errors.push("Pilot pack must cover REGULAR speed.");
  if (!pack.dimensions.antes.includes("OFF")) errors.push("Pilot pack must cover ante OFF.");
  if (pack.rules.length < 1) errors.push("Pilot pack must contain at least one rule.");

  for (const rule of pack.rules) {
    if (rule.potType !== "SINGLE_RAISED") errors.push(`${rule.id}: pilot only allows SINGLE_RAISED pot.`);
    if (rule.actionNode !== "SINGLE_RAISED_POT_CBET") {
      errors.push(`${rule.id}: pilot only allows SINGLE_RAISED_POT_CBET.`);
    }
    if (rule.positionPattern !== "SRP_BTN_VS_BB") {
      errors.push(`${rule.id}: pilot only allows SRP_BTN_VS_BB.`);
    }
    const lanes = new Set(rule.rangeBuckets.map((bucket) => bucket.lane));
    for (const lane of ["VALUE", "BLUFF", "CHECK"] as const) {
      if (!lanes.has(lane)) errors.push(`${rule.id}: missing ${lane} lane.`);
    }
    if (rule.rangeBuckets.length < 30) errors.push(`${rule.id}: pilot needs at least 30 hand-class buckets.`);
  }
  return errors;
}
