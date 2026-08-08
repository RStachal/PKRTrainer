import type { Card, Rank, Suit } from "../../core/types";
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
}

const ACTION_NODE_FOR_RULE: Partial<Record<TurnStrategyRule["node"], PostflopActionNode>> = {
  CBET: "TURN_BARREL",
  FACING_BET: "TURN_FACING_BET",
};

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

      const actionNode = ACTION_NODE_FOR_RULE[rule.node];
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

/**
 * The generator config that deals this spot, or nothing if the seats are unknown.
 *
 * The generator is told the seats, not the pattern, so a pattern the running
 * format has no context for cannot be dealt. Returning undefined then is the
 * point: the alternative is a spot whose seats disagree with its strategy, and
 * a player would be shown a cutoff's solve labelled as a hijack's.
 *
 * Hero's cards are left to the generator. The catalogue knows which classes are
 * in hero's range but not which two cards make one, and the generator already
 * deals around the board.
 */
export function solvedTurnSpotConfig(
  spot: SolvedTurnSpot,
  contexts: readonly PostflopPositionContext[],
): {
  street: "TURN";
  board: Card[];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  actionNode: PostflopActionNode;
  positionContext: PostflopPositionContext;
} | undefined {
  const positionContext = contexts.find((item) => item.positionPattern === spot.positionPattern);
  if (positionContext === undefined) return undefined;
  return {
    street: "TURN",
    board: [...spot.board],
    potType: spot.potType,
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    actionNode: spot.actionNode,
    positionContext,
  };
}
