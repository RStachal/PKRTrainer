import { describe, expect, it } from "vitest";

import {
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
    ])).toEqual(expect.arrayContaining(["rainbow", "dry"]));
  });

  it("doporucuje akci podle zakladni textury a streetu", () => {
    expect(recommendPostflopAction("FLOP", ["monotone", "connected"]).action)
      .toBe("CHECK");
    expect(recommendPostflopAction("FLOP", ["dry", "rainbow"]).action)
      .toBe("BET_SMALL");
    expect(recommendPostflopAction("RIVER", ["dry", "rainbow"]).action)
      .toBe("BET_BIG");
  });
});
