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

export type MttPostflopPilotScope =
  | "BTN_vs_BB_SRP_FLOP_CBET"
  | "UTG_vs_BB_SRP_FLOP_CBET"
  | "CO_vs_BB_SRP_FLOP_CBET"
  | "SB_vs_BB_SRP_OOP_FLOP_CBET"
  | "BTN_vs_CO_3BP_FLOP_CBET"
  | "BTN_vs_BB_SRP_FLOP_FACING_BET"
  | "BTN_vs_CO_3BP_FLOP_FACING_BET";

export interface MttPostflopPilotGateReport {
  valid: boolean;
  pilotScope: MttPostflopPilotScope;
  fullProductionReady: boolean;
  permissionReady: boolean;
  legalImportSlot: boolean;
  runtimeSmokeValid: boolean;
  provenanceFamilyIds: readonly string[];
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
  const provenanceFamilyIds = pilotProvenanceFamilyIds(pack);
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
    provenanceFamilyIds,
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
      return scopedFlopCbetErrors(pack, {
        potType: "SINGLE_RAISED",
        actionNode: "SINGLE_RAISED_POT_CBET",
        positionPattern: "SRP_BTN_VS_BB",
        label: "BTN vs BB SRP",
        minBuckets: 30,
        familyToken: "BTN_BB_SRP",
      });
    case "UTG_vs_BB_SRP_FLOP_CBET":
      return scopedFlopCbetErrors(pack, {
        potType: "SINGLE_RAISED",
        actionNode: "SINGLE_RAISED_POT_CBET",
        positionPattern: "SRP_UTG_VS_BB",
        label: "UTG vs BB SRP",
        minBuckets: 30,
        familyToken: "UTG_BB_SRP",
      });
    case "CO_vs_BB_SRP_FLOP_CBET":
      return scopedFlopCbetErrors(pack, {
        potType: "SINGLE_RAISED",
        actionNode: "SINGLE_RAISED_POT_CBET",
        positionPattern: "SRP_CO_VS_BB",
        label: "CO vs BB SRP",
        minBuckets: 30,
        familyToken: "CO_BB_SRP",
      });
    case "SB_vs_BB_SRP_OOP_FLOP_CBET":
      return scopedFlopCbetErrors(pack, {
        potType: "SINGLE_RAISED",
        actionNode: "SINGLE_RAISED_POT_CBET",
        positionPattern: "SRP_SB_VS_BB",
        label: "SB vs BB SRP OOP",
        minBuckets: 30,
        familyToken: "SB_BB_SRP",
      });
    case "BTN_vs_CO_3BP_FLOP_CBET":
      return scopedFlopCbetErrors(pack, {
        potType: "THREE_BET_POT",
        actionNode: "THREE_BET_POT_CBET",
        positionPattern: "3BP_BTN_VS_CO",
        label: "BTN vs CO 3BP",
        minBuckets: 20,
        familyToken: "CO_BTN_3BP",
      });
    case "BTN_vs_BB_SRP_FLOP_FACING_BET":
      return scopedFlopDecisionErrors(pack, {
        potType: "SINGLE_RAISED",
        actionNode: "FLOP_FACING_BET",
        positionPattern: "SRP_BTN_VS_BB",
        label: "BTN vs BB SRP facing flop bet",
        minBuckets: 30,
        familyToken: "BTN_BB_SRP",
      });
    case "BTN_vs_CO_3BP_FLOP_FACING_BET":
      return scopedFlopDecisionErrors(pack, {
        potType: "THREE_BET_POT",
        actionNode: "FLOP_FACING_BET",
        positionPattern: "3BP_BTN_VS_CO",
        label: "BTN vs CO 3BP facing flop bet",
        minBuckets: 20,
        familyToken: "CO_BTN_3BP",
      });
  }
}

