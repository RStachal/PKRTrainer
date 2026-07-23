import { R2V, isPair, isSuited } from "./poker";
import type { Card, HandLabel, Rank } from "./types";

/**
 * Board-aware flop hand classification.
 *
 * This is core poker logic rather than presentation: the same categories drive
 * the range matrix a player sees and the VALUE/BLUFF/CHECK lane recorded in
 * imported solver content. Classifying a hand without the board cannot tell
 * ace-high apart from top pair, so both consumers must share this function.
 */

export type FlopzillaCategory =
  | "SET_PLUS"
  | "MADE_STRAIGHT"
  | "TWO_PAIR"
  | "OVERPAIR"
  | "TOP_PAIR"
  | "PAIR"
  | "UNDERPAIR"
  | "FLUSH_DRAW"
  | "OESD"
  | "GUTSHOT"
  | "BACKDOOR_DRAW"
  | "OVERCARDS"
  | "AIR";

export type FlopzillaLane = "VALUE" | "BLUFF" | "CHECK";

/** Categories that are a made hand strong enough to bet for value. */
export const MADE_VALUE_CATEGORIES: readonly FlopzillaCategory[] = [
  "SET_PLUS",
  "MADE_STRAIGHT",
  "TWO_PAIR",
  "OVERPAIR",
  "TOP_PAIR",
];

interface ParsedHand {
  high: Rank;
  low: Rank;
  pair: boolean;
  suited: boolean;
}

export function classifyFlopHand(
  hand: HandLabel,
  board: readonly Card[],
): FlopzillaCategory {
  const parsed = parseHand(hand);
  const boardRanks = board.map((card) => card.rank);
  const boardValues = boardRanks.map((rank) => R2V[rank]);
  const topBoard = Math.max(...boardValues);
  const handValues = parsed.pair
    ? [R2V[parsed.high], R2V[parsed.high]]
    : [R2V[parsed.high], R2V[parsed.low]];

  if (parsed.pair) {
    const pairValue = R2V[parsed.high];
    if (boardRanks.includes(parsed.high)) return "SET_PLUS";
    if (pairValue > topBoard) return "OVERPAIR";
    if (pairValue < Math.min(...boardValues)) return "UNDERPAIR";
    return "PAIR";
  }

  const highOnBoard = boardRanks.includes(parsed.high);
  const lowOnBoard = boardRanks.includes(parsed.low);
  if (highOnBoard && lowOnBoard) return "TWO_PAIR";
  if (highOnBoard || lowOnBoard) {
    const pairedRank = highOnBoard ? parsed.high : parsed.low;
    if (R2V[pairedRank] === topBoard) return "TOP_PAIR";
    return "PAIR";
  }

  const straightCategory = straightDrawCategory([...boardValues, ...handValues]);
  if (straightCategory === "MADE_STRAIGHT") return "MADE_STRAIGHT";

  const flushCategory = flushDrawCategory(parsed, board);
  if (flushCategory) return flushCategory;

  if (straightCategory === "OESD" || straightCategory === "GUTSHOT") {
    return straightCategory;
  }

  if (parsed.suited) return "BACKDOOR_DRAW";
  if (handValues.every((value) => value > topBoard)) return "OVERCARDS";
  return "AIR";
}

export function flopzillaLaneForCategory(category: FlopzillaCategory): FlopzillaLane {
  switch (category) {
    case "SET_PLUS":
    case "MADE_STRAIGHT":
    case "TWO_PAIR":
    case "OVERPAIR":
    case "TOP_PAIR":
      return "VALUE";
    case "FLUSH_DRAW":
    case "OESD":
    case "GUTSHOT":
    case "BACKDOOR_DRAW":
    case "OVERCARDS":
      return "BLUFF";
    case "PAIR":
    case "UNDERPAIR":
    case "AIR":
      return "CHECK";
  }
}

/**
 * Lane for a hand that the solver actually puts money in with.
 *
 * A betting hand is VALUE only when it is a made hand on that board; anything
 * else that bets is pressure rather than value, which is what BLUFF means here.
 * Weak made hands such as a middle pair therefore bet as a bluff instead of
 * being promoted to value by their rank alone.
 */
export function bettingLaneForHand(
  hand: HandLabel,
  board: readonly Card[],
): Exclude<FlopzillaLane, "CHECK"> {
  return MADE_VALUE_CATEGORIES.includes(classifyFlopHand(hand, board)) ? "VALUE" : "BLUFF";
}

/**
 * Lane for a betting hand across the board set a rule aggregates.
 *
 * A rule can span several flops, so the label must describe the hand's usual
 * role rather than its role on one sampled board. VALUE requires the hand to be
 * made on a strict majority of those boards; otherwise it is a bluff.
 */
export function aggregateBettingLaneForHand(
  hand: HandLabel,
  boards: readonly (readonly Card[])[],
): Exclude<FlopzillaLane, "CHECK"> {
  if (boards.length === 0) return "BLUFF";
  const valueCount = boards.filter((board) => bettingLaneForHand(hand, board) === "VALUE").length;
  return valueCount * 2 > boards.length ? "VALUE" : "BLUFF";
}

function parseHand(hand: HandLabel): ParsedHand {
  const high = hand[0] as Rank;
  const low = hand[1] as Rank;
  return {
    high,
    low,
    pair: isPair(hand),
    suited: isSuited(hand),
  };
}

function flushDrawCategory(
  hand: ParsedHand,
  board: readonly Card[],
): "FLUSH_DRAW" | null {
  if (!hand.suited) return null;
  const suitCounts = new Map<string, number>();
  for (const card of board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }
  return [...suitCounts.values()].some((count) => count === 2) ? "FLUSH_DRAW" : null;
}

function straightDrawCategory(values: readonly number[]): "MADE_STRAIGHT" | "OESD" | "GUTSHOT" | null {
  const valueSet = new Set<number>(values);
  if (valueSet.has(14)) valueSet.add(1);

  let hasGutshot = false;
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const present = window.filter((value) => valueSet.has(value));
    if (present.length === 5) return "MADE_STRAIGHT";
    if (present.length === 4) {
      const missing = window.find((value) => !valueSet.has(value));
      if (missing === window[0] || missing === window[4]) return "OESD";
      hasGutshot = true;
    }
  }
  return hasGutshot ? "GUTSHOT" : null;
}
