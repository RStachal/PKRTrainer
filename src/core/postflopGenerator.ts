import type { Card, Position, Rank } from "./types";
import { RANKS, SUITS, rankValue } from "./poker";
import { mulberry32 } from "./rng";
import type { PostflopTrainingSpot } from "./postflopTrainingSpot";

export type PostflopStreet = "FLOP" | "TURN" | "RIVER";
export type PostflopAction = "CHECK" | "BET_SMALL" | "BET_BIG";
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
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  positionPattern: PostflopPositionPattern;
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
    }
  | {
      kind: "FALLBACK";
      ruleId: "postflop-generator-heuristic";
    };

export type PostflopStrategyResolver = (
  input: PostflopStrategyInput,
) => PostflopRecommendation | null;

export interface PostflopConfig {
  seed: number;
  street?: PostflopStreet;
  heroCards?: [Card, Card];
  potType?: PostflopPotType;
  potBB?: number;
  effectiveStackBB?: number;
  positionContext?: PostflopPositionContext;
  strategyResolver?: PostflopStrategyResolver;
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

export function generatePostflopSpot(config: PostflopConfig): PostflopSpot {
  const rng = mulberry32(config.seed);
  const heroCards = config.heroCards ?? dealCards(rng, fullDeck(), 2) as [Card, Card];
  const deck = fullDeck().filter((card) => !sameCard(card, heroCards[0]) && !sameCard(card, heroCards[1]));
  const street = config.street ?? randomStreet(rng);
  const board = dealCards(rng, deck, boardLength(street));
  const textures = classifyBoard(board);
  const potType = config.potType ?? "SINGLE_RAISED";
  const potBB = config.potBB ?? defaultPotBB(potType);
  const effectiveStackBB = config.effectiveStackBB ?? 40;
  const positionContext = config.positionContext ?? randomPositionContext(rng);
  const recommendation =
    config.strategyResolver?.({
      street,
      textures,
      potType,
      potBB,
      effectiveStackBB,
      positionPattern: positionContext.positionPattern,
    }) ??
    recommendPostflopAction(street, textures);

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
    textures,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: recommendation.action,
    explanation: recommendation.explanation,
    strategySource: recommendation.source ?? fallbackStrategySource(),
  };
}

function randomPositionContext(rng: () => number): PostflopPositionContext {
  return POSTFLOP_POSITION_CONTEXTS[
    Math.floor(rng() * POSTFLOP_POSITION_CONTEXTS.length)
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

export function recommendPostflopAction(
  street: PostflopStreet,
  textures: readonly BoardTexture[],
): PostflopRecommendation {
  const has = (texture: BoardTexture): boolean => textures.includes(texture);

  if (has("monotone") || has("connected")) {
    return {
      action: "CHECK",
      explanation:
        "Board je dynamický. Bez detailního modelu range je nejlepší kontrolní akce check.",
    };
  }

  if (street === "RIVER" && has("dry")) {
    return {
      action: "BET_BIG",
      explanation:
        "Suchý river má málo nových draw. V prototypu se preferuje větší tlak.",
    };
  }

  if (has("dry") || has("paired") || has("rainbow")) {
    return {
      action: "BET_SMALL",
      explanation:
        "Suchý nebo stabilní board je vhodný pro malý c-bet v prototypové strategii.",
    };
  }

  return {
    action: "CHECK",
    explanation:
      "Textura boardu není jednoznačně stabilní. Prototyp doporučuje check.",
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
