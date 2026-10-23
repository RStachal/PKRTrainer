import { describe, expect, it } from "vitest";

import {
  defaultPostflopOpponentPolicy,
  generatePostflopLine,
  postflopStateChipTotal,
  transitionPostflopLineState,
} from "../../src/core/postflopLineSimulator";
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
    expect(a.terminalReason).toBe("SHOWDOWN");
    expect(a.finalState).toMatchObject({
      street: "RIVER",
      terminal: true,
      terminalReason: "SHOWDOWN",
    });
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
    expect(line.terminalReason).toBe("HERO_FOLD");
  });

  it("definuje street transition kontrakt pro pressure a facing-bet vetve", () => {
    const checkLine = generatePostflopLine({
      seed: 34,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      chosenActionsByStreet: { FLOP: "CHECK" },
    });
    const checkTransition = transitionPostflopLineState({
      street: "FLOP",
      potType: checkLine.streets[0].spot.potType,
      action: checkLine.actionHistory[0],
    });

    expect(checkTransition).toMatchObject({
      nextStreet: "TURN",
      nextActionNode: "TURN_BARREL",
      priorFlopAction: "CHECK",
      potBB: 6,
      effectiveStackBB: 40,
    });

    const callLine = generatePostflopLine({
      seed: 35,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      actionNode: "FLOP_FACING_BET",
      chosenActionsByStreet: { FLOP: "CALL", TURN: "CALL" },
    });
    const flopCallTransition = transitionPostflopLineState({
      street: "FLOP",
      potType: callLine.streets[0].spot.potType,
      action: callLine.actionHistory[0],
    });
    const turnCallTransition = transitionPostflopLineState({
      street: "TURN",
      potType: callLine.streets[1].spot.potType,
      action: callLine.actionHistory[1],
      priorFlopAction: flopCallTransition.priorFlopAction,
    });

    expect(flopCallTransition).toMatchObject({
      nextStreet: "TURN",
      nextActionNode: "TURN_FACING_BET",
      priorFlopAction: "CALL",
    });
    expect(turnCallTransition).toMatchObject({
      nextStreet: "RIVER",
      nextActionNode: "RIVER_FACING_BET",
      priorFlopAction: "CALL",
      priorTurnAction: "CALL",
    });

    const foldTransition = transitionPostflopLineState({
      street: "TURN",
      potType: callLine.streets[1].spot.potType,
      action: {
        ...callLine.actionHistory[1],
        action: "FOLD",
        terminal: true,
      },
      priorFlopAction: "CALL",
    });

    expect(foldTransition).toMatchObject({
      nextStreet: undefined,
      nextActionNode: undefined,
      terminalReason: "HERO_FOLD",
      priorTurnAction: "FOLD",
    });
  });

  it("modeluje obe kontribuce, amount-to-call a zachovava chipy", () => {
    const line = generatePostflopLine({
      seed: 36,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      actionNode: "FLOP_FACING_BET",
      chosenActionsByStreet: { FLOP: "RAISE", TURN: "CHECK", RIVER: "CHECK" },
    });
    const raise = line.actionHistory[0];

    expect(raise).toMatchObject({
      action: "RAISE",
      amountToCallBB: 3,
      opponentResponse: "CALL",
      heroContributionBB: 9.8,
      villainContributionBB: 9.8,
      potBBBefore: 6,
      potBBAfter: 25.6,
      effectiveStackBBAfter: 30.2,
    });
    expect(raise.stateBefore).toMatchObject({
      heroStackBB: 40,
      villainStackBB: 40,
      outstandingBetBB: 0,
    });
    expect(raise.stateAfter).toMatchObject({
      heroStackBB: 30.2,
      villainStackBB: 30.2,
      outstandingBetBB: 0,
      heroStreetContributionBB: 0,
      villainStreetContributionBB: 0,
    });
    expect(postflopStateChipTotal(line.initialState)).toBe(86);
    expect(postflopStateChipTotal(raise.stateAfter!)).toBe(86);
    expect(postflopStateChipTotal(line.finalState)).toBe(86);
  });

  it("pouziva explicitni opponent policy a ukonci bet-fold bez implicitniho callu", () => {
    const policyCalls: string[] = [];
    const line = generatePostflopLine({
      seed: 37,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      chosenActionsByStreet: { FLOP: "BET_SMALL" },
      opponentPolicy: (input) => {
        policyCalls.push(`${input.street}|${input.heroAction}|${input.defaultResponse}`);
        return input.heroAction === "BET_SMALL"
          ? "FOLD"
          : defaultPostflopOpponentPolicy(input);
      },
    });

    expect(policyCalls).toEqual(["FLOP|BET_SMALL|CALL"]);
    expect(line.actionHistory).toHaveLength(1);
    expect(line.actionHistory[0]).toMatchObject({
      heroContributionBB: 2,
      villainContributionBB: 0,
      opponentResponse: "FOLD",
      potBBAfter: 8,
      effectiveStackBBAfter: 38,
      terminal: true,
    });
    expect(line.terminalReason).toBe("OPPONENT_FOLD");
    expect(postflopStateChipTotal(line.finalState)).toBe(86);
  });

  it("drzi nezaporne stacky a chip conservation napric sizingy a stacky", () => {
    for (const effectiveStackBB of [1, 3, 10, 40, 150]) {
      for (const action of ["CHECK", "BET_SMALL", "BET_BIG"] as const) {
        const line = generatePostflopLine({
          seed: effectiveStackBB,
          heroCards,
          board,
          potBB: 6,
          effectiveStackBB,
          chosenActionsByStreet: { FLOP: action },
        });
        const initialTotal = postflopStateChipTotal(line.initialState);
        for (const history of line.actionHistory) {
          expect(history.stateAfter!.heroStackBB).toBeGreaterThanOrEqual(0);
          expect(history.stateAfter!.villainStackBB).toBeGreaterThanOrEqual(0);
          expect(history.stateAfter!.potBB).toBeGreaterThanOrEqual(0);
          expect(postflopStateChipTotal(history.stateAfter!)).toBe(initialTotal);
        }
      }
    }
  });

  it("modeluje check-bet-raise-call jako atomickou street sekvenci", () => {
    const line = generatePostflopLine({
      seed: 38,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      chosenActionsByStreet: { FLOP: "CHECK" },
      opponentPolicy: (input) => (
        input.decisionPoint === "AFTER_HERO_CHECK" ? "BET_SMALL" : "CALL"
      ),
      heroResponsePolicy: (input) => (
        input.legalActions.includes("RAISE") ? "RAISE" : "CALL"
      ),
    });
    const flop = line.actionHistory[0];

    expect(flop.opponentResponse).toBe("BET_SMALL");
    expect(flop.sequence).toEqual([
      expect.objectContaining({ actor: "HERO", action: "CHECK", amountBB: 0 }),
      expect.objectContaining({
        actor: "VILLAIN",
        action: "BET_SMALL",
        amountBB: 2,
        fullRaise: true,
      }),
      expect.objectContaining({
        actor: "HERO",
        action: "RAISE",
        amountBB: 8,
        bettingReopened: true,
      }),
      expect.objectContaining({ actor: "VILLAIN", action: "CALL", amountBB: 6 }),
    ]);
    expect(flop).toMatchObject({
      potBBAfter: 22,
      heroContributionBB: 8,
      villainContributionBB: 8,
      effectiveStackBBAfter: 32,
      terminal: false,
    });
    expect(postflopStateChipTotal(flop.stateAfter!)).toBe(86);
  });

  it("modeluje bet-raise-fold a zachova vsechny vlozene chipy", () => {
    const line = generatePostflopLine({
      seed: 39,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      chosenActionsByStreet: { FLOP: "BET_SMALL" },
      opponentPolicy: (input) => (
        input.decisionPoint === "FACING_HERO_BET" ? "RAISE" : "CALL"
      ),
      heroResponsePolicy: () => "FOLD",
    });
    const flop = line.actionHistory[0];

    expect(flop.sequence?.map(({ actor, action }) => `${actor}:${action}`)).toEqual([
      "HERO:BET_SMALL",
      "VILLAIN:RAISE",
      "HERO:FOLD",
    ]);
    expect(flop).toMatchObject({
      opponentResponse: "RAISE",
      potBBAfter: 16,
      heroContributionBB: 2,
      villainContributionBB: 8,
      terminal: true,
    });
    expect(line.terminalReason).toBe("HERO_FOLD");
    expect(postflopStateChipTotal(line.finalState)).toBe(86);
  });

  it("kratky all-in nereopenne betting a nelegalni re-raise se zmeni na call", () => {
    const heroPolicyLegalActions: string[][] = [];
    const line = generatePostflopLine({
      seed: 40,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 3,
      chosenActionsByStreet: { FLOP: "BET_SMALL" },
      opponentPolicy: () => "ALL_IN",
      heroResponsePolicy: (input) => {
        heroPolicyLegalActions.push([...input.legalActions]);
        return "RAISE";
      },
    });
    const flop = line.actionHistory[0];

    expect(heroPolicyLegalActions).toEqual([["FOLD", "CALL"]]);
    expect(flop.sequence).toEqual([
      expect.objectContaining({
        actor: "HERO",
        action: "BET_SMALL",
        amountBB: 2,
        fullRaise: true,
      }),
      expect.objectContaining({
        actor: "VILLAIN",
        action: "ALL_IN",
        amountBB: 3,
        fullRaise: false,
        bettingReopened: false,
      }),
      expect.objectContaining({
        actor: "HERO",
        action: "CALL",
        amountBB: 1,
      }),
    ]);
    expect(flop).toMatchObject({
      potBBAfter: 12,
      effectiveStackBBAfter: 0,
      terminal: true,
    });
    expect(line.terminalReason).toBe("STACK_EXHAUSTED");
    expect(postflopStateChipTotal(line.finalState)).toBe(12);
  });

  it("prevezme explicitni opponent policy z resolver StrategyPack vetve", () => {
    const resolver: PostflopStrategyResolver = () => ({
      action: "BET_SMALL",
      explanation: "Resolver policy fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "fixture-pack",
        packVersion: "1",
        packVerifiedAt: "2026-06-19",
        ruleId: "fixture-rule",
        confidence: "HIGH",
        matchedTextures: ["dry"],
        sprMin: 0,
        sprMax: 20,
        positionPattern: "IP_OR_RANGE_ADVANTAGE",
        sourceUrls: [],
        assumptions: [],
        selectionScore: 1,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        opponentPolicy: {
          afterHeroCheck: "CHECK",
          facingHeroBet: "RAISE",
          facingHeroRaise: "CALL",
        },
      },
    });
    const line = generatePostflopLine({
      seed: 41,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 40,
      strategyResolver: resolver,
      chosenActionsByStreet: { FLOP: "BET_SMALL" },
    });

    expect(line.actionHistory[0].sequence?.map(({ actor, action }) => `${actor}:${action}`)).toEqual([
      "HERO:BET_SMALL",
      "VILLAIN:RAISE",
      "HERO:CALL",
    ]);
    expect(line.actionHistory[0].opponentResponse).toBe("RAISE");
  });
});
