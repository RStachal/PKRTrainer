import type { Card, HandLabel, Position, Rank } from "./types";
import { RANKS, SUITS, rankValue } from "./poker";
import { mulberry32 } from "./rng";
import type { PostflopActionNode, PostflopTrainingSpot } from "./postflopTrainingSpot";
import { positionsForFormat, type TableFormat } from "./trainingProfile";
import type { ActionEvSet } from "./actionEv";
import type { SprFidelity } from "./postflopSprFidelity";
import { heroRangeWeight } from "../data/ranges/postflopRangeWeights.generated";
import { familyIdFromRuleId } from "../data/ranges/postflopSolvedSpr";
import {
  bestActionsForActionEv,
  cloneActionEvSet,
  highestEvAction,
  isActionEvSetComplete,
} from "./actionEv";

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

/**
 * Every texture in the taxonomy, so a rule that declares all of them can be
 * recognised as covering any board rather than matching a particular one.
 */
export const ALL_BOARD_TEXTURES: readonly BoardTexture[] = [
  "paired",
  "monotone",
  "two-tone",
  "rainbow",
  "connected",
  "dry",
  "ace-high",
  "broadway-high",
  "low",
  "medium",
  "straight-possible",
  "flush-draw-heavy",
  "disconnected",
];

export type PostflopPositionPattern =
  | "EP_VS_BB"
  | "BTN_VS_BB"
  | "SB_VS_BB"
  | "OOP_RAISER_VS_IP_CALLER"
  | "OOP_CALLER_VS_IP_3BETTOR"
  | `SRP_${PositionPatternToken}_VS_${PositionPatternToken}`
  | `3BP_${PositionPatternToken}_VS_${PositionPatternToken}`;

export type PositionPatternToken =
  | "UTG"
  | "UTG_1"
  | "UTG_2"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB"
  | "BB";

export const LEGACY_POSTFLOP_POSITION_PATTERNS = [
  "EP_VS_BB",
  "BTN_VS_BB",
  "SB_VS_BB",
  "OOP_RAISER_VS_IP_CALLER",
  "OOP_CALLER_VS_IP_3BETTOR",
] as const satisfies readonly PostflopPositionPattern[];

const POSITION_PATTERN_TOKENS = [
  "UTG",
  "UTG_1",
  "UTG_2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
] as const satisfies readonly PositionPatternToken[];

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
  actionEvs?: ActionEvSet<PostflopAction>;
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
  actionEvs?: ActionEvSet<PostflopAction>;
  explanation: string;
  source?: PostflopRecommendationSource;
}

export interface PostflopOpponentPolicyBranch {
  afterHeroCheck: Extract<PostflopAction, "CHECK" | "BET_SMALL" | "BET_BIG"> | "ALL_IN";
  facingHeroBet: Extract<PostflopAction, "CALL" | "FOLD" | "RAISE"> | "ALL_IN";
  facingHeroRaise: Extract<PostflopAction, "CALL" | "FOLD">;
}

/**
 * Whether a recommendation came from solved content or from the public
 * heuristic model. The product must never present a heuristic answer as
 * solver-backed, so this has to be a structural property of the recommendation
 * rather than something inferred from free-text metadata.
 */
export type PostflopStrategyProvenance = "SOLVER_BACKED" | "PUBLIC_HEURISTIC";

export type PostflopRecommendationSource =
  | {
      kind: "STRATEGY_PACK";
      provenance: PostflopStrategyProvenance;
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
      opponentPolicy?: PostflopOpponentPolicyBranch;
      /**
       * How far the shown SPR sits from the SPR this family was solved at. Absent
       * when the family's solved SPR is unknown or the shown SPR is not positive.
       */
      sprFidelity?: SprFidelity;
      /**
       * Whether this rule's content was aggregated over one solver tree or two.
       * Present only when it is two, since that is the case worth saying out loud.
       */
      treeIntegrity?: "MIXED_TREES";
      /**
       * How many of the taxonomy's board textures this rule covers. A rule
       * covering all of them applies to any board, so the textures it "matched"
       * only describe the board that was dealt. Reported as a fraction rather
       * than a flag so a nearly-universal rule cannot claim a match either.
       */
      textureCoverage?: { covered: number; total: number };
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
  actionEvs?: ActionEvSet<PostflopAction>;
  /**
   * How often the hero's preflop range holds this bucket, as a percentage. Packs
   * do not carry it yet; when one does it wins over the generated weight table,
   * so populating it in the pipeline is enough to make it take effect.
   */
  weightPct?: number;
}

