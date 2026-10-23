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

  it("otvírač proti dorovnávajícímu SB dostane svou situaci, ne cokoli", () => {
    // Do 14. 10. 2026 tenhle výběr spadl na `null` a pohled pak rozdal libovolnou
    // situaci z celého katalogu - hráč chtěl CO proti SB a dostal něco jiného,
    // beze slova. Tak propadalo 7 ze 45 výběrů pozic.
    const context = postflopPositionContextFromFilters({
      ...baseFilters,
      positions: ["CO", "SB"],
      contexts: ["RFI"],
    });
    expect(context).toMatchObject({
      heroPosition: "CO",
      villainPosition: "SB",
      aggressorPosition: "CO",
      callerPosition: "SB",
      inPosition: true,
      positionPattern: "SRP_CO_VS_SB",
    });
  });

  it("platí to pro všechny otvírače, i ty s plusem ve jméně", () => {
    for (const opener of ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"] as const) {
      const pattern = postflopPositionContextFromFilters({
        ...baseFilters,
        positions: [opener, "SB"],
        contexts: ["RFI"],
      })?.positionPattern;
      expect(pattern).toBe(`SRP_${opener.replace("+", "_")}_VS_SB`);
    }
  });

  it("SB s BB zůstává blind proti blindu - nová větev ho nepřebije", () => {
    // Pořadí větví je tady celá věc: kdyby „otvírač + SB" stála před SB+BB,
    // spadl by blind proti blindu pod ni a ztratil vzor, na který spoléhá pilot.
    expect(postflopPositionContextFromFilters({
      ...baseFilters,
      positions: ["SB", "BB"],
      contexts: ["BVB"],
    })?.positionPattern).toBe("SB_VS_BB");
  });
});
