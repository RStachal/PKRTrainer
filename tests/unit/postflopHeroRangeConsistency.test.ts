import { describe, expect, it } from "vitest";

import {
  combosInClass,
  compareHeroRanges,
  solveRangeCombos,
} from "../../scripts/lib/postflopHeroRangeConsistency.mts";

// A postflop family is a spot reached through a preflop decision, so the hero's
// range going into the flop is the preflop pack's range for that seat and depth.
// Nothing checked that, and the button's inputs drifted a long way: UTG matches
// the pack to a tenth of a percent, the cutoff to two points, and every button
// family was solved against 12 to 19 percent where the pack opens 39.7.

describe("hero range consistency", () => {
  it("counts combinations by hand class shape", () => {
    expect(combosInClass("AA")).toBe(6);
    expect(combosInClass("AKs")).toBe(4);
    expect(combosInClass("AKo")).toBe(12);
    // A class with no suit marker is both, which is how some solve inputs write it.
    expect(combosInClass("AK")).toBe(16);
  });

  it("honours the weight form when measuring a solve range", () => {
    // A range written in mixed frequencies is narrower than its class count
    // suggests, which is what made the button's range look merely small.
    expect(solveRangeCombos("AA,KK")).toBe(12);
    expect(solveRangeCombos("AA,KK:0.5")).toBe(9);
    expect(solveRangeCombos("AA:abc")).toBe(6);
  });

  it("finds the button families and clears the seats that were built right", () => {
    const rows = compareHeroRanges();
    const byFamily = new Map(rows.map((row) => [row.familyId, row]));

    // Open again, at about three and a half points, and deliberately so.
    //
    // The pack and the 40BB UTG solve once agreed at roughly 15 percent; the
    // pack was narrowed to the charts and this gap opened. A carry-forward rule
    // then widened the pack back and closed it, and I read landing within two
    // tenths of the solve as corroboration - the note already in this file
    // warning that a pack agreeing with a solve proves nothing about either.
    //
    // It was right to warn. Two published references put nine-handed UTG near
    // 11.4 percent, the narrowed pack sits at 11.2 to 12.7, and the solve takes
    // its hero range from the same lineage as the flat table it was widened
    // toward. So the gap is between the pack and an old assumption rather than
    // between the pack and the evidence, and it closes when those families are
    // re-solved.
    expect(byFamily.get("MTT9_40BB_UTG_BB_SRP")?.gapPoints).toBeGreaterThan(2);
    expect(byFamily.get("MTT9_40BB_UTG_BB_SRP")?.gapPoints).toBeLessThan(5);

    // The cutoff no longer does, and that is a consequence rather than a
    // regression: widening the preflop packs toward the purchased charts moved
    // what the product teaches while the postflop solves stayed where they were.
    // It sits under the guard's tolerance but no longer near zero, and it clears
    // when those families are re-solved.
    const cutoff = byFamily.get("MTT9_50BB_CO_BB_SRP_CBET_MIDSPR")?.gapPoints;
    // Narrower than it was: the cutoff lost its offsuit wheel aces, which moved
    // the preflop pack toward the solve rather than away. Still a real gap, and
    // it clears when those families are re-solved.
    expect(cutoff).toBeGreaterThan(2);
    expect(cutoff).toBeLessThan(8);

    const button = rows.filter((row) => row.seat === "BTN" && row.gapPoints !== null);
    expect(button.length).toBeGreaterThan(0);
    for (const row of button) {
      expect(row.gapPoints, row.familyId).toBeGreaterThan(19);
    }
  });

  it("lists a family it cannot compare rather than dropping it", () => {
    // The 80BB button family carries the same narrow range and the pack has no
    // 80BB bucket. Skipping it silently would have hidden the sixth affected
    // family behind a pass.
    const rows = compareHeroRanges();
    const uncompared = rows.filter((row) => row.gapPoints === null);

    expect(uncompared.map((row) => row.familyId)).toContain("MTT9_80BB_BTN_BB_SRP_HIGHSPR");
    for (const row of uncompared) {
      expect(row.packPct, row.familyId).toBeNull();
      expect(row.solvePct, row.familyId).toBeGreaterThan(0);
    }
  });

  it("compares only pots where the pack's RFI range is the right question", () => {
    // Three-bet pots are excluded on purpose: the hero's range there is a 3-bet
    // or a call-of-3-bet range, and measuring it against RFI would manufacture a
    // gap in every one of them.
    const rows = compareHeroRanges();
    expect(rows.some((row) => row.familyId.includes("_3BP"))).toBe(false);
  });

  it("returns nothing rather than guessing when there are no parameter files", () => {
    expect(compareHeroRanges("does/not/exist")).toEqual([]);
  });
});
