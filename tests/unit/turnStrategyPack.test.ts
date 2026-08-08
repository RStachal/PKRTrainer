import { describe, expect, it } from "vitest";

import { TURN_COVERAGE_TARGET, type TurnFamilyEvidence } from "../../src/data/ranges/turnReviewGate";
import { buildTurnStrategyPack, turnRulesForDepth } from "../../src/data/ranges/turnStrategyPack";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Only a family the gate passed becomes a pack, and the builder enforces it.
 *
 * A builder that accepts anything and trusts its caller to have checked is how
 * 142 missing subgames become a pack that answers most turns and falls silently
 * through the rest. So the gate runs inside the build rather than beside it.
 */

const rule = (over: Partial<TurnStrategyRule> = {}): TurnStrategyRule => ({
  sourceDirectory: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR__222r",
  familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
  positionPattern: "SRP_CO_VS_BB",
  node: "CBET",
  potType: "SINGLE_RAISED",
  stackBB: 25,
  heroOutOfPosition: false,
  actions: ["CHECK", "BET 75.000000"],
  buckets: [{
    action: "CHECK",
    handClasses: ["72o"],
    combos: 12,
    mix: [{ action: "CHECK", frequency: 0.9 }, { action: "BET 75.000000", frequency: 0.1 }],
  }],
  classCount: 1,
  ...over,
});

const evidence = (over: Partial<TurnFamilyEvidence> = {}): TurnFamilyEvidence => ({
  familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
  boards: 33,
  plannedItems: 4622,
  writtenItems: 4622,
  minCoverage: 0.997,
  coverageTarget: TURN_COVERAGE_TARGET,
  sampledRules: [rule()],
  ...over,
});

const build = (over: Partial<TurnFamilyEvidence> = {}, rules = [rule()]) => buildTurnStrategyPack({
  id: "mtt-full-ring-9-turn-solved-co-bb-25bb-v1",
  createdAt: "2026-08-08",
  evidence: evidence(over),
  rules,
});

describe("turn strategy pack", () => {
  it("builds from a family the gate passed", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.provenance).toBe("SOLVER_BACKED");
    expect(result.pack.dimensions.street).toBe("TURN");
    expect(result.pack.familyIds).toEqual(["MTT9_25BB_CO_BB_SRP_CBET_LOWSPR"]);
  });

  it("stays LOW confidence however clean the solve was", () => {
    // The gate checks traceable, complete, converged and coherent. None of those
    // is a statement about whether the strategy is good - a tree missing a bet
    // size converges beautifully to the wrong game - so only a player moves this.
    const result = build({ minCoverage: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.confidence).toBe("LOW");
    expect(result.pack.assumptions.join(" ")).toContain("until a player reviews");
  });

  it("refuses a family the gate blocked, with the reason attached", () => {
    // The real state of the 40BB under-the-gun family.
    const result = build({ plannedItems: 2152, writtenItems: 2010 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("COMPLETE");
    expect(result.reason).toContain("142");
  });

  it("refuses a rule from a different family than the evidence", () => {
    // Shipping one solve's strategy under another's name is the failure nothing
    // downstream can detect, so it is caught where the two are still together.
    const result = build({}, [rule(), rule({ familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR" })]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("MTT9_20BB_BTN_BB_SRP_LOWSPR");
  });

  it("refuses a family that passed the gate but produced nothing", () => {
    const result = build({}, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("no rules");
  });

  it("says how to trace any answer back to its run", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The thing the flop packs cannot do.
    for (const item of result.pack.rules) {
      expect(item.sourceDirectory).toContain(item.familyId);
    }
    expect(result.pack.assumptions.join(" ")).toContain("traced");
  });

  it("selects rules near a stack depth for a resolver to use", () => {
    const result = build({}, [rule({ stackBB: 25 }), rule({ stackBB: 100 })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(turnRulesForDepth(result.pack, 25)).toHaveLength(1);
    expect(turnRulesForDepth(result.pack, 30)).toHaveLength(1);
    // Far enough away that a 25BB turn strategy is not the answer at 100.
    expect(turnRulesForDepth(result.pack, 60)).toHaveLength(0);
  });
});
