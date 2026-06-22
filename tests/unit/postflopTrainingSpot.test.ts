import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  postflopTrainingSpotId,
} from "../../src/core/postflopTrainingSpot";
import type { Card } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "d" },
];

describe("postflopTrainingSpot", () => {
  it("prevadi dnesni prototyp na typovany PostflopTrainingSpot", () => {
    const spot = generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards,
      potBB: 8,
      effectiveStackBB: 40,
      positionContext: {
        heroPosition: "HJ",
        villainPosition: "BTN",
        aggressorPosition: "HJ",
        callerPosition: "BTN",
        inPosition: false,
        callerType: "IN_POSITION_CALLER",
        positionPattern: "OOP_RAISER_VS_IP_CALLER",
      },
    });
    const trainingSpot = postflopSpotToTrainingSpot(spot);

    expect(trainingSpot).toMatchObject({
      id: postflopTrainingSpotId(spot),
      seed: 42,
      street: "FLOP",
      actionNode: "SINGLE_RAISED_POT_CBET",
      potType: "SINGLE_RAISED",
      potBB: 8,
      effectiveStackBB: 40,
      spr: 5,
      heroPosition: "HJ",
      villainPosition: "BTN",
      aggressorPosition: "HJ",
      callerPosition: "BTN",
      inPosition: false,
      callerType: "IN_POSITION_CALLER",
      positionPattern: "OOP_RAISER_VS_IP_CALLER",
      recommendedAction: spot.recommendedAction,
    });
    expect(trainingSpot.actions.map((action) => action.action)).toEqual([
      "CHECK",
      "BET_SMALL",
      "BET_BIG",
    ]);
    expect(trainingSpot.explanation.summary).toBe(spot.explanation);
    expect(trainingSpot.explanation.nextStreetPlan.length).toBeGreaterThan(0);
    expect(trainingSpot.explanation.source).toEqual({
      kind: "FALLBACK",
      ruleId: "postflop-generator-heuristic",
    });
  });

  it("oddeli street, action node, sizing a explanation pro turn a river", () => {
    const turn = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 7,
      street: "TURN",
      heroCards,
    }));
    const river = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 7,
      street: "RIVER",
      heroCards,
    }));

    expect(turn.actionNode).toBe("TURN_BARREL");
    expect(river.actionNode).toBe("RIVER_PRESSURE");
    expect(turn.actions.every((action) => action.sizing === action.action)).toBe(true);
    expect(river.explanation).toHaveProperty("valueHands");
    expect(river.explanation).toHaveProperty("bluffHands");
    expect(river.explanation).toHaveProperty("checkHands");
  });

  it("oznaci flop proti 3betu samostatnym action nodem a pot typem", () => {
    const trainingSpot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 1788246284,
      street: "FLOP",
      heroCards,
      potType: "THREE_BET_POT",
      positionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "HJ",
        callerPosition: "LJ",
        inPosition: false,
        callerType: "OUT_OF_POSITION_CALLER",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      },
    }));

    expect(trainingSpot.actionNode).toBe("THREE_BET_POT_CBET");
    expect(trainingSpot.potType).toBe("THREE_BET_POT");
    expect(trainingSpot.potBB).toBe(18);
    expect(trainingSpot.spr).toBe(2.2);
    expect(trainingSpot.explanation.valueHands).toContain("overpairy s pot-control");
    expect(trainingSpot.explanation.bluffHands).toContain("A-high backdoor blockery");
    expect(trainingSpot.explanation.checkHands).toContain("underpairy bez backdoorů");
    expect(trainingSpot.explanation.valueHands).not.toContain("range advantage hands");
  });

  it("zachova facing-bet action node a fold/call/raise moznosti", () => {
    const trainingSpot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "RIVER",
      heroCards,
      actionNode: "RIVER_FACING_BET",
      board: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
        { rank: "4", suit: "h" },
        { rank: "Q", suit: "s" },
      ],
    }));

    expect(trainingSpot.actionNode).toBe("RIVER_FACING_BET");
    expect(trainingSpot.actions.map((action) => action.action)).toEqual(["FOLD", "CALL", "RAISE"]);
    expect(trainingSpot.actions.map((action) => action.label)).toEqual(["Fold", "Call", "Raise"]);
    expect(trainingSpot.explanation.nextStreetPlan).toContain("River je poslední street");
  });
});
