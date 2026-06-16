import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
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
        priorFlopAction: "BET_SMALL",
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

  it("vyzaduje shodu prior flop action a turn card class", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());

    expect(resolver({ ...input, priorFlopAction: "CHECK" })).toBeNull();
    expect(resolver({ ...input, turnCardClass: "OVER_CARD" })).toBeNull();
  });

  it("matchuje turn facing-bet jen pri explicitnim action nodu", () => {
    const resolver = createTurnProductionStrategyResolver(productionPack());

    expect(resolver(input)?.action).toBe("BET_SMALL");
    expect(resolver({ ...input, actionNode: "TURN_FACING_BET" })?.action).toBe("CALL");
    expect(resolver({ ...input, actionNode: "TURN_FACING_BET" })?.source).toMatchObject({
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
