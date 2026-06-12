import type { Card, Position } from "./types";
import type {
  BoardTexture,
  PostflopAction,
  PostflopCallerType,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopRecommendationSource,
  PostflopSpot,
  PostflopStreet,
} from "./postflopGenerator";

export type PostflopActionNode =
  | "SINGLE_RAISED_POT_CBET"
  | "THREE_BET_POT_CBET"
  | "FLOP_FACING_BET"
  | "TURN_BARREL"
  | "TURN_FACING_BET"
  | "RIVER_PRESSURE"
  | "RIVER_FACING_BET";

export type PostflopSizing =
  | "CHECK"
  | "BET_SMALL"
  | "BET_BIG"
  | "CALL"
  | "RAISE"
  | "FOLD";

export interface PostflopActionOption {
  action: PostflopAction;
  sizing: PostflopSizing;
  label: string;
}

export interface PostflopExplanation {
  summary: string;
  valueHands: readonly string[];
  bluffHands: readonly string[];
  checkHands: readonly string[];
  nextStreetPlan: string;
  source: PostflopRecommendationSource;
}

export interface PostflopTrainingSpot {
  id: string;
  seed: number;
  street: PostflopStreet;
  actionNode: PostflopActionNode;
  heroCards: [Card, Card];
  board: readonly Card[];
  boardTextures: readonly BoardTexture[];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  spr: number;
  heroPosition: Position;
  villainPosition: Position;
  aggressorPosition: Position;
  callerPosition: Position;
  inPosition: boolean;
  callerType: PostflopCallerType;
  positionPattern: PostflopPositionPattern;
  actions: readonly PostflopActionOption[];
  recommendedAction: PostflopAction;
  explanation: PostflopExplanation;
}

const ACTION_LABEL: Record<PostflopAction, string> = {
  CHECK: "Check",
  BET_SMALL: "Bet small",
  BET_BIG: "Bet big",
  CALL: "Call",
  RAISE: "Raise",
  FOLD: "Fold",
};

export function postflopSpotToTrainingSpot(spot: PostflopSpot): PostflopTrainingSpot {
  return {
    id: postflopTrainingSpotId(spot),
    seed: spot.seed,
    street: spot.street,
    actionNode: actionNodeForSpot(spot),
    heroCards: spot.heroCards,
    board: spot.board,
    boardTextures: spot.textures,
    potType: spot.potType,
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    spr: roundedSpr(spot.effectiveStackBB, spot.potBB),
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    aggressorPosition: spot.aggressorPosition,
    callerPosition: spot.callerPosition,
    inPosition: spot.inPosition,
    callerType: spot.callerType,
    positionPattern: spot.positionPattern,
    actions: spot.actions.map((action) => ({
      action,
      sizing: action,
      label: ACTION_LABEL[action],
    })),
    recommendedAction: spot.recommendedAction,
    explanation: buildExplanation(spot),
  };
}

export function postflopTrainingSpotId(spot: Pick<PostflopSpot, "seed" | "street" | "board">): string {
  return [
    "POSTFLOP",
    spot.street,
    spot.seed,
    spot.board.map((card) => `${card.rank}${card.suit}`).join("-"),
  ].join("|");
}

function actionNodeForSpot(
  spot: Pick<PostflopSpot, "street" | "potType" | "actionNode">,
): PostflopActionNode {
  if (spot.actionNode) return spot.actionNode;
  switch (spot.street) {
    case "FLOP":
      if (spot.potType === "THREE_BET_POT") return "THREE_BET_POT_CBET";
      return "SINGLE_RAISED_POT_CBET";
    case "TURN":
      return "TURN_BARREL";
    case "RIVER":
      return "RIVER_PRESSURE";
  }
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}

function buildExplanation(spot: PostflopSpot): PostflopExplanation {
  return {
    summary: spot.explanation,
    valueHands: valueHandsForSpot(spot),
    bluffHands: bluffHandsForSpot(spot),
    checkHands: checkHandsForSpot(spot),
    nextStreetPlan: nextStreetPlanForStreet(spot.street, spot.recommendedAction),
    source: spot.strategySource,
  };
}

function valueHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return spot.recommendedAction === "CHECK"
        ? ["overpairs with pot-control", "top pair good kicker", "middle pairs with backdoors"]
        : ["overpairs", "top pair top kicker", "strong combo draws"];
    }
    if (spot.positionPattern === "BTN_VS_BB" || spot.positionPattern === "EP_VS_BB") {
      if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
        return ["top pair", "second pair", "overpairs from preflop range"];
      }
      return ["top pair good kicker", "overpairs", "strong pair+draw"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return spot.recommendedAction === "CHECK"
        ? ["top pair weak kicker", "second pair", "overpair check-call portion"]
        : ["top pair+", "overpairs", "strong made hands"];
    }
    if (spot.positionPattern === "SB_VS_BB") {
      return ["top pair+", "good second pairs", "strong equity draws"];
    }
  }

  switch (spot.recommendedAction) {
    case "BET_BIG":
      return ["top pair+", "overpair", "strong made hands"];
    case "BET_SMALL":
      return ["top pair", "middle pair", "range advantage hands"];
    case "CALL":
      return ["showdown value", "pairs with blocker support", "draws getting price"];
    case "RAISE":
      return ["strong value", "nut advantage hands", "premium blockers"];
    case "FOLD":
      return ["hands without enough equity or blockers"];
    case "CHECK":
      return ["marginal showdown value", "pot-control hands"];
  }
}

function bluffHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.recommendedAction === "CHECK") {
    if (spot.street === "FLOP" && spot.potType === "THREE_BET_POT") {
      return ["A-high backdoor blockers", "gutshot with overcards"];
    }
    return [];
  }
  if (spot.recommendedAction === "CALL" || spot.recommendedAction === "FOLD") {
    return [];
  }
  if (spot.recommendedAction === "RAISE") {
    return ["nut blockers", "combo draws", "low showdown bluffs with removal"];
  }

  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["nut flush draw", "A-high blocker hands", "gutshot + overcards"];
    }
    if (spot.positionPattern === "BTN_VS_BB") {
      return spot.textures.includes("connected") || spot.textures.includes("two-tone")
        ? ["open-ended draws", "flush draws", "overcards with backdoor equity"]
        : ["backdoor flush draw", "BDFD + overcard", "blocker hands"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return ["strong draw without showdown value", "overcards with backdoor equity", "top-pair blockers"];
    }
  }

  if (spot.textures.includes("connected") || spot.textures.includes("two-tone")) {
    return ["open-ended draws", "flush draws", "overcards"];
  }
  return ["backdoor draws", "blocker hands"];
}

function checkHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["underpairs without backdoors", "A-high showdown", "air without blockers"];
    }
    if (!spot.inPosition || spot.textures.includes("connected") || spot.textures.includes("monotone")) {
      return ["weaker pairs", "medium showdown value", "air without good backdoors"];
    }
    if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
      return ["worst air", "slowplay portion", "weak backdoor combos"];
    }
  }

  if (spot.textures.includes("monotone") || spot.textures.includes("connected")) {
    return ["weak pairs", "air without blockers", "medium showdown value"];
  }
  return ["worst air", "slowplay portion"];
}

function nextStreetPlanForStreet(
  street: PostflopStreet,
  action: PostflopAction,
): string {
  if (street === "RIVER") {
    return "River is the final street; evaluate showdown value and sizing.";
  }
  if (action === "CHECK") {
    return "On the next street, re-check texture, range advantage and SPR.";
  }
  if (action === "CALL") {
    return "Continue by re-evaluating pot odds, blockers and showdown value on the next card.";
  }
  if (action === "RAISE") {
    return "After raising, plan turn or river barrels around nut advantage and blocker quality.";
  }
  if (action === "FOLD") {
    return "Folding ends this branch; review whether equity, blockers or pot odds justified continuing.";
  }
  return "On blank runouts you can keep pressure; slow down on dynamic cards.";
}
