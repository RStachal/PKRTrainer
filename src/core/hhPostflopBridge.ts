import { hashStr } from "./rng";
import type { HHResult } from "./hhParser";
import {
  generatePostflopSpot,
  postflopPositionContextsForFormat,
  type PostflopAction,
  type PostflopPotType,
  type PostflopStreet,
  type PostflopPositionContext,
  type PostflopStrategyResolver,
} from "./postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopExplanationLanguage,
  type PostflopTrainingSpot,
} from "./postflopTrainingSpot";
import type { Card, Spot } from "./types";
import type { TableFormat } from "./trainingProfile";

export function buildImportedFlopTrainingSpot(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
  options: ImportedPostflopStrategyOptions = {},
): PostflopTrainingSpot | undefined {
  return buildImportedPostflopTrainingSpots(result, strategyResolver, options)[0];
}

export interface ImportedPostflopStrategyOptions {
  allowFallback?: boolean;
  language?: PostflopExplanationLanguage;
}

export function buildImportedPostflopTrainingSpots(
  result: HHResult,
  strategyResolver?: PostflopStrategyResolver,
  options: ImportedPostflopStrategyOptions = {},
): readonly PostflopTrainingSpot[] {
  if (!result.ok || !result.spot) return [];
  if (!result.fields.flop || !result.fields.heroCards) return [];
  if (!isSupportedPreflopAggressor(result.spot, result.fields.actions)) return [];

  const potType = importedPotType(result.spot);
  const positionContext = positionContextFromPreflopSpot(
    result.spot,
    result.fields.tableFormat ?? "FULL_RING_9",
    potType,
  );
  if (!positionContext) return [];

  const spots: PostflopTrainingSpot[] = [];
  spots.push(buildImportedPostflopTrainingSpot({
    result,
    heroCards: result.fields.heroCards,
    street: "FLOP",
    potType,
    positionContext,
    board: result.fields.flop,
    strategyResolver,
    allowFallback: options.allowFallback,
    language: options.language,
  }));

  if (result.fields.turn) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "TURN",
      potType,
      positionContext,
      board: result.fields.turn,
      strategyResolver,
      allowFallback: options.allowFallback,
      language: options.language,
    }));
  }

  if (result.fields.river) {
    spots.push(buildImportedPostflopTrainingSpot({
      result,
      heroCards: result.fields.heroCards,
      street: "RIVER",
      potType,
      positionContext,
      board: result.fields.river,
      strategyResolver,
      allowFallback: options.allowFallback,
      language: options.language,
    }));
  }

  return spots;
}

function buildImportedPostflopTrainingSpot(input: {
  result: HHResult;
  heroCards: [Card, Card];
  street: PostflopStreet;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  board: readonly Card[];
  positionContext: PostflopPositionContext;
  strategyResolver?: PostflopStrategyResolver;
  allowFallback?: boolean;
  language?: PostflopExplanationLanguage;
}): PostflopTrainingSpot {
  const {
    result,
    heroCards,
    street,
    potType,
    board,
    positionContext,
    strategyResolver,
    allowFallback,
    language,
  } = input;
  const history = historyForStreet(result, street);
  const financial = financialStateForStreet(result, street);
  return postflopSpotToTrainingSpot(generatePostflopSpot({
    seed: hashStr(`HH_${street}|${result.spot?.id ?? "unknown"}|${cardLabels(board)}`),
    street,
    heroCards,
    board: [...board],
    potType,
    potBB: financial?.potBeforeBB ?? defaultImportedPotBB(street),
    effectiveStackBB:
      financial?.effectiveStackBeforeBB ??
      result.fields.effStackBB ??
      result.spot?.effStack ??
      40,
    positionContext,
    actionNode: actionNodeForStreet(street, history),
    priorFlopAction: street === "TURN" ? postflopActionFromRaw(
      result.fields.postflopActions?.flop?.heroActions[0],
    ) : undefined,
    priorTurnAction: street === "RIVER" ? postflopActionFromRaw(
      result.fields.postflopActions?.turn?.heroActions[0],
    ) : undefined,
    strategyResolver,
    allowFallback,
  }), language);
}

function financialStateForStreet(result: HHResult, street: PostflopStreet) {
  switch (street) {
    case "FLOP":
      return result.fields.financialState?.flop;
    case "TURN":
      return result.fields.financialState?.turn;
    case "RIVER":
      return result.fields.financialState?.river;
  }
}

function defaultImportedPotBB(street: PostflopStreet): number {
  switch (street) {
    case "FLOP":
      return 6;
    case "TURN":
      return 10;
    case "RIVER":
      return 18;
  }
}

function isSupportedPreflopAggressor(
  spot: Spot,
  actions: readonly string[] | undefined,
): boolean {
  const firstAction = actions?.[0]?.toLowerCase() ?? "";
  if (!firstAction.startsWith("raise") && !firstAction.startsWith("bet")) return false;
  return spot.context === "RFI" ||
    spot.context === "BVB" ||
    spot.context === "VS_OPEN" ||
    spot.context === "SQUEEZE";
}

function importedPotType(
  spot: Spot,
): Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT"> {
  return spot.context === "VS_OPEN" || spot.context === "SQUEEZE"
    ? "THREE_BET_POT"
    : "SINGLE_RAISED";
}

function positionContextFromPreflopSpot(
  spot: Spot,
  tableFormat: TableFormat,
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
): PostflopPositionContext | undefined {
  if (spot.heroPos === "BB") return undefined;
  return postflopPositionContextsForFormat(tableFormat, potType)
    .find((context) => (
      context.heroPosition === spot.heroPos &&
      context.villainPosition === "BB" &&
      context.aggressorPosition === spot.heroPos
    ));
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
