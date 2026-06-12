import type { Card, HandLabel, Position, Rank } from "./types";
import { RANKS, SUITS, rankValue } from "./poker";
import { mulberry32 } from "./rng";
import type { PostflopActionNode, PostflopTrainingSpot } from "./postflopTrainingSpot";
import { positionsForFormat, type TableFormat } from "./trainingProfile";

export type PostflopStreet = "FLOP" | "TURN" | "RIVER";
export const POSTFLOP_ACTIONS = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
  "CALL",
  "RAISE",
  "FOLD",
] as const;
export type PostflopAction = (typeof POSTFLOP_ACTIONS)[number];
export type PostflopPotType =
  | "SINGLE_RAISED"
  | "THREE_BET_POT"
  | "LIMPED_POT";
export type BoardTexture =
  | "paired"
  | "monotone"
  | "two-tone"
  | "rainbow"
  | "connected"
  | "dry"
  | "ace-high"
  | "broadway-high"
  | "low"
  | "medium"
  | "straight-possible"
  | "flush-draw-heavy"
  | "disconnected";

export type PostflopPositionPattern =
  | "EP_VS_BB"
  | "BTN_VS_BB"
  | "SB_VS_BB"
  | "OOP_RAISER_VS_IP_CALLER"
  | "OOP_CALLER_VS_IP_3BETTOR";

export type PostflopTurnCardClass =
  | "BLANK"
  | "LOW_BRICK"
  | "OVER_CARD"
  | "BROADWAY"
  | "BOARD_PAIRING"
  | "FLUSH_COMPLETING"
  | "STRAIGHT_COMPLETING"
  | "DYNAMIC";

export type PostflopRiverRunoutClass =
  | "BLANK"
  | "OVER_CARD"
  | "BOARD_PAIRING"
  | "FLUSH_COMPLETING"
  | "STRAIGHT_COMPLETING"
  | "FOUR_FLUSH"
  | "FOUR_STRAIGHT"
  | "DYNAMIC";

export type PostflopStrategyPositionPattern =
  | PostflopPositionPattern
  | "IP_OR_RANGE_ADVANTAGE"
  | "OOP_OR_DYNAMIC_BOARD"
  | "EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE";

export type PostflopCallerType =
  | "BIG_BLIND"
  | "IN_POSITION_CALLER"
  | "OUT_OF_POSITION_CALLER";

export interface PostflopPositionContext {
  heroPosition: Position;
  villainPosition: Position;
  aggressorPosition: Position;
  callerPosition: Position;
  inPosition: boolean;
  callerType: PostflopCallerType;
  positionPattern: PostflopPositionPattern;
}

export interface PostflopSpot {
  seed: number;
  street: PostflopStreet;
  heroCards: [Card, Card];
  board: Card[];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  heroPosition: Position;
  villainPosition: Position;
  aggressorPosition: Position;
  callerPosition: Position;
  inPosition: boolean;
  callerType: PostflopCallerType;
  positionPattern: PostflopPositionPattern;
  actionNode?: PostflopActionNode;
  textures: BoardTexture[];
  actions: readonly PostflopAction[];
  recommendedAction: PostflopAction;
  explanation: string;
  strategySource: PostflopRecommendationSource;
  trainingSpot?: PostflopTrainingSpot;
}

export interface PostflopStrategyInput {
  street: PostflopStreet;
  textures: readonly BoardTexture[];
  board?: readonly Card[];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  positionPattern: PostflopPositionPattern;
  actionNode?: PostflopActionNode;
  heroHand?: HandLabel;
  priorFlopAction?: PostflopAction;
  turnCardClass?: PostflopTurnCardClass;
  priorTurnAction?: PostflopAction;
  riverRunoutClass?: PostflopRiverRunoutClass;
}

export interface PostflopRecommendation {
  action: PostflopAction;
  explanation: string;
  source?: PostflopRecommendationSource;
}

