import { describe, expect, it } from "vitest";

import {
  POSTFLOP_POSITION_CONTEXTS,
  classifyBoard,
  generatePostflopSpot,
  recommendPostflopAction,
} from "../../src/core/postflopGenerator";
import type { Card } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "d" },
];

describe("postflopGenerator", () => {
  it("generuje deterministicky board bez kolize s kartami hrdiny", () => {
    const a = generatePostflopSpot({ seed: 42, street: "RIVER", heroCards });
    const b = generatePostflopSpot({ seed: 42, street: "RIVER", heroCards });

    expect(a).toEqual(b);
    expect(a.board).toHaveLength(5);
    const labels = [...a.heroCards, ...a.board].map((card) => `${card.rank}${card.suit}`);
    expect(new Set(labels).size).toBe(labels.length);
    expect(a.actions).toEqual(["CHECK", "BET_SMALL", "BET_BIG"]);
    expect(a.recommendedAction).toMatch(/^(CHECK|BET_SMALL|BET_BIG)$/);
    expect(a.explanation.length).toBeGreaterThan(0);
    expect(a.positionPattern)
      .toMatch(/^(EP_VS_BB|BTN_VS_BB|SB_VS_BB|OOP_RAISER_VS_IP_CALLER|OOP_CALLER_VS_IP_3BETTOR)$/);
  });

  it("klasifikuje zakladni textury boardu", () => {
    expect(classifyBoard([
      { rank: "A", suit: "s" },
      { rank: "A", suit: "h" },
      { rank: "7", suit: "d" },
    ])).toContain("paired");

    expect(classifyBoard([
      { rank: "A", suit: "s" },
      { rank: "K", suit: "s" },
      { rank: "Q", suit: "s" },
    ])).toEqual(expect.arrayContaining(["monotone", "connected"]));

    expect(classifyBoard([
      { rank: "A", suit: "s" },
      { rank: "7", suit: "h" },
      { rank: "2", suit: "d" },
    ])).toEqual(expect.arrayContaining(["rainbow", "dry", "ace-high", "disconnected"]));
  });

  it("klasifikuje rozsirene flop textury pro verejne heuristiky", () => {
    expect(classifyBoard([
      { rank: "K", suit: "s" },
      { rank: "8", suit: "h" },
      { rank: "3", suit: "d" },
    ])).toEqual(expect.arrayContaining(["broadway-high", "disconnected", "dry"]));

    expect(classifyBoard([
      { rank: "9", suit: "s" },
      { rank: "8", suit: "s" },
      { rank: "7", suit: "h" },
    ])).toEqual(expect.arrayContaining([
      "medium",
      "connected",
      "straight-possible",
      "flush-draw-heavy",
    ]));

    expect(classifyBoard([
      { rank: "J", suit: "s" },
      { rank: "T", suit: "s" },
      { rank: "8", suit: "h" },
    ])).toEqual(expect.arrayContaining([
      "broadway-high",
      "connected",
      "straight-possible",
      "flush-draw-heavy",
    ]));

    expect(classifyBoard([
      { rank: "6", suit: "s" },
      { rank: "6", suit: "h" },
      { rank: "5", suit: "d" },
    ])).toEqual(expect.arrayContaining(["paired", "low", "disconnected"]));

    expect(classifyBoard([
      { rank: "A", suit: "s" },
      { rank: "K", suit: "s" },
      { rank: "Q", suit: "s" },
    ])).toEqual(expect.arrayContaining([
      "monotone",
      "flush-draw-heavy",
      "ace-high",
      "straight-possible",
    ]));
  });

  it("doporucuje akci podle zakladni textury a streetu", () => {
    expect(recommendPostflopAction("FLOP", ["monotone", "connected"]).action)
      .toBe("CHECK");
    expect(recommendPostflopAction("FLOP", ["dry", "rainbow"]).action)
      .toBe("BET_SMALL");
    expect(recommendPostflopAction("RIVER", ["dry", "rainbow"]).action)
      .toBe("BET_BIG");
  });

  it("umi pouzit externi strategy resolver a jinak zachova fallback", () => {
    let resolverPositionPattern = "";
    const fromResolver = generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards,
      positionContext: POSTFLOP_POSITION_CONTEXTS[1],
      strategyResolver: (input) => {
        resolverPositionPattern = input.positionPattern;
        expect(input.potType).toBe("SINGLE_RAISED");
        return {
          action: "CHECK",
          explanation: "Resolver rozhodl.",
          source: {
            kind: "STRATEGY_PACK",
            packId: "test-pack",
            packVersion: "test-v1",
            packVerifiedAt: "2026-06-02",
            ruleId: "test-rule",
            confidence: "LOW",
            matchedTextures: ["dry"],
            sprMin: 2,
            sprMax: 12,
            positionPattern: "BTN_VS_BB",
            sourceUrls: ["https://example.test/postflop"],
            assumptions: ["Test assumption"],
            selectionScore: 99,
            tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
          },
        };
      },
    });
    const fromFallback = generatePostflopSpot({
      seed: 42,
      street: "RIVER",
      heroCards,
      strategyResolver: () => null,
    });

    expect(fromResolver.recommendedAction).toBe("CHECK");
    expect(fromResolver.explanation).toBe("Resolver rozhodl.");
    expect(resolverPositionPattern).toBe("BTN_VS_BB");
    expect(fromResolver).toMatchObject({
      heroPosition: "BTN",
      villainPosition: "BB",
      aggressorPosition: "BTN",
      callerPosition: "BB",
      inPosition: true,
      callerType: "BIG_BLIND",
      positionPattern: "BTN_VS_BB",
    });
    expect(fromResolver.strategySource).toEqual({
      kind: "STRATEGY_PACK",
      packId: "test-pack",
      packVersion: "test-v1",
      packVerifiedAt: "2026-06-02",
      ruleId: "test-rule",
      confidence: "LOW",
      matchedTextures: ["dry"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "BTN_VS_BB",
      sourceUrls: ["https://example.test/postflop"],
      assumptions: ["Test assumption"],
      selectionScore: 99,
      tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
    });
    expect(fromFallback.recommendedAction).toBe(
      recommendPostflopAction(fromFallback.street, fromFallback.textures).action,
    );
    expect(fromFallback.strategySource).toEqual({
      kind: "FALLBACK",
      ruleId: "postflop-generator-heuristic",
    });
  });
});
