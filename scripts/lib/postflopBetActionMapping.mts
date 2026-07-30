/**
 * The rules that decide whether a solved bet becomes BET_SMALL or BET_BIG.
 *
 * Two places need to agree: the draft normalizer, which assigns the action when a
 * pack is built, and the bet-sizing table, which tells the view what ended up
 * behind each button. If they disagree the view describes a button the pack does
 * not have.
 *
 * There are two rules because the packs were not all built at the same time.
 *
 * LEGACY thresholds on an absolute chip count, and the families do not share a
 * pot: with pot 50 every real bet (33, 50 and 75 percent) stays under it and only
 * the all-in clears it, while with pot 157 a half-pot bet is 79 chips and clears
 * it. So a 50 percent bet is BET_SMALL in one family and BET_BIG in another, and
 * in ten of thirteen families BET_BIG means the solver shoving.
 *
 * CURRENT thresholds on the fraction of the pot, which is what the labels claim
 * to mean and is the same in every family whatever its pot.
 *
 * Every pack shipped before 2026-07-30 was built by LEGACY. A pack rebuilt after
 * that is built by CURRENT, so the sizing table records which rule each family
 * was built with rather than assuming one - that is what lets the button keep
 * describing the pack it actually has while families are corrected one at a time.
 */
export type BetActionRule = "LEGACY_CHIP_THRESHOLD" | "POT_FRACTION";

/** The absolute chip threshold the legacy rule applied. */
export const LEGACY_BIG_BET_CHIP_THRESHOLD = 75;

/**
 * Bets above this fraction of the pot are BET_BIG.
 *
 * 0.6 sits between the two sizes the library actually solves either side of it:
 * with 33/50/75 the split is 33 and 50 small against 75 big, and with 25/50 both
 * are small and only the all-in is big. It is a convention, but it is the same
 * convention everywhere, which is the entire point.
 */
export const BIG_BET_POT_FRACTION = 0.6;

/** Kept under the old name so existing callers and the drift test still resolve. */
export const NORMALIZER_BIG_BET_CHIP_THRESHOLD = LEGACY_BIG_BET_CHIP_THRESHOLD;

export type PostflopBetAction = "BET_SMALL" | "BET_BIG";

/** Which button a solved bet ends up behind, under the rule named. */
export function betActionFor(
  amountChips: number,
  potChips: number,
  rule: BetActionRule,
): PostflopBetAction {
  if (!Number.isFinite(amountChips)) return "BET_SMALL";
  if (rule === "LEGACY_CHIP_THRESHOLD") {
    return amountChips > LEGACY_BIG_BET_CHIP_THRESHOLD ? "BET_BIG" : "BET_SMALL";
  }
  // Without a usable pot there is no fraction to take, and guessing one would put
  // the button back to describing something it cannot know.
  if (!Number.isFinite(potChips) || potChips <= 0) return "BET_SMALL";
  return amountChips / potChips > BIG_BET_POT_FRACTION ? "BET_BIG" : "BET_SMALL";
}

/** The legacy rule on its own, for describing packs built before the change. */
export function betActionForChips(amountChips: number): PostflopBetAction {
  return betActionFor(amountChips, Number.NaN, "LEGACY_CHIP_THRESHOLD");
}
