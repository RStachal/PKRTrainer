import { describe, expect, it } from "vitest";

import { assessSprFidelity } from "../../src/core/postflopSprFidelity";
import {
  MTT_POSTFLOP_SOLVED_SPR,
  familyIdFromRuleId,
  solvedSprForRuleId,
} from "../../src/data/ranges/postflopSolvedSpr";
import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";

describe("assessSprFidelity", () => {
  it("calls an on-point SPR a match", () => {
    // A single-raised bucket landing right on its solved SPR.
    const fidelity = assessSprFidelity(4.0, 4.0);
    expect(fidelity).toMatchObject({ ratio: 1, band: "MATCH" });
  });

  it("treats a small drift as still the same game", () => {
    // The measured single-raised spread: most buckets are within 1.28x.
    expect(assessSprFidelity(2.4, 2.0)?.band).toBe("MATCH");
    expect(assessSprFidelity(2.0, 2.4)?.band).toBe("MATCH");
  });

  it("flags the measured three-bet gap as a mismatch", () => {
    // The worst OPS-73 case: a 5BB three-bet bucket shown SPR 0.3 against a solve
    // at 1.8. At SPR 0.3 the player is committed and the solve does not apply.
    const fidelity = assessSprFidelity(0.3, 1.8);
    expect(fidelity?.band).toBe("MISMATCH");
    expect(fidelity?.ratio).toBe(6);
  });

  it("separates a stretched band from a clean mismatch", () => {
    expect(assessSprFidelity(2.9, 2.0)?.band).toBe("STRETCHED"); // 1.45x
    expect(assessSprFidelity(3.1, 2.0)?.band).toBe("MISMATCH"); // 1.55x
  });

  it("is symmetric in which SPR is larger", () => {
    expect(assessSprFidelity(6.9, 3.8)?.ratio).toBe(assessSprFidelity(3.8, 6.9)?.ratio);
  });

  it("returns null for a non-positive or non-finite SPR", () => {
    expect(assessSprFidelity(0, 2)).toBeNull();
    expect(assessSprFidelity(2, 0)).toBeNull();
    expect(assessSprFidelity(Number.NaN, 2)).toBeNull();
    expect(assessSprFidelity(2, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("solved SPR table", () => {
  it("derives the family from a rule id", () => {
    expect(familyIdFromRuleId("mtt9_50bb_btn_bb_srp-check-aggregate")).toBe("MTT9_50BB_BTN_BB_SRP");
    expect(familyIdFromRuleId("mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate"))
      .toBe("MTT9_150BB_CO_BTN_3BP_HIGHSPR");
  });

  it("records a solved SPR for every shipped pilot rule", () => {
    // A new family cannot ship without its solved SPR being recorded here, so the
    // fidelity of its spots can never silently become unknown.
    const unmapped: string[] = [];
    let ruleCount = 0;
    for (const entry of generatedMttPostflopPilotPacks) {
      for (const rule of entry.pack.rules) {
        ruleCount += 1;
        if (solvedSprForRuleId(rule.id) === undefined) unmapped.push(rule.id);
      }
    }
    expect(ruleCount).toBeGreaterThan(0);
    expect(unmapped).toEqual([]);
  });

  it("holds every solved SPR as a positive finite number", () => {
    for (const [family, spr] of Object.entries(MTT_POSTFLOP_SOLVED_SPR)) {
      expect(Number.isFinite(spr), family).toBe(true);
      expect(spr, family).toBeGreaterThan(0);
    }
  });
});
