import type { PostflopStrategyResolver, PostflopStreet } from "../../core/postflopGenerator";
import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, TableFormat } from "../../core/trainingProfile";
import { isMttV1Profile } from "../../core/trainingCapability";
import type { GameVariant, RakeMode } from "../../core/trainingProfile";
import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import {
  createFlopProductionStrategyResolverChain,
  flopProductionStrategyPacks,
} from "./flopProductionStrategyResolver";
import {
  postflopPublicHeuristicStrategyPacks,
  type PostflopStrategyPack,
} from "./postflopStrategyPack";
import { createPostflopStrategyResolverChain } from "./postflopStrategyResolver";
import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";
import {
  createTurnProductionStrategyResolverChain,
  turnProductionStrategyPacks,
} from "./turnProductionStrategyResolver";
import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";
import {
  createRiverProductionStrategyResolverChain,
  riverProductionStrategyPacks,
} from "./riverProductionStrategyResolver";
import type { TurnStrategyPack } from "./turnStrategyPack";
import { createRiverSolvedStrategyResolverChain } from "./riverStrategyResolver";
import {
  createTurnSolvedStrategyResolverChain,
  turnSolvedStrategyPacks,
} from "./turnSolvedStrategyPacks";

export interface MttProductionPostflopResolverProfile {
  gameVariant?: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: PostflopStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode?: RakeMode;
}

export interface MttProductionPostflopResolverPacks {
  flopProductionPacks?: readonly FlopProductionStrategyPack[];
  turnProductionPacks?: readonly TurnProductionStrategyPack[];
  turnSolvedPacks?: readonly TurnStrategyPack[];
  riverProductionPacks?: readonly RiverProductionStrategyPack[];
}

export function createPostflopStrategyResolverWithProductionFallback(
  productionPacks: readonly FlopProductionStrategyPack[] = flopProductionStrategyPacks,
  heuristicPacks: readonly PostflopStrategyPack[] = postflopPublicHeuristicStrategyPacks,
  turnProductionPacks: readonly TurnProductionStrategyPack[] = turnProductionStrategyPacks,
  riverProductionPacks: readonly RiverProductionStrategyPack[] = riverProductionStrategyPacks,
  turnSolvedPacks?: readonly TurnStrategyPack[],
): PostflopStrategyResolver {
  const productionResolver = createFlopProductionStrategyResolverChain(productionPacks);
  // The solved packs go ahead of the chart-derived turn packs, because they are
  // the only turn content that names the run it came from. Both refuse spots
  // they were not solved for, so the ordering decides nothing except which of
  // two answers a player sees when both exist - and that should be the one whose
  // evidence is on disk.
  //
  // Left undefined, the chain reads the solved packs late, so families that
  // finish downloading mid-session are used instead of being missed.
  const turnSolvedResolver = createTurnSolvedStrategyResolverChain(turnSolvedPacks);
  // River má vyřešený obsah od 13. srpna a tenhle řetězec se ho nikdy nezeptal.
  //
  // Turn tu byl a river ne, což je ta horší varianta: vypadá to jako promyšlené
  // pořadí, ne jako opomenutí. Vyřešený river přitom odmítá všechno, co
  // nevyřešil, takže před chartovým riverem nic nezastíní - jen dá přednost
  // odpovědi, jejíž podklad leží na disku.
  const riverSolvedResolver = createRiverSolvedStrategyResolverChain();
  const turnProductionResolver = createTurnProductionStrategyResolverChain(turnProductionPacks);
  const riverProductionResolver = createRiverProductionStrategyResolverChain(riverProductionPacks);
  const heuristicResolver = createPostflopStrategyResolverChain(heuristicPacks);

  return (input) => (
    productionResolver(input) ??
    turnSolvedResolver(input) ??
    riverSolvedResolver(input) ??
    turnProductionResolver(input) ??
    riverProductionResolver(input) ??
    heuristicResolver(input)
  );
}

export function createDefaultPostflopStrategyResolver(): PostflopStrategyResolver {
  return createPostflopStrategyResolverWithProductionFallback();
}

export function createMttProductionPostflopStrategyResolver(
  profile: MttProductionPostflopResolverProfile,
  packs: MttProductionPostflopResolverPacks = {},
): PostflopStrategyResolver {
  if (!isMttV1Profile({
    gameVariant: profile.gameVariant ?? "MTT",
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: profile.street,
    evModel: profile.evModel,
    ante: profile.ante,
    rakeMode: profile.rakeMode ?? "NONE",
  })) {
    return () => null;
  }
  const resolver = createProductionResolverForProfile(profile, packs);
  return (input) => {
    if (input.street !== profile.street) return null;
    return resolver(input);
  };
}

export function createMttProductionPostflopFamilyResolver(
  profile: Omit<MttProductionPostflopResolverProfile, "street">,
  packs: MttProductionPostflopResolverPacks = {},
): PostflopStrategyResolver {
  return (input) => createMttProductionPostflopStrategyResolver({
    ...profile,
    street: input.street,
  }, packs)(input);
}

function createProductionResolverForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: MttProductionPostflopResolverPacks,
): PostflopStrategyResolver {
  switch (profile.street) {
    case "FLOP":
      return createFlopProductionStrategyResolverChain(
        matchingFlopPacksForProfile(profile, packs.flopProductionPacks ?? flopProductionStrategyPacks),
      );
    case "TURN": {
      // Solved packs are filtered per call, not once: the profile filter has to
      // run against whatever has finished downloading now, not at boot.
      const solved: PostflopStrategyResolver = (input) => createTurnSolvedStrategyResolverChain(
        matchingTurnSolvedPacksForProfile(profile, packs.turnSolvedPacks ?? turnSolvedStrategyPacks),
      )(input);
      const charted = createTurnProductionStrategyResolverChain(
        matchingTurnPacksForProfile(profile, packs.turnProductionPacks ?? turnProductionStrategyPacks),
      );
      return (input) => solved(input) ?? charted(input);
    }
    case "RIVER":
      return createRiverProductionStrategyResolverChain(
        matchingRiverPacksForProfile(profile, packs.riverProductionPacks ?? riverProductionStrategyPacks),
      );
  }
}

function matchingFlopPacksForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: readonly FlopProductionStrategyPack[],
): readonly FlopProductionStrategyPack[] {
  return packs.filter((pack) => matchesProfile(pack.dimensions, profile));
}

function matchingTurnPacksForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: readonly TurnProductionStrategyPack[],
): readonly TurnProductionStrategyPack[] {
  return packs.filter((pack) => matchesProfile(pack.dimensions, profile));
}

function matchingTurnSolvedPacksForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: readonly TurnStrategyPack[],
): readonly TurnStrategyPack[] {
  return packs.filter((pack) => matchesProfile(pack.dimensions, profile));
}

function matchingRiverPacksForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: readonly RiverProductionStrategyPack[],
): readonly RiverProductionStrategyPack[] {
  return packs.filter((pack) => matchesProfile(pack.dimensions, profile));
}

function matchesProfile(
  dimensions: {
    gameVariant: string;
    tableFormat: TableFormat;
    blindSpeeds: readonly BlindSpeed[];
    street: PostflopStreet;
    evModel: EvModel;
    antes: readonly AnteMode[];
  },
  profile: MttProductionPostflopResolverProfile,
): boolean {
  return (
    dimensions.gameVariant === "MTT" &&
    dimensions.tableFormat === profile.tableFormat &&
    dimensions.street === profile.street &&
    dimensions.evModel === profile.evModel &&
    dimensions.blindSpeeds.includes(profile.blindSpeed) &&
    dimensions.antes.includes(profile.ante)
  );
}
