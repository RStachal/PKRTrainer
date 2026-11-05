import { describe, expect, it } from "vitest";

import {
  BIG_BET_POT_FRACTION,
  translateTurnAction,
  translateTurnActions,
} from "../../src/data/ranges/turnActionTranslation";

/**
 * The last thing between a solved turn and a player: the solver's vocabulary.
 *
 * It writes `BET 17.000000`, a size in chips; the product speaks CHECK,
 * BET_SMALL, BET_BIG, CALL, RAISE, FOLD. The rule builder deliberately kept the
 * labels untranslated because bridging needs the pot at that node - and guessing
 * would relabel a quarter-pot bet as a pot-sized one, teaching a player the
 * opposite of what was solved.
 *
 * The plan carries the pot for every subgame, so nothing is guessed here either.
 */

describe("turn action translation", () => {
  it("passes through the actions that carry no size", () => {
    expect(translateTurnAction("CHECK", 100)?.action).toBe("CHECK");
    expect(translateTurnAction("CALL", 100)?.action).toBe("CALL");
    expect(translateTurnAction("FOLD", 100)?.action).toBe("FOLD");
  });

  it("splits bets at half the pot", () => {
    // The product has two bet sizes and a solve routinely has three or four, so
    // collapsing is unavoidable and the only honest question is where the line
    // sits. Half-pot is where required fold frequency reaches a third - the
    // number a player is taught to work from - and a solve offering 33 and 75
    // percent lands one on each side, which is what the two sizes are for.
    expect(translateTurnAction("BET 33.000000", 100)?.action).toBe("BET_SMALL");
    expect(translateTurnAction("BET 75.000000", 100)?.action).toBe("BET_BIG");
    // Exactly at the boundary counts as big.
    expect(translateTurnAction("BET 50.000000", 100)?.action).toBe("BET_BIG");
    expect(BIG_BET_POT_FRACTION).toBe(0.5);
  });

  it("keeps a raise a raise whatever its size", () => {
    // The product has one raise. Splitting it by size would invent a distinction
    // it cannot express.
    expect(translateTurnAction("RAISE 40.000000", 100)?.action).toBe("RAISE");
    expect(translateTurnAction("RAISE 400.000000", 100)?.action).toBe("RAISE");
  });

  it("reports the size it measured, so a translation can be checked", () => {
    expect(translateTurnAction("BET 25.000000", 100)?.potFraction).toBeCloseTo(0.25, 3);
    expect(translateTurnAction("CHECK", 100)?.potFraction).toBeUndefined();
  });

  it("refuses a sized action with no pot to measure against", () => {
    // A bet with no pot cannot be called small or big, and saying so beats
    // returning a number that means nothing.
    expect(translateTurnAction("BET 25.000000", 0)).toBeUndefined();
    expect(translateTurnAction("BET 25.000000", -5)).toBeUndefined();
    // But an unsized action is still fine without one.
    expect(translateTurnAction("CHECK", 0)?.action).toBe("CHECK");
  });

  it("refuses a label it does not recognise rather than guessing", () => {
    expect(translateTurnAction("SOMETHING", 100)).toBeUndefined();
    expect(translateTurnAction("BET", 100)).toBeUndefined();
    expect(translateTurnAction("BET abc", 100)).toBeUndefined();
  });

  it("preserves order, because the frequencies are positional", () => {
    // A translation that reordered these would attach every hand's strategy to
    // the wrong action - the one failure here nothing downstream could notice.
    const solved = ["CHECK", "BET 33.000000", "BET 75.000000", "BET 625.000000"];
    const { actions } = translateTurnActions(solved, 100);
    expect(actions.map((item) => item.solverLabel)).toEqual(solved);
    expect(actions.map((item) => item.action))
      .toEqual(["CHECK", "BET_SMALL", "BET_BIG", "BET_BIG"]);
  });

  it("counts what the collapsing cost", () => {
    // Three bet sizes into two: a reviewer should see where the product's
    // vocabulary is narrower than the solve, not discover it later.
    const { mergedCount } = translateTurnActions(
      ["CHECK", "BET 33.000000", "BET 75.000000", "BET 625.000000"],
      100,
    );
    expect(mergedCount).toBe(1);
    expect(translateTurnActions(["CHECK", "BET 33.000000"], 100).mergedCount).toBe(0);
  });
});
