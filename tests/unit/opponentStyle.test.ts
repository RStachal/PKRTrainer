import { describe, expect, it } from "vitest";

import {
  OPPONENT_STYLES,
  classifyOpponent,
  requiredFoldFrequency,
  shoveProfitableOnFoldsAlone,
  shoveWidthMultiplier,
  styleForLabel,
} from "../../src/core/opponentStyle";

// Styles adjust a threshold rather than supplying a second set of ranges, which is
// the same shape bubble factor uses for ICM. These tests hold the two things that
// makes worth having: the measured anchors, and the direction of every shift.

describe("break-even fold frequency", () => {
  it("matches the identity the owner's book prints", () => {
    // Half pot needs a third of the folds, pot-sized needs half, and so on.
    expect(requiredFoldFrequency(0.5, 1) * 100).toBeCloseTo(33.3, 1);
    expect(requiredFoldFrequency(1, 1) * 100).toBeCloseTo(50, 1);
    expect(requiredFoldFrequency(1.5, 1) * 100).toBeCloseTo(60, 1);
  });

  it("asks for more folds as the bluff gets bigger", () => {
    let previous = 0;
    for (const bet of [0.25, 0.5, 1, 2, 4]) {
      const needed = requiredFoldFrequency(bet, 1);
      expect(needed).toBeGreaterThan(previous);
      previous = needed;
    }
  });
});

describe("styles", () => {
  it("keeps Little's two measured anchors", () => {
    // Calling 20 percent of hands against a shove is folding 80; the loose field
    // calls about 40, so it folds 60. Everything between is interpolation and the
    // type says which is which.
    expect(OPPONENT_STYLES.TIGHT_AGGRESSIVE.foldsToShove).toBe(0.8);
    expect(OPPONENT_STYLES.TIGHT_AGGRESSIVE.basis).toBe("MEASURED");
    expect(OPPONENT_STYLES.LOOSE_PASSIVE.foldsToShove).toBe(0.6);
    expect(OPPONENT_STYLES.LOOSE_PASSIVE.basis).toBe("MEASURED");
  });

  it("orders fold frequency the way looseness implies", () => {
    const tight = OPPONENT_STYLES.TIGHT_PASSIVE.foldsToShove;
    const loose = OPPONENT_STYLES.LOOSE_PASSIVE.foldsToShove;
    expect(tight).toBeGreaterThan(loose);
  });

  it("narrows the shove against a calling station and widens it against a rock", () => {
    // The direction the owner's material states in words: against a station,
    // "musíme výrazně omezit naši range pro push", because the fold equity that
    // paid for the shove is not there.
    expect(shoveWidthMultiplier(OPPONENT_STYLES.LOOSE_PASSIVE)).toBeLessThan(1);
    expect(shoveWidthMultiplier(OPPONENT_STYLES.TIGHT_PASSIVE)).toBeGreaterThan(1);
  });

  it("stops calling a shove free money once the price rises", () => {
    // A one-third-pot stab clears a station's folds; shoving three times the pot
    // at the same opponent does not.
    expect(shoveProfitableOnFoldsAlone(OPPONENT_STYLES.LOOSE_PASSIVE, 0.5, 1)).toBe(true);
    expect(shoveProfitableOnFoldsAlone(OPPONENT_STYLES.LOOSE_PASSIVE, 3, 1)).toBe(false);
  });
});

describe("labels and classification", () => {
  it("resolves the names the owner uses to the four quadrants", () => {
    expect(styleForLabel("fish")).toBe(OPPONENT_STYLES.LOOSE_PASSIVE);
    expect(styleForLabel("calling station")).toBe(OPPONENT_STYLES.LOOSE_PASSIVE);
    expect(styleForLabel("REG")).toBe(OPPONENT_STYLES.TIGHT_AGGRESSIVE);
    expect(styleForLabel("rock")).toBe(OPPONENT_STYLES.TIGHT_PASSIVE);
    expect(styleForLabel("nonsense")).toBeUndefined();
  });

  it("separates a maniac from a calling station on the aggression axis", () => {
    // Both are loose. What tells them apart is how much of it they raise, which is
    // exactly the distinction the source draws.
    expect(classifyOpponent(0.55, 0.4, 200)).toBe(OPPONENT_STYLES.LOOSE_AGGRESSIVE);
    expect(classifyOpponent(0.55, 0.08, 200)).toBe(OPPONENT_STYLES.LOOSE_PASSIVE);
  });

  it("refuses to classify on a sample too small to mean anything", () => {
    // The Kompendium is explicit that stats without sample size are orientation
    // only. A style guessed from ten hands is worse than no style at all, because
    // it will be acted on.
    expect(classifyOpponent(0.55, 0.4, 10)).toBeUndefined();
    expect(classifyOpponent(0.55, 0.4, 30)).toBeDefined();
  });

  it("puts the recreational threshold where the source puts it", () => {
    // "They play more than 40% of their hands" - so 45 percent VPIP is loose and
    // 22 is not, whatever the aggression.
    expect(classifyOpponent(0.45, 0.05, 100)?.looseness).toBe("LOOSE");
    expect(classifyOpponent(0.22, 0.18, 100)?.looseness).toBe("TIGHT");
  });
});
