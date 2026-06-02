import { describe, expect, it } from "vitest";

import {
  CASH_STACK_BUCKETS,
  DEFAULT_CASH_PROFILE,
  cashProfileId,
  cashProfileToTrainingProfile,
  cashProfileWith,
  validateCashProfile,
} from "../../src/core/cashGameProfile";

describe("cashGameProfile", () => {
  it("definuje cash profil oddeleny od produkcniho MTT/SNG enginu", () => {
    expect(DEFAULT_CASH_PROFILE).toEqual({
      tableFormat: "SIX_MAX",
      blindMode: "FIXED",
      defaultStackBB: 100,
      ante: "OFF",
      rakeMode: "RAKE",
    });
    expect(CASH_STACK_BUCKETS).toEqual([40, 60, 75, 100, 125, 150, 200]);
    expect(validateCashProfile(DEFAULT_CASH_PROFILE)).toEqual([]);
  });

  it("rezervuje rake a no-rake dimenzi bez zapojeni cash ranges", () => {
    const noRake = cashProfileWith(DEFAULT_CASH_PROFILE, {
      rakeMode: "NO_RAKE",
      tableFormat: "FULL_RING_9",
      defaultStackBB: 150,
    });

    expect(cashProfileId(noRake)).toBe("CASH|FULL_RING_9|FIXED|150|OFF|NO_RAKE");
    expect(cashProfileToTrainingProfile(noRake)).toEqual({
      gameVariant: "CASH",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "NO_RAKE",
    });
  });

  it("validuje cash assumptions pro budouci ranges", () => {
    expect(validateCashProfile({
      ...DEFAULT_CASH_PROFILE,
      ante: "ON",
      defaultStackBB: 0,
    })).toEqual([
      "cash ante is expected to be OFF for initial profiles",
      "defaultStackBB must be a positive finite BB value",
    ]);
  });
});
