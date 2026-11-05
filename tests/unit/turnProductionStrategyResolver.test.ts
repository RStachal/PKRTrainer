import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { gradePostflopAction } from "../../src/core/postflopScoring";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  createTurnProductionStrategyResolver,
} from "../../src/data/ranges/turnProductionStrategyResolver";
import type { TurnProductionStrategyPack } from "../../src/data/ranges/turnProductionStrategyPack";
import {
  turnSingleRaisedPrototypeStrategyPack,
  type PostflopStrategySourceEvidence,
} from "../../src/data/ranges/postflopStrategyPack";
import {
  createPostflopStrategyResolverWithProductionFallback,
} from "../../src/data/ranges/postflopStrategyRegistry";

const sourceEvidence: PostflopStrategySourceEvidence[] = [
  {
    url: "https://example.test/owned-turn-production",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Solver",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "TURN",
    evModel: "CHIP_EV",
    methodology: "Owned production fixture.",
    licenseNote: "Owned export; redistribution inside this project is permitted.",
  },
  {
    url: "https://example.test/owned-turn-review",
    verifiedAt: "2026-06-11",
    operator: "PKRTrainer Review",
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "TURN",
    evModel: "CHIP_EV",
    methodology: "Independent fixture review.",
    licenseNote: "Review metadata only.",
  },
];

