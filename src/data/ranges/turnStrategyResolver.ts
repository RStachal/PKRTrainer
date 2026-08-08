import type {
  PostflopRecommendation,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import { translateTurnActions } from "./turnActionTranslation";
import type { TurnStrategyPack } from "./turnStrategyPack";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * Serve a solved turn strategy to the trainer, or decline.
 *
 * Turn spots reach solved content zero percent of the time: the pilot packs are
 * flop packs by type, and 4.2 GB of solved turn output had no path to a player.
 * This is the end of that path - the same shape `flopProductionStrategyResolver`
 * has one street earlier, so the chain that already falls through to the
 * heuristic model can take a turn resolver without knowing it is new.
 *
 * ## Declining is the important half
 *
 * Eleven families exist and they cover eleven spots. Everything else is a turn
 * the solver has never seen, and answering it from a neighbouring family would
 * be worse than the heuristic: the heuristic is labelled as one, while a wrong
 * solved answer arrives wearing SOLVER_BACKED. So the match is exact on
 * position pattern, pot type and node, and near on depth, and anything else
 * returns null for the chain to handle.
 *
 * ## Why the hero's hand decides the action
 *
 * A rule holds several buckets - most of the range checking, some of it betting -
 * and the rule-wide most common action is the wrong answer for a hand in the
 * other bucket. The flop resolver learned this: a check-lane hand must be told
 * to check even when the rule as a whole most often bets. A hand in no bucket at
 * all was never solved here, and returns null rather than borrowing the rule's
 * average.
 */

/** How far a rule's stated depth may sit from the spot's, in big blinds. */
export const TURN_DEPTH_TOLERANCE_BB = 10;

function ruleMatches(rule: TurnStrategyRule, input: PostflopStrategyInput): boolean {
  if (rule.positionPattern !== input.positionPattern) return false;
  if (rule.potType !== input.potType) return false;
  const wantsFacingBet = input.actionNode === "TURN_FACING_BET";
  if (wantsFacingBet !== (rule.node === "FACING_BET")) return false;
  return Math.abs(rule.stackBB - input.effectiveStackBB) <= TURN_DEPTH_TOLERANCE_BB;
}

/**
 * Pick the rule solved closest to this spot's depth.
 *
 * Depth is the only dimension a turn rule is matched loosely on, so it is the
 * only one where "closest" means anything. Ties keep the earlier rule, which is
 * the order the packs were built in - arbitrary, but stable, and a resolver that
 * answered differently on equal evidence would be worse than one that picks.
 */
function bestRule(
  rules: readonly TurnStrategyRule[],
  input: PostflopStrategyInput,
): TurnStrategyRule | null {
  let best: TurnStrategyRule | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const rule of rules) {
    if (!ruleMatches(rule, input)) continue;
    const distance = Math.abs(rule.stackBB - input.effectiveStackBB);
    if (distance < bestDistance) {
      best = rule;
      bestDistance = distance;
    }
  }
  return best;
}

export function createTurnStrategyResolver(pack: TurnStrategyPack): PostflopStrategyResolver {
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (input.street !== "TURN") return null;

    const rule = bestRule(pack.rules, input);
    if (rule === null) return null;

    // The pot is what the solver's chip sizes are measured against, and without
    // it a bet cannot be called small or big. An input carrying no pot is not a
    // spot this can answer.
    const { actions, mergedCount } = translateTurnActions(rule.actions, input.potBB);
    if (actions.length === 0) return null;

    const bucket = input.heroHand === undefined
      ? rule.buckets[0]
      : rule.buckets.find((item) => item.handClasses.includes(input.heroHand!));
    // A hand outside every bucket was never solved here. Returning the rule's
    // most common action would present an answer the solver never gave for this
    // holding, labelled solver-backed.
    if (bucket === undefined) return null;

    const bucketIndex = rule.actions.indexOf(bucket.action);
    const translated = bucketIndex >= 0 ? actions[bucketIndex] : undefined;
    if (translated === undefined) return null;

    return {
      action: translated.action,
      explanation: [
        `Solved turn strategy for ${rule.positionPattern} at ${rule.stackBB}BB effective.`,
        `This hand sits in the ${bucket.action} group, ${bucket.handClasses.length} classes and ${bucket.combos} combinations.`,
        mergedCount > 0
          ? `The solve offered more bet sizes than the trainer shows; ${mergedCount} were merged into the two it has.`
          : "",
      ].filter(Boolean).join(" "),
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.createdAt,
        ruleId: rule.sourceDirectory,
      },
    } as PostflopRecommendation;
  };
}
