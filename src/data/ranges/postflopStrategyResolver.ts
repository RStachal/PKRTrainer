import type {
  PostflopAction,
  PostflopStrategyInput,
  PostflopStrategyResolver,
  PostflopStreet,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import {
  matchingPostflopRules,
  type PostflopStrategyPack,
  type PostflopStrategyRule,
} from "./postflopStrategyPack";

const SUPPORTED_ACTIONS = new Set<PostflopAction>(["CHECK", "BET_SMALL", "BET_BIG"]);

export function createPostflopStrategyResolver(
  pack: PostflopStrategyPack,
): PostflopStrategyResolver {
  return (input: PostflopStrategyInput) => {
    if (pack.dimensions.street !== input.street) return null;

    const rule = selectBestPostflopRule(matchingPostflopRules(pack, {
      actionNode: actionNodeForStreet(input.street),
      boardTextures: input.textures,
      spr: roundedSpr(input.effectiveStackBB, input.potBB),
    }).filter((candidate) => isSupportedAction(candidate.preferredAction)), input);

    if (!rule || !isSupportedAction(rule.preferredAction)) return null;
    return {
      action: rule.preferredAction,
      explanation: rule.explanation,
      source: {
        kind: "STRATEGY_PACK",
        packId: pack.id,
        ruleId: rule.id,
        confidence: pack.confidence,
      },
    };
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

function actionNodeForStreet(street: PostflopStreet): PostflopActionNode {
  switch (street) {
    case "FLOP":
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
  const matchedTextures = rule.boardTextures
    .filter((texture) => input.textures.includes(texture))
    .length;
  const textureSpecificity = matchedTextures * 100 - rule.boardTextures.length;
  const sprWidth = Math.max(0, rule.sprMax - rule.sprMin);
  const sprSpecificity = Math.max(0, 50 - sprWidth);

  return textureSpecificity + sprSpecificity;
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}