function scopedFlopCbetErrors(
  pack: FlopProductionStrategyPack,
  scope: {
    potType: "SINGLE_RAISED" | "THREE_BET_POT";
    actionNode: "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET";
    positionPattern: "SRP_BTN_VS_BB" | "SRP_UTG_VS_BB" | "SRP_CO_VS_BB" | "SRP_SB_VS_BB" | "3BP_BTN_VS_CO";
    label: string;
    minBuckets: number;
    familyToken: string;
  },
): string[] {
  return scopedFlopDecisionErrors(pack, scope);
}

function scopedFlopDecisionErrors(
  pack: FlopProductionStrategyPack,
  scope: {
    potType: "SINGLE_RAISED" | "THREE_BET_POT";
    actionNode: "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET";
    positionPattern: "SRP_BTN_VS_BB" | "SRP_UTG_VS_BB" | "SRP_CO_VS_BB" | "SRP_SB_VS_BB" | "3BP_BTN_VS_CO";
    label: string;
    minBuckets: number;
    familyToken: string;
  },
): string[] {
  const errors: string[] = [];
  if (pack.dimensions.gameVariant !== "MTT") errors.push("Pilot pack must be MTT.");
  if (pack.dimensions.tableFormat !== "FULL_RING_9") errors.push("Pilot pack must be FULL_RING_9.");
  if (pack.dimensions.street !== "FLOP") errors.push("Pilot pack must be FLOP.");
  if (!pack.dimensions.blindSpeeds.includes("REGULAR")) errors.push("Pilot pack must cover REGULAR speed.");
  if (!pack.dimensions.antes.includes("OFF")) errors.push("Pilot pack must cover ante OFF.");
  if (pack.rules.length < 1) errors.push("Pilot pack must contain at least one rule.");
  errors.push(...pilotProvenanceFamilyErrors(pack, scope.label, scope.familyToken));

  for (const rule of pack.rules) {
    if (rule.potType !== scope.potType) errors.push(`${rule.id}: ${scope.label} pilot only allows ${scope.potType} pot.`);
    if (rule.actionNode !== scope.actionNode) {
      errors.push(`${rule.id}: ${scope.label} pilot only allows ${scope.actionNode}.`);
    }
    if (rule.positionPattern !== scope.positionPattern) {
      errors.push(`${rule.id}: ${scope.label} pilot only allows ${scope.positionPattern}.`);
    }
    if (rule.rangeBuckets.length === 0) errors.push(`${rule.id}: at least one range lane is required.`);
    if (rule.rangeBuckets.length < scope.minBuckets) {
      errors.push(`${rule.id}: ${scope.label} pilot needs at least ${scope.minBuckets} hand-class buckets.`);
    }
  }

  // Lane coverage is required of the pilot as a whole, not of every SPR band.
  // A converged solve can legitimately have no bluffs in one band - below SPR 3
  // the observed c-bet range is pairs and broadway only - and demanding all
  // three lanes per rule would force a bluff lane to be invented where the
  // solver has none.
  const packLanes = new Set(pack.rules.flatMap((rule) => rule.rangeBuckets.map((bucket) => bucket.lane)));
  for (const lane of ["VALUE", "BLUFF", "CHECK"] as const) {
    if (!packLanes.has(lane)) errors.push(`${scope.label} pilot is missing the ${lane} lane across every rule.`);
  }
  return errors;
}

function pilotProvenanceFamilyErrors(
  pack: FlopProductionStrategyPack,
  label: string,
  familyToken: string,
): string[] {
  return pilotProvenanceFamilyIds(pack)
    .filter((familyId) => !familyId.includes(familyToken))
    .map((familyId) => `${label} pilot provenance references incompatible solver family ${familyId}.`);
}

function pilotProvenanceFamilyIds(pack: FlopProductionStrategyPack): readonly string[] {
  const searchable = [
    pack.version,
    ...pack.assumptions,
    ...pack.sourceEvidence.flatMap((evidence) => [
      evidence.url,
      evidence.methodology,
    ]),
    ...pack.rules.flatMap((rule) => [rule.id, rule.explanation]),
  ].join("\n");
  return [...new Set(searchable.match(/\bMTT9_[A-Z0-9_]+\b/g) ?? [])];
}
