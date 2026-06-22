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
        ? ["overpairy s pot-control", "top pair s dobrým kickerem", "střední páry s backdoory"]
        : ["overpairy", "top pair top kicker", "silné combo draw"];
    }
    if (spot.positionPattern === "BTN_VS_BB" || spot.positionPattern === "EP_VS_BB") {
      if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
        return ["top pair", "second pair", "overpairy z preflop range"];
      }
      return ["top pair s dobrým kickerem", "overpairy", "silná pair+draw"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return spot.recommendedAction === "CHECK"
        ? ["top pair se slabým kickerem", "second pair", "check-call část overpairů"]
        : ["top pair+", "overpairy", "silné made hands"];
    }
    if (spot.positionPattern === "SB_VS_BB") {
      return ["top pair+", "dobré second pairy", "draw se silnou equity"];
    }
  }

  switch (spot.recommendedAction) {
    case "BET_BIG":
      return ["top pair+", "overpair", "silné made hands"];
    case "BET_SMALL":
      return ["top pair", "middle pair", "handy s range výhodou"];
    case "CALL":
      return ["showdown value", "páry podpořené blockery", "draw se správnou cenou"];
    case "RAISE":
      return ["silná value", "handy s nut výhodou", "prémiové blockery"];
    case "FOLD":
      return ["handy bez dostatečné equity nebo blockerů"];
    case "CHECK":
      return ["marginální showdown value", "pot-control handy"];
  }
}

function bluffHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.recommendedAction === "CHECK") {
    if (spot.street === "FLOP" && spot.potType === "THREE_BET_POT") {
      return ["A-high backdoor blockery", "gutshot s overkartami"];
    }
    return [];
  }
  if (spot.recommendedAction === "CALL" || spot.recommendedAction === "FOLD") {
    return [];
  }
  if (spot.recommendedAction === "RAISE") {
    return ["nut blockery", "combo draw", "bluffy s nízkou showdown value a removalem"];
  }

  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["nut flush draw", "A-high blocker handy", "gutshot + overkarty"];
    }
    if (spot.positionPattern === "BTN_VS_BB") {
      return spot.textures.includes("connected") || spot.textures.includes("two-tone")
        ? ["open-ended draw", "flush draw", "overkarty s backdoor equity"]
        : ["backdoor flush draw", "BDFD + overkarta", "blocker handy"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return ["silná draw bez showdown value", "overkarty s backdoor equity", "top-pair blockery"];
    }
  }

  if (spot.textures.includes("connected") || spot.textures.includes("two-tone")) {
    return ["open-ended draw", "flush draw", "overkarty"];
  }
  return ["backdoor draw", "blocker handy"];
}

function checkHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["underpairy bez backdoorů", "A-high showdown", "air bez blockerů"];
    }
    if (!spot.inPosition || spot.textures.includes("connected") || spot.textures.includes("monotone")) {
      return ["slabší páry", "střední showdown value", "air bez dobrých backdoorů"];
    }
    if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
      return ["nejhorší air", "slowplay část", "slabá backdoor komba"];
    }
  }

  if (spot.textures.includes("monotone") || spot.textures.includes("connected")) {
    return ["slabé páry", "air bez blockerů", "střední showdown value"];
  }
  return ["nejhorší air", "slowplay část"];
}

function nextStreetPlanForStreet(
  street: PostflopStreet,
  action: PostflopAction,
): string {
  if (street === "RIVER") {
    return "River je poslední street; vyhodnoťte showdown value a sizing.";
  }
  if (action === "CHECK") {
    return "Na další streetě znovu vyhodnoťte texturu, range výhodu a SPR.";
  }
  if (action === "CALL") {
    return "Po další kartě znovu vyhodnoťte pot odds, blockery a showdown value.";
  }
  if (action === "RAISE") {
    return "Po raisu plánujte turn nebo river barrely podle nut výhody a kvality blockerů.";
  }
  if (action === "FOLD") {
    return "Fold ukončí tuto větev; ověřte, zda equity, blockery nebo pot odds opravňovaly pokračování.";
  }
  return "Na blank runoutech můžete pokračovat v tlaku; na dynamických kartách zpomalte.";
}
