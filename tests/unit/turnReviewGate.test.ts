import { describe, expect, it } from "vitest";

import {
  TURN_COVERAGE_TARGET,
  renderTurnReviewReport,
  reviewTurnFamily,
  type TurnFamilyEvidence,
} from "../../src/data/ranges/turnReviewGate";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * The gate that decides which solved families are worth a reviewer's time.
 *
 * 4.2 GB of solver output exists with no path to a player, and the missing step
 * was never a converter - it is a decision. These are the criteria that decision
 * rests on, ordered so a family fails on the cheapest question it fails at.
 *
 * Run over the real artefacts it passes ten families of eleven and blocks
 * `MTT9_40BB_UTG_BB_SRP` at COMPLETE: 2,152 subgames planned, 2,010 written, so
 * 142 turn lines have no strategy. A pack built from it would answer most turns
 * and fall silently through the rest - invisible from outside, which is why
 * completeness is checked before anything more interesting.
 */

const soundRule = (directory: string, pattern: string): TurnStrategyRule => ({
  sourceDirectory: directory,
  familyId: directory.split("__")[0],
  positionPattern: pattern,
  node: "CBET",
  potType: "SINGLE_RAISED",
  stackBB: 25,
  heroOutOfPosition: false,
  actions: ["CHECK", "BET 75.000000"],
  buckets: [
    {
      action: "CHECK",
      handClasses: ["72o"],
      combos: 12,
      mix: [{ action: "CHECK", frequency: 0.9 }, { action: "BET 75.000000", frequency: 0.1 }],
    },
  ],
  classCount: 1,
});

const evidence = (over: Partial<TurnFamilyEvidence> = {}): TurnFamilyEvidence => ({
  familyId: "MTT9_25BB_BTN_BB_SRP",
  boards: 20,
  plannedItems: 1000,
  writtenItems: 1000,
  minCoverage: 0.995,
  coverageTarget: TURN_COVERAGE_TARGET,
  sampledRules: [soundRule("MTT9_25BB_BTN_BB_SRP__222r", "SRP_BTN_VS_BB")],
  ...over,
});

describe("turn review gate", () => {
  it("passes a family that is traceable, complete, converged and coherent", () => {
    const verdict = reviewTurnFamily(evidence());
    expect(verdict.readyForReview).toBe(true);
    expect(verdict.findings).toEqual([]);
    expect(verdict.positionPattern).toBe("SRP_BTN_VS_BB");
    expect(verdict.completeness).toBe(1);
  });

  it("blocks a family whose name cannot be read", () => {
    // There is no manifest tying a solve to a spot. A name that will not parse
    // has lost the only record of what the family is about, and nothing
    // downstream can recover it.
    const verdict = reviewTurnFamily(evidence({ familyId: "SOMETHING_ELSE" }));
    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("TRACEABLE");
    expect(verdict.positionPattern).toBeUndefined();
  });

  it("blocks a family with subgames that were planned and never written", () => {
    // The tier that earns its place: this is the real state of the 40BB
    // under-the-gun family.
    const verdict = reviewTurnFamily(evidence({ plannedItems: 2152, writtenItems: 2010 }));
    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("COMPLETE");
    expect(verdict.findings[0].detail).toContain("142");
    expect(verdict.completeness).toBeCloseTo(0.934, 3);
  });

  it("blocks a family that did not reach its coverage target", () => {
    const verdict = reviewTurnFamily(evidence({ minCoverage: 0.87 }));
    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("CONVERGED");
  });

  it("blocks a family whose rules do not hold together", () => {
    const broken = soundRule("MTT9_25BB_BTN_BB_SRP__222r", "SRP_BTN_VS_BB");
    const verdict = reviewTurnFamily(evidence({
      sampledRules: [{
        ...broken,
        // Frequencies that do not sum to one mean the action order was misread.
        buckets: [{ ...broken.buckets[0], mix: [
          { action: "CHECK", frequency: 0.2 },
          { action: "BET 75.000000", frequency: 0.2 },
        ] }],
      }],
    }));
    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("COHERENT");
  });

  it("catches a rule filed under a pattern its family does not describe", () => {
    // Directory and parse having drifted apart would misfile everything under
    // it, and nothing further down could tell.
    const verdict = reviewTurnFamily(evidence({
      sampledRules: [soundRule("MTT9_25BB_BTN_BB_SRP__222r", "3BP_CO_VS_BTN")],
    }));
    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("COHERENT");
    expect(verdict.findings[0].detail).toContain("does not match");
  });

  it("stops at the first failed tier rather than piling on consequences", () => {
    // A family that cannot be traced does not need its frequencies checked, and
    // four findings where one caused the others hides the real problem.
    const verdict = reviewTurnFamily(evidence({
      familyId: "SOMETHING_ELSE", plannedItems: 100, writtenItems: 1, minCoverage: 0.1,
    }));
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.failedTier).toBe("TRACEABLE");
  });

  it("leads the report with what needs attention", () => {
    const report = renderTurnReviewReport([
      reviewTurnFamily(evidence()),
      reviewTurnFamily(evidence({ familyId: "MTT9_40BB_UTG_BB_SRP", plannedItems: 2152, writtenItems: 2010 })),
    ]);
    expect(report).toContain("ready for review: 1");
    // Blocked first, however the caller ordered them.
    expect(report.indexOf("MTT9_40BB_UTG_BB_SRP")).toBeLessThan(report.indexOf("MTT9_25BB_BTN_BB_SRP"));
  });
});
