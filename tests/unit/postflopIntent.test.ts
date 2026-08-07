import { describe, expect, it } from "vitest";

import {
  postflopIntentFromFilters,
  postflopPositionContextFromFilters,
} from "../../src/core/postflopIntent";
import type { Filters } from "../../src/core/types";

const baseFilters: Filters = {
  positions: [],
  buckets: [],
  contexts: [],
  ante: "ON",
  scoringMode: "LENIENT",
};

describe("postflopIntent", () => {
  it("prevede LJ + HJ proti 3-betu na LJ vs HJ postflop kontext", () => {
    expect(postflopPositionContextFromFilters({
      ...baseFilters,
      positions: ["LJ", "HJ"],
      contexts: ["VS_3BET"],
    })).toEqual({
      heroPosition: "LJ",
      villainPosition: "HJ",
      aggressorPosition: "HJ",
      callerPosition: "LJ",
      inPosition: false,
      callerType: "OUT_OF_POSITION_CALLER",
      positionPattern: "3BP_HJ_VS_LJ",
    });
  });

  it("prevede proti 3-betu na 3bet pot se stackem z filtru", () => {
    expect(postflopIntentFromFilters({
      ...baseFilters,
      positions: ["LJ", "HJ"],
      buckets: [30],
      contexts: ["VS_3BET"],
    })).toMatchObject({
      potType: "THREE_BET_POT",
      potBB: 18,
      effectiveStackBB: 30,
      positionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        positionPattern: "3BP_HJ_VS_LJ",
      },
    });
  });

  it("zachova specialni blind a BTN vs BB patterny", () => {
    expect(postflopPositionContextFromFilters({
      ...baseFilters,
      positions: ["BTN", "BB"],
      contexts: ["RFI"],
    })?.positionPattern).toBe("BTN_VS_BB");

    expect(postflopPositionContextFromFilters({
      ...baseFilters,
      positions: ["SB", "BB"],
      contexts: ["BVB"],
    })?.positionPattern).toBe("SB_VS_BB");
  });

  it("bez pozic nevnucuje generatoru zadny kontext", () => {
    expect(postflopPositionContextFromFilters(baseFilters)).toBeNull();
  });
});
