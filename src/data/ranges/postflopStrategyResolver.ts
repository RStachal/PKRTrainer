import type {
  BoardTexture,
  PostflopAction,
  PostflopStrategyInput,
  PostflopStrategyResolver,
  PostflopStreet,
} from "../../core/postflopGenerator";
import { POSTFLOP_ACTIONS } from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import {
  matchingPostflopRules,
  type PostflopStrategyPack,
  type PostflopStrategyRule,
} from "./postflopStrategyPack";

const SUPPORTED_ACTIONS = new Set<PostflopAction>(POSTFLOP_ACTIONS);

export function createPostflopStrategyResolver(
  pack: PostflopStrategyPack,
): PostflopStrategyResolver {
  return (input: PostflopStrategyInput) => {
    if (pack.dimensions.street !== input.street) return null;
    if (pack.dimensions.potType !== input.potType) return null;

    const rule = selectBestPostflopRule(matchingPostflopRules(pack, {
      actionNode: input.actionNode ?? actionNodeForStreet(input.street, input.potType),
      boardTextures: input.textures,
      spr: roundedSpr(input.effectiveStackBB, input.potBB),
      positionPattern: input.positionPattern,
    }).filter((candidate) => isSupportedAction(candidate.preferredAction)), input);

    if (!rule || !isSupportedAction(rule.preferredAction)) return null;
    return {
      action: rule.preferredAction,
      explanation: rule.explanation,
      source: {
        kind: "STRATEGY_PACK",
        provenance: "PUBLIC_HEURISTIC",
        packId: pack.id,
        packVersion: pack.version,
        packVerifiedAt: pack.verifiedAt,
        ruleId: rule.id,
        confidence: pack.confidence,
        matchedTextures: matchedTextures(rule, input),
        sprMin: rule.sprMin,
        sprMax: rule.sprMax,
        positionPattern: rule.positionPattern,
        sourceUrls: pack.sourceEvidence.map((evidence) => evidence.url),
        assumptions: pack.assumptions,
        selectionScore: ruleScore(rule, input),
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        ...(rule.opponentPolicy
          ? { opponentPolicy: { ...rule.opponentPolicy } }
          : {}),
      },
    };
  };
}

export function createPostflopStrategyResolverChain(
  packs: readonly PostflopStrategyPack[],
): PostflopStrategyResolver {
  const resolvers = packs.map(createPostflopStrategyResolver);
  return (input: PostflopStrategyInput) => {
    for (const resolver of resolvers) {
      const recommendation = resolver(input);
      if (recommendation) return recommendation;
    }
    return null;
  };
}

export function selectBestPostflopRule(
  rules: readonly PostflopStrategyRule[],
  input: PostflopStrategyInput,
): PostflopStrategyRule | null {
  let bestRule: PostflopStrategyRule | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    const score = ruleScore(rule, input);
    if (score > bestScore || (score === bestScore && index < bestIndex)) {
      bestRule = rule;
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestRule;
}

function actionNodeForStreet(
  street: PostflopStreet,
  potType: PostflopStrategyInput["potType"],
): PostflopActionNode {
  switch (street) {
    case "FLOP":
      if (potType === "THREE_BET_POT") return "THREE_BET_POT_CBET";
      return "SINGLE_RAISED_POT_CBET";
    case "TURN":
      return "TURN_BARREL";
    case "RIVER":
      return "RIVER_PRESSURE";
  }
}

function isSupportedAction(action: string): action is PostflopAction {
  return SUPPORTED_ACTIONS.has(action as PostflopAction);
}

function ruleScore(rule: PostflopStrategyRule, input: PostflopStrategyInput): number {
  const matchedTextureCount = matchedTextures(rule, input).length;
  const textureSpecificity = matchedTextureCount * 100 - rule.boardTextures.length;
  const sprWidth = Math.max(0, rule.sprMax - rule.sprMin);
  const sprSpecificity = Math.max(0, 50 - sprWidth);
  const positionSpecificity = rule.positionPattern === input.positionPattern ? 25 : 0;

  return textureSpecificity + sprSpecificity + positionSpecificity;
}

function matchedTextures(
  rule: PostflopStrategyRule,
  input: PostflopStrategyInput,
): readonly BoardTexture[] {
  return rule.boardTextures.filter((texture) => input.textures.includes(texture));
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}
