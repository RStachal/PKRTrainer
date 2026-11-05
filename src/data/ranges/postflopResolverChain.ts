import type {
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";

/**
 * One chain across the streets, so a turn spot can reach solved turn content.
 *
 * The flop chain tries each flop pack and falls through to null, and the caller
 * hands that null to the heuristic model. Turn resolvers now exist and have
 * nowhere to be tried, which is why turn coverage is zero however much has been
 * solved.
 *
 * A chain of resolvers is the whole mechanism, and the ordering matters only in
 * one respect: every resolver already refuses a street it does not serve, so a
 * flop resolver never answers a turn and a turn resolver never answers a flop.
 * That means the order here is free, and the chain stays honest even if someone
 * later adds a river resolver in the wrong place.
 *
 * What the chain must not do is invent a fallback of its own. Returning null
 * when nothing matched is the signal the heuristic model waits for, and a chain
 * that answered anyway would hand a player solver-labelled content for a spot no
 * solver has seen.
 */
export function createPostflopResolverChain(
  resolvers: readonly PostflopStrategyResolver[],
): PostflopStrategyResolver {
  return (input: PostflopStrategyInput) => {
    for (const resolver of resolvers) {
      const recommendation = resolver(input);
      if (recommendation) return recommendation;
    }
    return null;
  };
}