export type PostflopRecommendationSource =
  | {
      kind: "STRATEGY_PACK";
      packId: string;
      packVersion: string;
      packVerifiedAt: string;
      ruleId: string;
      confidence: "LOW" | "MEDIUM" | "HIGH";
      matchedTextures: readonly BoardTexture[];
      sprMin: number;
      sprMax: number;
      positionPattern: PostflopStrategyPositionPattern;
      sourceUrls: readonly string[];
      assumptions: readonly string[];
      selectionScore: number;
      tieBreak: "RULE_SCORE_THEN_PACK_ORDER";
      rangeBuckets?: readonly PostflopRangeBucket[];
      heroRangeBucket?: PostflopHeroRangeBucket;
    }
  | {
      kind: "FALLBACK";
      ruleId: "postflop-generator-heuristic";
    };

export type PostflopStrategyResolver = (
  input: PostflopStrategyInput,
) => PostflopRecommendation | null;

export type PostflopRangeLane = "VALUE" | "BLUFF" | "CHECK";
export type PostflopFrequencyVisibility = "QUALITATIVE" | "EXACT";

export interface PostflopActionFrequency {
  action: PostflopAction;
  frequencyPct: number;
  visibility: PostflopFrequencyVisibility;
}

export interface PostflopRangeBucket {
  lane: PostflopRangeLane;
  label: string;
  action: PostflopAction;
  handClasses: readonly HandLabel[];
  features: readonly string[];
  actionMix?: readonly PostflopActionFrequency[];
}

export interface PostflopHeroRangeBucket {
  lane: PostflopRangeLane;
  label: string;
  action: PostflopAction;
  handClass: HandLabel;
  features: readonly string[];
  actionMix?: readonly PostflopActionFrequency[];
}

export interface PostflopConfig {
  seed: number;
  street?: PostflopStreet;
  heroCards?: [Card, Card];
  board?: Card[];
  potType?: PostflopPotType;
  potBB?: number;
  effectiveStackBB?: number;
  positionContext?: PostflopPositionContext;
  actionNode?: PostflopActionNode;
  strategyResolver?: PostflopStrategyResolver;
  priorFlopAction?: PostflopAction;
  turnCardClass?: PostflopTurnCardClass;
  priorTurnAction?: PostflopAction;
  riverRunoutClass?: PostflopRiverRunoutClass;
}

export const POSTFLOP_POSITION_CONTEXTS = [
  {
    heroPosition: "UTG",
    villainPosition: "BB",
    aggressorPosition: "UTG",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "EP_VS_BB",
  },
  {
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "BTN_VS_BB",
  },
  {
    heroPosition: "SB",
    villainPosition: "BB",
    aggressorPosition: "SB",
    callerPosition: "BB",
    inPosition: false,
    callerType: "BIG_BLIND",
    positionPattern: "SB_VS_BB",
  },
  {
    heroPosition: "HJ",
    villainPosition: "BTN",
    aggressorPosition: "HJ",
    callerPosition: "BTN",
    inPosition: false,
    callerType: "IN_POSITION_CALLER",
    positionPattern: "OOP_RAISER_VS_IP_CALLER",
  },
] as const satisfies readonly PostflopPositionContext[];

export function postflopPositionContextsForFormat(
  format: TableFormat,
  potType: Exclude<PostflopPotType, "LIMPED_POT"> = "SINGLE_RAISED",
): PostflopPositionContext[] {
  const positions = positionsForFormat(format);
  const nonBlindPositions = positions.filter((position) => position !== "SB" && position !== "BB");

  if (potType === "THREE_BET_POT") {
    const threeBetContexts: PostflopPositionContext[] = [];
    for (let callerIndex = 0; callerIndex < nonBlindPositions.length; callerIndex += 1) {
      for (let aggressorIndex = callerIndex + 1; aggressorIndex < nonBlindPositions.length; aggressorIndex += 1) {
        threeBetContexts.push(oopCallerVsIpThreeBettorContext(
          nonBlindPositions[callerIndex],
          nonBlindPositions[aggressorIndex],
        ));
      }
    }
    return uniquePositionContexts(threeBetContexts);
  }

  const singleRaisedContexts: PostflopPositionContext[] = [];
  for (const opener of nonBlindPositions) {
    singleRaisedContexts.push(openRaiserVsBigBlindContext(opener));
  }
  if (positions.includes("SB") && positions.includes("BB")) {
    singleRaisedContexts.push(sbVsBbContext());
  }
  for (let raiserIndex = 0; raiserIndex < nonBlindPositions.length; raiserIndex += 1) {
    for (let callerIndex = raiserIndex + 1; callerIndex < nonBlindPositions.length; callerIndex += 1) {
      singleRaisedContexts.push(oopRaiserVsIpCallerContext(
        nonBlindPositions[raiserIndex],
        nonBlindPositions[callerIndex],
      ));
    }
  }

  return uniquePositionContexts(singleRaisedContexts);
}

