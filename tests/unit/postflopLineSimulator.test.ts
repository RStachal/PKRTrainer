import { describe, expect, it } from "vitest";

import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import type { PostflopStrategyResolver } from "../../src/core/postflopGenerator";
import type { Card } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "d" },
];

const board: [Card, Card, Card, Card, Card] = [
  { rank: "A", suit: "h" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "c" },
  { rank: "4", suit: "s" },
  { rank: "Q", suit: "h" },
];

describe("postflopLineSimulator", () => {
  it("generuje deterministickou flop-turn-river line se stejnym runoutem", () => {
    const a = generatePostflopLine({ seed: 42, heroCards, board });
    const b = generatePostflopLine({ seed: 42, heroCards, board });

    expect(a).toEqual(b);
    expect(a.heroCards).toEqual(heroCards);
    expect(a.board).toEqual(board);
    expect(a.streets.map((street) => street.street)).toEqual(["FLOP", "TURN", "RIVER"]);
    expect(a.streets[0].spot.board).toEqual(board.slice(0, 3));
    expect(a.streets[1].spot.board).toEqual(board.slice(0, 4));
    expect(a.streets[2].spot.board).toEqual(board);
    expect(a.actionHistory).toHaveLength(3);
  });

  it("predava flop akci do turn resolveru a posouva pot se stackem", () => {
    const seenPriorFlopActions: unknown[] = [];
    const seenPriorTurnActions: unknown[] = [];
    const resolver: PostflopStrategyResolver = (input) => {
      if (input.street === "FLOP") {
        return { action: "BET_BIG", explanation: "Flop pressure." };
      }
      if (input.street === "TURN") {
        seenPriorFlopActions.push(input.priorFlopAction);
        expect(input.turnCardClass).toBe("LOW_BRICK");
        return input.priorFlopAction === "BET_BIG"
          ? { action: "CHECK", explanation: "Turn slows down." }
          : null;
      }
      seenPriorTurnActions.push(input.priorTurnAction);
      return { action: "BET_SMALL", explanation: "River value." };
    };

    const line = generatePostflopLine({
      seed: 12,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      strategyResolver: resolver,
    });

    expect(seenPriorFlopActions).toEqual(["BET_BIG"]);
    expect(seenPriorTurnActions).toEqual(["CHECK"]);
    expect(line.streets[0].spot.potBB).toBe(6);
    expect(line.actionHistory[0]).toMatchObject({
      street: "FLOP",
      action: "BET_BIG",
      potBBBefore: 6,
      effectiveStackBBBefore: 40,
      potBBAfter: 15,
      effectiveStackBBAfter: 35.5,
    });
    expect(line.streets[1].spot.potBB).toBe(15);
    expect(line.streets[1].spot.effectiveStackBB).toBe(35.5);
    expect(line.streets[2].actionHistory).toHaveLength(2);
  });

  it("vetvi dalsi street podle skutecne zvolene akce a ukonci line po foldu", () => {
    const line = generatePostflopLine({
      seed: 33,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      actionNode: "FLOP_FACING_BET",
      chosenActionsByStreet: {
        FLOP: "CALL",
        TURN: "FOLD",
      },
    });

    expect(line.streets.map((street) => street.street)).toEqual(["FLOP", "TURN"]);
    expect(line.streets[0].spot.actionNode).toBe("FLOP_FACING_BET");
    expect(line.streets[1].spot.actionNode).toBe("TURN_FACING_BET");
    expect(line.streets[1].spot.actions).toEqual(["FOLD", "CALL", "RAISE"]);
    expect(line.actionHistory).toEqual([
      expect.objectContaining({
        street: "FLOP",
        actionNode: "FLOP_FACING_BET",
        action: "CALL",
        source: "CHOSEN",
        potBBBefore: 6,
        potBBAfter: 12,
        effectiveStackBBAfter: 37,
        terminal: false,
      }),
      expect.objectContaining({
        street: "TURN",
        actionNode: "TURN_FACING_BET",
        action: "FOLD",
        source: "CHOSEN",
        terminal: true,
      }),
    ]);
    expect(line.terminalReason).toBe("FOLD");
  });
});
