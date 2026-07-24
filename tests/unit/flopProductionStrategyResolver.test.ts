import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { gradePostflopAction } from "../../src/core/postflopScoring";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  createFlopProductionStrategyResolver,
} from "../../src/data/ranges/flopProductionStrategyResolver";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import {
  flopSingleRaisedPrototypeStrategyPack,
  type PostflopStrategySourceEvidence,
} from "../../src/data/ranges/postflopStrategyPack";
import {
  createDefaultPostflopStrategyResolver,
  createPostflopStrategyResolverWithProductionFallback,
} from "../../src/data/ranges/postflopStrategyRegistry";

const sourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-flop-production",
    verifiedAt: "2026-06-04",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Owned production fixture.",
    licenseNote: "Owned export; redistribution inside this project is permitted.",
  },
  {
    url: "https://example.test/owned-flop-review",
    verifiedAt: "2026-06-04",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    methodology: "Independent fixture review.",
    licenseNote: "Review metadata only.",
  },
];

function productionPack(confidence: "LOW" | "MEDIUM" = "MEDIUM"): FlopProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-flop-srp-production-test-v1",
    version: "production-test-v1",
    createdAt: "2026-06-04",
    verifiedAt: "2026-06-04",
    confidence,
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned fixture export.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence,
    assumptions: ["Production resolver fixture."],
    rules: [
      {
        id: "flop-production-btn-bb-dry-big",
        actionNode: "SINGLE_RAISED_POT_CBET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry", "rainbow"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value",
            action: "BET_BIG",
            handClasses: ["AA"],
            features: ["overpair"],
            actionMix: [
              { action: "BET_BIG", frequencyPct: 65, visibility: "EXACT" },
              { action: "CHECK", frequencyPct: 35, visibility: "EXACT" },
            ],
            actionEvs: {
              source: "SOLVER",
              unit: "BB",
              equivalentThresholdBb: 0.01,
              acceptableThresholdBb: 0.05,
              values: [
                { action: "CHECK", evBb: 0.2 },
                { action: "BET_SMALL", evBb: 0.12 },
                { action: "BET_BIG", evBb: 0.205 },
              ],
            },
          },
          {
            lane: "BLUFF",
            label: "bluff",
            action: "BET_BIG",
            handClasses: ["QJs"],
            features: ["backdoor equity"],
          },
          {
            lane: "CHECK",
            label: "check",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Production fixture prefers big bet on this dry BTN vs BB node.",
      },
    ],
  };
}

function threeBetProductionPack(): FlopProductionStrategyPack {
  return {
    ...productionPack(),
    id: "mtt-full-ring-9-flop-3bet-production-test-v1",
    rules: [
      {
        id: "flop-production-oop-caller-ip-3bettor-dry-small",
        actionNode: "THREE_BET_POT_CBET",
        potType: "THREE_BET_POT",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
        boardTextures: ["dry", "rainbow"],
        sprMin: 1,
        sprMax: 5,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_SMALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value",
            action: "BET_SMALL",
            handClasses: ["AA"],
            features: ["overpair"],
          },
          {
            lane: "BLUFF",
            label: "bluff",
            action: "BET_SMALL",
            handClasses: ["QJs"],
            features: ["backdoor equity"],
          },
          {
            lane: "CHECK",
            label: "check",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Production fixture covers dry OOP caller versus in-position 3bettor.",
      },
    ],
  };
}

function facingBetProductionPack(): FlopProductionStrategyPack {
  return {
    ...productionPack(),
    id: "mtt-full-ring-9-flop-facing-bet-production-test-v1",
    rules: [
      {
        id: "flop-production-facing-bet-btn-bb-dry-call",
        actionNode: "FLOP_FACING_BET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry", "rainbow"],
        sprMin: 2,
        sprMax: 12,
        actions: ["FOLD", "CALL", "RAISE"],
        recommendedAction: "CALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value continue",
            action: "RAISE",
            handClasses: ["AA"],
            features: ["overpair"],
          },
          {
            lane: "BLUFF",
            label: "bluff raise",
            action: "RAISE",
            handClasses: ["QJs"],
            features: ["backdoor equity"],
          },
          {
            lane: "CHECK",
            label: "fold lane",
            action: "FOLD",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Production fixture calls facing bet on this dry BTN vs BB node.",
      },
      ...productionPack().rules,
    ],
  };
}

const input = {
  street: "FLOP" as const,
  textures: ["dry", "rainbow"] as const,
  potType: "SINGLE_RAISED" as const,
  potBB: 6,
  effectiveStackBB: 40,
  positionPattern: "BTN_VS_BB" as const,
};