export const POSTFLOP_FULL_RING_POSITION_CONTEXTS = uniquePositionContexts([
  ...POSTFLOP_POSITION_CONTEXTS,
  ...postflopPositionContextsForFormat("FULL_RING_9", "SINGLE_RAISED"),
]);

export function generatePostflopSpot(config: PostflopConfig): PostflopSpot {
  const rng = mulberry32(config.seed);
  const heroCards = config.heroCards ?? dealCards(rng, fullDeck(), 2) as [Card, Card];
  const deck = fullDeck().filter((card) => !sameCard(card, heroCards[0]) && !sameCard(card, heroCards[1]));
  const street = config.street ?? randomStreet(rng);
  const board = config.board?.slice(0, boardLength(street)) ?? dealCards(rng, deck, boardLength(street));
  const textures = classifyBoard(board);
  const potType = config.potType ?? "SINGLE_RAISED";
  const potBB = config.potBB ?? defaultPotBB(potType);
  const effectiveStackBB = config.effectiveStackBB ?? 40;
  const positionContext = config.positionContext ?? randomPositionContext(rng);
  const actionNode = config.actionNode ?? defaultActionNode(street, potType);
  const actions = actionsForActionNode(actionNode);
  const resolvedRecommendation =
    config.strategyResolver?.({
      street,
      textures,
      board,
      potType,
      potBB,
      effectiveStackBB,
      positionPattern: positionContext.positionPattern,
      actionNode,
      heroHand: postflopHandClassFromCards(heroCards),
      priorFlopAction: street === "TURN" ? config.priorFlopAction ?? "BET_SMALL" : config.priorFlopAction,
      turnCardClass: street === "TURN" ? config.turnCardClass ?? classifyTurnCard(board) : config.turnCardClass,
      priorTurnAction: street === "RIVER" ? config.priorTurnAction ?? "BET_SMALL" : config.priorTurnAction,
      riverRunoutClass: street === "RIVER" ? config.riverRunoutClass ?? classifyRiverRunout(board) : config.riverRunoutClass,
    });
  const fallbackRecommendation = recommendPostflopActionForNode(actionNode, street, textures);
  const recommendation = resolvedRecommendation && actions.includes(resolvedRecommendation.action)
    ? resolvedRecommendation
    : fallbackRecommendation;

  return {
    seed: config.seed >>> 0,
    street,
    heroCards,
    board,
    potType,
    potBB,
    effectiveStackBB,
    heroPosition: positionContext.heroPosition,
    villainPosition: positionContext.villainPosition,
    aggressorPosition: positionContext.aggressorPosition,
    callerPosition: positionContext.callerPosition,
    inPosition: positionContext.inPosition,
    callerType: positionContext.callerType,
    positionPattern: positionContext.positionPattern,
    actionNode,
    textures,
    actions,
    recommendedAction: recommendation.action,
    explanation: recommendation.explanation,
    strategySource: recommendation.source ?? fallbackStrategySource(),
  };
}

function randomPositionContext(rng: () => number): PostflopPositionContext {
  return POSTFLOP_FULL_RING_POSITION_CONTEXTS[
    Math.floor(rng() * POSTFLOP_FULL_RING_POSITION_CONTEXTS.length)
  ];
}

function defaultPotBB(potType: PostflopPotType): number {
  switch (potType) {
    case "THREE_BET_POT":
      return 18;
    case "LIMPED_POT":
      return 4;
    case "SINGLE_RAISED":
      return 6;
  }
}

