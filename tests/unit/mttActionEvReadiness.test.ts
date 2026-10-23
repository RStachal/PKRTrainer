import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import type { ActionKey, HandLabel } from "../../src/core/types";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import { buildMttActionEvReadinessReport } from "../../src/data/ranges/mttActionEvReadiness";
import type { RangePack } from "../../src/data/ranges/rangePack";

describe("MTT action EV readiness", () => {
  it("requires solver EV for every action offered at every decision", () => {
    const report = buildMttActionEvReadinessReport({
      preflopPacks: [completePreflopPack()],
      postflopPacks: [completePostflopPack()],
    });

    expect(report).toMatchObject({
      valid: true,
      comparisonReady: true,
      preflop: { completeDecisions: 169, totalDecisions: 169, readyPacks: 1 },
      postflop: { completeDecisions: 1, totalDecisions: 1, readyPacks: 1 },
      blockers: [],
      errors: [],
    });
  });

  it("does not count strategy frequencies as action EV", () => {
    const postflop = completePostflopPack();
    const bucket = postflop.rules[0].rangeBuckets[0];
    const frequencyOnly = {
      ...postflop,
      rules: [{
        ...postflop.rules[0],
        rangeBuckets: [{
          ...bucket,
          actionEvs: undefined,
          actionMix: [
            { action: "CHECK", frequencyPct: 50, visibility: "EXACT" },
            { action: "BET_SMALL", frequencyPct: 50, visibility: "EXACT" },
          ],
        }],
      }],
    } as FlopProductionStrategyPack;
    const report = buildMttActionEvReadinessReport({
      preflopPacks: [completePreflopPack()],
      postflopPacks: [frequencyOnly],
    });

    expect(report.valid).toBe(true);
    expect(report.comparisonReady).toBe(false);
    expect(report.postflop.completeDecisions).toBe(0);
    expect(report.blockers[0]).toContain("complete solver action EV 0/1 decisions");
  });
});

function completePreflopPack(): RangePack {
  const strict = {} as Record<HandLabel, ActionKey[]>;
  const lenient = {} as Record<HandLabel, ActionKey[]>;
  const actionEvs = {} as NonNullable<RangePack["records"][number]["actionEvs"]>;
  for (const hand of ALL_HAND_CLASSES) {
    strict[hand] = ["CALL"];
    lenient[hand] = ["CALL"];
    actionEvs[hand] = {
      source: "SOLVER",
      unit: "BB",
      values: [
        { action: "FOLD", evBb: 0 },
        { action: "CALL", evBb: 1 },
        { action: "3BET", evBb: 1.005 },
      ],
      equivalentThresholdBb: 0.01,
      acceptableThresholdBb: 0.05,
    };
  }
  return {
    id: "test-preflop-action-ev",
    version: "1",
    createdAt: "2026-07-16",
    verifiedAt: "2026-07-16",
    confidence: "HIGH",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NO_RAKE",
    },
    assumptions: [],
    searchQueries: [],
    sourceEvidence: [],
    records: [{ position: "BTN", bucket: 40, context: "VS_OPEN", strict, lenient, actionEvs }],
  };
}

function completePostflopPack(): FlopProductionStrategyPack {
  return {
    contentLanguage: "en",
    id: "test-postflop-action-ev",
    version: "1",
    createdAt: "2026-07-16",
    verifiedAt: "2026-07-16",
    confidence: "HIGH",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned test fixture.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON"],
    },
    sourceEvidence: [],
    assumptions: [],
    rules: [{
      id: "test-rule",
      actionNode: "SINGLE_RAISED_POT_CBET",
      potType: "SINGLE_RAISED",
      positionPattern: "SRP_BTN_VS_BB",
      boardTextures: ["dry"],
      sprMin: 1,
      sprMax: 5,
      actions: ["CHECK", "BET_SMALL"],
      recommendedAction: "CHECK",
      rangeBuckets: [{
        lane: "CHECK",
        label: "AA",
        action: "CHECK",
        handClasses: ["AA"],
        features: [],
        actionEvs: {
          source: "SOLVER",
          unit: "BB",
          values: [
            { action: "CHECK", evBb: 2 },
            { action: "BET_SMALL", evBb: 2 },
          ],
          equivalentThresholdBb: 0.01,
          acceptableThresholdBb: 0.05,
        },
      }],
      explanation: "Test fixture.",
    }],
  };
}
