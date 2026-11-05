import { describe, expect, it } from "vitest";

import {
  SNG_PAYOUT_PRESETS,
  buildSngIcmContext,
  bubbleFactor,
  estimateBubbleFactor,
  heroStackRank,
  normalizePayoutStructure,
  validatePayoutStructure,
  validateStackDistribution,
  type StackDistribution,
} from "../../src/core/icmModel";

const distribution: StackDistribution = {
  remainingPlayers: 4,
  heroIndex: 1,
  stacks: [
    { position: "BTN", stackBB: 42 },
    { position: "SB", stackBB: 18 },
    { position: "BB", stackBB: 11 },
    { position: "CO", stackBB: 29 },
  ],
};

describe("icmModel", () => {
  it("definuje zakladni SNG payout presety", () => {
    expect(validatePayoutStructure(SNG_PAYOUT_PRESETS.SNG_9_MAX_TOP_3)).toEqual([]);
    expect(validatePayoutStructure(SNG_PAYOUT_PRESETS.SNG_6_MAX_TOP_2)).toEqual([]);
    expect(normalizePayoutStructure({
      id: "TEST",
      paidPlaces: 2,
      payouts: [65, 35],
    }).payouts).toEqual([0.65, 0.35]);
  });

  it("validuje stack distribution a pocita poradi hero stacku", () => {
    expect(validateStackDistribution(distribution)).toEqual([]);
    expect(heroStackRank(distribution)).toBe(3);

    expect(validateStackDistribution({
      ...distribution,
      heroIndex: 9,
    })).toContain("heroIndex must point to an existing stack");
  });

  it("odhaduje bubble factor podle placenych mist a stack distribution", () => {
    expect(estimateBubbleFactor(SNG_PAYOUT_PRESETS.SNG_9_MAX_TOP_3, distribution))
      .toBe(2.3);

    // Winner-take-all has no ladder, so prize equity is exactly a player's share
    // of the chips and a call risks precisely what it gains. The factor is 1 by
    // construction. The previous version of this expected 1.5, which came from a
    // table of invented constants rather than from any calculation - there is no
    // stack distribution that makes a single-payout tournament apply ICM pressure.
    expect(estimateBubbleFactor(SNG_PAYOUT_PRESETS.WINNER_TAKE_ALL, {
      ...distribution,
      remainingPlayers: 4,
      stacks: distribution.stacks,
    })).toBe(1);
  });

  it("differs by opponent, which a per-player number cannot express", () => {
    // The small blind on 18bb risks its tournament against the 42bb stack but
    // barely anything against the 11bb one. Same hero, same moment, factors of
    // 2.26 and 1.22 - which is why this is computed per pairing.
    const stacks = distribution.stacks.map((stack) => stack.stackBB);
    const payouts = SNG_PAYOUT_PRESETS.SNG_9_MAX_TOP_3.payouts;
    const versusBig = bubbleFactor(stacks, payouts, 1, 0);
    const versusShort = bubbleFactor(stacks, payouts, 1, 2);
    expect(versusBig).toBeGreaterThan(2);
    expect(versusShort).toBeLessThan(1.3);
  });

  it("sestavi SNG ICM context pro push/fold, call all-in a rejam", () => {
    const context = buildSngIcmContext({
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      payoutStructure: SNG_PAYOUT_PRESETS.SNG_9_MAX_TOP_3,
      stackDistribution: distribution,
      spotType: "REJAM",
    });

    expect(context).toMatchObject({
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      spotType: "REJAM",
      bubbleFactor: 2.3,
    });

    expect(buildSngIcmContext({
      tableFormat: "SIX_MAX",
      blindSpeed: "REGULAR",
      payoutStructure: SNG_PAYOUT_PRESETS.SNG_6_MAX_TOP_2,
      stackDistribution: {
        remainingPlayers: 3,
        heroIndex: 0,
        stacks: [{ stackBB: 22 }, { stackBB: 12 }, { stackBB: 8 }],
      },
      spotType: "PUSH_FOLD",
      bubbleFactor: 1.8,
    }).spotType).toBe("PUSH_FOLD");
  });
});
