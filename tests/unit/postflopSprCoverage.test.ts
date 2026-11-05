import { describe, expect, it } from "vitest";

import {
  isPostflopSprCovered,
  maxCoveredSprForPotType,
  minCoveredSprForPotType,
} from "../../src/data/ranges/postflopSprCoverage";

describe("postflop SPR coverage", () => {
  it("covers the mid-stack single-raised SPRs the pilots solved", () => {
    // 100BB over a 6BB pot is SPR 16.7, inside the HIGH band.
    expect(isPostflopSprCovered("SINGLE_RAISED", 16.7)).toBe(true);
    expect(isPostflopSprCovered("SINGLE_RAISED", 2)).toBe(true);
    expect(isPostflopSprCovered("SINGLE_RAISED", 6)).toBe(true);
  });

  it("marks the deep-stack single-raised hole as uncovered", () => {
    // 125BB and 150BB over a 6BB pot are SPR 20.8 and 25, past every band.
    expect(isPostflopSprCovered("SINGLE_RAISED", 20.8)).toBe(false);
    expect(isPostflopSprCovered("SINGLE_RAISED", 25)).toBe(false);
  });

  it("treats shallow three-bet SPRs as covered by band, not a coverage gap", () => {
    // These are inside the LOW band; their distance from the solved point is a
    // fidelity warning, handled separately, not a coverage hole.
    expect(isPostflopSprCovered("THREE_BET_POT", 0.3)).toBe(true);
    expect(isPostflopSprCovered("THREE_BET_POT", 0.83)).toBe(true);
  });

  it("reports the covered SPR envelope for messaging", () => {
    expect(maxCoveredSprForPotType("SINGLE_RAISED")).toBe(20);
    expect(minCoveredSprForPotType("SINGLE_RAISED")).toBe(0);
    expect(maxCoveredSprForPotType("THREE_BET_POT")).toBe(20);
  });

  it("returns false and null for a pot type no pilot covers", () => {
    expect(isPostflopSprCovered("LIMPED_POT", 4)).toBe(false);
    expect(maxCoveredSprForPotType("LIMPED_POT")).toBeNull();
    expect(minCoveredSprForPotType("LIMPED_POT")).toBeNull();
  });

  it("rejects a non-finite SPR", () => {
    expect(isPostflopSprCovered("SINGLE_RAISED", Number.NaN)).toBe(false);
    expect(isPostflopSprCovered("SINGLE_RAISED", Number.POSITIVE_INFINITY)).toBe(false);
  });
});
