import { EQUITY_CLASSES, PREFLOP_EQUITY } from "../data/ranges/preflopEquity.generated";
import type { HandLabel } from "./types";

/**
 * All-in preflop equity, and the expected value of the two actions it prices.
 *
 * The trainer could already say what a call *needs* - `decisionMaths` derives that
 * from pot odds - but not what an action is *worth*, because nothing knew how a
 * hand runs against a range. Every shipped record carries no actionEvs, so the EV
 * bubbles the UI has been wired for have never had anything to show.
 *
 * The table behind this is generated and checked against textbook matchups before
 * it is written; see scripts/generatePreflopEquity.mts. It is class against class,
 * so card removal between the two ranges is ignored - most visible with a pair
 * against itself. Preflop charts carry the same simplification.
 */

const INDEX = new Map(EQUITY_CLASSES.map((hand, position) => [hand, position]));
const ROWS = new Map<string, number[]>();

function row(hand: HandLabel): number[] | undefined {
  const cached = ROWS.get(hand);
  if (cached !== undefined) return cached;
  const raw = PREFLOP_EQUITY[hand];
  if (raw === undefined) return undefined;
  const parsed = raw.split(",").map(Number);
  ROWS.set(hand, parsed);
  return parsed;
}

/** Combinations in a hand class: 6 for a pair, 4 suited, 12 offsuit. */
export function combosInClass(hand: HandLabel): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

/** Equity of one class against another, 0..1. */
export function equityVsClass(hero: HandLabel, villain: HandLabel): number | undefined {
  const values = row(hero);
  const column = INDEX.get(villain);
  if (values === undefined || column === undefined) return undefined;
  const perMille = values[column];
  return perMille === undefined ? undefined : perMille / 1000;
}

/**
 * Equity against a range, weighted by how many combinations each class holds.
 *
 * Weighting by class rather than by combination would treat a single offsuit
 * holding as equal to a pair, which it is not - twelve combinations against six.
 */
export function equityVsRange(hero: HandLabel, range: readonly HandLabel[]): number | undefined {
  let weighted = 0;
  let combos = 0;
  for (const villain of range) {
    const equity = equityVsClass(hero, villain);
    if (equity === undefined) continue;
    const weight = combosInClass(villain);
    weighted += equity * weight;
    combos += weight;
  }
  return combos === 0 ? undefined : weighted / combos;
}

export interface ShoveEv {
  /** EV of shoving, in big blinds, against callers with this calling range. */
  jamBB: number;
  /** EV of folding is zero by definition, kept so the pair reads as a pair. */
  foldBB: 0;
  equityWhenCalled: number;
  foldFrequency: number;
}

/**
 * What a shove is worth against an opponent who calls with `callingRange`.
 *
 * Two branches: they fold and the blinds are won outright, or they call and the
 * hand runs to showdown for the whole stack. Written out rather than folded into
 * one expression because the two halves are what a player needs to see.
 */
export function shoveEv(
  hero: HandLabel,
  callingRange: readonly HandLabel[],
  stackBB: number,
  potBB: number,
  opponentsBehind = 1,
): ShoveEv | undefined {
  const equityWhenCalled = equityVsRange(hero, callingRange);
  if (equityWhenCalled === undefined) return undefined;

  const callCombos = callingRange.reduce((sum, hand) => sum + combosInClass(hand), 0);
  const foldsOnce = Math.max(0, Math.min(1, 1 - callCombos / 1326));
  // A shove has to get through everyone still to act, not just one player. Pricing
  // it against a single caller was the first version and it flattered every hand:
  // 52o came out at +0.36 BB from the button because one opponent folding 78
  // percent of the time pays for anything. Five opponents behind fold together
  // only 29 percent of the time, and the same shove is a loss.
  const foldFrequency = Math.pow(foldsOnce, Math.max(1, opponentsBehind));

  // Called: the pot is the blinds plus both stacks; the hero has staked one.
  const calledPot = potBB + 2 * stackBB;
  const evCalled = equityWhenCalled * calledPot - stackBB;
  return {
    jamBB: foldFrequency * potBB + (1 - foldFrequency) * evCalled,
    foldBB: 0,
    equityWhenCalled,
    foldFrequency,
  };
}

export interface CallAllInEv {
  /** EV of calling the shove, in big blinds. */
  callBB: number;
  foldBB: 0;
  equity: number;
}

/**
 * What calling an all-in is worth against the range that shoved.
 *
 * The hero puts in `toCallBB` to contest a pot that already contains the blinds
 * and the shover's stack.
 */
export function callAllInEv(
  hero: HandLabel,
  shovingRange: readonly HandLabel[],
  toCallBB: number,
  potBB: number,
): CallAllInEv | undefined {
  const equity = equityVsRange(hero, shovingRange);
  if (equity === undefined) return undefined;
  const finalPot = potBB + toCallBB;
  return { callBB: equity * finalPot - toCallBB, foldBB: 0, equity };
}
