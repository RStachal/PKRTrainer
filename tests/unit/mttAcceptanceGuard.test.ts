import { describe, expect, it } from "vitest";

import {
  familyIdFromRuleId,
  isWithheld,
  renderWithheldFamilies,
  rulesByFamilyIn,
  withheldFamiliesForRules,
  type AcceptanceRecord,
} from "../../scripts/lib/mttAcceptanceGuard.mts";

// The accuracy grader records "no" for a family that misses the exploitability
// target, but that verdict lives only in artifacts that are not version
// controlled and nothing downstream reads it. Two withheld families reached the
// shipped packs before this guard existed. These assertions pin the rule.

const accepted: AcceptanceRecord = {
  familyId: "MTT9_50BB_BTN_BB_SRP",
  decision: "scoped",
  caveats: "max observed 0.4994",
};
const withheld: AcceptanceRecord = {
  familyId: "MTT9_150BB_CO_BTN_3BP_HIGHSPR",
  decision: "no",
  caveats: "Boards above the 0.5 exploitability target: 883r (1.0976).",
};

describe("acceptance guard", () => {
  it("derives the family from a rule id", () => {
    expect(familyIdFromRuleId("mtt9_150bb_co_btn_3bp_highspr-check-aggregate"))
      .toBe("MTT9_150BB_CO_BTN_3BP_HIGHSPR");
  });

  it("treats anything that is not an acceptance as withheld", () => {
    expect(isWithheld("no")).toBe(true);
    expect(isWithheld("REJECTED")).toBe(true);
    expect(isWithheld("scoped")).toBe(false);
    expect(isWithheld("yes")).toBe(false);
    // An empty decision is not a verdict at all.
    expect(isWithheld("")).toBe(false);
    expect(isWithheld("   ")).toBe(false);
  });

  it("reports a withheld family and every shipped rule that draws on it", () => {
    const result = withheldFamiliesForRules(
      [
        "mtt9_150bb_co_btn_3bp_highspr-check-aggregate",
        "mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate",
        "mtt9_50bb_btn_bb_srp-check-aggregate",
      ],
      [accepted, withheld],
    );

    expect(result).toHaveLength(1);
    expect(result[0].familyId).toBe("MTT9_150BB_CO_BTN_3BP_HIGHSPR");
    // Both rules matter: a reader needs to know how far the content reaches.
    expect(result[0].ruleIds).toEqual([
      "mtt9_150bb_co_btn_3bp_highspr-check-aggregate",
      "mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate",
    ]);
  });

  it("passes a pack built only from accepted families", () => {
    expect(withheldFamiliesForRules(["mtt9_50bb_btn_bb_srp-check-aggregate"], [accepted]))
      .toEqual([]);
  });

  it("does not treat a family with no decision as withheld", () => {
    // Absent evidence is not a failed grade. Failing here would block every
    // machine that has not run the grader yet, which is a different problem.
    expect(withheldFamiliesForRules(["mtt9_40bb_utg_bb_srp-check-aggregate"], [accepted]))
      .toEqual([]);
  });

  it("carries the grader's own reason into the message", () => {
    const message = renderWithheldFamilies(
      withheldFamiliesForRules(["mtt9_150bb_co_btn_3bp_highspr-check-aggregate"], [withheld]),
    );
    expect(message).toContain("MTT9_150BB_CO_BTN_3BP_HIGHSPR");
    expect(message).toContain("883r (1.0976)");
    expect(message).toContain("decide explicitly");
  });

  it("says so plainly when nothing is withheld", () => {
    expect(renderWithheldFamilies([])).toBe("No shipped pack draws on a withheld family.");
  });

  it("groups shipped rules by family for a family-level problem", () => {
    // Used to name which shipped content a tree-mixing family reaches. Holding a
    // family back from the next rebuild does nothing about what it already put in
    // the packs, so that reach has to be reported.
    const grouped = rulesByFamilyIn(
      [
        "mtt9_150bb_co_btn_3bp_highspr-check-aggregate",
        "mtt9_50bb_btn_bb_srp_facing_midspr-check-bet_17-aggregate",
        "mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate",
        "mtt9_40bb_utg_bb_srp-check-aggregate",
      ],
      new Set(["MTT9_150BB_CO_BTN_3BP_HIGHSPR", "MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR"]),
    );

    expect([...grouped.keys()]).toEqual([
      "MTT9_150BB_CO_BTN_3BP_HIGHSPR",
      "MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR",
    ]);
    expect(grouped.get("MTT9_150BB_CO_BTN_3BP_HIGHSPR")).toHaveLength(2);
    // A family outside the set contributes nothing.
    expect([...grouped.values()].flat()).not.toContain("mtt9_40bb_utg_bb_srp-check-aggregate");
  });

  it("returns nothing when no shipped rule touches the flagged families", () => {
    expect(rulesByFamilyIn(["mtt9_40bb_utg_bb_srp-check-aggregate"], new Set(["MTT9_OTHER"])).size)
      .toBe(0);
  });
});