function defaultActionNode(
  street: PostflopStreet,
  potType: PostflopPotType,
): PostflopActionNode {
  switch (street) {
    case "FLOP":
      return potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET";
    case "TURN":
      return "TURN_BARREL";
    case "RIVER":
      return "RIVER_PRESSURE";
  }
}

function actionsForActionNode(actionNode: PostflopActionNode): readonly PostflopAction[] {
  switch (actionNode) {
    case "FLOP_FACING_BET":
    case "TURN_FACING_BET":
    case "RIVER_FACING_BET":
      return ["FOLD", "CALL", "RAISE"];
    case "SINGLE_RAISED_POT_CBET":
    case "THREE_BET_POT_CBET":
    case "TURN_BARREL":
    case "RIVER_PRESSURE":
      return ["CHECK", "BET_SMALL", "BET_BIG"];
  }
}

function fallbackStrategySource(): PostflopRecommendationSource {
  return {
    kind: "FALLBACK",
    ruleId: "postflop-generator-heuristic",
  };
}

export function classifyBoard(board: readonly Card[]): BoardTexture[] {
  const textures = new Set<BoardTexture>();
  const ranks = board.map((card) => card.rank);
  const suits = board.map((card) => card.suit);
  const uniqueRanks = new Set(ranks);
  const uniqueSuits = new Set(suits);
  const values = [...new Set(ranks.map(rankValue))].sort((a, b) => b - a);

  if (uniqueRanks.size < ranks.length) textures.add("paired");
  if (uniqueSuits.size === 1 && suits.length >= 3) textures.add("monotone");
  else if (uniqueSuits.size === 2 && suits.length >= 3) textures.add("two-tone");
  else if (uniqueSuits.size >= 3) textures.add("rainbow");

  if (suits.length >= 3 && uniqueSuits.size <= 2) textures.add("flush-draw-heavy");
  if (values[0] === 14) textures.add("ace-high");
  else if (values[0] >= 11) textures.add("broadway-high");
  else if (values[0] <= 8) textures.add("low");
  else textures.add("medium");

  if (isConnected(ranks)) textures.add("connected");
  if (isStraightPossible(values)) textures.add("straight-possible");
  if (!textures.has("connected") && !textures.has("straight-possible")) {
    textures.add("disconnected");
  }
  if (textures.size === 0 || (textures.size === 1 && textures.has("rainbow"))) {
    textures.add("dry");
  }
  if (
    textures.has("rainbow") &&
    textures.has("disconnected") &&
    !textures.has("paired")
  ) {
    textures.add("dry");
  }
  return [...textures];
}

export function classifyTurnCard(board: readonly Card[]): PostflopTurnCardClass | undefined {
  if (board.length < 4) return undefined;

  const flop = board.slice(0, 3);
  const turn = board[3];
  const flopRanks = flop.map((card) => card.rank);
  const flopValues = [...new Set(flopRanks.map(rankValue))].sort((a, b) => b - a);
  const allValues = [...new Set(board.slice(0, 4).map((card) => rankValue(card.rank)))].sort((a, b) => b - a);

  if (flopRanks.includes(turn.rank)) return "BOARD_PAIRING";

  const flushCompleting = flop.filter((card) => card.suit === turn.suit).length >= 2;
  const straightCompleting = isStraightPossible(allValues) && !isStraightPossible(flopValues);
  if (flushCompleting && straightCompleting) return "DYNAMIC";
  if (flushCompleting) return "FLUSH_COMPLETING";
  if (straightCompleting) return "STRAIGHT_COMPLETING";

  const turnValue = rankValue(turn.rank);
  const highestFlopValue = Math.max(...flopValues);
  if (turnValue > highestFlopValue) return "OVER_CARD";
  if (turnValue >= 10) return "BROADWAY";
  if (turnValue <= 8) return "LOW_BRICK";
  return "BLANK";
}

