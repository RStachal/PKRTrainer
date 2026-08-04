import { describe, expect, it } from "vitest";

import { bubbleFactor, icmEquity, requiredEquityWithIcm } from "../../src/core/icmModel";

// Bubble factor is what lets a chipEV range be taught in an ICM spot without
// owning an ICM engine: it is one number that says how much more equity a call
// needs because of the payout ladder. The values below are the owner's own SnG
// material, which works several of them by hand, so these are checks against a
// published source rather than against this implementation's own output.
//
// It replaced a table of invented constants. Those were wrong in a consistent
// direction - a chip leader came out near 2.0 where the real figure is 1.3 -
// because they were per-player and the concept is pairwise.

const FR = [0.5, 0.3, 0.2];
const SH = [0.65, 0.35];

describe("ICM equity", () => {
  it("reproduces the worked example's equities exactly", () => {
    // Chip leader on 8000 against three stacks of 4000, three places paid.
    const equity = icmEquity([8000, 4000, 4000, 4000], FR);
    expect(Math.round(equity[0] * 1000) / 10).toBe(33);
    for (const index of [1, 2, 3]) {
      expect(Math.round(equity[index] * 1000) / 10).toBe(22.3);
    }
  });

  it("gives every equal stack an equal share, and the shares sum to the pool", () => {
    const equity = icmEquity([1500, 1500, 1500, 1500, 1500], FR);
    for (const value of equity) expect(value).toBeCloseTo(0.2, 6);
    expect(equity.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("ranks equity by stack without ever making it linear in chips", () => {
    // The whole reason ICM exists: doubling your chips does not double your money.
    const equity = icmEquity([6000, 3000, 3000], FR);
    expect(equity[0]).toBeGreaterThan(equity[1]);
    expect(equity[0]).toBeLessThan(2 * equity[1]);
  });
});

describe("bubble factor", () => {
  it("is pairwise, and asymmetric between a leader and a short stack", () => {
    // The asymmetry is the point: the leader risks little and the short stacks
    // risk everything, which is why a big stack can shove wide on a bubble.
    const stacks = [8000, 4000, 4000, 4000];
    expect(bubbleFactor(stacks, FR, 0, 3)).toBeCloseTo(1.3, 1);
    expect(bubbleFactor(stacks, FR, 3, 0)).toBeCloseTo(2.1, 1);
    expect(bubbleFactor(stacks, FR, 3, 2)).toBeCloseTo(1.7, 1);
  });

  it("matches the published figures for even stacks at each stage", () => {
    expect(bubbleFactor(Array(9).fill(1500), FR, 0, 1)).toBeCloseTo(1.2, 1);
    expect(bubbleFactor([4000, 4000, 4000, 4000], FR, 0, 1)).toBeCloseTo(1.9, 1);
    // Double or Nothing pays every survivor equally, which is why it is extreme.
    const don = Array(6).fill(2250);
    expect(bubbleFactor(don, Array(5).fill(0.2), 0, 1)).toBeGreaterThan(4.5);
  });

  it("is exactly 1 when the payout is flat, which is the cash game case", () => {
    // No ladder means equity is linear in chips, so risk equals reward and the
    // adjustment vanishes. This is the hook a cash conversion would use.
    expect(bubbleFactor([1000, 1000, 1000], [1 / 3, 1 / 3, 1 / 3], 0, 1)).toBeCloseTo(1, 6);
    expect(bubbleFactor([5000, 1000], [0.5, 0.5], 0, 1)).toBeCloseTo(1, 6);
  });

  it("rises as the bubble approaches", () => {
    const nine = bubbleFactor(Array(9).fill(1500), FR, 0, 1);
    const four = bubbleFactor(Array(4).fill(1500), FR, 0, 1);
    expect(four).toBeGreaterThan(nine);
  });
});

describe("required equity under ICM", () => {
  it("reproduces the article's worked pot-odds conversion", () => {
    // Chip odds of 1.65:1 need 37.7 percent; at a bubble factor of 1.2 they need 42.
    expect(requiredEquityWithIcm(1.65, 1.2) * 100).toBeCloseTo(42.1, 1);
    // The article rounds this to 55; at a factor of exactly 1.2 it is 54.5, and
    // the 54.8 seen elsewhere comes from the computed 1.21 rather than the printed 1.2.
    expect(requiredEquityWithIcm(1, 1.2) * 100).toBeCloseTo(54.5, 1);
  });

  it("leaves chip odds untouched at a factor of one", () => {
    expect(requiredEquityWithIcm(1, 1)).toBeCloseTo(0.5, 6);
    expect(requiredEquityWithIcm(3, 1)).toBeCloseTo(0.25, 6);
  });

  it("demands more equity as the factor grows, never less", () => {
    let previous = 0;
    for (const factor of [1, 1.2, 1.9, 3, 5]) {
      const needed = requiredEquityWithIcm(2, factor);
      expect(needed).toBeGreaterThan(previous);
      previous = needed;
    }
  });
});
