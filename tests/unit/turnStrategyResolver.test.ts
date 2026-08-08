import { describe, expect, it } from "vitest";

import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";
import { TURN_COVERAGE_TARGET } from "../../src/data/ranges/turnReviewGate";
import { buildTurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import {
  TURN_DEPTH_TOLERANCE_BB,
  createTurnStrategyResolver,
} from "../../src/data/ranges/turnStrategyResolver";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * The end of the path from a solved turn to a player.
 *
 * Turn spots reached solved content zero percent of the time - the pilot packs
 * are flop packs by type, and 4.2 GB of solved turn output had nowhere to go.
 *
 * Declining is the important half of this. Eleven families cover eleven spots;
 * everything else is a turn the solver has never seen, and answering it from a
 * neighbouring family would be worse than the heuristic, because the heuristic
 * is labelled as one while a wrong solved answer arrives wearing SOLVER_BACKED.
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
  buckets: [
    {
      action: "CHECK",
      handClasses: ["72o"],
      combos: 12,
      mix: [{ action: "CHECK", frequency: 0.9 }, { action: "BET 75.000000", frequency: 0.1 }],
    },
    {
      action: "BET 75.000000",
      handClasses: ["AA"],
      combos: 6,
      mix: [{ action: "CHECK", frequency: 0.1 }, { action: "BET 75.000000", frequency: 0.9 }],
    },
  ],
  classCount: 2,
  ...over,
});

function packWith(rules: TurnStrategyRule[]) {
  const result = buildTurnStrategyPack({
    id: "mtt-turn-solved-test-v1",
    createdAt: "2026-08-08",
    evidence: {
      familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
      boards: 33, plannedItems: 100, writtenItems: 100,
      minCoverage: 0.997, coverageTarget: TURN_COVERAGE_TARGET,
      sampledRules: [rules[0]],
    },
    rules,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}

const input = (over: Partial<PostflopStrategyInput> = {}): PostflopStrategyInput => ({
  street: "TURN",
  textures: ["dry"],
  potType: "SINGLE_RAISED",
  potBB: 100,
  effectiveStackBB: 25,
  positionPattern: "SRP_CO_VS_BB",
  actionNode: "TURN_BARREL",
  heroHand: "AA",
  ...over,
});

describe("turn strategy resolver", () => {
  const resolve = createTurnStrategyResolver(packWith([rule()]));

  it("answers a spot the solver actually saw", () => {
    const recommendation = resolve(input())!;
    expect(recommendation).not.toBeNull();
    // 75 into 100 is above half the pot.
    expect(recommendation.action).toBe("BET_BIG");
    const source = recommendation.source!;
    expect(source.kind).toBe("STRATEGY_PACK");
    if (source.kind === "STRATEGY_PACK") {
      expect(source.provenance).toBe("SOLVER_BACKED");
      // Traceable to the run that produced it.
      expect(source.ruleId).toContain("MTT9_25BB_CO_BB_SRP_CBET_LOWSPR");
    }
  });

  it("answers for the hero's hand, not the rule's most common action", () => {
    // Most of this range checks. A hand in the betting bucket must still be told
    // to bet, and the reverse - which is what the flop resolver learned.
    expect(resolve(input({ heroHand: "AA" }))!.action).toBe("BET_BIG");
    expect(resolve(input({ heroHand: "72o" }))!.action).toBe("CHECK");
  });

  it("declines a hand that was never solved here", () => {
    // Borrowing the rule's average would present an answer the solver never gave
    // for this holding, labelled solver-backed.
    expect(resolve(input({ heroHand: "KK" }))).toBeNull();
  });

  it("declines a spot outside the solved family", () => {
    expect(resolve(input({ positionPattern: "SRP_BTN_VS_BB" }))).toBeNull();
    expect(resolve(input({ potType: "THREE_BET_POT" }))).toBeNull();
    expect(resolve(input({ street: "FLOP" }))).toBeNull();
    // A facing-bet node is a different decision from betting into the field.
    expect(resolve(input({ actionNode: "TURN_FACING_BET" }))).toBeNull();
  });

  it("declines a depth the solve is not near", () => {
    expect(resolve(input({ effectiveStackBB: 25 + TURN_DEPTH_TOLERANCE_BB }))).not.toBeNull();
    expect(resolve(input({ effectiveStackBB: 25 + TURN_DEPTH_TOLERANCE_BB + 1 }))).toBeNull();
  });

  it("prefers the rule solved closest to the spot's depth", () => {
    const near = createTurnStrategyResolver(packWith([
      rule({ stackBB: 20, sourceDirectory: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR__20bb" }),
      rule({ stackBB: 30, sourceDirectory: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR__30bb" }),
    ]));
    const source = near(input({ effectiveStackBB: 29 }))!.source!;
    if (source.kind === "STRATEGY_PACK") {
      expect(source.ruleId).toContain("30bb");
    }
  });

  it("declines when there is no pot to measure a bet against", () => {
    // The solver's sizes are in chips. Without a pot a bet cannot be called
    // small or big, so this is not a spot the resolver can answer.
    expect(resolve(input({ potBB: 0 }))).toBeNull();
  });

  it("says when the trainer showed fewer bet sizes than the solve had", () => {
    const wide = createTurnStrategyResolver(packWith([rule({
      actions: ["CHECK", "BET 33.000000", "BET 75.000000", "BET 625.000000"],
      buckets: [{
        action: "BET 75.000000",
        handClasses: ["AA"],
        combos: 6,
        mix: [
          { action: "CHECK", frequency: 0.05 },
          { action: "BET 33.000000", frequency: 0.05 },
          { action: "BET 75.000000", frequency: 0.9 },
          { action: "BET 625.000000", frequency: 0 },
        ],
      }],
    })]));
    expect(wide(input())!.explanation).toContain("merged");
  });
});
