import type {
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
  type TurnProductionStrategyPack,
  type TurnProductionStrategyRule,
  validateTurnProductionStrategyPack,
} from "./turnProductionStrategyPack";
import { runtimeMttTurnStrategyPacks } from "./mttProductionRuntimeRegistry";

export const turnProductionStrategyPacks: readonly TurnProductionStrategyPack[] =
  runtimeMttTurnStrategyPacks;

export function createTurnProductionStrategyResolver(
  pack: TurnProductionStrategyPack,
): PostflopStrategyResolver {
  const packErrors = validateTurnProductionStrategyPack(pack);
  return (input: PostflopStrategyInput): PostflopRecommendation | null => {
    if (packErrors.length > 0) return null;
    if (input.street !== "TURN") return null;
    if (!input.priorFlopAction || !input.turnCardClass) return null;

    const rule = selectBestTurnProductionRule(matchingTurnProductionRules(pack, input), input);
    if (!rule) return null;
    const matchedHeroBucket = heroRangeBucket(rule, input);
    // A hand outside this rule's range was never solved here. Returning a
    // rule-wide average for it would present an answer the solver never gave,
    // and label it solver-backed; let the chain fall through to the honestly
    // labelled heuristic model instead.
    if (input.heroHand !== undefined && matchedHeroBucket === undefined) return null;
    const actionEvs = isActionEvSetComplete(matchedHeroBucket?.actionEvs, rule.actions)
      ? cloneActionEvSet(matchedHeroBucket.actionEvs)
      : undefined;
    // Recommend the hero hand's own action, not the rule-wide most-common one;
    // fall back to the rule action only for a hand outside this rule's range.
    const action = actionEvs
      ? highestEvAction(actionEvs) ?? matchedHeroBucket?.action ?? rule.recommendedAction
      : matchedHeroBucket?.action ?? rule.recommendedAction;

    return {
      action,
      ...(actionEvs ? { actionEvs } : {}),
      explanation: rule.explanation,
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
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
        heroRangeBucket: matchedHeroBucket,
        ...(rule.opponentPolicy
          ? { opponentPolicy: { ...rule.opponentPolicy } }
          : {}),
      },
    };
  };
}

export function createTurnProductionStrategyResolverChain(
  packs: readonly TurnProductionStrategyPack[],
): PostflopStrategyResolver {
  const resolvers = packs.map(createTurnProductionStrategyResolver);
  return (input: PostflopStrategyInput) => {
    for (const resolver of resolvers) {
      const recommendation = resolver(input);
      if (recommendation) return recommendation;
    }
    return null;
  };
}

export function matchingTurnProductionRules(
  pack: TurnProductionStrategyPack,
  input: PostflopStrategyInput,
): TurnProductionStrategyRule[] {
  if (input.street !== "TURN" || !input.priorFlopAction || !input.turnCardClass) return [];
  const priorFlopAction = input.priorFlopAction;
  const turnCardClass = input.turnCardClass;
  return pack.rules.filter((rule) => (
    rule.potType === input.potType &&
    rule.positionPattern === input.positionPattern &&
    actionNodeMatchesInput(rule, input) &&
    rule.priorFlopAction === priorFlopAction &&
    rule.turnCardClasses.includes(turnCardClass)
  ));
}

export function selectBestTurnProductionRule(
  rules: readonly TurnProductionStrategyRule[],
  input: PostflopStrategyInput,
): TurnProductionStrategyRule | null {
  let bestRule: TurnProductionStrategyRule | null = null;
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
  rule: TurnProductionStrategyRule,
  input: PostflopStrategyInput,
): boolean {
  const spr = roundedSpr(input.effectiveStackBB, input.potBB);
  return (
    input.street === "TURN" &&
    input.priorFlopAction !== undefined &&
    input.turnCardClass !== undefined &&
    rule.potType === input.potType &&
    rule.positionPattern === input.positionPattern &&
    actionNodeMatchesInput(rule, input) &&
    rule.priorFlopAction === input.priorFlopAction &&
    rule.turnCardClasses.includes(input.turnCardClass) &&
    spr >= rule.sprMin &&
    spr <= rule.sprMax
  );
}

function actionNodeMatchesInput(
  rule: TurnProductionStrategyRule,
  input: PostflopStrategyInput,
): boolean {
  if (input.actionNode !== undefined) return rule.actionNode === input.actionNode;
  return rule.actionNode !== "TURN_FACING_BET";
}

function ruleScore(rule: TurnProductionStrategyRule, input: PostflopStrategyInput): number {
  const turnClassSpecificity = input.turnCardClass && rule.turnCardClasses.includes(input.turnCardClass)
    ? 100 - rule.turnCardClasses.length
    : 0;
  const sprWidth = Math.max(0, rule.sprMax - rule.sprMin);
  return turnClassSpecificity + Math.max(0, 50 - sprWidth);
}

function heroRangeBucket(
  rule: TurnProductionStrategyRule,
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

function rangeBuckets(rule: TurnProductionStrategyRule): PostflopRangeBucket[] {
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
