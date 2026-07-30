import { describe, expect, it } from "vitest";

import {
  MTT_POSTFLOP_BET_SIZING,
  familyBetSizing,
} from "../../src/data/ranges/postflopBetSizing.generated";
import { collectBetSizing, familySizingFrom, heroBetSide } from "../../scripts/buildPostflopBetSizing.mts";
import {
  BIG_BET_POT_FRACTION,
  LEGACY_BIG_BET_CHIP_THRESHOLD,
  betActionFor,
} from "../../scripts/lib/postflopBetActionMapping.mts";
import { readFileSync } from "node:fs";

// The draft normalizer splits BET_SMALL from BET_BIG on an absolute chip count,
// and the families do not share a pot. With pot 50 every real bet is under the
// threshold and only the all-in clears it; with pot 157 a half-pot bet clears it.
// The view rendered a fixed 33 and 75 percent of pot regardless, so in most
// families the button read "big bet 4 BB" while the strategy behind it was the
// solver shoving 65.

describe("solved bet sizing", () => {
  it("agrees with the parameter files it was generated from", () => {
    const fromDisk = collectBetSizing();
    expect(Object.keys(MTT_POSTFLOP_BET_SIZING).sort()).toEqual([...fromDisk.keys()].sort());
    for (const [family, sizing] of fromDisk) {
      expect(MTT_POSTFLOP_BET_SIZING[family], family).toEqual({
        potChips: sizing.potChips,
        effectiveStackChips: sizing.effectiveStackChips,
        smallPct: sizing.smallPct,
        bigPct: sizing.bigPct,
        bigIsAllIn: sizing.bigIsAllIn,
        rule: sizing.rule,
      });
    }
  });

  it("finds that BET_BIG is only the all-in in most shipped families", () => {
    // The measurement the fix rests on. If a re-solve gives these families a real
    // big bet this changes, and the all-in label must stop being the normal case.
    const allInOnly = Object.values(MTT_POSTFLOP_BET_SIZING)
      .filter((sizing) => sizing.bigIsAllIn && sizing.bigPct.length === 0);
    expect(allInOnly.length).toBe(13);
  });

  it("keeps a family whose big bet is a real bet out of the all-in case", () => {
    // Pot 157 puts a half-pot bet at 79 chips, over the normalizer's threshold,
    // so this family's BET_BIG genuinely is a bet - the same label meaning two
    // different things is what made the fixed 75 percent indefensible.
    const sizing = familyBetSizing("MTT9_80BB_CO_BTN_3BP_MIDSPR");
    expect(sizing?.bigPct).toEqual([50]);
    expect(sizing?.smallPct).toEqual([25]);
  });

  it("records the merge where several solved sizes sit behind one button", () => {
    const sizing = familyBetSizing("MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR");
    expect(sizing?.smallPct).toEqual([33, 50, 75]);
    expect(sizing?.bigPct).toEqual([]);
    expect(sizing?.bigIsAllIn).toBe(true);
  });

  it("returns nothing for a family it has never seen", () => {
    expect(familyBetSizing("NO_SUCH_FAMILY")).toBeUndefined();
  });
});

