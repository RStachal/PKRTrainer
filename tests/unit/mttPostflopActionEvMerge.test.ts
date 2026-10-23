import { describe, expect, it } from "vitest";

import { mergeActionEvIntoPilotPack } from "../../src/data/ranges/mttPostflopActionEvMerge";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import type { ActionEvSet } from "../../src/core/actionEv";
import type { PostflopAction } from "../../src/core/postflopGenerator";

function completeEv(): ActionEvSet<PostflopAction> {
  return {
    source: "SOLVER",
    unit: "BB",
    equivalentThresholdBb: 0.01,
    acceptableThresholdBb: 0.05,
    values: [
      { action: "CHECK", evBb: 0.2 },
      { action: "BET_SMALL", evBb: 0.12 },
      { action: "BET_BIG", evBb: 0.205 },
    ],
  };
}

function basePack(): FlopProductionStrategyPack {
  return {
    id: "merge-test-pack",
    version: "v1",
    createdAt: "2026-07-25",
    verifiedAt: "2026-07-25",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/owned",
        verifiedAt: "2026-07-25",
        operator: "PKRTrainer Solver",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Owned fixture.",
        licenseNote: "Owned.",
      },
    ],
    assumptions: ["Merge fixture."],
    rules: [
      {
        id: "merge-rule",
        actionNode: "SINGLE_RAISED_POT_CBET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry", "rainbow"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: [
          { lane: "VALUE", label: "value", action: "BET_BIG", handClasses: ["AA"], features: ["overpair"] },
          { lane: "CHECK", label: "check", action: "CHECK", handClasses: ["72o"], features: ["air"] },
        ],
        explanation: "Merge fixture rule.",
      },
    ],
  };
}

/** The action-EV candidate the intake produces: the base pack with EV attached. */
function candidateWithEv(): FlopProductionStrategyPack {
  const base = basePack();
  return {
    ...base,
    rules: base.rules.map((rule) => ({
      ...rule,
      rangeBuckets: rule.rangeBuckets.map((bucket) => ({ ...bucket, actionEvs: completeEv() })),
    })),
  };
}

describe("mergeActionEvIntoPilotPack", () => {
  it("overlays complete action EV onto every matching bucket", () => {
    const result = mergeActionEvIntoPilotPack(basePack(), candidateWithEv());
    expect(result.errors).toEqual([]);
    expect(result.mergedBuckets).toBe(2);
    expect(result.totalBuckets).toBe(2);
    for (const bucket of result.pack.rules[0].rangeBuckets) {
      expect(bucket.actionEvs?.source).toBe("SOLVER");
      expect(bucket.actionEvs?.values).toHaveLength(3);
    }
  });

  it("does not change lanes, actions or hand classes", () => {
    const result = mergeActionEvIntoPilotPack(basePack(), candidateWithEv());
    const merged = result.pack.rules[0].rangeBuckets;
    const original = basePack().rules[0].rangeBuckets;
    expect(merged.map((b) => [b.lane, b.action, b.handClasses]))
      .toEqual(original.map((b) => [b.lane, b.action, b.handClasses]));
  });

  it("fails closed and merges nothing when the candidate is missing a rule", () => {
    const candidate = candidateWithEv();
    candidate.rules[0].id = "different-rule-id";
    const result = mergeActionEvIntoPilotPack(basePack(), candidate);
    expect(result.errors.some((e) => e.includes("no rule merge-rule"))).toBe(true);
    expect(result.mergedBuckets).toBe(0);
    // The base is returned untouched, so no bucket gains EV.
    expect(result.pack.rules[0].rangeBuckets.every((b) => b.actionEvs === undefined)).toBe(true);
  });

  it("fails closed when a bucket count or label does not line up", () => {
    const candidate = candidateWithEv();
    candidate.rules[0].rangeBuckets[1].label = "renamed";
    const mismatchLabel = mergeActionEvIntoPilotPack(basePack(), candidate);
    expect(mismatchLabel.errors.some((e) => e.includes("does not match base"))).toBe(true);
    expect(mismatchLabel.mergedBuckets).toBe(0);

    const short = candidateWithEv();
    short.rules[0].rangeBuckets = [short.rules[0].rangeBuckets[0]];
    const mismatchCount = mergeActionEvIntoPilotPack(basePack(), short);
    expect(mismatchCount.errors.some((e) => e.includes("buckets"))).toBe(true);
    expect(mismatchCount.mergedBuckets).toBe(0);
  });

  it("rejects action EV that is not complete for the rule's actions", () => {
    const candidate = candidateWithEv();
    // Drop BET_BIG, leaving an EV set that no longer prices every legal action.
    candidate.rules[0].rangeBuckets[0].actionEvs = {
      ...completeEv(),
      values: completeEv().values.filter((value) => value.action !== "BET_BIG"),
    };
    const result = mergeActionEvIntoPilotPack(basePack(), candidate);
    expect(result.errors.some((e) => e.includes("not complete"))).toBe(true);
    expect(result.mergedBuckets).toBe(0);
  });
});
