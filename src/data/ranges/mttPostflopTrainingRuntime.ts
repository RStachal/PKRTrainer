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
import { createTurnSolvedStrategyResolverChain } from "./turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "./turnSolvedRuntimeRegistry";
import { createRiverSolvedStrategyResolverChain } from "./riverStrategyResolver";
import { runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";

/** Jedno oprávnění na celý vyřešený turn; rodiny vznikly jedním během. */
const SOLVED_TURN_ENTITLEMENT = "mtt.postflop.turn.solved.pilot" as const;
/** Totéž pro river, ze stejného důvodu. */
const SOLVED_RIVER_ENTITLEMENT = "mtt.postflop.river.solved.pilot" as const;

/** Resolver nad vyřešenými riverovými rodinami, nebo nic, když žádná nedorazila. */
function solvedRiverRuntimeResolver(): ReturnType<typeof createRiverSolvedStrategyResolverChain> | null {
  return runtimeSolvedRiverPacks.length > 0 ? createRiverSolvedStrategyResolverChain() : null;
}

/**
 * Resolver nad vyřešenými turn rodinami, nebo nic, když žádná nedorazila.
 *
 * Packy se stahují na pozadí, takže na začátku relace jich je málo a za chvíli
 * všechny. Řetězec čte živý registr, takže se nemusí přestavovat; tahle funkce
 * jen odpoví, jestli už je co servírovat.
 */
function solvedTurnRuntimeResolver(): ReturnType<typeof createTurnSolvedStrategyResolverChain> | null {
  return runtimeSolvedTurnPacks.length > 0 ? createTurnSolvedStrategyResolverChain() : null;
}
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

  // Vyřešený turn obsah má vlastní placenou cestu, protože žádná jiná neexistuje.
  //
  // Jedenáct rodin a 3 082 vyřešených turnů se dodává jako lazy chunky, stahuje
  // se na začátku relace - a runtime se jich nikdy na nic nezeptal. Produkční
  // větev je nepustí, dokud není celý profil PRODUCTION, a pilotní katalog je
  // flopový. Obsah byl dosažitelný jen měřicím skriptem, což zvenku vypadá úplně
  // stejně, jako by neexistoval.
  // Turn i river jdou stejnou cestou, jen s jiným registrem a jiným oprávněním.
  // Napsat to dvakrát by znamenalo dvě místa, kde se opravuje jedna chyba -
  // přesně tím trpí produkční packy pro turn a river, které vznikly každý zvlášť.
  const solvedStreet = profile.street === "TURN"
    ? { resolver: solvedTurnRuntimeResolver(), entitlement: SOLVED_TURN_ENTITLEMENT, label: "turn" }
    : profile.street === "RIVER"
      ? { resolver: solvedRiverRuntimeResolver(), entitlement: SOLVED_RIVER_ENTITLEMENT, label: "river" }
      : null;

  if (solvedStreet !== null) {
    const solvedTurn = solvedStreet.resolver;
    if (solvedTurn !== null) {
      const access = evaluateEntitlementAccess({
        required: [solvedStreet.entitlement],
        grants,
        now: options.now,
        allowGrace: options.allowGrace,
      });
      if (access.active.includes(solvedStreet.entitlement)) {
        return {
          mode: "SCOPED_PILOT",
          resolver: solvedTurn,
          allowFallback: false,
          reason: `Vyřešený ${solvedStreet.label} obsah je dostupný; není to plné produkční pokrytí a odpovídá jen na desky, které někdo vyřešil.`,
          pilotScopes: [],
          activeEntitlements: [solvedStreet.entitlement],
          missingEntitlements: [],
        };
      }
      return {
        mode: "LOCKED_PILOT",
        resolver: null,
        allowFallback: false,
        reason: `Vyřešený ${solvedStreet.label} obsah existuje, ale chybí k němu aktivní oprávnění.`,
        pilotScopes: [],
        activeEntitlements: [],
        missingEntitlements: [solvedStreet.entitlement],
      };
    }
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
