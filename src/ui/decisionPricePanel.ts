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

/**
 * The open size the shipped table teaches at this depth.
 *
 * A mirror of what `drillEngine.openSizeAtDepth` reads back from the action keys
 * themselves - OPEN_2X up to 25BB, OPEN_25X from 30 up. Duplicated because the
 * panel has no range store to consult, and duplication that cannot be seen is
 * duplication that drifts, so `decisionPricePanel.test.ts` asserts the two agree
 * at every depth rather than trusting this to stay true.
 */
export function teachesOpenSizeAtDepth(bucket: number): number {
  return bucket <= 25 ? 2 : 2.5;
}

/** Whether the spot actually offers a shove, since only then is there one to price. */
function offersJam(spot: Spot): boolean {
  return spot.answers.some((answer) => answer.key === "JAM");
}

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
 * Priced where the hero's own money is all in, because then the size is not a
 * choice: push/fold, calling a shove, and shoving over an open. Everywhere else
 * the bet size is not determined by the spot, and a made-up size produces a
 * made-up requirement that reads exactly as authoritative as a real one.
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
  } else if (spot.context === "VS_OPEN" && offersJam(spot)) {
    // Re-jamming over a raise. The hero's side is all in, so the only other
    // number is what the opener put in - and that is not an assumption: the
    // shipped table teaches one open size per depth, 2x up to 25BB and 2.5x from
    // 30 up, which is where this reads it from.
    //
    // The panel used to say nothing here while the EV bubbles showed a figure
    // for the same spot, which left a player looking at a number with no
    // statement of what it was priced against.
    const openBB = teachesOpenSizeAtDepth(spot.effStack);
    const requirement = shoveRequirement(stack, pot + openBB, style);
    box.appendChild(line(
      doc,
      "decision-price__headline",
      CS.training.rejamPrice(bb(stack), bb(pot + openBB), pct(requirement.requiredFolds)),
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
  } else if (spot.context === "VS_LIMP" && offersJam(spot)) {
    // Shoving over limpers. The pot is determined without assuming anything -
    // the blinds plus one big blind for each limper, and the spot records how
    // many there were - so the folds this needs can be stated exactly.
    //
    // The expected value cannot. That would need how much of their range a
    // limper calls with, and a limping range is not modelled anywhere here.
    // Inventing a denominator is what turned a re-jam with 52o into +2.7 big
    // blinds before it was caught, so this panel says the price and the EV
    // bubbles stay empty rather than guessing.
    const limped = pot + spot.tableState.limpsBefore;
    const requirement = shoveRequirement(stack, limped, style);
    box.appendChild(line(
      doc,
      "decision-price__headline",
      CS.training.limpJamPrice(
        bb(stack),
        bb(limped),
        String(spot.tableState.limpsBefore),
        pct(requirement.requiredFolds),
      ),
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
  } else if (spot.context === "RFI") {
    // Opening first in. The hero's money is not all in, but the size is still
    // not a choice the spot leaves open: the shipped table teaches one open size
    // per depth. So the price can be stated even though the expected value
    // cannot - that would need what happens after the call, and no postflop
    // model stands behind these packs.
    //
    // This is the context a player sees most often, and it carried no number at
    // all until now.
    const openBB = teachesOpenSizeAtDepth(spot.effStack);
    const requirement = shoveRequirement(openBB, pot, style);
    box.appendChild(line(
      doc,
      "decision-price__headline",
      CS.training.openPrice(bb(openBB), bb(pot), pct(requirement.requiredFolds)),
    ));
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
