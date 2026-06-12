import { hashStr } from "./rng";
import type { HHResult } from "./hhParser";
import {
  generatePostflopSpot,
  type PostflopPositionContext,
  type PostflopStrategyResolver,
} from "./postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopTrainingSpot,
} from "./postflopTrainingSpot";
import type { Spot } from "./types";

export function buildImportedFlopTrainingSpot(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
): PostflopTrainingSpot | undefined {
  if (!result.ok || !result.spot) return undefined;
  if (!result.fields.flop || !result.fields.heroCards) return undefined;
  if (!isSupportedPreflopAggressor(result.spot, result.fields.actions)) return undefined;

  const positionContext = positionContextFromPreflopSpot(result.spot);
  if (!positionContext) return undefined;

  return postflopSpotToTrainingSpot(generatePostflopSpot({
    seed: hashStr(`HH_FLOP|${result.spot.id}|${cardLabels(result.fields.flop)}`),
    street: "FLOP",
    heroCards: result.fields.heroCards,
    board: result.fields.flop,
    potType: "SINGLE_RAISED",
    potBB: 6,
    effectiveStackBB: result.fields.effStackBB ?? result.spot.effStack,
    positionContext,
    strategyResolver,
  }));
}

function isSupportedPreflopAggressor(
  spot: Spot,
  actions: readonly string[] | undefined,
): boolean {
  const firstAction = actions?.[0]?.toLowerCase() ?? "";
  if (!firstAction.startsWith("raise") && !firstAction.startsWith("bet")) return false;
  return spot.context === "RFI" || spot.context === "BVB";
}

function positionContextFromPreflopSpot(spot: Spot): PostflopPositionContext | undefined {
  if (spot.heroPos === "BB") return undefined;
  if (spot.heroPos === "SB") return {
    heroPosition: "SB",
    villainPosition: "BB",
    aggressorPosition: "SB",
    callerPosition: "BB",
    inPosition: false,
    callerType: "BIG_BLIND",
    positionPattern: "SB_VS_BB",
  };
  if (spot.heroPos === "BTN") return {
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "BTN_VS_BB",
  };
  return {
    heroPosition: spot.heroPos,
    villainPosition: "BB",
    aggressorPosition: spot.heroPos,
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "EP_VS_BB",
  };
}

function cardLabels(cards: readonly { rank: string; suit: string }[]): string {
  return cards.map((card) => `${card.rank}${card.suit}`).join("-");
}
