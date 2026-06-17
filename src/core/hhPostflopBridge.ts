import { hashStr } from "./rng";
import type { HHResult } from "./hhParser";
import {
  generatePostflopSpot,
  type PostflopAction,
  type PostflopStreet,
  type PostflopPositionContext,
  type PostflopStrategyResolver,
} from "./postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopTrainingSpot,
} from "./postflopTrainingSpot";
import type { Card, Spot } from "./types";

export function buildImportedFlopTrainingSpot(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
): PostflopTrainingSpot | undefined {
  return buildImportedPostflopTrainingSpots(result, strategyResolver)[0];
}

export function buildImportedPostflopTrainingSpots(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
): readonly PostflopTrainingSpot[] {
  if (!result.ok || !result.spot) return [];
  if (!result.fields.flop || !result.fields.heroCards) return [];
  if (!isSupportedPreflopAggressor(result.spot, result.fields.actions)) return [];

  const positionContext = positionContextFromPreflopSpot(result.spot);
  if (!positionContext) return [];

  const spots: PostflopTrainingSpot[] = [];
  spots.push(buildImportedPostflopTrainingSpot({
    result,
    heroCards: result.fields.heroCards,
    street: "FLOP",
    potBB: 6,
    positionContext,
    board: result.fields.flop,
    strategyResolver,
  }));

  if (result.fields.turn) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "TURN",
      potBB: 10,
      positionContext,
      board: result.fields.turn,
      strategyResolver,
    }));
  }

  if (result.fields.river) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "RIVER",
      potBB: 18,
      positionContext,
      board: result.fields.river,
      strategyResolver,
    }));
  }

  return spots;
}

function buildImportedPostflopTrainingSpot(input: {
  result: HHResult;
  heroCards: [Card, Card];
  street: PostflopStreet;
  potBB: number;
  board: readonly Card[];
  positionContext: PostflopPositionContext;
  strategyResolver?: PostflopStrategyResolver;
}): PostflopTrainingSpot {
  const { result, heroCards, street, potBB, board, positionContext, strategyResolver } = input;
  const history = historyForStreet(result, street);
  return postflopSpotToTrainingSpot(generatePostflopSpot({
    seed: hashStr(`HH_${street}|${result.spot?.id ?? "unknown"}|${cardLabels(board)}`),
    street,
    heroCards,
    board: [...board],
    potType: "SINGLE_RAISED",
    potBB,
    effectiveStackBB: result.fields.effStackBB ?? result.spot?.effStack ?? 40,
    positionContext,
    actionNode: actionNodeForStreet(street, history),
    priorFlopAction: street === "TURN" ? postflopActionFromRaw(
      result.fields.postflopActions?.flop?.heroActions[0],
    ) : undefined,
    priorTurnAction: street === "RIVER" ? postflopActionFromRaw(
      result.fields.postflopActions?.turn?.heroActions[0],
    ) : undefined,
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

function historyForStreet(result: HHResult, street: PostflopStreet) {
  switch (street) {
    case "FLOP":
      return result.fields.postflopActions?.flop;
    case "TURN":
      return result.fields.postflopActions?.turn;
    case "RIVER":
      return result.fields.postflopActions?.river;
  }
}

function actionNodeForStreet(
  street: PostflopStreet,
  history: ReturnType<typeof historyForStreet>,
) {
  const facingBet = history?.actionsBeforeHero.some(isPressureAction) ?? false;
  switch (street) {
    case "FLOP":
      return facingBet ? "FLOP_FACING_BET" : "SINGLE_RAISED_POT_CBET";
    case "TURN":
      return facingBet ? "TURN_FACING_BET" : "TURN_BARREL";
    case "RIVER":
      return facingBet ? "RIVER_FACING_BET" : "RIVER_PRESSURE";
  }
}

function isPressureAction(raw: string): boolean {
  return /^(bets|raises)\b/i.test(raw.trim());
}

function postflopActionFromRaw(raw: string | undefined): PostflopAction | undefined {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value.startsWith("fold")) return "FOLD";
  if (value.startsWith("check")) return "CHECK";
  if (value.startsWith("call")) return "CALL";
  if (value.startsWith("raise")) return "RAISE";
  if (value.startsWith("bet")) return "BET_SMALL";
  return undefined;
}
