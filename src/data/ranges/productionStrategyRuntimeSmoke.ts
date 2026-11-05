import type {
  PostflopStrategyInput,
  PostflopRecommendation,
} from "../../core/postflopGenerator";
import { highestEvAction } from "../../core/actionEv";
import { createFlopProductionStrategyResolver } from "./flopProductionStrategyResolver";
import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import { createRiverProductionStrategyResolver } from "./riverProductionStrategyResolver";
import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";
import { createTurnProductionStrategyResolver } from "./turnProductionStrategyResolver";
import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";
import type { ProductionStrategyPack } from "./productionStrategySemanticValidation";

export interface ProductionStrategyRuntimeSmokeReport {
  valid: boolean;
  sampleCount: number;
  errors: readonly string[];
}

export function buildProductionStrategyRuntimeSmokeReport(
  pack: ProductionStrategyPack,
): ProductionStrategyRuntimeSmokeReport {
  const resolve = pack.dimensions.street === "FLOP"
    ? createFlopProductionStrategyResolver(pack as FlopProductionStrategyPack)
    : pack.dimensions.street === "TURN"
      ? createTurnProductionStrategyResolver(pack as TurnProductionStrategyPack)
      : createRiverProductionStrategyResolver(pack as RiverProductionStrategyPack);
  const errors: string[] = [];

  for (const rule of pack.rules) {
    const input = sampleInput(pack, rule);
    const recommendation = resolve(input);
    errors.push(...compareRecommendation(pack, rule, recommendation));
  }

  return {
    valid: errors.length === 0,
    sampleCount: pack.rules.length,
    errors,
  };
}

function sampleInput(
  pack: ProductionStrategyPack,
  rule: ProductionStrategyPack["rules"][number],
): PostflopStrategyInput {
  const potBB = 10;
  const input: PostflopStrategyInput = {
    street: pack.dimensions.street,
    textures: [],
    potType: rule.potType,
    potBB,
    effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * potBB,
    positionPattern: rule.positionPattern,
    actionNode: rule.actionNode,
    heroHand: rule.cardRemovalSamples?.[0]?.handClass ??
      rule.rangeBuckets[0]?.handClasses[0],
    board: rule.cardRemovalSamples?.[0]?.board,
  };
  if (pack.dimensions.street === "FLOP") {
    input.textures = (rule as FlopProductionStrategyPack["rules"][number]).boardTextures;
  } else if (pack.dimensions.street === "TURN") {
    const item = rule as TurnProductionStrategyPack["rules"][number];
    input.priorFlopAction = item.priorFlopAction;
    input.turnCardClass = item.turnCardClasses[0];
  } else {
    const item = rule as RiverProductionStrategyPack["rules"][number];
    input.priorTurnAction = item.priorTurnAction;
    input.riverRunoutClass = item.riverRunoutClasses[0];
  }
  return input;
}

function compareRecommendation(
  pack: ProductionStrategyPack,
  rule: ProductionStrategyPack["rules"][number],
  recommendation: PostflopRecommendation | null,
): string[] {
  const prefix = `${pack.id}/${rule.id}`;
  if (recommendation === null) return [`${prefix}: runtime resolver returned no recommendation.`];
  const errors: string[] = [];
  // The runtime recommends the sampled hand's own action, not the rule-wide
  // most-common action: a check-lane hand must be told to check even when the
  // rule as a whole most often bets. Expect the highest-EV action when the hero
  // bucket carries complete action EV, otherwise the hero bucket's own action.
  const heroBucket = recommendation.source?.kind === "STRATEGY_PACK"
    ? recommendation.source.heroRangeBucket
    : undefined;
  const expectedAction = recommendation.actionEvs
    ? (highestEvAction(recommendation.actionEvs) ?? heroBucket?.action ?? rule.recommendedAction)
    : (heroBucket?.action ?? rule.recommendedAction);
  if (recommendation.action !== expectedAction) {
    errors.push(`${prefix}: runtime action does not match the sampled hand's bucket action.`);
  }
  if (recommendation.explanation !== rule.explanation) {
    errors.push(`${prefix}: runtime explanation differs from imported rule.`);
  }
  if (
    recommendation.source?.kind !== "STRATEGY_PACK" ||
    recommendation.source.packId !== pack.id ||
    recommendation.source.packVersion !== pack.version ||
    recommendation.source.packVerifiedAt !== pack.verifiedAt ||
    recommendation.source.ruleId !== rule.id ||
    recommendation.source.confidence !== pack.confidence
  ) {
    errors.push(`${prefix}: runtime source quality metadata differs from imported pack.`);
  }
  const expectedHeroHand = rule.cardRemovalSamples?.[0]?.handClass ??
    rule.rangeBuckets[0]?.handClasses[0];
  if (
    expectedHeroHand !== undefined &&
    recommendation.source?.kind === "STRATEGY_PACK" &&
    recommendation.source.heroRangeBucket?.handClass !== expectedHeroHand
  ) {
    errors.push(`${prefix}: runtime hero range bucket does not match sampled imported hand.`);
  }
  return errors;
}
