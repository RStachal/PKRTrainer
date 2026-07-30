/**
 * The single rule that decides whether a solved bet becomes BET_SMALL or BET_BIG.
 *
 * Two places need to agree about this and used to state it separately: the draft
 * normalizer, which assigns the action when a pack is built, and the bet-sizing
 * table, which tells the view what ended up behind each button. If those two ever
 * disagree the view describes a button the pack does not have - which is the same
 * shape as the defect the sizing table was written to fix, so the constant lives
 * here and both import it.
 *
 * THE RULE IS KNOWN TO BE WRONG, AND IS KEPT ANYWAY. It thresholds on an absolute
 * chip count, and the families do not share a pot: with pot 50 every real bet
 * (33, 50 and 75 percent) stays under it and only the all-in clears it, while
 * with pot 157 a half-pot bet is 79 chips and clears it. So a 50 percent bet is
 * BET_SMALL in one family and BET_BIG in another.
 *
 * It is not corrected here because correcting it is a content change, not a
 * display one. Every shipped pack had its actions assigned by this rule; changing
 * it would make the sizing table describe what a rebuild WOULD produce rather
 * than what is actually in the packs, and open exactly the gap between label and
 * strategy that was just closed. The right moment is the next pack rebuild, when
 * both move together and the result can be checked - see the roadmap entry "The
 * bet button that described the wrong bet".
 */
export const NORMALIZER_BIG_BET_CHIP_THRESHOLD = 75;

export type PostflopBetAction = "BET_SMALL" | "BET_BIG";

/** Which button a solved bet of this many chips ends up behind. */
export function betActionForChips(amountChips: number): PostflopBetAction {
  return Number.isFinite(amountChips) && amountChips > NORMALIZER_BIG_BET_CHIP_THRESHOLD
    ? "BET_BIG"
    : "BET_SMALL";
}
