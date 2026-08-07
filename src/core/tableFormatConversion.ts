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
 * equal seats-behind, so these would run tight. Checked against published
 * six-max opening frequencies, that is wrong, and wrong in the direction that
 * matters: at 100BB ante off they run 1.9 points wide under the gun, 4.5 at the
 * hijack, 4.4 at the cutoff, 3.9 on the button and 6.1 in the small blind - and
 * the references are MTT figures that already include antes, while those are
 * our ante-off numbers, so the gap is if anything understated.
 *
 * The reason is visible in the mapping. Six-max under-the-gun inherits the
 * nine-handed lojack, which is a middle seat in a nine-handed game and opens
 * like one; the six-max seat with the same players behind it is the earliest
 * seat at its table and is played tighter than the seat count alone suggests.
 * Seats-behind captures how often you run into a better hand and not how the
 * rest of the table responds to a raise.
 *
 * So: a ceiling to be corrected downward by measurement, not a floor. Anything
 * shown to a player has to say which, because "these are conservative" and
 * "these are loose" are opposite instructions.
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
