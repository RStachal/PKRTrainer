import type { PostflopStrategyResolver } from "../../core/postflopGenerator";
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
