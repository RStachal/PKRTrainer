import type { PostflopAction } from "../../core/postflopGenerator";

/**
 * Turn a solver action label into the product's vocabulary, given the pot.
 *
 * The solver writes `BET 17.000000` - a size in chips - and the product speaks
 * CHECK, BET_SMALL, BET_BIG, CALL, RAISE, FOLD. Bridging the two needs the pot
 * at that node, which is why the rule builder deliberately left the labels
 * untranslated: guessing the mapping would relabel a quarter-pot bet as a
 * pot-sized one, and a player told to bet big when the solve said small has been
 * taught the opposite of what was solved.
 *
 * The plan carries the pot for every subgame, so nothing has to be guessed here
 * either - the caller passes it in and the arithmetic is the whole method.
 *
 * ## Where the boundary sits, and why it is a judgement
 *
 * Half the pot. Below that a bet is the small one, at or above it the big one.
 * The product has exactly two bet sizes and a solve routinely has three or four,
 * so some collapsing is unavoidable and the only honest question is where the
 * line goes.
 *
 * Half-pot is the standard boundary in the material this project draws on, and
 * it is the point where required fold frequency reaches a third - the number a
 * player is taught to work from. A solve offering 33 and 75 percent lands one on
 * each side, which is what those two sizes are for.
 *
 * The collapsing is lossy and the count says so: a node with three bet sizes
 * reports that two of them merged, so a reviewer can see where the product's
 * vocabulary is narrower than the solve rather than discovering it later.
 */

export interface TranslatedAction {
  /** The solver's own label, kept so a translation can always be checked. */
  solverLabel: string;
  action: PostflopAction;
  /** Bet size as a fraction of the pot, absent for non-bets. */
  potFraction?: number;
}

export interface TurnActionTranslation {
  actions: readonly TranslatedAction[];
  /** Solver actions that collapsed onto an action another already held. */
  mergedCount: number;
}

/** Bets at or above this share of the pot are the big one. */
export const BIG_BET_POT_FRACTION = 0.5;

const CHIP_SIZE = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i;

/**
 * Translate one label, or undefined when it is not an action this vocabulary has.
 *
 * A pot of zero returns undefined for any sized action rather than dividing by
 * it: a bet with no pot to measure against cannot be called small or big, and
 * saying so beats returning a number that means nothing.
 */
export function translateTurnAction(
  solverLabel: string,
  potBB: number,
): TranslatedAction | undefined {
  const label = solverLabel.trim();
  const upper = label.toUpperCase();

  if (upper === "CHECK") return { solverLabel: label, action: "CHECK" };
  if (upper === "FOLD") return { solverLabel: label, action: "FOLD" };
  if (upper === "CALL") return { solverLabel: label, action: "CALL" };

  const sized = CHIP_SIZE.exec(label);
  if (sized === null) return undefined;
  if (potBB <= 0) return undefined;

  const chips = Number(sized[2]);
  if (!Number.isFinite(chips) || chips <= 0) return undefined;
  const potFraction = chips / potBB;

  // A raise stays a raise whatever its size: the product has one raise and
  // splitting it by size would invent a distinction it cannot express.
  if (/^(RAISE)/i.test(sized[1])) {
    return { solverLabel: label, action: "RAISE", potFraction };
  }
  return {
    solverLabel: label,
    action: potFraction >= BIG_BET_POT_FRACTION ? "BET_BIG" : "BET_SMALL",
    potFraction,
  };
}

/**
 * Translate a node's whole action list, reporting what the collapsing cost.
 *
 * Order is preserved, because the frequencies that go with these actions are
 * positional - a translation that reordered them would attach every hand's
 * strategy to the wrong action, which is the one failure here that nothing
 * downstream could notice.
 */
export function translateTurnActions(
  solverLabels: readonly string[],
  potBB: number,
): TurnActionTranslation {
  const actions: TranslatedAction[] = [];
  const seen = new Set<PostflopAction>();
  let mergedCount = 0;

  for (const label of solverLabels) {
    const translated = translateTurnAction(label, potBB);
    if (translated === undefined) continue;
    if (seen.has(translated.action)) mergedCount += 1;
    seen.add(translated.action);
    actions.push(translated);
  }

  return { actions, mergedCount };
}
