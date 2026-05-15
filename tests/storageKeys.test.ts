import { describe, expect, it } from "vitest";
import {
  CATEGORY_OPTIONS,
  CATEGORY_PHASES,
  CATEGORY_VALUES,
  DEFAULT_CATEGORY,
} from "../src/domain/constants";
import { EVT_KEY, HH_KEY, LS_KEY, PROFILE_ID } from "../src/state/storageKeys";
import { createFreshState } from "../src/state/trainingState";

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

  it("matches category metadata from the legacy selector", () => {
    expect(CATEGORY_OPTIONS).toEqual([
      { value: "ALL", phase: "ALL", label: "Vše" },
      {
        value: "OPEN_HJ_CO_BTN",
        phase: "PREFLOP",
        label: "OPEN_HJ_CO_BTN (15–25 BB)",
      },
      { value: "ISO_LIMP", phase: "PREFLOP", label: "ISO_LIMP (15–25 BB)" },
      {
        value: "BB_DEFEND",
        phase: "PREFLOP",
        label: "BB_DEFEND (vs 2x/2.5x/3x)",
      },
      {
        value: "BB_DEFEND_2X",
        phase: "PREFLOP",
        label: "BB_DEFEND_2X (vs CO/BTN steal 2x)",
      },
      { value: "REJAM", phase: "PREFLOP", label: "REJAM (15–20 BB)" },
      { value: "SB_OPEN", phase: "PREFLOP", label: "SB_OPEN (15–25 BB)" },
      {
        value: "BVB_AFTER_3BET",
        phase: "PREFLOP",
        label: "BVB_AFTER_3BET (SB open proti BB 3betu)",
      },
      {
        value: "FLOP_CBET_HU_DRY_PFR",
        phase: "FLOP",
        label: "FLOP: cbet HU suchý (PFR)",
      },
      {
        value: "FLOP_CBET_HU_WET_PFR",
        phase: "FLOP",
        label: "FLOP: cbet HU mokrý (PFR)",
      },
      {
        value: "FLOP_CHECKBACK_PFR_IP",
        phase: "FLOP",
        label: "FLOP: checkback v pozici (PFR)",
      },
      {
        value: "FLOP_DEFEND_VS_CBET_IP",
        phase: "FLOP",
        label: "FLOP: defend vs cbet IP",
      },
      {
        value: "FLOP_DEFEND_VS_CBET_OOP_BB",
        phase: "FLOP",
        label: "FLOP: defend vs cbet OOP (BB)",
      },
      {
        value: "FLOP_MULTIWAY_PFR",
        phase: "FLOP",
        label: "FLOP: multiway (PFR)",
      },
      {
        value: "FLOP_ISO_POT_VS_LIMPER",
        phase: "FLOP",
        label: "FLOP: iso pot vs limper",
      },
      {
        value: "FLOP_3BETPOT_AHIGH",
        phase: "FLOP",
        label: "FLOP: 3bet pot A-high",
      },
      { value: "FLOP_BVB_SRP", phase: "FLOP", label: "FLOP: BvB SRP" },
      {
        value: "FLOP_RFI_DEFENDER_RANGE_AWARE",
        phase: "FLOP",
        label: "FLOP: board s ohledem na range",
      },
      {
        value: "TURN_PFR_BARREL_DRY",
        phase: "TURN",
        label: "TURN: barrel HU suchý (PFR)",
      },
      {
        value: "TURN_PFR_BARREL_WET",
        phase: "TURN",
        label: "TURN: barrel HU mokrý (PFR)",
      },
      {
        value: "TURN_PFR_DELAYED_CBET_IP",
        phase: "TURN",
        label: "TURN: delayed cbet IP",
      },
      {
        value: "TURN_DEFEND_VS_BARREL_IP",
        phase: "TURN",
        label: "TURN: defend vs barrel IP",
      },
      {
        value: "TURN_DEFEND_VS_BARREL_OOP_BB",
        phase: "TURN",
        label: "TURN: defend vs barrel OOP (BB)",
      },
      {
        value: "TURN_3BETPOT_AHIGH",
        phase: "TURN",
        label: "TURN: 3bet pot A-high",
      },
      { value: "TURN_BVB_SRP", phase: "TURN", label: "TURN: BvB SRP" },
      {
        value: "RIVER_PFR_VALUEBET",
        phase: "RIVER",
        label: "RIVER: valuebet (PFR)",
      },
      {
        value: "RIVER_PFR_THIN_VALUE_IP",
        phase: "RIVER",
        label: "RIVER: thin value IP (PFR)",
      },
      {
        value: "RIVER_PFR_CHECKBACK",
        phase: "RIVER",
        label: "RIVER: checkback (PFR)",
      },
      {
        value: "RIVER_DEFEND_BLUFCATCH",
        phase: "RIVER",
        label: "RIVER: defend bluffcatch",
      },
      {
        value: "RIVER_DEFEND_VALUE_RAISE",
        phase: "RIVER",
        label: "RIVER: defend value-raise",
      },
      { value: "RIVER_BVB_SRP", phase: "RIVER", label: "RIVER: BvB SRP" },
      {
        value: "RIVER_3BETPOT_AHIGH",
        phase: "RIVER",
        label: "RIVER: 3bet pot A-high",
      },
    ]);
  });

  it("matches legacy localStorage key constants", () => {
    expect(PROFILE_ID).toBe("JungleStyle1");
    expect(LS_KEY).toBe("fuf_drill_v5_JungleStyle1");
    expect(EVT_KEY).toBe("fuf_drill_v5_JungleStyle1_events_v1");
    expect(HH_KEY).toBe("fuf_hh_jungle_v1");
  });

  it("matches the legacy fresh training state", () => {
    expect(createFreshState()).toEqual({
      answered: 0,
      correct: 0,
      streak: 0,
      mode: "MIXED",
      strict: "LENIENT",
      phase: "PREFLOP",
      catFilter: "ALL",
      seen: {},
      missed: {},
      byCat: {},
    });
  });
});
