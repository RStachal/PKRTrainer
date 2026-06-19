import type { TrainingProfile } from "./trainingProfile";

export type TrainingCapabilityStatus =
  | "PRODUCTION"
  | "PREVIEW"
  | "BLOCKED"
  | "UNSUPPORTED";

export type TrainingFlowMode =
  | "PREFLOP_DRILL"
  | "POSTFLOP_SINGLE_SPOT"
  | "POSTFLOP_HAND_LINE"
  | "HH_REVIEW";

export interface StaticTrainingCapability {
  status: Exclude<TrainingCapabilityStatus, "PRODUCTION">;
  allowedFlowModes: readonly TrainingFlowMode[];
  reason: string;
}

export function staticTrainingCapability(
  profile: TrainingProfile,
): StaticTrainingCapability {
  switch (profile.gameVariant) {
    case "MTT":
      if (!isMttV1Profile(profile)) {
        return unsupported(
          profile.evModel === "ICM"
            ? "MTT ICM is outside the current MTT v1 release contract."
            : "This MTT profile is outside the current MTT v1 release contract.",
        );
      }
      return {
        status: "BLOCKED",
        allowedFlowModes: profile.street === "PREFLOP"
          ? ["PREFLOP_DRILL", "HH_REVIEW"]
          : ["POSTFLOP_SINGLE_SPOT", "POSTFLOP_HAND_LINE", "HH_REVIEW"],
        reason: "This legal MTT v1 profile requires production readiness data.",
      };
    case "SNG":
      if (
        profile.rakeMode !== "NONE" ||
        profile.street !== "PREFLOP" ||
        profile.evModel === "DOLAR_EV"
      ) {
        return unsupported("Only SNG preflop chipEV and ICM candidate profiles are available.");
      }
      return {
        status: "PREVIEW",
        allowedFlowModes: ["PREFLOP_DRILL"],
        reason: "SNG is a candidate preview and production scoring is disabled.",
      };
    case "CASH":
      if (
        profile.tableFormat !== "SIX_MAX" ||
        profile.blindSpeed !== "REGULAR" ||
        profile.street !== "PREFLOP" ||
        profile.evModel !== "CHIP_EV" ||
        profile.ante !== "OFF" ||
        (profile.rakeMode !== "RAKE" && profile.rakeMode !== "NO_RAKE")
      ) {
        return unsupported(
          "Only 6-max regular preflop chipEV cash preview without ante is available.",
        );
      }
      return {
        status: "PREVIEW",
        allowedFlowModes: ["PREFLOP_DRILL"],
        reason: "Cash is a candidate preview and production scoring is disabled.",
      };
  }
}

export function isMttV1Profile(
  profile: TrainingProfile,
): profile is TrainingProfile & {
  gameVariant: "MTT";
  evModel: "CHIP_EV" | "DOLAR_EV";
  rakeMode: "NONE";
} {
  return (
    profile.gameVariant === "MTT" &&
    profile.rakeMode === "NONE" &&
    (profile.evModel === "CHIP_EV" || profile.evModel === "DOLAR_EV")
  );
}

export function isFlowAllowed(
  capability: Pick<StaticTrainingCapability, "allowedFlowModes">,
  flow: TrainingFlowMode,
): boolean {
  return capability.allowedFlowModes.includes(flow);
}

function unsupported(reason: string): StaticTrainingCapability {
  return {
    status: "UNSUPPORTED",
    allowedFlowModes: [],
    reason,
  };
}
