import { villainActionMix, dominantVillainBet, villainBetShares } from "./villainBetFrequency.mts";

/**
 * Whether a shipped facing-bet rule still trains the bet the solver actually
 * makes most.
 *
 * A facing-bet pilot puts the player against ONE villain bet size, and the
 * rebuild pipeline pins that size from the previous run rather than re-deriving
 * it. A pin can therefore be right when it was made and wrong later, with
 * nothing to say so.
 *
 * The rule that this exists to enforce was learned the hard way. A first attempt
 * at this measurement was taken on review data from the reduced tree and produced
 * a confident, wrong answer: it named three shipped rules as training a rare
 * branch, and re-measuring on full-tree data showed four of six pins were the
 * top bet all along. The reduced tree has no turn or river raises, so it distorts
 * exactly the thing being measured.
 *
 * So a family whose boards still mix the two trees is reported as UNJUDGED rather
 * than compared. Refusing to answer is the honest output when the input cannot
 * support one.
 */
export type PinDriftVerdict = "ON_TOP_BET" | "DRIFTED" | "UNJUDGED" | "NO_DATA";

export interface PinDriftRow {
  familyId: string;
  ruleId: string;
  pinnedAction: string;
  pinnedFrequency: number;
  topAction: string | null;
  topFrequency: number;
  /**
   * The top bet's share of the villain's betting weight, and whether that share
   * is a majority. A pin can be off the top bet without training anything rare:
   * where three sizes split the betting roughly evenly, moving the pin raises the
   * number without changing the spot. Reported so the verdict is not read as a
   * bigger finding than it is.
   */
  topShareOfBets: number;
  betSizingIsSplit: boolean;
  verdict: PinDriftVerdict;
}

/**
 * The villain bet a facing-bet rule id was built against.
 *
 * Rule ids look like `mtt9_50bb_btn_bb_srp_facing_midspr-check-bet_17-aggregate`,
 * where the middle segment is the node history the draft was harvested from.
 * Returns null for rules that are not facing-bet rules.
 */
export function pinnedBetActionFromRuleId(ruleId: string): string | null {
  const match = /-check-(bet_[0-9]+)-/i.exec(ruleId);
  return match === null ? null : match[1].toUpperCase();
}

export function assessPinDrift(input: {
  ruleId: string;
  familyId: string;
  /** Review of the node where the villain chooses a size. */
  villainReviewPath: string;
  /** True when the family's boards still span both solver trees. */
  familyMixesTrees: boolean;
}): PinDriftRow | null {
  const pinnedAction = pinnedBetActionFromRuleId(input.ruleId);
  if (pinnedAction === null) return null;

  const base = {
    familyId: input.familyId,
    ruleId: input.ruleId,
    pinnedAction,
    pinnedFrequency: 0,
    topAction: null as string | null,
    topFrequency: 0,
    topShareOfBets: 0,
    betSizingIsSplit: false,
  };

  // Judging a blended family is how the wrong answer was produced last time.
  if (input.familyMixesTrees) return { ...base, verdict: "UNJUDGED" };

  const mix = villainActionMix(input.villainReviewPath);
  if (mix.combos === 0) return { ...base, verdict: "NO_DATA" };

  const top = dominantVillainBet(mix);
  const pinnedFrequency = mix.byAction.get(pinnedAction) ?? 0;
  if (top === null) return { ...base, pinnedFrequency, verdict: "NO_DATA" };

  const shares = villainBetShares(mix);
  const topShareOfBets = shares[0]?.share ?? 0;
  return {
    ...base,
    pinnedFrequency,
    topAction: top.action,
    topFrequency: top.frequency,
    topShareOfBets,
    betSizingIsSplit: topShareOfBets < 0.5,
    verdict: top.action === pinnedAction ? "ON_TOP_BET" : "DRIFTED",
  };
}

/** One line per rule, with the numbers that drove each verdict. */
export function renderPinDrift(rows: readonly PinDriftRow[]): string {
  if (rows.length === 0) return "No shipped facing-bet rule to check.";
  const drifted = rows.filter((row) => row.verdict === "DRIFTED");
  const unjudged = rows.filter((row) => row.verdict === "UNJUDGED");
  const lines = rows.map((row) => {
    const pinned = `${row.pinnedAction} at ${(row.pinnedFrequency * 100).toFixed(1)}%`;
    if (row.verdict === "UNJUDGED") {
      return `  ${row.ruleId}: ${row.pinnedAction} - not judged, the family still mixes two trees`;
    }
    if (row.verdict === "NO_DATA") return `  ${row.ruleId}: ${row.pinnedAction} - no villain data`;
    if (row.verdict === "ON_TOP_BET") return `  ${row.ruleId}: ${pinned}, the top bet`;
    const split = row.betSizingIsSplit
      ? `; no size carries a majority of the villain's bets (top is ${(row.topShareOfBets * 100).toFixed(0)}% of them)`
      : "";
    return `  ${row.ruleId}: ${pinned}, but ${row.topAction} is used ${(row.topFrequency * 100).toFixed(1)}%${split}`;
  });
  const summary = drifted.length === 0
    ? `Every judged pin is the villain's most-used bet (${unjudged.length} not judged).`
    : `${drifted.length} shipped rule(s) train a bet that is not the villain's most-used size.`;
  return [summary, ...lines].join("\n");
}

/**
 * Drift for a pin known directly, rather than read out of a shipped rule id.
 *
 * A family can be rebuilt without any of its rules shipping - the 3bet MID
 * facing-bet draft is built every run and merged into nothing - and those are
 * exactly the pins nobody looks at. One of them is pinned to a size the solver
 * uses under one percent, the degenerate overbet the pinning was introduced to
 * avoid, and it would have stayed that way until someone merged it.
 */
export function assessPinDriftForAction(input: {
  familyId: string;
  pinnedAction: string;
  villainReviewPath: string;
  familyMixesTrees: boolean;
}): PinDriftRow {
  return assessPinDrift({
    // The rule id only matters as a carrier for the pinned action here.
    ruleId: `${input.familyId.toLowerCase()}-check-${input.pinnedAction.toLowerCase()}-aggregate`,
    familyId: input.familyId,
    villainReviewPath: input.villainReviewPath,
    familyMixesTrees: input.familyMixesTrees,
  })!;
}
