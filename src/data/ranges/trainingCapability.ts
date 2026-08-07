import {
  staticTrainingCapability,
  type TrainingCapabilityStatus,
  type TrainingFlowMode,
} from "../../core/trainingCapability";
import type { TrainingProfile } from "../../core/trainingProfile";
import {
  mttCompletionReadinessRowForTrainingProfile,
  type MttCompletionReadinessRow,
} from "./mttProductionReadiness";
import {
  mttProductionImportSlotId,
  mttProductionImportSlotKind,
} from "./mttImportSlotNaming";
import { generatedMttProductionManifest } from "./mttProductionRegistry.generated";

export interface TrainingCapability {
  status: TrainingCapabilityStatus;
  canStartTraining: boolean;
  allowHeuristicFallback: boolean;
  allowedFlowModes: readonly TrainingFlowMode[];
  reason: string;
  mttReadiness: MttCompletionReadinessRow | null;
}

export function trainingCapabilityForProfile(
  profile: TrainingProfile,
): TrainingCapability {
  const contract = staticTrainingCapability(profile);
  if (contract.status === "UNSUPPORTED") {
    return {
      ...contract,
      canStartTraining: false,
      allowHeuristicFallback: false,
      mttReadiness: null,
    };
  }
  if (profile.gameVariant !== "MTT") {
    return {
      ...contract,
      canStartTraining: false,
      allowHeuristicFallback: false,
      mttReadiness: null,
    };
  }

  const readiness = bundledProductionReadiness(
    mttCompletionReadinessRowForTrainingProfile(profile),
  );
  if (readiness?.productionReady === true) {
    return {
      status: "PRODUCTION",
      canStartTraining: true,
      allowHeuristicFallback: false,
      allowedFlowModes: contract.allowedFlowModes,
      reason: "Production data is available for this MTT v1 profile.",
      mttReadiness: readiness,
    };
  }
  if (isPlayableMttPreflopPreview(profile) && readiness?.status === "CANDIDATE") {
    return {
      status: "PREVIEW",
      canStartTraining: true,
      allowHeuristicFallback: false,
      allowedFlowModes: contract.allowedFlowModes,
      reason: "Historical 9-max regular chipEV preflop data is available as a playable preview; production promotion still requires legal import evidence.",
      mttReadiness: readiness,
    };
  }
  if (profile.street !== "PREFLOP") {
    return {
      status: "PREVIEW",
      canStartTraining: true,
      allowHeuristicFallback: true,
      allowedFlowModes: contract.allowedFlowModes,
      reason: "Production strategy is missing; this postflop profile runs as a preview.",
      mttReadiness: readiness,
    };
  }
  return {
    status: "BLOCKED",
    canStartTraining: false,
    allowHeuristicFallback: false,
    allowedFlowModes: contract.allowedFlowModes,
    reason: readiness?.missingReasons[0] ??
      "Production preflop range is missing for this MTT v1 profile.",
    mttReadiness: readiness,
  };
}

function bundledProductionReadiness(
  readiness: MttCompletionReadinessRow | null,
): MttCompletionReadinessRow | null {
  if (readiness === null || readiness.productionReady) return readiness;

  const kind = mttProductionImportSlotKind(readiness.street);
  const profileKey = mttProductionImportSlotId(readiness);
  const entry = generatedMttProductionManifest.find((candidate) => (
    candidate.kind === kind && candidate.profileKey === profileKey
  ));
  if (entry === undefined) return readiness;

  return {
    ...readiness,
    status: "PRODUCTION",
    productionReady: true,
    coverageKind: entry.kind === "mtt-preflop"
      ? "PREFLOP_RANGE_PACK"
      : "POSTFLOP_PRODUCTION_PACK",
    packId: entry.packId,
    importSlot: null,
    missingReasons: [],
  };
}

/**
 * Six-max joins nine-handed here, and it is worth being explicit about what it
 * allows: drilling ranges that are derived rather than measured.
 *
 * The six-max packs are nine-handed records re-labelled by how many opponents
 * are still to act. They carry LOW confidence, name the seat each came from, and
 * will run tight, because a six-max field is looser at equal seats-behind.
 *
 * The alternative was what shipped - six-max in the picker teaching nothing,
 * because the derivation was written and never wired in. Preview only:
 * `startableMttPreflopRangePack` still demands records, and the production gate
 * still refuses inferred chart values, which stands until measured six-max
 * charts arrive.
 */
export function isPlayableMttPreflopPreview(profile: TrainingProfile): boolean {
  return (
    profile.gameVariant === "MTT" &&
    (profile.tableFormat === "FULL_RING_9" || profile.tableFormat === "SIX_MAX") &&
    profile.blindSpeed === "REGULAR" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.rakeMode === "NONE"
  );
}