export interface PostflopHeroRangeBucket {
  lane: PostflopRangeLane;
  label: string;
  action: PostflopAction;
  handClass: HandLabel;
  features: readonly string[];
  actionMix?: readonly PostflopActionFrequency[];
  actionEvs?: ActionEvSet<PostflopAction>;
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
  allowFallback?: boolean;
}

export class PostflopStrategyUnavailableError extends Error {
  constructor() {
    super("No production postflop strategy matched the selected spot.");
    this.name = "PostflopStrategyUnavailableError";
  }
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

export const MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS = uniqueStrings([
  ...postflopPositionContextsForFormat("FULL_RING_9", "SINGLE_RAISED").map((context) => context.positionPattern),
  ...postflopPositionContextsForFormat("FULL_RING_9", "THREE_BET_POT").map((context) => context.positionPattern),
  ...postflopPositionContextsForFormat("SIX_MAX", "SINGLE_RAISED").map((context) => context.positionPattern),
  ...postflopPositionContextsForFormat("SIX_MAX", "THREE_BET_POT").map((context) => context.positionPattern),
]) as readonly PostflopPositionPattern[];

export function isPostflopPositionPattern(value: unknown): value is PostflopPositionPattern {
  if (typeof value !== "string") return false;
  if ((LEGACY_POSTFLOP_POSITION_PATTERNS as readonly string[]).includes(value)) return true;

  const match = /^(SRP|3BP)_([A-Z0-9_]+)_VS_([A-Z0-9_]+)$/.exec(value);
  if (match === null) return false;
  return (
    isPositionPatternToken(match[2]) &&
    isPositionPatternToken(match[3]) &&
    match[2] !== match[3]
  );
}

export function positionPatternLabel(pattern: PostflopPositionPattern): string {
  if (pattern.startsWith("SRP_")) return granularPatternLabel(pattern, "SRP");
  if (pattern.startsWith("3BP_")) return granularPatternLabel(pattern, "3bet pot");

  switch (pattern) {
    case "EP_VS_BB":
      return "Early position vs BB (IP)";
    case "BTN_VS_BB":
      return "Button vs BB (IP)";
    case "SB_VS_BB":
      return "Small blind vs BB (OOP)";
    case "OOP_RAISER_VS_IP_CALLER":
      return "OOP raiser vs IP caller";
    case "OOP_CALLER_VS_IP_3BETTOR":
      return "OOP caller vs IP 3bettor";
  }

  return pattern;
}

export const POSTFLOP_FULL_RING_POSITION_CONTEXTS = uniquePositionContexts([
  ...POSTFLOP_POSITION_CONTEXTS,
  ...postflopPositionContextsForFormat("FULL_RING_9", "SINGLE_RAISED"),
]);

export function generatePostflopSpot(config: PostflopConfig): PostflopSpot {
  const rng = mulberry32(config.seed);
  const dealtHeroCards = config.heroCards ?? dealCards(rng, fullDeck(), 2) as [Card, Card];
  const deck = fullDeck().filter((card) => (
    !sameCard(card, dealtHeroCards[0]) && !sameCard(card, dealtHeroCards[1])
  ));
  const street = config.street ?? randomStreet(rng);
  const board = config.board?.slice(0, boardLength(street)) ?? dealCards(rng, deck, boardLength(street));
  const textures = classifyBoard(board);
  const potType = config.potType ?? "SINGLE_RAISED";
  const potBB = config.potBB ?? defaultPotBB(potType);
  const effectiveStackBB = config.effectiveStackBB ?? 40;
  const positionContext = config.positionContext ?? randomPositionContext(rng);
  const actionNode = config.actionNode ?? defaultActionNode(street, potType);
  const actions = actionsForActionNode(actionNode);

  const strategyInput = {
    street,
    textures,
    board,
    potType,
    potBB,
    effectiveStackBB,
    positionPattern: positionContext.positionPattern,
    actionNode,
    priorFlopAction: street === "TURN" ? config.priorFlopAction ?? "BET_SMALL" : config.priorFlopAction,
    turnCardClass: street === "TURN" ? config.turnCardClass ?? classifyTurnCard(board) : config.turnCardClass,
    priorTurnAction: street === "RIVER" ? config.priorTurnAction ?? "BET_SMALL" : config.priorTurnAction,
    riverRunoutClass: street === "RIVER" ? config.riverRunoutClass ?? classifyRiverRunout(board) : config.riverRunoutClass,
  } satisfies Omit<PostflopStrategyInput, "heroHand">;

  // Keep the hero inside the range the solver actually analysed for this spot.
  // A freely dealt hand is usually one the preflop raiser would never hold here
  // - on the BTN vs BB c-bet pilot only 19 percent of random combinations are in
  // range - and such a hand has no bucket, so its recommendation would fall back
  // to the rule-wide action. Rule selection does not depend on the hero hand, so
  // the pack can be probed with the dealt hand and the hero re-dealt only when
  // that hand is out of range. Spots without a pack range keep the plain deal.
  // The probe deliberately omits the hero hand. Rule selection does not depend on
  // it, and a production resolver refuses a per-hand answer for a hand outside
  // the solved range, which would hide the very range this needs to draw from.
  const heroCards = config.heroCards
    ?? redealHeroIntoStrategyRange(
      rng,
      dealtHeroCards,
      config.strategyResolver?.(strategyInput) ?? null,
      board,
    );

  const resolvedRecommendation =
    config.strategyResolver?.({
      ...strategyInput,
      heroHand: postflopHandClassFromCards(heroCards),
    });
  const fallbackRecommendation = recommendPostflopActionForNode(actionNode, street, textures);
  const validResolvedRecommendation = (
    resolvedRecommendation &&
    actions.includes(resolvedRecommendation.action)
  )
    ? resolvedRecommendation
    : null;
  if (validResolvedRecommendation === null && config.allowFallback === false) {
    throw new PostflopStrategyUnavailableError();
  }
  const recommendation = validResolvedRecommendation ?? fallbackRecommendation;
  const actionEvs = isActionEvSetComplete(recommendation.actionEvs, actions)
    ? cloneActionEvSet(recommendation.actionEvs)
    : undefined;
  const equivalentBestActions = actionEvs ? bestActionsForActionEv(actionEvs) : [];
  const recommendedAction = actionEvs && !equivalentBestActions.includes(recommendation.action)
    ? (highestEvAction(actionEvs) ?? recommendation.action)
    : recommendation.action;

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
    recommendedAction,
    ...(actionEvs ? { actionEvs } : {}),
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
  const straightCompleting = isRunoutStraightPossible(allValues)
    && !isRunoutStraightPossible(flopValues);
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
  const straightCompleting = isRunoutStraightPossible(allValues)
    && !isRunoutStraightPossible(priorValues);
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
        "Proti tlaku na dynamickém boardu fallback ponechá pokračovací handy v potu a bez modelu nevolí bluff raise.",
    };
  }
  return {
    action: "FOLD",
    explanation:
      "Proti tlaku bez samostatného range modelu fallback na stabilních boardech zahazuje handy s nízkou equity.",
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
        "Board je dynamický. Bez podrobného range modelu je check nejlepší kontrolní akce.",
    };
  }

  if (street === "RIVER" && has("dry")) {
    return {
      action: "BET_BIG",
      explanation:
        "Suchý river vytváří málo nových draw. Prototyp preferuje vyšší tlak.",
    };
  }

  if (has("dry") || has("paired") || has("rainbow")) {
    return {
      action: "BET_SMALL",
      explanation:
        "Suché nebo stabilní boardy jsou v prototypové strategii vhodné pro malý c-bet.",
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

function deckWithout(board: readonly Card[]): Card[] {
  return fullDeck().filter((card) => !board.some((used) => sameCard(card, used)));
}

/**
 * Replace the hero hand when the strategy pack does not contain it.
 *
 * Enumerating concrete combinations rather than picking a hand class first keeps
 * the natural combinatorial weighting: a pair has six combinations and a suited
 * hand four, and cards already on the board are unavailable. The dealt hand is
 * returned untouched when it is already in range or when there is no pack range
 * to draw from, so spots backed by the heuristic model are unaffected.
 */
function redealHeroIntoStrategyRange(
  rng: () => number,
  dealt: readonly [Card, Card],
  recommendation: PostflopRecommendation | null,
  board: readonly Card[],
): [Card, Card] {
  const source = recommendation?.source;
  if (source?.kind !== "STRATEGY_PACK") return [dealt[0], dealt[1]];
  const handClasses = new Set(source.rangeBuckets?.flatMap((bucket) => bucket.handClasses) ?? []);
  if (handClasses.size === 0) return [dealt[0], dealt[1]];
  if (handClasses.has(postflopHandClassFromCards(dealt))) return [dealt[0], dealt[1]];

  // Draw in proportion to how often the solve's range actually holds each class.
  // Three families open part of their range part of the time - the button opens
  // 55 a quarter of the time - and dealing uniformly practised those hands up to
  // four times too often. The advice shown for them was right; the frequency the
  // player met them was not.
  const family = familyIdFromRuleId(source.ruleId);
  // A pack that states its own weights is believed over the table recovered from
  // the solve inputs. Nothing populates weightPct today, and this is what stops
  // that becoming a trap: whoever fills it in the pipeline gets the effect they
  // expect rather than a second source of truth that is silently ignored.
  const bucketWeights = new Map<HandLabel, number>();
  for (const bucket of source.rangeBuckets ?? []) {
    if (bucket.weightPct === undefined || !Number.isFinite(bucket.weightPct)) continue;
    const weight = Math.max(0, Math.min(100, bucket.weightPct)) / 100;
    for (const handClass of bucket.handClasses) bucketWeights.set(handClass, weight);
  }
  const deck = deckWithout(board);
  const combos: Array<[Card, Card]> = [];
  const weights: number[] = [];
  let totalWeight = 0;
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      const pair: [Card, Card] = [deck[i], deck[j]];
      const handClass = postflopHandClassFromCards(pair);
      if (!handClasses.has(handClass)) continue;
      const weight = bucketWeights.get(handClass) ?? heroRangeWeight(family, handClass);
      if (weight <= 0) continue;
      combos.push(pair);
      weights.push(weight);
      totalWeight += weight;
    }
  }
  if (combos.length === 0) return [dealt[0], dealt[1]];

  let target = rng() * totalWeight;
  for (let index = 0; index < combos.length; index += 1) {
    target -= weights[index];
    if (target < 0) return combos[index];
  }
  // Only reachable through floating-point drift at the very top of the range.
  return combos[combos.length - 1];
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
  return {
    heroPosition,
    villainPosition: "BB",
    aggressorPosition: heroPosition,
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: srpPositionPattern(heroPosition, "BB"),
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
    positionPattern: srpPositionPattern("SB", "BB"),
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
    positionPattern: srpPositionPattern(heroPosition, villainPosition),
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
    positionPattern: threeBetPositionPattern(villainPosition, heroPosition),
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

function srpPositionPattern(
  aggressorPosition: Position,
  callerPosition: Position,
): PostflopPositionPattern {
  return `SRP_${positionPatternToken(aggressorPosition)}_VS_${positionPatternToken(callerPosition)}`;
}

function threeBetPositionPattern(
  aggressorPosition: Position,
  callerPosition: Position,
): PostflopPositionPattern {
  return `3BP_${positionPatternToken(aggressorPosition)}_VS_${positionPatternToken(callerPosition)}`;
}

function positionPatternToken(position: Position): PositionPatternToken {
  switch (position) {
    case "UTG+1":
      return "UTG_1";
    case "UTG+2":
      return "UTG_2";
    case "UTG":
    case "LJ":
    case "HJ":
    case "CO":
    case "BTN":
    case "SB":
    case "BB":
      return position;
  }
}

function positionFromPatternToken(token: PositionPatternToken): Position {
  switch (token) {
    case "UTG_1":
      return "UTG+1";
    case "UTG_2":
      return "UTG+2";
    case "UTG":
    case "LJ":
    case "HJ":
    case "CO":
    case "BTN":
    case "SB":
    case "BB":
      return token;
  }
}

function isPositionPatternToken(value: string): value is PositionPatternToken {
  return POSITION_PATTERN_TOKENS.includes(value as PositionPatternToken);
}

function granularPatternLabel(pattern: PostflopPositionPattern, prefix: string): string {
  const match = /^(SRP|3BP)_([A-Z0-9_]+)_VS_([A-Z0-9_]+)$/.exec(pattern);
  if (match === null || !isPositionPatternToken(match[2]) || !isPositionPatternToken(match[3])) {
    return pattern;
  }
  return `${prefix} ${positionFromPatternToken(match[2])} vs ${positionFromPatternToken(match[3])}`;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
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
  return maxStraightWindowCount(values) >= 3;
}

function isStraightPossible(values: readonly number[]): boolean {
  if (values.length < 3) return false;
  return maxStraightWindowCount(values) >= 3;
}

function isRunoutStraightPossible(values: readonly number[]): boolean {
  if (values.length < 3) return false;
  for (let index = 0; index <= values.length - 3; index += 1) {
    if (values[index] - values[index + 2] <= 4) return true;
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
