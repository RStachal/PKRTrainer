import type { Card } from "./types";
import type {
  BoardTexture,
  PostflopAction,
  PostflopSpot,
  PostflopStreet,
} from "./postflopGenerator";

export type PostflopActionNode =
  | "SINGLE_RAISED_POT_CBET"
  | "TURN_BARREL"
  | "RIVER_PRESSURE";

export type PostflopSizing =
  | "CHECK"
  | "BET_SMALL"
  | "BET_BIG";

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
}

export interface PostflopTrainingSpot {
  id: string;
  seed: number;
  street: PostflopStreet;
  actionNode: PostflopActionNode;
  heroCards: [Card, Card];
  board: readonly Card[];
  boardTextures: readonly BoardTexture[];
  potType: "SINGLE_RAISED";
  potBB: number;
  effectiveStackBB: number;
  spr: number;
  actions: readonly PostflopActionOption[];
  recommendedAction: PostflopAction;
  explanation: PostflopExplanation;
}

const ACTION_LABEL: Record<PostflopAction, string> = {
  CHECK: "Check",
  BET_SMALL: "Bet maly",
  BET_BIG: "Bet velky",
};

export function postflopSpotToTrainingSpot(spot: PostflopSpot): PostflopTrainingSpot {
  return {
    id: postflopTrainingSpotId(spot),
    seed: spot.seed,
    street: spot.street,
    actionNode: actionNodeForStreet(spot.street),
    heroCards: spot.heroCards,
    board: spot.board,
    boardTextures: spot.textures,
    potType: "SINGLE_RAISED",
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    spr: roundedSpr(spot.effectiveStackBB, spot.potBB),
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

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}

function buildExplanation(spot: PostflopSpot): PostflopExplanation {
  return {
    summary: spot.explanation,
    valueHands: valueHandsForAction(spot.recommendedAction),
    bluffHands: bluffHandsForAction(spot.recommendedAction, spot.textures),
    checkHands: checkHandsForTextures(spot.textures),
    nextStreetPlan: nextStreetPlanForStreet(spot.street, spot.recommendedAction),
  };
}

function valueHandsForAction(action: PostflopAction): readonly string[] {
  switch (action) {
    case "BET_BIG":
      return ["top pair+", "overpair", "silne made hands"];
    case "BET_SMALL":
      return ["top pair", "middle pair", "range advantage hands"];
    case "CHECK":
      return ["marginal showdown value", "pot-control hands"];
  }
}

function bluffHandsForAction(
  action: PostflopAction,
  textures: readonly BoardTexture[],
): readonly string[] {
  if (action === "CHECK") return [];
  if (textures.includes("connected") || textures.includes("two-tone")) {
    return ["open-ended draws", "flush draws", "overcards"];
  }
  return ["backdoor draws", "blocker hands"];
}

function checkHandsForTextures(textures: readonly BoardTexture[]): readonly string[] {
  if (textures.includes("monotone") || textures.includes("connected")) {
    return ["slabe pary", "air bez blockeru", "stredni showdown value"];
  }
  return ["nejhorsi air", "cast slowplay ruk"];
}

function nextStreetPlanForStreet(
  street: PostflopStreet,
  action: PostflopAction,
): string {
  if (street === "RIVER") {
    return "Na riveru uz dalsi street neni; vyhodnot showdown value a sizing.";
  }
  if (action === "CHECK") {
    return "Na dalsi streete znovu vyhodnot texturu, range advantage a SPR.";
  }
  return "Na blank dalsi streete muzes pokracovat tlakem, na dynamicke karte zpomal.";
}
