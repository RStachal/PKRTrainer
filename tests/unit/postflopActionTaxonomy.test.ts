import { describe, expect, it } from "vitest";

import {
  POSTFLOP_ACTIONS,
  type PostflopSpot,
} from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";

describe("postflopActionTaxonomy", () => {
  it("podporuje check, bet sizingy, call, raise a fold v jednom kontraktu", () => {
    expect(POSTFLOP_ACTIONS).toEqual([
      "CHECK",
      "BET_SMALL",
      "BET_BIG",
      "CALL",
      "RAISE",
      "FOLD",
    ]);

    const spot: PostflopSpot = {
      seed: 1,
      street: "TURN",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
      board: [
        { rank: "A", suit: "h" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
        { rank: "Q", suit: "s" },
      ],
      potType: "SINGLE_RAISED",
      potBB: 10,
      effectiveStackBB: 40,
      heroPosition: "BTN",
      villainPosition: "BB",
      aggressorPosition: "BTN",
      callerPosition: "BB",
      inPosition: true,
      callerType: "BIG_BLIND",
      positionPattern: "BTN_VS_BB",
      textures: ["ace-high", "two-tone"],
      actions: POSTFLOP_ACTIONS,
      recommendedAction: "RAISE",
      explanation: "Synthetic facing-bet taxonomy fixture.",
      strategySource: {
        kind: "FALLBACK",
        ruleId: "postflop-generator-heuristic",
      },
    };

    const trainingSpot = postflopSpotToTrainingSpot(spot);

    expect(trainingSpot.actions.map((action) => action.label)).toEqual([
      "Check",
      "Bet small",
      "Bet big",
      "Call",
      "Raise",
      "Fold",
    ]);
    expect(trainingSpot.recommendedAction).toBe("RAISE");
    expect(trainingSpot.explanation.valueHands).toContain("silná value");
    expect(trainingSpot.explanation.bluffHands).toContain("nut blockery");
  });
});