export function classifyRiverRunout(board: readonly Card[]): PostflopRiverRunoutClass | undefined {
  if (board.length < 5) return undefined;

  const river = board[4];
  const priorBoard = board.slice(0, 4);
  const priorRanks = priorBoard.map((card) => card.rank);
  const priorValues = [...new Set(priorRanks.map(rankValue))].sort((a, b) => b - a);
  const allValues = [...new Set(board.map((card) => rankValue(card.rank)))].sort((a, b) => b - a);
  const suitsBefore = suitCounts(priorBoard);
  const suitsAfter = suitCounts(board);

  if (priorRanks.includes(river.rank)) return "BOARD_PAIRING";

  const riverSuitCountBefore = suitsBefore.get(river.suit) ?? 0;
  const riverSuitCountAfter = suitsAfter.get(river.suit) ?? 0;
  const flushCompleting = riverSuitCountBefore === 2 && riverSuitCountAfter >= 3;
  const fourFlush = riverSuitCountAfter >= 4;
  const straightCompleting = isStraightPossible(allValues) && !isStraightPossible(priorValues);
  const fourStraight = maxStraightWindowCount(allValues) >= 4;

  if ((flushCompleting || fourFlush) && (straightCompleting || fourStraight)) return "DYNAMIC";
  if (fourFlush) return "FOUR_FLUSH";
  if (flushCompleting) return "FLUSH_COMPLETING";
  if (straightCompleting) return "STRAIGHT_COMPLETING";
  if (fourStraight) return "FOUR_STRAIGHT";

  const riverValue = rankValue(river.rank);
  const highestPriorValue = Math.max(...priorValues);
  if (riverValue > highestPriorValue) return "OVER_CARD";
  return "BLANK";
}

function recommendPostflopActionForNode(
  actionNode: PostflopActionNode,
  street: PostflopStreet,
  textures: readonly BoardTexture[],
): PostflopRecommendation {
  switch (actionNode) {
    case "FLOP_FACING_BET":
    case "TURN_FACING_BET":
    case "RIVER_FACING_BET":
      return recommendFacingBetAction(textures);
    case "SINGLE_RAISED_POT_CBET":
    case "THREE_BET_POT_CBET":
    case "TURN_BARREL":
    case "RIVER_PRESSURE":
      return recommendPostflopAction(street, textures);
  }
}

function recommendFacingBetAction(
  textures: readonly BoardTexture[],
): PostflopRecommendation {
  const has = (texture: BoardTexture): boolean => textures.includes(texture);
  if (has("connected") || has("two-tone") || has("flush-draw-heavy") || has("straight-possible")) {
    return {
      action: "CALL",
      explanation:
        "Facing pressure on a dynamic board, the fallback keeps continuing hands in the pot instead of bluff-raising without a model.",
    };
  }
  return {
    action: "FOLD",
    explanation:
      "Facing pressure without a dedicated range model, the fallback folds low-equity hands on stable boards.",
  };
}

export function recommendPostflopAction(
  street: PostflopStreet,
  textures: readonly BoardTexture[],
): PostflopRecommendation {
  const has = (texture: BoardTexture): boolean => textures.includes(texture);

  if (has("monotone") || has("connected")) {
    return {
      action: "CHECK",
      explanation:
        "The board is dynamic. Without a detailed range model, check is the best control action.",
    };
  }

  if (street === "RIVER" && has("dry")) {
    return {
      action: "BET_BIG",
      explanation:
        "Dry rivers create few new draws. The prototype prefers higher pressure.",
    };
  }

  if (has("dry") || has("paired") || has("rainbow")) {
    return {
      action: "BET_SMALL",
      explanation:
        "Dry or stable boards are suitable for a small c-bet in the prototype strategy.",
    };
  }

  return {
    action: "CHECK",
    explanation:
      "The board texture is not clearly stable. The prototype recommends check.",
  };
}

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function dealCards(rng: () => number, deck: Card[], count: number): Card[] {
  const cards: Card[] = [];
  const mutable = deck.slice();
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(rng() * mutable.length);
    const [card] = mutable.splice(index, 1);
    cards.push(card);
  }
  return cards;
}

