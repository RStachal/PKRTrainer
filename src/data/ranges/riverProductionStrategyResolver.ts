import type {
  PostflopHeroRangeBucket,
  PostflopRecommendation,
  PostflopRangeBucket,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import {
  type RiverProductionStrategyPack,
  type RiverProductionStrategyRule,
  validateRiverProductionStrategyPack,
} from "./riverProductionStrategyPack";

export const riverProductionStrategyPacks: readonly RiverProductionStrategyPack[] = [];

export function createRiverProductionStrategyResolver(
  pack: RiverProductionStrategyPack,
): PostflopStrategyResolver {
  const packErrors = validateRiverProductionStrategyPack(pack);
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (packErrors.length > 0) return null;
    if (input.street !== "RIVER") return null;
    if (!input.priorTurnAction || !input.riverRunoutClass) return null;

    const rule = selectBestRiverProductionRule(matchingRiverProductionRules(pack, input), input);
    if (!rule) return null;

    return {
      action: rule.recommendedAction,
      explanation: rule.explanation,
      source: {
        kind: "STRATEGY_PACK",
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.verifiedAt,
        ruleId: rule.id,
        confidence: pack.confidence,
        matchedTextures: [...input.textures],
        sprMin: rule.sprMin,
        sprMax: rule.sprMax,
        positionPattern: rule.positionPattern,
        sourceUrls: pack.sourceEvidence.map((source) => source.url),
        assumptions: pack.assumptions,
        selectionScore: ruleScore(rule, input),
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        rangeBuckets: rangeBuckets(rule),
        heroRangeBucket: heroRangeBucket(rule, input),
      },
    };
  };
}

export function createRiverProductionStrategyResolverChain(
  packs: readonly RiverProductionStrategyPack[],
): PostflopStrategyResolver {
  const resolvers = packs.map(createRiverProductionStrategyResolver);
  return (input: PostflopStrategyInput) => {
    for (const resolver of resolvers) {
      const recommendation = resolver(input);
      if (recommendation) return recommendation;
    }
    return null;
  };
}

export function matchingRiverProductionRules(
  pack: RiverProductionStrategyPack,
  input: PostflopStrategyInput,
): RiverProductionStrategyRule[] {
  if (input.street !== "RIVER" || !input.priorTurnAction || !input.riverRunoutClass) return [];
  const priorTurnAction = input.priorTurnAction;
  const riverRunoutClass = input.riverRunoutClass;
  return pack.rules.filter((rule) => (
    rule.potType === input.potType &&
    rule.positionPattern === input.positionPattern &&
    rule.priorTurnAction === priorTurnAction &&
    rule.riverRunoutClasses.includes(riverRunoutClass)
  ));
}

export function selectBestRiverProductionRule(
  rules: readonly RiverProductionStrategyRule[],
  input: PostflopStrategyInput,
): RiverProductionStrategyRule | null {
  let bestRule: RiverProductionStrategyRule | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (!ruleMatchesInput(rule, input)) continue;
    const score = ruleScore(rule, input);
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      bestRule = rule;
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestRule;
}

function ruleMatchesInput(
  rule: RiverProductionStrategyRule,
  input: PostflopStrategyInput,
): boolean {
  const spr = roundedSpr(input.effectiveStackBB, input.potBB);
  return (
    input.street === "RIVER" &&
    input.priorTurnAction !== undefined &&
    input.riverRunoutClass !== undefined &&
    rule.potType === input.potType &&
    rule.positionPattern === input.positionPattern &&
    rule.priorTurnAction === input.priorTurnAction &&
    rule.riverRunoutClasses.includes(input.riverRunoutClass) &&
    spr >= rule.sprMin &&
    spr <= rule.sprMax
  );
}

function ruleScore(rule: RiverProductionStrategyRule, input: PostflopStrategyInput): number {
  const runoutSpecificity = input.riverRunoutClass && rule.riverRunoutClasses.includes(input.riverRunoutClass)
    ? 100 - rule.riverRunoutClasses.length
    : 0;
  const blockerSpecificity = rule.blockerRelevance === "HIGH" ? 20 : rule.blockerRelevance === "MEDIUM" ? 10 : 0;
  const sprWidth = Math.max(0, rule.sprMax - rule.sprMin);
  return runoutSpecificity + blockerSpecificity + Math.max(0, 50 - sprWidth);
}

function heroRangeBucket(
  rule: RiverProductionStrategyRule,
  input: PostflopStrategyInput,
): PostflopHeroRangeBucket | undefined {
  if (!input.heroHand) return undefined;
  const bucket = rule.rangeBuckets.find((item) => item.handClasses.includes(input.heroHand!));
  if (!bucket) return undefined;
  return {
    lane: bucket.lane,
    label: bucket.label,
    action: bucket.action,
    handClass: input.heroHand,
    features: [...bucket.features],
    actionMix: bucket.actionMix?.map((item) => ({ ...item })),
  };
}

function rangeBuckets(rule: RiverProductionStrategyRule): PostflopRangeBucket[] {
  return rule.rangeBuckets.map((bucket) => ({
    lane: bucket.lane,
    label: bucket.label,
    action: bucket.action,
    handClasses: [...bucket.handClasses],
    features: [...bucket.features],
    actionMix: bucket.actionMix?.map((item) => ({ ...item })),
  }));
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}
