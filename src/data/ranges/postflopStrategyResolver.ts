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
} from "./postflopStrategyPack";

const SUPPORTED_ACTIONS = new Set<PostflopAction>(["CHECK", "BET_SMALL", "BET_BIG"]);

export function createPostflopStrategyResolver(
  pack: PostflopStrategyPack,
): PostflopStrategyResolver {
  return (input: PostflopStrategyInput) => {
    if (pack.dimensions.street !== input.street) return null;

    const rule = matchingPostflopRules(pack, {
      actionNode: actionNodeForStreet(input.street),
      boardTextures: input.textures,
      spr: roundedSpr(input.effectiveStackBB, input.potBB),
    }).find((candidate) => isSupportedAction(candidate.preferredAction));

    if (!rule || !isSupportedAction(rule.preferredAction)) return null;
    return {
      action: rule.preferredAction,
      explanation: rule.explanation,
    };
  };
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

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}
