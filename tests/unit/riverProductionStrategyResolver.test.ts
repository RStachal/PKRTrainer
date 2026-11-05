import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { gradePostflopAction } from "../../src/core/postflopScoring";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
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
        priorTurnAction: "CALL",
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

  it("doporuci akci konkretniho hero bucketu, ne rule-wide akci, kdyz chybi action EV", () => {
    // The flop resolver's defect, held on the river before content exists: the
    // rule pressures BET_BIG overall, but 72o is a give-up in the CHECK lane and
    // this pack has no action EV. 72o must be told to CHECK.
    const resolver = createRiverProductionStrategyResolver(productionPack());

    const checkHand = resolver({ ...input, heroHand: "72o" });
    expect(checkHand?.action).toBe("CHECK");
    expect(checkHand?.source?.kind).toBe("STRATEGY_PACK");
    if (checkHand?.source?.kind === "STRATEGY_PACK") {
      expect(checkHand.source.heroRangeBucket).toMatchObject({ lane: "CHECK", action: "CHECK", handClass: "72o" });
    }

    // A blocker-bluff hand in the same rule bets; its bucket action still leads.
    expect(resolver({ ...input, heroHand: "QJs" })?.action).toBe("BET_BIG");

    // A hand outside the range was never solved here, so the pack refuses rather
    // than passing off a rule-wide average as a solver result.
    expect(resolver({ ...input, heroHand: "K3o" })).toBeNull();

    // Without a hero hand the caller asks about the rule itself.
    expect(resolver({ ...input })?.action).toBe("BET_BIG");
  });

  it("hodnoti hrace podle akce jeho ruky, ne podle rule-wide akce", () => {
    // 72o is a check-lane give-up on this blank river: checking must grade correct
    // even though the rule's most-common action is BET_BIG.
    const spot = generatePostflopSpot({
      seed: 11,
      street: "RIVER",
      board: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "d" },
        { rank: "9", suit: "c" },
        { rank: "4", suit: "h" },
        { rank: "3", suit: "s" },
      ],
      heroCards: [
        { rank: "7", suit: "h" },
        { rank: "2", suit: "s" },
      ],
      potType: "SINGLE_RAISED",
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

    expect(spot.recommendedAction).toBe("CHECK");
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "CHECK").correct).toBe(true);
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "BET_BIG").correct).toBe(false);
  });

  it("rozdava hrdinu z range, kterou pack skutecne resil", () => {
    const resolver = createRiverProductionStrategyResolver(productionPack());
    const packHands = new Set(
      productionPack().rules.flatMap((rule) => rule.rangeBuckets.flatMap((bucket) => bucket.handClasses)),
    );

    let withBucket = 0;
    const spots = 60;
    for (let seed = 1; seed <= spots; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "RIVER",
        potType: "SINGLE_RAISED",
        potBB: 15,
        effectiveStackBB: 35,
        board: [
          { rank: "A", suit: "s" },
          { rank: "K", suit: "d" },
          { rank: "9", suit: "c" },
          { rank: "4", suit: "h" },
          { rank: "3", suit: "s" },
        ],
        positionContext: {
          heroPosition: "BTN",
          villainPosition: "BB",
          aggressorPosition: "BTN",
          callerPosition: "BB",
          inPosition: true,
          callerType: "BIG_BLIND",
          positionPattern: "BTN_VS_BB",
        },
        strategyResolver: resolver,
      });
      // A freely dealt hand is almost never in the solved range, so without the
      // re-deal these spots would grade against the rule-wide action instead.
      if (spot.strategySource.kind === "STRATEGY_PACK" && spot.strategySource.heroRangeBucket) {
        withBucket += 1;
        expect(packHands.has(spot.strategySource.heroRangeBucket.handClass)).toBe(true);
      }
    }
    expect(withBucket).toBe(spots);
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
    expect(resolver({ ...input, priorTurnAction: "CALL", actionNode: "RIVER_FACING_BET" })?.action).toBe("CALL");
    expect(
      resolver({ ...input, priorTurnAction: "CALL", actionNode: "RIVER_FACING_BET" })?.source,
    ).toMatchObject({
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
