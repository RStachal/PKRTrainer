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
  riverProductionPacks?: readonly RiverProductionStrategyPack[];
}

export function createPostflopStrategyResolverWithProductionFallback(
  productionPacks: readonly FlopProductionStrategyPack[] = flopProductionStrategyPacks,
  heuristicPacks: readonly PostflopStrategyPack[] = postflopPublicHeuristicStrategyPacks,
  turnProductionPacks: readonly TurnProductionStrategyPack[] = turnProductionStrategyPacks,
  riverProductionPacks: readonly RiverProductionStrategyPack[] = riverProductionStrategyPacks,
): PostflopStrategyResolver {
  const productionResolver = createFlopProductionStrategyResolverChain(productionPacks);
  const turnProductionResolver = createTurnProductionStrategyResolverChain(turnProductionPacks);
  const riverProductionResolver = createRiverProductionStrategyResolverChain(riverProductionPacks);
  const heuristicResolver = createPostflopStrategyResolverChain(heuristicPacks);

  return (input) => (
    productionResolver(input) ??
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

function createProductionResolverForProfile(
  profile: MttProductionPostflopResolverProfile,
  packs: MttProductionPostflopResolverPacks,
): PostflopStrategyResolver {
  switch (profile.street) {
    case "FLOP":
      return createFlopProductionStrategyResolverChain(
        matchingFlopPacksForProfile(profile, packs.flopProductionPacks ?? flopProductionStrategyPacks),
      );
    case "TURN":
      return createTurnProductionStrategyResolverChain(
        matchingTurnPacksForProfile(profile, packs.turnProductionPacks ?? turnProductionStrategyPacks),
      );
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
