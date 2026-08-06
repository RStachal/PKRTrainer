import { callRequirement, shoveRequirement } from "../core/decisionMaths";
import { OPPONENT_STYLES } from "../core/opponentStyle";
import type { Filters, Spot } from "../core/types";
import { CS } from "./cs";

/**
 * What the decision costs, in the terms a player can redo at the table.
 *
 * The trainer has always been able to say which action; this says at what price.
 * A player told to fold learns a rule. A player told "this call needs 42 percent
 * and the shove needs 41 percent folds to pay for itself" learns to work the next
 * one out themselves, which is the difference between a chart and a trainer.
 *
 * Everything here is derived from the pot and the stack the spot already carries,
 * through `core/decisionMaths`. Nothing is looked up, so there is no spot this
 * cannot price and no pack that has to ship a number for it.
 *
 * The opponent, when the player names one, moves exactly one thing: the folds the
 * shove is expected to get. The GTO baseline underneath is untouched. That is the
 * same shape as the bubble factor in `core/icmModel` - one number moving one
 * threshold - and it is deliberate, because the alternative is a second set of
 * ranges for every style, which would be four times the material and none of it
 * measured.
 */

const pct = (value: number): string => `${(value * 100).toFixed(1).replace(".", ",")} %`;
const bb = (value: number): string => value.toFixed(1).replace(".", ",");

function line(doc: Document, className: string, text: string): HTMLElement {
  const node = doc.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

/**
 * The price of this spot, or nothing when the spot does not fix one.
 *
 * Only the all-in contexts fix a price without further assumption: the hero is
 * either putting a whole stack in or calling one. Elsewhere the bet size is not
 * determined by the spot, and a made-up size would produce a made-up requirement
 * that reads exactly as authoritative as a real one.
 */
export function renderDecisionPrice(
  doc: Document,
  spot: Spot,
  filters: Filters,
): HTMLElement | null {
  const pot = spot.startingPot ?? 1.5;
  const stack = spot.effStack;
  const style = filters.opponentStyle === undefined
    ? undefined
    : OPPONENT_STYLES[filters.opponentStyle];

  const box = doc.createElement("div");
  box.className = "decision-price";
  box.dataset.context = spot.context;

  if (spot.context === "PUSH_FOLD") {
    const requirement = shoveRequirement(stack, pot, style);
    box.appendChild(line(
      doc,
      "decision-price__headline",
      CS.training.shovePrice(bb(stack), bb(pot), pct(requirement.requiredFolds)),
    ));
    if (style !== undefined && requirement.expectedFolds !== undefined) {
      box.appendChild(line(
        doc,
        requirement.profitableOnFoldsAlone
          ? "decision-price__verdict decision-price__verdict--good"
          : "decision-price__verdict",
        requirement.profitableOnFoldsAlone
          ? CS.training.shoveFoldsEnough(pct(requirement.expectedFolds))
          : CS.training.shoveFoldsShort(pct(requirement.expectedFolds)),
      ));
    }
  } else if (spot.context === "VS_ALLIN") {
    // The shover is in for their stack, so the pot is the blinds plus that stack
    // and the call is the hero's own - the same convention the EV uses.
    const requirement = callRequirement({ potBB: pot + stack, toCallBB: stack });
    box.appendChild(line(
      doc,
      "decision-price__headline",
      CS.training.callPrice(
        requirement.oddsAgainst.toFixed(2).replace(".", ","),
        pct(requirement.chipEquity),
      ),
    ));
  } else {
    return null;
  }

  // Where the opponent's number comes from. Two of the four styles are anchored
  // to a published calling width and two are interpolated between them, and the
  // panel says which rather than presenting all four as equally known.
  if (style !== undefined) {
    box.appendChild(line(
      doc,
      "decision-price__basis",
      style.basis === "MEASURED"
        ? CS.training.opponentBasisMeasured
        : CS.training.opponentBasisInterpolated,
    ));
  }

  return box;
}
