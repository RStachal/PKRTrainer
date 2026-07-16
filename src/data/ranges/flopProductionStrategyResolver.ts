import type {
  BoardTexture,
  PostflopHeroRangeBucket,
  PostflopRecommendation,
  PostflopRangeBucket,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import {
  cloneActionEvSet,
  highestEvAction,
  isActionEvSetComplete,
} from "../../core/actionEv";
import {
  type FlopProductionStrategyPack,
  type FlopProductionStrategyRule,
  validateFlopProductionStrategyPack,
} from "./flopProductionStrategyPack";
import { runtimeMttFlopStrategyPacks } from "./mttProductionRuntimeRegistry";

export const flopProductionStrategyPacks: readonly FlopProductionStrategyPack[] =
  runtimeMttFlopStrategyPacks;

export function createFlopProductionStrategyResolver(
  pack: FlopProductionStrategyPack,
): PostflopStrategyResolver {
  const packErrors = validateFlopProductionStrategyPack(pack);
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (packErrors.length > 0) return null;
    if (input.street !== "FLOP") return null;

    const rule = selectBestFlopProductionRule(matchingFlopProductionRules(pack, input), input);
    if (!rule) return null;
    const matchedHeroBucket = heroRangeBucket(rule, input);
    const actionEvs = isActionEvSetComplete(matchedHeroBucket?.actionEvs, rule.actions)
      ? cloneActionEvSet(matchedHeroBucket.actionEvs)
      : undefined;
    const action = actionEvs
      ? highestEvAction(actionEvs) ?? rule.recommendedAction
      : rule.recommendedAction;

    return {
      action,
      ...(actionEvs ? { actionEvs } : {}),
      explanation: rule.explanation,
      source: {
        kind: "STRATEGY_PACK",
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.verifiedAt,
        ruleId: rule.id,
        confidence: pack.confidence,
        matchedTextures: matchedTextures(rule, input),
        sprMin: rule.sprMin,
        sprMax: rule.sprMax,
        positionPattern: rule.positionPattern,
        sourceUrls: pack.sourceEvidence.map((source) => source.url),
        assumptions: pack.assumptions,
        selectionScore: ruleScore(rule, input),
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        rangeBuckets: rangeBuckets(rule),
        heroRangeBucket: matchedHeroBucket,
        ...(rule.opponentPolicy
          ? { opponentPolicy: { ...rule.opponentPolicy } }
          : {}),
      },
    };
  };
}

export function createFlopProductionStrategyResolverChain(
  packs: readonly FlopProductionStrategyPack[],
): PostflopStrategyResolver {
  const resolvers = packs.map(createFlopProductionStrategyResolver);
  return (input: PostflopStrategyInput) => {
    for (const resolver of resolvers) {
      const recommendation = resolver(input);
      if (recommendation) return recommendation;
    }
    return null;
  };
}

export function matchingFlopProductionRules(
  pack: FlopProductionStrategyPack,
  input: PostflopStrategyInput,
): FlopProductionStrategyRule[] {
  if (input.street !== "FLOP") return [];
  return pack.rules.filter((rule) => (
    rule.potType === input.potType &&
    actionNodeMatchesInput(rule, input) &&
    rule.positionPattern === input.positionPattern &&
    rule.boardTextures.some((texture) => input.textures.includes(texture))
  ));
}

export function selectBestFlopProductionRule(
  rules: readonly FlopProductionStrategyRule[],
  input: PostflopStrategyInput,
): FlopProductionStrategyRule | null {
  let bestRule: FlopProductionStrategyRule | null = null;
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
  rule: FlopProductionStrategyRule,
  input: PostflopStrategyInput,
): boolean {
  const spr = roundedSpr(input.effectiveStackBB, input.potBB);
  return (
    rule.potType === input.potType &&
    actionNodeMatchesInput(rule, input) &&
    rule.positionPattern === input.positionPattern &&
    spr >= rule.sprMin &&
    spr <= rule.sprMax &&
    rule.boardTextures.some((texture) => input.textures.includes(texture))
  );
}

function actionNodeMatchesInput(
  rule: FlopProductionStrategyRule,
  input: PostflopStrategyInput,
): boolean {
  if (input.actionNode !== undefined) return rule.actionNode === input.actionNode;
  return rule.actionNode !== "FLOP_FACING_BET";
}

function ruleScore(rule: FlopProductionStrategyRule, input: PostflopStrategyInput): number {
  const matchedTextureCount = matchedTextures(rule, input).length;
  const textureSpecificity = matchedTextureCount * 100 - rule.boardTextures.length;
  const sprWidth = Math.max(0, rule.sprMax - rule.sprMin);
  return textureSpecificity + Math.max(0, 50 - sprWidth);
}

function matchedTextures(
  rule: FlopProductionStrategyRule,
  input: PostflopStrategyInput,
): readonly BoardTexture[] {
  return rule.boardTextures.filter((texture) => input.textures.includes(texture));
}

function heroRangeBucket(
  rule: FlopProductionStrategyRule,
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
    ...(bucket.actionEvs ? { actionEvs: cloneActionEvSet(bucket.actionEvs) } : {}),
  };
}

function rangeBuckets(rule: FlopProductionStrategyRule): PostflopRangeBucket[] {
  return rule.rangeBuckets.map((bucket) => ({
    lane: bucket.lane,
    label: bucket.label,
    action: bucket.action,
    handClasses: [...bucket.handClasses],
    features: [...bucket.features],
    actionMix: bucket.actionMix?.map((item) => ({ ...item })),
    ...(bucket.actionEvs ? { actionEvs: cloneActionEvSet(bucket.actionEvs) } : {}),
  }));
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}
