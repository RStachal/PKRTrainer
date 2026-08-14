import { POSITION_ORDER, type Card, type Position, type Rank, type Suit } from "../../core/types";
import type {
  PostflopPositionContext,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import { runtimeSolvedTurnPacks } from "./turnSolvedRuntimeRegistry";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * The turn spots that were actually solved, offered as something to deal.
 *
 * A solved turn pack answers one flop, one turn card, one depth and one node,
 * and refuses everything else - which is the only honest thing it can do, and
 * also means a trainer dealing random boards will reach it about never. The
 * resolver being correct and the content being unreachable look identical from
 * the outside: the player gets a heuristic answer either way.
 *
 * So the packs are read the other way round. Instead of dealing a board and
 * asking whether anything solved it, ask what was solved and deal that.
 *
 * ## What this does to the boards a player sees
 *
 * It narrows them, and that is a real cost worth naming. Thirty three flops
 * instead of the whole space means a player who drills only this will see the
 * same textures repeatedly.
 *
 * The trade is with what they are told on the other boards, which is a heuristic
 * - honestly labelled, but a heuristic. Thirty three boards with exact answers
 * teaches the spot better than twelve hundred with approximate ones, and the
 * boards were not picked for convenience: the decomposition chose them to span
 * the texture space it was run over.
 *
 * The catalogue is a source of spots, not a replacement for the generator. A
 * caller that wants a random board still gets one.
 */

export interface SolvedTurnSpot {
  positionPattern: PostflopPositionPattern;
  potType: PostflopPotType;
  actionNode: PostflopActionNode;
  board: readonly Card[];
  effectiveStackBB: number;
  potBB: number;
  /** Hand classes the solve put in hero's range here. */
  heroHandClasses: readonly string[];
  /** Share of the flop node's range that arrives on this turn, 0 to 1. */
  reach: number;
  /** The directory the spot was solved in, for tracing an answer back. */
  sourceDirectory: string;
  /** The seat whose strategy this is, as the solve identified it. */
  heroSeat: string;
  villainSeat: string;
  /** Whether that seat took the betting lead before the flop. */
  heroIsAggressor: boolean;
  /** Whether that seat acts last after the flop. */
  heroInPosition: boolean;
}

/**
 * The decision a solved node holds, read from the node rather than its family.
 *
 * The same mapping the resolver uses, and for the same reason: a family named
 * for its flop c-bet holds a turn node belonging to the player who called that
 * c-bet, so the name is not evidence of which decision was solved.
 */
function actionNodeFor(rule: TurnStrategyRule): PostflopActionNode | undefined {
  const hero = rule.spot?.hero;
  if (hero === undefined) return undefined;
  if (hero.facingBet) return "TURN_FACING_BET";
  return hero.isAggressor ? "TURN_BARREL" : "TURN_OOP_LEAD";
}

function card(text: string): Card | undefined {
  if (text.length < 2) return undefined;
  return {
    rank: text[0].toUpperCase() as Rank,
    suit: text[1].toLowerCase() as Suit,
  };
}

/**
 * Every solved turn currently loaded, as spots a generator can be handed.
 *
 * A rule that cannot describe a complete spot is left out rather than filled in
 * with defaults. A spot dealt at the wrong depth or with the wrong pot would
 * reach the resolver, be refused, and quietly become a heuristic drill wearing
 * the catalogue's name.
 */
export function solvedTurnSpots(): readonly SolvedTurnSpot[] {
  const spots: SolvedTurnSpot[] = [];
  for (const pack of runtimeSolvedTurnPacks) {
    for (const rule of pack.rules) {
      const solved = rule.spot;
      if (solved === undefined) continue;
      if (solved.potBB === undefined) continue;

      const hero = solved.hero;
      if (hero === undefined) continue;
      const actionNode = actionNodeFor(rule);
      if (actionNode === undefined) continue;

      const board = [...solved.flop, solved.turnCards[0]]
        .map(card)
        .filter((item): item is Card => item !== undefined);
      if (board.length !== 4) continue;

      const heroHandClasses = [...new Set(rule.buckets.flatMap((bucket) => bucket.handClasses))];
      if (heroHandClasses.length === 0) continue;

      spots.push({
        positionPattern: rule.positionPattern as PostflopPositionPattern,
        potType: rule.potType as PostflopPotType,
        actionNode,
        board,
        effectiveStackBB: rule.stackBB,
        potBB: solved.potBB,
        heroHandClasses,
        reach: solved.reach,
        sourceDirectory: rule.sourceDirectory,
        heroSeat: hero.seat,
        villainSeat: hero.villainSeat,
        heroIsAggressor: hero.isAggressor,
        heroInPosition: hero.side === "IP",
      });
    }
  }
  return spots;
}

/**
 * Pick one solved turn spot, weighted by how often it actually arrives.
 *
 * Reach is the share of the flop node's range that gets to this turn, so
 * weighting by it deals the turns a player meets in proportion to meeting them.
 * Picking uniformly would spend as much of a session on a turn that arrives one
 * time in fifty as on one that arrives one time in three.
 */
export function pickSolvedTurnSpot(
  random: number,
  spots: readonly SolvedTurnSpot[] = solvedTurnSpots(),
): SolvedTurnSpot | undefined {
  if (spots.length === 0) return undefined;

  const total = spots.reduce((sum, spot) => sum + Math.max(spot.reach, 0), 0);
  // Every reach zero or absent leaves nothing to weight by, and a uniform pick is
  // better than refusing to deal.
  if (total <= 0) return spots[Math.min(Math.floor(random * spots.length), spots.length - 1)];

  let cursor = Math.min(Math.max(random, 0), 0.999999) * total;
  for (const spot of spots) {
    cursor -= Math.max(spot.reach, 0);
    if (cursor < 0) return spot;
  }
  return spots[spots.length - 1];
}

const SUITS = ["s", "h", "d", "c"] as const;

/**
 * Two cards making this hand class, avoiding the board.
 *
 * Returns undefined when the board has eaten the class - three of a rank on the
 * board leaves one card, and a suited class needs two of the same suit that are
 * both still available.
 */
function cardsForHandClass(
  handClass: string,
  board: readonly Card[],
  random: number,
): [Card, Card] | undefined {
  const used = new Set(board.map((card) => `${card.rank}${card.suit}`.toLowerCase()));
  const free = (rank: string) => SUITS
    .map((suit) => ({ rank: rank as Rank, suit: suit as Suit }))
    .filter((card) => !used.has(`${card.rank}${card.suit}`.toLowerCase()));

  const first = handClass[0];
  const second = handClass[1];
  const combos: [Card, Card][] = [];

  if (first === second) {
    const available = free(first);
    for (let i = 0; i < available.length; i += 1) {
      for (let j = i + 1; j < available.length; j += 1) combos.push([available[i], available[j]]);
    }
  } else {
    const suited = handClass.endsWith("s");
    for (const high of free(first)) {
      for (const low of free(second)) {
        if ((high.suit === low.suit) === suited) combos.push([high, low]);
      }
    }
  }

  if (combos.length === 0) return undefined;
  return combos[Math.min(Math.floor(random * combos.length), combos.length - 1)];
}

/**
 * A hand hero can actually hold here, weighted the way a deck deals them.
 *
 * Picking a class uniformly would deal aces as often as ace-king offsuit, which
 * a deck does not - there are six of one and twelve of the other. Weighting by
 * combination count is the right prior when the solve records which classes are
 * in the range but not how much of each.
 */
export function heroCardsFromClasses(
  heroHandClasses: readonly string[],
  board: readonly Card[],
  random: number,
): [Card, Card] | undefined {
  const weight = (handClass: string) => (
    handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
  );
  const total = heroHandClasses.reduce((sum, item) => sum + weight(item), 0);
  if (total === 0) return undefined;

  let cursor = Math.min(Math.max(random, 0), 0.999999) * total;
  for (const handClass of heroHandClasses) {
    cursor -= weight(handClass);
    if (cursor < 0) {
      // The second draw reuses the same number, deliberately: one random value
      // per spot keeps a seed reproducing the same hand, which is what the seed
      // box is for.
      return cardsForHandClass(handClass, board, random);
    }
  }
  return undefined;
}

/** Ruka, kterou hrdina v tomhle turnovém spotu může držet. */
function heroCardsFor(spot: SolvedTurnSpot, random: number): [Card, Card] | undefined {
  return heroCardsFromClasses(spot.heroHandClasses, spot.board, random);
}

/** "UTG_1" as the solves write it, "UTG+1" as the product does. */
function seatToPosition(seat: string): Position {
  return seat.replace(/_(\d)$/, "+$1") as Position;
}

/**
 * Seat the player in the chair whose strategy they are about to be shown.
 *
 * Looking the context up by pattern is not enough and was actively wrong. Every
 * single-raised context is written from the raiser's side, so `SRP_CO_VS_BB`
 * seats hero at the cutoff - and these solves hold the big blind's decision.
 * The player would have been sat at the cutoff, in position, holding the
 * initiative, and given the answers of the player across the table.
 *
 * The solve names both seats and which of them raised, so the chair is built
 * from that. The lookup remains as a fallback for spots whose seat names cannot
 * be read, and those simply are not dealt.
 */
function positionContextFor(
  spot: SolvedTurnSpot,
  contexts: readonly PostflopPositionContext[],
): PostflopPositionContext | undefined {
  const hero = seatToPosition(spot.heroSeat);
  const villain = seatToPosition(spot.villainSeat);
  if (!POSITION_ORDER.includes(hero) || !POSITION_ORDER.includes(villain)) {
    return contexts.find((item) => item.positionPattern === spot.positionPattern);
  }
  return {
    heroPosition: hero,
    villainPosition: villain,
    aggressorPosition: spot.heroIsAggressor ? hero : villain,
    callerPosition: spot.heroIsAggressor ? villain : hero,
    inPosition: spot.heroInPosition,
    callerType: spot.heroIsAggressor
      ? (villain === "BB" ? "BIG_BLIND" : "IN_POSITION_CALLER")
      : (hero === "BB" ? "BIG_BLIND" : "OUT_OF_POSITION_CALLER"),
    positionPattern: spot.positionPattern,
  };
}

/**
 * The generator config that deals this spot, or nothing if the seats are unknown.
 *
 * The generator is told the seats, not the pattern, so a pattern the running
 * format has no context for cannot be dealt. Returning undefined then is the
 * point: the alternative is a spot whose seats disagree with its strategy, and
 * a player would be shown a cutoff's solve labelled as a hijack's.
 *
 * ## Hero's cards come from the solve, not from the deck
 *
 * Leaving them to the generator looked harmless and was not. A hand outside
 * hero's solved range is not merely unanswerable - it is a hand hero cannot
 * hold, because holding it means they folded before reaching this turn. Dealt
 * anyway, three quarters of solved turn spots asked the resolver a question
 * about an impossible holding, got a refusal, and fell through to the heuristic
 * on a board that had been chosen precisely because it was solved.
 */
export function solvedTurnSpotConfig(
  spot: SolvedTurnSpot,
  contexts: readonly PostflopPositionContext[],
  random = 0.5,
): {
  street: "TURN";
  board: Card[];
  heroCards?: [Card, Card];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  actionNode: PostflopActionNode;
  positionContext: PostflopPositionContext;
} | undefined {
  const positionContext = positionContextFor(spot, contexts);
  if (positionContext === undefined) return undefined;
  const heroCards = heroCardsFor(spot, random);
  return {
    street: "TURN",
    board: [...spot.board],
    ...(heroCards ? { heroCards } : {}),
    potType: spot.potType,
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    actionNode: spot.actionNode,
    positionContext,
  };
}
