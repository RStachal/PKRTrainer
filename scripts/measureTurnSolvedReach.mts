import {
  createTurnSolvedStrategyResolverChain,
  loadSolvedTurnPacks,
} from "../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import type {
  PostflopPositionPattern,
  PostflopStrategyInput,
} from "../src/core/postflopGenerator";
import type { Card, Rank, Suit } from "../src/core/types";
import { ALL_HAND_CLASSES } from "../src/core/poker";

/**
 * How often a turn spot reaches solved content, measured through the real chain.
 *
 * The number before any of this was zero: 4.2 GB of solved turn output existed
 * and nothing carried it to a player. A pack-level coverage report would not have
 * caught that, because the packs were fine - the gap was that nothing asked them
 * anything.
 *
 * ## Three numbers, and the middle one is the point
 *
 * **Served** - a solved board, a solved turn card, a hand in hero's range. This
 * should be near total, because a shipped family failing on its own board is a
 * bug rather than a gap.
 *
 * **Declined on an unsolved board** - the same family, same depth, same node, a
 * board nobody solved. This should be total. A resolver that answers here is
 * serving one board's strategy for another and calling it solver-backed, which
 * is worse than having no turn content at all: the player cannot tell.
 *
 * **Reach across the street** - how much of the turn is solved at all. It stays
 * small until many families ship, and it is reported so the small number is on
 * the record rather than implied by the other two.
 */

const HANDS = ALL_HAND_CLASSES;
const FAMILY_PATTERN = "SRP_CO_VS_BB" as PostflopPositionPattern;

function card(text: string): Card {
  return { rank: text[0].toUpperCase() as Rank, suit: text[1].toLowerCase() as Suit };
}

await loadSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
console.log(`solved turn packs loaded: ${runtimeSolvedTurnPacks.length}`);
for (const pack of runtimeSolvedTurnPacks) {
  console.log(`  ${pack.id}: ${pack.rules.length} rules, families ${pack.familyIds.join(", ")}`);
}

const solved = createTurnSolvedStrategyResolverChain();

const rules = runtimeSolvedTurnPacks.flatMap((pack) => pack.rules);
const withSpot = rules.filter((rule) => rule.spot !== undefined);
const solvedBoards = new Set(withSpot.map((rule) => rule.spot!.flop.join("")));

function probe(board: readonly Card[], heroHand: string, stackBB: number): boolean {
  const input: PostflopStrategyInput = {
    street: "TURN",
    textures: [],
    board,
    potType: "SINGLE_RAISED",
    potBB: 12,
    effectiveStackBB: stackBB,
    positionPattern: FAMILY_PATTERN,
    actionNode: "TURN_BARREL",
    heroHand,
    priorFlopAction: "BET_SMALL",
    turnCardClass: "BLANK",
  };
  return solved(input) !== null;
}

// Served: every solved turn, asked with the hands the solve put in hero's range.
let servedSpots = 0;
let served = 0;
for (const rule of withSpot) {
  const spot = rule.spot!;
  const inRange = new Set(rule.buckets.flatMap((bucket) => bucket.handClasses));
  const board = [...spot.flop, spot.turnCards[0]].map(card);
  for (const hand of inRange) {
    servedSpots += 1;
    if (probe(board, hand, rule.stackBB)) served += 1;
  }
}

// Declined: boards this family never solved, at the family's own depth and node.
// The turn card is one of the solved ones, so the only thing wrong is the flop -
// the closest an unsolved board can get to a solved one.
const RANKS: Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
let unsolvedSpots = 0;
let unsolvedAnswered = 0;
for (const high of RANKS) {
  for (const mid of RANKS) {
    for (const low of RANKS) {
      const flop = [`${high}s`, `${mid}d`, `${low}c`];
      if (solvedBoards.has(flop.join(""))) continue;
      if (new Set([high, mid, low]).size < 3) continue;
      const board = [...flop, "2h"].map(card);
      for (const hand of HANDS.slice(0, 12)) {
        unsolvedSpots += 1;
        if (probe(board, hand, 25)) unsolvedAnswered += 1;
      }
    }
  }
}

// Reach across the street: every hand on every solved board, plus the same
// number of unsolved boards, which is roughly what a session actually deals.
const streetSpots = servedSpots + unsolvedSpots;

const percent = (part: number, whole: number) => (
  whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`
);

console.log("");
console.log("=== Turn solved reach ===");
console.log(`solved turns in the pack: ${withSpot.length} of ${rules.length} rules`);
console.log(`distinct solved flops: ${solvedBoards.size}`);
console.log("");
console.log(`served on solved boards: ${served} of ${servedSpots} (${percent(served, servedSpots)})`);
console.log(
  `answered on unsolved boards: ${unsolvedAnswered} of ${unsolvedSpots} ` +
  `(${percent(unsolvedAnswered, unsolvedSpots)}) - must be 0.0%`,
);
console.log("");
console.log(`turn spots probed in total: ${streetSpots}`);
console.log(`solver-backed: ${served} (${percent(served, streetSpots)})`);

if (unsolvedAnswered > 0) {
  console.error("A board nobody solved was answered as solver-backed.");
  process.exitCode = 1;
}
