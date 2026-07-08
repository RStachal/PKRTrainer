import type { EntitlementGrant, PkrEntitlement } from "../../core/paymentEntitlements";
import { evaluateEntitlementAccess } from "../../core/paymentEntitlements";
import type { PostflopStrategyResolver } from "../../core/postflopGenerator";
import { isPostflopStreet, type TrainingProfile } from "../../core/trainingProfile";
import {
  createMttProductionPostflopFamilyResolver,
} from "./postflopStrategyRegistry";
import {
  readyMttPostflopPilotsForProfile,
  requiredEntitlementsForMttPostflopPilotScopes,
} from "./mttPostflopPilotCatalog";
import { createMttPostflopPilotAwareResolver } from "./mttPostflopPilotRuntime";
import { trainingCapabilityForProfile } from "./trainingCapability";

export type MttPostflopTrainingRuntimeMode =
  | "PRODUCTION"
  | "SCOPED_PILOT"
  | "LOCKED_PILOT"
  | "PREVIEW_FALLBACK"
  | "UNAVAILABLE";

export interface MttPostflopTrainingRuntimeReport {
  mode: MttPostflopTrainingRuntimeMode;
  resolver: PostflopStrategyResolver | null;
  allowFallback: boolean;
  reason: string;
  pilotScopes: readonly string[];
  activeEntitlements: readonly PkrEntitlement[];
  missingEntitlements: readonly PkrEntitlement[];
}

export interface MttPostflopTrainingRuntimeOptions {
  profile: TrainingProfile;
  grants: readonly EntitlementGrant[];
  now?: string | Date;
  allowGrace?: boolean;
}

export function buildMttPostflopTrainingRuntime(
  options: MttPostflopTrainingRuntimeOptions,
): MttPostflopTrainingRuntimeReport {
  const { profile, grants } = options;
  if (profile.gameVariant !== "MTT" || !isPostflopStreet(profile.street)) {
    return unavailable("Only MTT postflop profiles can use the MTT postflop runtime.");
  }

  const capability = trainingCapabilityForProfile(profile);
  if (!capability.canStartTraining) {
    return unavailable(capability.reason);
  }

  const productionResolver = (
    capability.status === "PRODUCTION" &&
    capability.mttReadiness?.productionReady === true
  )
    ? createMttProductionPostflopFamilyResolver({
      gameVariant: profile.gameVariant,
      tableFormat: profile.tableFormat,
      blindSpeed: profile.blindSpeed,
      evModel: profile.evModel,
      ante: profile.ante,
      rakeMode: profile.rakeMode,
    })
    : null;

  if (productionResolver !== null) {
    return {
      mode: "PRODUCTION",
      resolver: productionResolver,
      allowFallback: false,
      reason: "Full production postflop resolver is available for this MTT profile.",
      pilotScopes: [],
      activeEntitlements: [],
      missingEntitlements: [],
    };
  }

  const pilots = readyMttPostflopPilotsForProfile(profile);
  if (pilots.length > 0) {
    const pilotScopes = pilots.map((pilot) => pilot.scope);
    const requiredEntitlements = requiredEntitlementsForMttPostflopPilotScopes(pilotScopes);
    const access = evaluateEntitlementAccess({
      required: requiredEntitlements,
      grants,
      now: options.now,
      allowGrace: options.allowGrace,
    });
    const activePilotEntitlements = access.active.filter((entitlement) => (
      requiredEntitlements.includes(entitlement)
    ));

    if (activePilotEntitlements.length === 0) {
      return {
        mode: "LOCKED_PILOT",
        resolver: null,
        allowFallback: false,
        reason: "Scoped postflop pilot coverage is available, but no matching paid pilot entitlement is active.",
        pilotScopes,
        activeEntitlements: [],
        missingEntitlements: requiredEntitlements,
      };
    }

    return {
      mode: "SCOPED_PILOT",
      resolver: createMttPostflopPilotAwareResolver({
        grants,
        now: options.now,
        allowGrace: options.allowGrace,
      }),
      allowFallback: false,
      reason: "Scoped solver-backed postflop pilot runtime is available; this is not full production coverage.",
      pilotScopes,
      activeEntitlements: activePilotEntitlements,
      missingEntitlements: access.missing,
    };
  }

  return {
    mode: "PREVIEW_FALLBACK",
    resolver: null,
    allowFallback: capability.allowHeuristicFallback,
    reason: capability.reason,
    pilotScopes: [],
    activeEntitlements: [],
    missingEntitlements: [],
  };
}

function unavailable(reason: string): MttPostflopTrainingRuntimeReport {
  return {
    mode: "UNAVAILABLE",
    resolver: null,
    allowFallback: false,
    reason,
    pilotScopes: [],
    activeEntitlements: [],
    missingEntitlements: [],
  };
}