describe("flopProductionStrategyResolver", () => {
  it("prevede validni production flop rule na postflop doporuceni", () => {
    const resolver = createFlopProductionStrategyResolver(productionPack());
    const result = resolver({ ...input, heroHand: "AA" });

    expect(result?.action).toBe("BET_BIG");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-flop-srp-production-test-v1");
      expect(result.source.ruleId).toBe("flop-production-btn-bb-dry-big");
      expect(result.source.confidence).toBe("MEDIUM");
      expect(result.source.matchedTextures).toEqual(["dry", "rainbow"]);
      expect(result.source.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        label: "value",
        action: "BET_BIG",
        handClass: "AA",
      });
      expect(result.source.heroRangeBucket?.actionMix).toEqual([
        { action: "BET_BIG", frequencyPct: 65, visibility: "EXACT" },
        { action: "CHECK", frequencyPct: 35, visibility: "EXACT" },
      ]);
      expect(result.source.heroRangeBucket?.actionEvs?.values).toHaveLength(3);
    }
    expect(result?.actionEvs?.values).toHaveLength(3);
  });

  it("doporuci akci konkretniho hero bucketu, ne rule-wide akci, kdyz chybi action EV", () => {
    // The rule recommends BET_BIG overall, but 72o sits in the CHECK lane with no
    // action EV. The player holding 72o must be told to CHECK, not graded against
    // the rule-wide most-common action.
    const resolver = createFlopProductionStrategyResolver(productionPack());

    const checkHand = resolver({ ...input, heroHand: "72o" });
    expect(checkHand?.action).toBe("CHECK");
    expect(checkHand?.source?.kind).toBe("STRATEGY_PACK");
    if (checkHand?.source?.kind === "STRATEGY_PACK") {
      expect(checkHand.source.heroRangeBucket).toMatchObject({ lane: "CHECK", action: "CHECK", handClass: "72o" });
    }

    // A no-EV bluff hand in the same rule bets; its bucket action still leads.
    const bluffHand = resolver({ ...input, heroHand: "QJs" });
    expect(bluffHand?.action).toBe("BET_BIG");

    // A hand outside the range has no bucket, so the rule-wide action is the
    // only available fallback.
    const offRange = resolver({ ...input, heroHand: "K3o" });
    expect(offRange?.action).toBe("BET_BIG");
    expect(offRange?.source?.kind === "STRATEGY_PACK" && offRange.source.heroRangeBucket).toBeUndefined();
  });

  it("hodnoti hrace podle akce jeho ruky, ne podle rule-wide akce", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [productionPack()],
      [flopSingleRaisedPrototypeStrategyPack],
    );
    const spot = generatePostflopSpot({
      seed: 11,
      street: "FLOP",
      board: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
      ],
      heroCards: [
        { rank: "7", suit: "h" },
        { rank: "2", suit: "s" },
      ],
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
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

    // 72o is a check-lane air hand: checking must grade correct even though the
    // rule's most-common action is BET_BIG.
    expect(spot.recommendedAction).toBe("CHECK");
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "CHECK").correct).toBe(true);
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "BET_BIG").correct).toBe(false);
  });

  it("rozdava hrdinu z range, kterou pack skutecne resil", () => {
    const resolver = createFlopProductionStrategyResolver(productionPack());
    const packHands = new Set(
      productionPack().rules.flatMap((rule) => rule.rangeBuckets.flatMap((bucket) => bucket.handClasses)),
    );

    let withBucket = 0;
    const spots = 60;
    for (let seed = 1; seed <= spots; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "FLOP",
        potType: "SINGLE_RAISED",
        potBB: 6,
        effectiveStackBB: 40,
        board: [
          { rank: "A", suit: "s" },
          { rank: "7", suit: "d" },
          { rank: "2", suit: "c" },
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

  it("nechá hrdinu být, kdyz pack pro spot zadnou range nema", () => {
    // The public heuristic model exposes no pack range, so the plain deal stands
    // and seeded behaviour for those spots is unchanged.
    const spot = generatePostflopSpot({
      seed: 5,
      street: "FLOP",
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
    });
    expect(spot.heroCards).toHaveLength(2);
    expect(spot.board).toHaveLength(3);
  });

  it("production fallback registry preferuje production pack pred public heuristic packem", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [productionPack()],
      [flopSingleRaisedPrototypeStrategyPack],
    );
    const result = resolver(input);

    expect(result?.action).toBe("BET_BIG");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-flop-srp-production-test-v1");
    }
  });

  it("postflop treningovy generator pouzije SRP production resolver, kdyz existuje", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [productionPack()],
      [flopSingleRaisedPrototypeStrategyPack],
    );

    const spot = generatePostflopSpot({
      seed: 7,
      street: "FLOP",
      board: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
      ],
      heroCards: [
        { rank: "A", suit: "h" },
        { rank: "A", suit: "c" },
      ],
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
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

    expect(spot.recommendedAction).toBe("BET_BIG");
    const checkGrade = gradePostflopAction(postflopSpotToTrainingSpot(spot), "CHECK");
    expect(checkGrade).toMatchObject({
      correct: true,
      recommended: ["CHECK", "BET_BIG"],
      actionEv: { outcome: "EQUIVALENT" },
    });
    expect(checkGrade.actionEv?.evLossBb).toBeCloseTo(0.005, 9);
    expect(spot.strategySource.kind).toBe("STRATEGY_PACK");
    if (spot.strategySource.kind === "STRATEGY_PACK") {
      expect(spot.strategySource.packId).toBe("mtt-full-ring-9-flop-srp-production-test-v1");
      expect(spot.strategySource.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        action: "BET_BIG",
        handClass: "AA",
      });
    }
  });

  it("production fallback registry umi pouzit 3bet flop production pack", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [threeBetProductionPack()],
      [flopSingleRaisedPrototypeStrategyPack],
    );
    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "THREE_BET_POT",
      potBB: 18,
      effectiveStackBB: 40,
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      actionNode: "THREE_BET_POT_CBET",
      heroHand: "AA",
    });

    expect(result?.action).toBe("BET_SMALL");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-flop-3bet-production-test-v1");
      expect(result.source.ruleId).toBe("flop-production-oop-caller-ip-3bettor-dry-small");
      expect(result.source.positionPattern).toBe("OOP_CALLER_VS_IP_3BETTOR");
      expect(result.source.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        action: "BET_SMALL",
        handClass: "AA",
      });
    }
  });

  it("nematchuje flop production rule proti jinemu action nodu", () => {
    const resolver = createFlopProductionStrategyResolver(threeBetProductionPack());
    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "THREE_BET_POT",
      potBB: 18,
      effectiveStackBB: 40,
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      actionNode: "SINGLE_RAISED_POT_CBET",
    });

    expect(result).toBeNull();
  });

  it("matchuje explicitni flop facing-bet production node", () => {
    const resolver = createFlopProductionStrategyResolver(facingBetProductionPack());

    const facingResult = resolver({
      ...input,
      actionNode: "FLOP_FACING_BET",
      heroHand: "AA",
    });
    const implicitCbetResult = resolver({
      ...input,
      heroHand: "AA",
    });

    // AA is an overpair in the VALUE lane facing a bet; its own action is RAISE.
    // The recommendation follows the hero bucket, not the rule-wide CALL.
    expect(facingResult?.action).toBe("RAISE");
    expect(facingResult?.source?.kind).toBe("STRATEGY_PACK");
    if (facingResult?.source?.kind === "STRATEGY_PACK") {
      expect(facingResult.source.ruleId).toBe("flop-production-facing-bet-btn-bb-dry-call");
      expect(facingResult.source.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        action: "RAISE",
        handClass: "AA",
      });
    }
    expect(implicitCbetResult?.action).toBe("BET_BIG");
  });

  it("bez validniho production packu zustane public heuristic fallback", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [productionPack("LOW")],
      [flopSingleRaisedPrototypeStrategyPack],
    );
    const fallbackOnly = createDefaultPostflopStrategyResolver();
    const result = resolver(input);
    const defaultResult = fallbackOnly(input);

    expect(result?.action).toBe("BET_SMALL");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    expect(defaultResult?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe(flopSingleRaisedPrototypeStrategyPack.id);
    }
    if (defaultResult?.source?.kind === "STRATEGY_PACK") {
      expect(defaultResult.source.packId).toBe(flopSingleRaisedPrototypeStrategyPack.id);
    }
  });

  it("3bet pot bez production packu nepouzije SRP heuristic a spadne na generator fallback", () => {
    const resolver = createDefaultPostflopStrategyResolver();
    const threeBetInput = {
      street: "FLOP" as const,
      textures: ["dry", "rainbow"] as const,
      potType: "THREE_BET_POT" as const,
      potBB: 18,
      effectiveStackBB: 40,
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR" as const,
    };

    expect(resolver(threeBetInput)).toBeNull();

    const spot = generatePostflopSpot({
      seed: 91,
      street: "FLOP",
      potType: "THREE_BET_POT",
      potBB: 18,
      effectiveStackBB: 40,
      positionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "HJ",
        callerPosition: "LJ",
        inPosition: false,
        callerType: "OUT_OF_POSITION_CALLER",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      },
      strategyResolver: resolver,
    });

    expect(spot.potType).toBe("THREE_BET_POT");
    expect(spot.positionPattern).toBe("OOP_CALLER_VS_IP_3BETTOR");
    expect(spot.strategySource).toEqual({
      kind: "FALLBACK",
      ruleId: "postflop-generator-heuristic",
    });
  });
});
