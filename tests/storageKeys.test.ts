import { describe, expect, it } from "vitest";
import {
  CATEGORY_PHASES,
  CATEGORY_VALUES,
  DEFAULT_CATEGORY,
} from "../src/domain/constants";
import { EVT_KEY, HH_KEY, LS_KEY, PROFILE_ID } from "../src/state/storageKeys";

describe("legacy constant parity", () => {
  it("matches category constants from the legacy selector", () => {
    expect(DEFAULT_CATEGORY).toBe("ALL");
    expect(CATEGORY_PHASES).toEqual(["PREFLOP", "FLOP", "TURN", "RIVER"]);
    expect(CATEGORY_VALUES).toEqual([
      "ALL",
      "OPEN_HJ_CO_BTN",
      "ISO_LIMP",
      "BB_DEFEND",
      "BB_DEFEND_2X",
      "REJAM",
      "SB_OPEN",
      "BVB_AFTER_3BET",
      "FLOP_CBET_HU_DRY_PFR",
      "FLOP_CBET_HU_WET_PFR",
      "FLOP_CHECKBACK_PFR_IP",
      "FLOP_DEFEND_VS_CBET_IP",
      "FLOP_DEFEND_VS_CBET_OOP_BB",
      "FLOP_MULTIWAY_PFR",
      "FLOP_ISO_POT_VS_LIMPER",
      "FLOP_3BETPOT_AHIGH",
      "FLOP_BVB_SRP",
      "FLOP_RFI_DEFENDER_RANGE_AWARE",
      "TURN_PFR_BARREL_DRY",
      "TURN_PFR_BARREL_WET",
      "TURN_PFR_DELAYED_CBET_IP",
      "TURN_DEFEND_VS_BARREL_IP",
      "TURN_DEFEND_VS_BARREL_OOP_BB",
      "TURN_3BETPOT_AHIGH",
      "TURN_BVB_SRP",
      "RIVER_PFR_VALUEBET",
      "RIVER_PFR_THIN_VALUE_IP",
      "RIVER_PFR_CHECKBACK",
      "RIVER_DEFEND_BLUFCATCH",
      "RIVER_DEFEND_VALUE_RAISE",
      "RIVER_BVB_SRP",
      "RIVER_3BETPOT_AHIGH",
    ]);
  });

  it("matches legacy localStorage key constants", () => {
    expect(PROFILE_ID).toBe("JungleStyle1");
    expect(LS_KEY).toBe("fuf_drill_v5_JungleStyle1");
    expect(EVT_KEY).toBe("fuf_drill_v5_JungleStyle1_events_v1");
    expect(HH_KEY).toBe("fuf_hh_jungle_v1");
  });
});
