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

export function createPostflopStrategyResolverWithProductionFallback(
  productionPacks: readonly FlopProductionStrategyPack[] = flopProductionStrategyPacks,
  heuristicPacks: readonly PostflopStrategyPack[] = postflopPublicHeuristicStrategyPacks,
): PostflopStrategyResolver {
  const productionResolver = createFlopProductionStrategyResolverChain(productionPacks);
  const heuristicResolver = createPostflopStrategyResolverChain(heuristicPacks);

  return (input) => productionResolver(input) ?? heuristicResolver(input);
}

export function createDefaultPostflopStrategyResolver(): PostflopStrategyResolver {
  return createPostflopStrategyResolverWithProductionFallback();
}
