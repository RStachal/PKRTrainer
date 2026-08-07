import { POSITION_ORDER, type Position } from "./types";
import type { TableFormat } from "./trainingProfile";

/**
 * Carry a measured nine-handed range across to six-handed, by seats yet to act.
 *
 * Six-max ships with four range packs and no records at all: the format is
 * supported and has nothing to teach. Nine-handed has 507 measured records per
 * ante mode. So the question is not whether to derive, it is on what rule.
 *
 * ## The rule
 *
 * Seat names do not transfer - a six-max cutoff is not a nine-handed cutoff,
 * because what makes a seat early or late is how many players still have to act
 * behind it. Counting the blinds, a nine-handed lojack and a six-max under the gun
 * both have five opponents left to act, and face the same chance of running into a
 * better hand. That is the invariant this maps on.
 *
 * ```
 *   seats behind   9-max      6-max
 *        5          LJ         UTG
 *        4          HJ         HJ
 *        3          CO         CO
 *        2          BTN        BTN
 *        1          SB         SB
 *        0          BB         BB
 * ```
 *
 * Nine-handed UTG, UTG+1 and UTG+2 have six or more behind them and no six-max
 * seat matches; they are simply not carried over, rather than squeezed into the
 * nearest seat.
 *
 * ## What this is not
 *
 * It is an approximation with a stated basis, not a measurement, and anything
 * built from it must say so.
 *
 * The expectation written here first was that a six-max field plays looser at
 * equal seats-behind, so these would run tight. Two public references were
 * checked and they disagree, so neither the original claim nor its opposite
 * survives:
 *
 * - against 100BB point estimates (UTG 17, HJ 21, CO 28, BTN 43, SB 36) ours run
 *   1.9 to 6.1 points wider at every seat;
 * - against 50BB bands (early 18-20, middle 25-30, cutoff 30-40, button 50+,
 *   small blind 60+) ours sit inside at the three early seats and below at the
 *   button and small blind.
 *
 * The small blind is the extreme: 36 percent in one source, 60-plus in the
 * other. A 24-point spread between two published references for one seat is not
 * something a derivation can be calibrated against, and narrowing to hit either
 * would be choosing a source rather than measuring.
 *
 * What can be said is that the mapping lands in the same region as published
 * six-max play, and where it drifts it drifts at the late seats - which is where
 * seats-behind is weakest, because it captures how often you run into a better
 * hand and not how the rest of the table answers a raise.
 *
 * Neither a floor nor a ceiling, then. An approximation whose error is not one
 * signed number, and anything shown to a player has to say that rather than pick
 * a direction, because "conservative" and "loose" are opposite instructions.
 */

/** How many opponents still have to act behind a seat, counting the blinds. */
export function seatsBehind(position: Position, format: TableFormat): number | undefined {
  const order = format === "SIX_MAX"
    ? (["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const)
    : POSITION_ORDER;
  const index = order.indexOf(position as never);
  if (index < 0) return undefined;
  return order.length - 1 - index;
}

/** The nine-handed seat a six-max seat inherits from, by seats behind. */
export function sourcePositionForSixMax(position: Position): Position | undefined {
  const behind = seatsBehind(position, "SIX_MAX");
  if (behind === undefined) return undefined;
  return POSITION_ORDER.find((seat) => seatsBehind(seat, "FULL_RING_9") === behind);
}

/** Every six-max seat with the nine-handed seat it draws from. */
export function sixMaxPositionMap(): ReadonlyArray<{ sixMax: Position; fullRing: Position }> {
  const out: Array<{ sixMax: Position; fullRing: Position }> = [];
  for (const seat of ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as Position[]) {
    const source = sourcePositionForSixMax(seat);
    if (source !== undefined) out.push({ sixMax: seat, fullRing: source });
  }
  return out;
}

/**
 * The nine-handed seats no six-max seat inherits.
 *
 * Reported rather than silently dropped: a reader of the derived pack should be
 * able to see that three measured seats had nowhere to go.
 */
export function unmappedFullRingPositions(): readonly Position[] {
  const used = new Set(sixMaxPositionMap().map((pair) => pair.fullRing));
  return POSITION_ORDER.filter((seat) => !used.has(seat));
}