describe("bet sizing extraction", () => {
  const PARAMS = [
    "set_pot 50",
    "set_effective_stack 650",
    "set_bet_sizes oop,flop,bet,33,50,75",
    "set_bet_sizes oop,flop,allin",
    "set_bet_sizes ip,flop,bet,50",
    "set_bet_sizes ip,flop,allin",
  ].join("\n");

  it("reads the hero's own side of the tree", () => {
    // The hero is the raiser in position unless the family says otherwise, and
    // reading the wrong side would describe the villain's buttons.
    expect(heroBetSide("MTT9_50BB_BTN_BB_SRP")).toBe("ip");
    expect(heroBetSide("MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR")).toBe("oop");

    expect(familySizingFrom(PARAMS, "MTT9_TEST_OOP_FAMILY")?.smallPct).toEqual([33, 50, 75]);
    expect(familySizingFrom(PARAMS, "MTT9_TEST_FAMILY")?.smallPct).toEqual([50]);
  });

  it("puts a bet over the chip threshold on the big side", () => {
    const wide = familySizingFrom(
      ["set_pot 157", "set_effective_stack 600", "set_bet_sizes ip,flop,bet,25,50", "set_bet_sizes ip,flop,allin"].join("\n"),
      "MTT9_TEST_FAMILY",
    );
    expect(wide?.smallPct).toEqual([25]);
    expect(wide?.bigPct).toEqual([50]);
  });

  it("refuses a parameter file with no usable pot", () => {
    // Guessing a pot would produce a sizing table that looks authoritative and
    // describes nothing, which is the failure being corrected here.
    expect(familySizingFrom("set_effective_stack 600", "MTT9_TEST_FAMILY")).toBeNull();
    expect(familySizingFrom("set_pot 0", "MTT9_TEST_FAMILY")).toBeNull();
  });

  it("does not call it an all-in when the tree has no all-in", () => {
    const noShove = familySizingFrom(
      ["set_pot 50", "set_effective_stack 650", "set_bet_sizes ip,flop,bet,50"].join("\n"),
      "MTT9_TEST_FAMILY",
    );
    expect(noShove?.bigIsAllIn).toBe(false);
  });
});

describe("one rule for both places", () => {
  it("keeps the legacy rule available to describe packs already built by it", () => {
    expect(betActionFor(LEGACY_BIG_BET_CHIP_THRESHOLD, 50, "LEGACY_CHIP_THRESHOLD")).toBe("BET_SMALL");
    expect(betActionFor(LEGACY_BIG_BET_CHIP_THRESHOLD + 1, 50, "LEGACY_CHIP_THRESHOLD")).toBe("BET_BIG");
  });

  it("splits on the fraction of the pot under the current rule", () => {
    // The whole point: the same fraction gets the same label whatever the pot.
    // Under the legacy rule a half-pot bet was small at pot 50 and big at 157.
    for (const pot of [50, 157, 400]) {
      expect(betActionFor(pot * 0.5, pot, "POT_FRACTION"), `pot ${pot}`).toBe("BET_SMALL");
      expect(betActionFor(pot * 0.75, pot, "POT_FRACTION"), `pot ${pot}`).toBe("BET_BIG");
    }
    expect(betActionFor(50 * 0.5, 50, "LEGACY_CHIP_THRESHOLD")).toBe("BET_SMALL");
    expect(betActionFor(157 * 0.5, 157, "LEGACY_CHIP_THRESHOLD")).toBe("BET_BIG");
  });

  it("refuses to invent a fraction when the pot is unusable", () => {
    expect(betActionFor(1000, 0, "POT_FRACTION")).toBe("BET_SMALL");
    expect(betActionFor(1000, Number.NaN, "POT_FRACTION")).toBe("BET_SMALL");
    expect(betActionFor(Number.NaN, 50, "POT_FRACTION")).toBe("BET_SMALL");
  });

  it("sits either side of the sizes the library actually solves", () => {
    // 0.6 is a convention, but it has to separate 50 from 75, which is where
    // every family in the library places its sizes.
    expect(BIG_BET_POT_FRACTION).toBeGreaterThan(0.5);
    expect(BIG_BET_POT_FRACTION).toBeLessThan(0.75);
  });

  it("leaves the normalizer with no threshold of its own to drift from", () => {
    // Two copies of one rule is how the table comes to describe a split the packs
    // do not have - the same shape as the defect it was written to fix.
    const source = readFileSync("scripts/buildTexasSolverNormalizedDraft.mts", "utf8");
    expect(source).toContain("betActionFor(");
    expect(source).not.toMatch(/amount\s*>\s*75/);
  });

  it("describes every shipped family by the rule its pack was built with", () => {
    // Families are corrected one at a time, so the table must record the rule per
    // family rather than assume one. Everything shipped today predates the change.
    for (const [family, sizing] of Object.entries(MTT_POSTFLOP_BET_SIZING)) {
      expect(sizing.rule, family).toBe("LEGACY_CHIP_THRESHOLD");
    }
  });
});
