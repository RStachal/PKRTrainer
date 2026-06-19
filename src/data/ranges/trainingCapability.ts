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

  const readiness = mttCompletionReadinessRowForTrainingProfile(profile);
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
