import { describe, expect, it } from "vitest";

import {
  callAllInEv,
  combosInClass,
  equityVsClass,
  equityVsRange,
  shoveEv,
} from "../../src/core/preflopEquity";

// The table is sampled, so these assert what is true about poker rather than what
// this particular run of the generator produced. Tolerances match the generator's
// own gate: it refuses to write unless textbook matchups land within 1.5 points.

describe("preflop equity", () => {
  it("reproduces matchups every player knows", () => {
    // Within 1.5 points, which is the generator's own gate rather than a number
    // chosen here: the table is sampled, and asserting tighter than the sampling
    // would be asserting the seed rather than the poker.
    const near = (hero: string, villain: string, expected: number) => {
      const got = equityVsClass(hero, villain)! * 100;
      expect(Math.abs(got - expected), `${hero} vs ${villain}: ${got.toFixed(1)}%`).toBeLessThan(1.5);
    };
    near("AA", "KK", 81.3);
    near("AA", "AKs", 87.6);
    near("AKs", "QQ", 46.3);
    near("AKo", "AQo", 73.5);
    near("JJ", "AKs", 54.0);
    near("76s", "AA", 22.9);
  });

  it("is symmetric: two hands' equities sum to one", () => {
    for (const [a, b] of [["AA", "72o"], ["KQs", "JTs"], ["99", "AKo"]] as const) {
      expect(equityVsClass(a, b)! + equityVsClass(b, a)!).toBeCloseTo(1, 1);
    }
  });

  it("weights a range by combinations, not by class", () => {
    // An offsuit class is twelve combinations and a pair six, so treating each
    // class as one vote would misweight every range in the app.
    expect(combosInClass("AA")).toBe(6);
    expect(combosInClass("AKs")).toBe(4);
    expect(combosInClass("AKo")).toBe(12);

    const vsPairs = equityVsRange("AKs", ["AA", "KK"])!;
    const vsMixed = equityVsRange("AKs", ["AA", "KK", "AKo"])!;
    expect(vsMixed).toBeGreaterThan(vsPairs);
  });

  it("has no hand beating aces and no hand losing to seven-deuce", () => {
    for (const hand of ["KK", "AKs", "76s", "72o"]) {
      expect(equityVsClass(hand, "AA")!).toBeLessThan(0.5);
    }
    for (const hand of ["AA", "KK", "JTs"]) {
      expect(equityVsClass(hand, "72o")!).toBeGreaterThan(0.5);
    }
  });
});

describe("what a shove is worth", () => {
  const caller = ["AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AKo"];

  it("orders hands by how they run when called", () => {
    const strong = shoveEv("AA", caller, 10, 1.5)!;
    const weak = shoveEv("72o", caller, 10, 1.5)!;
    expect(strong.jamBB).toBeGreaterThan(weak.jamBB);
    expect(strong.equityWhenCalled).toBeGreaterThan(weak.equityWhenCalled);
  });

  it("is worth less as the opponent calls wider", () => {
    // The whole reason a calling station changes the shove: fold equity is the
    // larger half of a short shove's value, and a wide caller removes it.
    const vsTight = shoveEv("A5s", caller, 10, 1.5)!;
    const vsWide = shoveEv("A5s", [...caller, "99", "88", "77", "A9o", "KQo", "QJs", "JTs"], 10, 1.5)!;
    expect(vsWide.foldFrequency).toBeLessThan(vsTight.foldFrequency);
    expect(vsWide.jamBB).toBeLessThan(vsTight.jamBB);
  });

  it("prices folding at exactly zero, which is what makes the pair comparable", () => {
    expect(shoveEv("72o", caller, 10, 1.5)!.foldBB).toBe(0);
  });
});

describe("what calling an all-in is worth", () => {
  const shover = ["AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AQs", "AKo", "AQo", "KQs"];

  it("pays for premiums and punishes trash at the same price", () => {
    expect(callAllInEv("AA", shover, 10, 11.5)!.callBB).toBeGreaterThan(0);
    expect(callAllInEv("72o", shover, 10, 11.5)!.callBB).toBeLessThan(0);
  });

  it("turns break-even exactly where the pot odds say it should", () => {
    // Calling 10 into 11.5 needs 10/21.5 = 46.5 percent. A hand with that equity
    // is worth zero, which is the same number decisionMaths states from odds alone.
    const hand = ["TT", "99", "AJs", "KQs", "A9s"]
      .map((h) => ({ h, ev: callAllInEv(h, shover, 10, 11.5)! }))
      .sort((a, b) => Math.abs(a.ev.callBB) - Math.abs(b.ev.callBB))[0];
    expect(Math.abs(hand.ev.equity - 10 / 21.5)).toBeLessThan(0.08);
  });
});
