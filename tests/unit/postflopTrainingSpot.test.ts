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
});