function randomStreet(rng: () => number): PostflopStreet {
  const streets: PostflopStreet[] = ["FLOP", "TURN", "RIVER"];
  return streets[Math.floor(rng() * streets.length)];
}

function boardLength(street: PostflopStreet): number {
  switch (street) {
    case "FLOP":
      return 3;
    case "TURN":
      return 4;
    case "RIVER":
      return 5;
  }
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function suitCounts(cards: readonly Card[]): Map<Card["suit"], number> {
  const counts = new Map<Card["suit"], number>();
  for (const card of cards) {
    counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  }
  return counts;
}

function openRaiserVsBigBlindContext(heroPosition: Position): PostflopPositionContext {
  if (heroPosition === "BTN") return btnVsBbContext();
  if (heroPosition === "SB") return sbVsBbContext();
  return {
    heroPosition,
    villainPosition: "BB",
    aggressorPosition: heroPosition,
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "EP_VS_BB",
  };
}

function btnVsBbContext(): PostflopPositionContext {
  return {
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "BTN_VS_BB",
  };
}

function sbVsBbContext(): PostflopPositionContext {
  return {
    heroPosition: "SB",
    villainPosition: "BB",
    aggressorPosition: "SB",
    callerPosition: "BB",
    inPosition: false,
    callerType: "BIG_BLIND",
    positionPattern: "SB_VS_BB",
  };
}

function oopRaiserVsIpCallerContext(
  heroPosition: Position,
  villainPosition: Position,
): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition,
    aggressorPosition: heroPosition,
    callerPosition: villainPosition,
    inPosition: false,
    callerType: "IN_POSITION_CALLER",
    positionPattern: "OOP_RAISER_VS_IP_CALLER",
  };
}

function oopCallerVsIpThreeBettorContext(
  heroPosition: Position,
  villainPosition: Position,
): PostflopPositionContext {
  return {
    heroPosition,
    villainPosition,
    aggressorPosition: villainPosition,
    callerPosition: heroPosition,
    inPosition: false,
    callerType: "OUT_OF_POSITION_CALLER",
    positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
  };
}

function uniquePositionContexts(
  contexts: readonly PostflopPositionContext[],
): PostflopPositionContext[] {
  const seen = new Set<string>();
  const unique: PostflopPositionContext[] = [];
  for (const context of contexts) {
    const key = [
      context.heroPosition,
      context.villainPosition,
      context.aggressorPosition,
      context.callerPosition,
      context.positionPattern,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(context);
  }
  return unique;
}

function postflopHandClassFromCards(cards: readonly [Card, Card]): HandLabel {
  const [a, b] = cards;
  const ai = RANKS.indexOf(a.rank);
  const bi = RANKS.indexOf(b.rank);
  if (ai === bi) return `${a.rank}${b.rank}`;
  const high = ai < bi ? a : b;
  const low = ai < bi ? b : a;
  return `${high.rank}${low.rank}${high.suit === low.suit ? "s" : "o"}`;
}

function isConnected(ranks: readonly Rank[]): boolean {
  const values = [...new Set(ranks.map(rankValue))].sort((a, b) => b - a);
  if (values.length < 3) return false;
  for (let i = 0; i <= values.length - 3; i += 1) {
    if (values[i] - values[i + 2] <= 4) return true;
  }
  if (values.includes(14) && values.includes(5) && values.includes(4)) return true;
  return false;
}

function isStraightPossible(values: readonly number[]): boolean {
  if (values.length < 3) return false;
  for (let i = 0; i <= values.length - 3; i += 1) {
    if (values[i] - values[i + 2] <= 4) return true;
  }
  return values.includes(14) && values.includes(5) && values.includes(4);
}

function maxStraightWindowCount(values: readonly number[]): number {
  const normalized = new Set(values);
  if (normalized.has(14)) normalized.add(1);
  let best = 0;
  for (let low = 1; low <= 10; low += 1) {
    let count = 0;
    for (let value = low; value < low + 5; value += 1) {
      if (normalized.has(value)) count += 1;
    }
    best = Math.max(best, count);
  }
  return best;
}