function productionPack(confidence: "LOW" | "MEDIUM" = "MEDIUM"): TurnProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-turn-srp-production-test-v1",
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
      street: "TURN",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence,
    assumptions: ["Production turn resolver fixture."],
    rules: [
      {
        id: "turn-production-btn-bb-low-brick-small-barrel",
        actionNode: "TURN_BARREL",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorFlopAction: "BET_SMALL",
        turnCardClasses: ["LOW_BRICK"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_SMALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "thin value",
            action: "BET_SMALL",
            handClasses: ["AA"],
            features: ["overpair"],
            actionMix: [
              { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
              { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
            ],
          },
          {
            lane: "BLUFF",
            label: "barrel bluff",
            action: "BET_SMALL",
            handClasses: ["QJs"],
            features: ["backdoor draw continued"],
          },
          {
            lane: "CHECK",
            label: "give up",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Production fixture uses a small barrel on this low-brick BTN vs BB turn.",
      },
      {
        id: "turn-production-btn-bb-low-brick-facing-bet-call",
        actionNode: "TURN_FACING_BET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorFlopAction: "CALL",
        turnCardClasses: ["LOW_BRICK"],
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
            features: ["draw with blockers"],
          },
          {
            lane: "CHECK",
            label: "fold lane",
            action: "FOLD",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Production fixture calls when facing a turn bet in this low-brick BTN vs BB spot.",
      },
    ],
  };
}

const input = {
  street: "TURN" as const,
  textures: ["dry", "disconnected", "ace-high"] as const,
  potType: "SINGLE_RAISED" as const,
  potBB: 6,
  effectiveStackBB: 40,
  positionPattern: "BTN_VS_BB" as const,
  priorFlopAction: "BET_SMALL" as const,
  turnCardClass: "LOW_BRICK" as const,
};

describe("turnProductionStrategyResolver", () => {
  it("prevede validni production turn rule na postflop doporuceni", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());
    const result = resolver({ ...input, heroHand: "AA" });

    expect(result?.action).toBe("BET_SMALL");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-turn-srp-production-test-v1");
      expect(result.source.ruleId).toBe("turn-production-btn-bb-low-brick-small-barrel");
      expect(result.source.confidence).toBe("MEDIUM");
      expect(result.source.matchedTextures).toEqual(["dry", "disconnected", "ace-high"]);
      expect(result.source.heroRangeBucket).toMatchObject({
        lane: "VALUE",
        label: "thin value",
        action: "BET_SMALL",
        handClass: "AA",
      });
      expect(result.source.heroRangeBucket?.actionMix).toEqual([
        { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
        { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
      ]);
    }
  });

  it("doporuci akci konkretniho hero bucketu, ne rule-wide akci, kdyz chybi action EV", () => {
    // The same defect that was fixed on the flop resolver: the rule barrels
    // BET_SMALL overall, but 72o sits in the CHECK lane and this pack carries no
    // action EV. The player holding 72o must be told to CHECK, not graded against
    // the rule-wide action. Turn content does not exist yet, so this locks the
    // fix before any is added.
    const resolver = createTurnProductionStrategyResolver(productionPack());

    const checkHand = resolver({ ...input, heroHand: "72o" });
    expect(checkHand?.action).toBe("CHECK");
    expect(checkHand?.source?.kind).toBe("STRATEGY_PACK");
    if (checkHand?.source?.kind === "STRATEGY_PACK") {
      expect(checkHand.source.heroRangeBucket).toMatchObject({ lane: "CHECK", action: "CHECK", handClass: "72o" });
    }

    // A bluff hand in the same rule barrels; its bucket action still leads.
    expect(resolver({ ...input, heroHand: "QJs" })?.action).toBe("BET_SMALL");

    // A hand outside the range was never solved here, so the pack refuses rather
    // than passing off a rule-wide average as a solver result.
    expect(resolver({ ...input, heroHand: "K3o" })).toBeNull();

    // Without a hero hand the caller asks about the rule itself, so the rule-wide
    // action is the right answer.
    expect(resolver({ ...input })?.action).toBe("BET_SMALL");
  });

  it("hodnoti hrace podle akce jeho ruky, ne podle rule-wide akce", () => {
    // 72o is a check-lane air hand on this low-brick turn: checking must grade
    // correct even though the rule's most-common action is BET_SMALL.
    const spot = generatePostflopSpot({
      seed: 11,
      street: "TURN",
      board: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
        { rank: "4", suit: "h" },
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
      strategyResolver: createTurnProductionStrategyResolver(productionPack()),
    });

    expect(spot.recommendedAction).toBe("CHECK");
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "CHECK").correct).toBe(true);
    expect(gradePostflopAction(postflopSpotToTrainingSpot(spot), "BET_SMALL").correct).toBe(false);
  });

  it("rozdava hrdinu z range, kterou pack skutecne resil", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());
    const packHands = new Set(
      productionPack().rules.flatMap((rule) => rule.rangeBuckets.flatMap((bucket) => bucket.handClasses)),
    );

    let withBucket = 0;
    const spots = 60;
    for (let seed = 1; seed <= spots; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "TURN",
        potType: "SINGLE_RAISED",
        potBB: 6,
        effectiveStackBB: 40,
        board: [
          { rank: "A", suit: "s" },
          { rank: "7", suit: "d" },
          { rank: "2", suit: "c" },
          { rank: "4", suit: "h" },
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

  it("vyzaduje shodu prior flop action a turn card class", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());

    expect(resolver({ ...input, priorFlopAction: "CHECK" })).toBeNull();
    expect(resolver({ ...input, turnCardClass: "OVER_CARD" })).toBeNull();
  });

  it("matchuje turn facing-bet jen pri explicitnim action nodu", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());

    expect(resolver(input)?.action).toBe("BET_SMALL");
    expect(resolver({ ...input, priorFlopAction: "CALL", actionNode: "TURN_FACING_BET" })?.action).toBe("CALL");
    expect(
      resolver({ ...input, priorFlopAction: "CALL", actionNode: "TURN_FACING_BET" })?.source,
    ).toMatchObject({
      kind: "STRATEGY_PACK",
      ruleId: "turn-production-btn-bb-low-brick-facing-bet-call",
    });
  });

  it("production fallback registry preferuje turn production pack pred public heuristic packem", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [],
      [turnSingleRaisedPrototypeStrategyPack],
      [productionPack()],
    );
    const result = resolver(input);

    expect(result?.action).toBe("BET_SMALL");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe("mtt-full-ring-9-turn-srp-production-test-v1");
    }
  });

  it("bez validniho production packu zustane public heuristic fallback", () => {
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [],
      [turnSingleRaisedPrototypeStrategyPack],
      [productionPack("LOW")],
    );
    const result = resolver(input);

    expect(result?.action).toBe("BET_BIG");
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.packId).toBe(turnSingleRaisedPrototypeStrategyPack.id);
    }
  });

  it("single-street turn generator doplni default prior flop action a turn card class", () => {
    const spot = generatePostflopSpot({
      seed: 77,
      street: "TURN",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "A", suit: "d" },
      ],
      board: [
        { rank: "A", suit: "h" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
        { rank: "4", suit: "s" },
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
      strategyResolver: createTurnProductionStrategyResolver(productionPack()),
    });

    expect(spot.recommendedAction).toBe("BET_SMALL");
    expect(spot.strategySource.kind).toBe("STRATEGY_PACK");
  });
});
