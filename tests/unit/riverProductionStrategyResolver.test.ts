import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import {
  createRiverProductionStrategyResolver,
} from "../../src/data/ranges/riverProductionStrategyResolver";
import type { RiverProductionStrategyPack } from "../../src/data/ranges/riverProductionStrategyPack";
import {
  riverSingleRaisedPrototypeStrategyPack,
  type PostflopStrategySourceEvidence,
} from "../../src/data/ranges/postflopStrategyPack";
import { createPostflopStrategyResolverWithProductionFallback } from "../../src/data/ranges/postflopStrategyRegistry";

const sourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-river-production",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "RIVER",
    evModel: "CHIP_EV",
    methodology: "Owned production fixture.",
    licenseNote: "Owned export; redistribution inside this project is permitted.",
  },
  {
    url: "https://example.test/owned-river-review",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "RIVER",
    evModel: "CHIP_EV",
    methodology: "Independent fixture review.",
    licenseNote: "Review metadata only.",
  },
];

function productionPack(confidence: "LOW" | "MEDIUM" = "MEDIUM"): RiverProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-river-srp-production-test-v1",
    version: "production-test-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence,
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "RIVER",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence,
    assumptions: ["Production river resolver fixture."],
    rules: [
      {
        id: "river-production-btn-bb-blank-big",
        actionNode: "RIVER_PRESSURE",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorTurnAction: "BET_SMALL",
        riverRunoutClasses: ["BLANK"],
        blockerRelevance: "HIGH",
        sprMin: 1,
        sprMax: 8,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "polar value",
            action: "BET_BIG",
            handClasses: ["AA"],
            features: ["top value"],
            blockerRelevance: "LOW",
          },
          {
            lane: "BLUFF",
            label: "blocker bluff",
            action: "BET_BIG",
            handClasses: ["QJs"],
            features: ["blocker candidate"],
            blockerRelevance: "HIGH",
          },
          {
            lane: "CHECK",
            label: "showdown",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["give up"],
            blockerRelevance: "LOW",
          },
        ],
        explanation: "Production fixture uses polar pressure on this blank BTN vs BB river.",
      },
      {
        id: "river-production-btn-bb-blank-facing-call",
        actionNode: "RIVER_FACING_BET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorTurnAction: "BET_SMALL",
        riverRunoutClasses: ["BLANK"],
        blockerRelevance: "MEDIUM",
        sprMin: 1,
        sprMax: 8,
        actions: ["FOLD", "CALL", "RAISE"],
        recommendedAction: "CALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value continue",
            action: "RAISE",
            handClasses: ["AA"],
            features: ["top value"],
            blockerRelevance: "LOW",
            actionMix: [
              { action: "RAISE", frequencyPct: 40, visibility: "EXACT" },
              { action: "CALL", frequencyPct: 60, visibility: "EXACT" },
            ],
          },
          {
            lane: "BLUFF",
            label: "bluff raise",
            action: "RAISE",
            handClasses: ["QJs"],
            features: ["blocker candidate"],
            blockerRelevance: "HIGH",
          },
          {
            lane: "CHECK",
            label: "fold lane",
            action: "FOLD",
            handClasses: ["72o"],
            features: ["give up"],
            blockerRelevance: "LOW",
          },
        ],
        explanation: "Production fixture calls when facing a river bet on this blank BTN vs BB river.",
      },
    ],
  };
}

const input = {
  street: "RIVER" as const,
  textures: ["dry", "disconnected", "ace-high"] as const,
  potType: "SINGLE_RAISED" as const,
  potBB: 15,
  effectiveStackBB: 35,
  positionPattern: "BTN_VS_BB" as const,
  priorTurnAction: "BET_SMALL" as const,
  riverRunoutClass: "BLANK" as const,
};

describe("riverProductionStrategyResolver", () => {
  it("prevede validni production river rule na postflop doporuceni", () => {
    const resolver = createRiverProductionStrategyResolver(productionPack());
    const result = resolver({ ...input, heroHand: "AA" });

    expect(result?.action).toBe("BET_BIG");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-river-srp-production-test-v1");
      expect(result.source.ruleId).toBe("river-production-btn-bb-blank-big");
      expect(result.source.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        label: "polar value",
        action: "BET_BIG",
        handClass: "AA",
      });
    }
  });

  it("registry preferuje river production pack pred public heuristic fallbackem", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [],
      [riverSingleRaisedPrototypeStrategyPack],
      [],
      [productionPack()],
    );
    const result = resolver(input);

    expect(result?.action).toBe("BET_BIG");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-river-srp-production-test-v1");
    }
  });

  it("matchuje river facing-bet jen pri explicitnim action nodu", () => {
    const resolver = createRiverProductionStrategyResolver(productionPack());

    expect(resolver(input)?.action).toBe("BET_BIG");
    expect(resolver({ ...input, actionNode: "RIVER_FACING_BET" })?.action).toBe("CALL");
    expect(resolver({ ...input, actionNode: "RIVER_FACING_BET" })?.source).toMatchObject({
      kind: "STRATEGY_PACK",
      ruleId: "river-production-btn-bb-blank-facing-call",
    });
  });

  it("single-street river generator doplni default prior turn action a river runout class", () => {
    const spot = generatePostflopSpot({
      seed: 77,
      street: "RIVER",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "A", suit: "d" },
      ],
      board: [
        { rank: "A", suit: "h" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
        { rank: "4", suit: "s" },
        { rank: "9", suit: "h" },
      ],
      potBB: 15,
      effectiveStackBB: 35,
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      strategyResolver: createRiverProductionStrategyResolver(productionPack()),
    });

    expect(spot.recommendedAction).toBe("BET_BIG");
    expect(spot.strategySource.kind).toBe("STRATEGY_PACK");
  });

  it("nevalidni production pack spadne na public heuristic fallback", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [],
      [riverSingleRaisedPrototypeStrategyPack],
      [],
      [productionPack("LOW")],
    );
    const result = resolver(input);

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe(riverSingleRaisedPrototypeStrategyPack.id);
    }
  });
});
