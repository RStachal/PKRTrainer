import { describe, expect, it } from "vitest";

import {
  POSTFLOP_STRATEGY_ACTIONS,
  flopSingleRaisedPrototypeStrategyPack,
  matchingPostflopRules,
  validatePostflopStrategyPack,
  validatePostflopStrategyRule,
} from "../../src/data/ranges/postflopStrategyPack";

describe("postflopStrategyPack", () => {
  it("definuje flop StrategyPack pro budouci postflop ranges", () => {
    expect(POSTFLOP_STRATEGY_ACTIONS).toEqual([
      "CHECK",
      "BET_SMALL",
      "BET_BIG",
      "RAISE",
      "CALL",
      "FOLD",
    ]);
    expect(validatePostflopStrategyPack(flopSingleRaisedPrototypeStrategyPack))
      .toEqual([]);
    expect(flopSingleRaisedPrototypeStrategyPack.dimensions).toEqual({
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      street: "FLOP",
      evModel: "CHIP_EV",
      potType: "SINGLE_RAISED",
    });
  });

  it("validuje pravidla vcetne preferredAction a SPR", () => {
    expect(validatePostflopStrategyRule({
      id: "broken",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["dry"],
      sprMin: 10,
      sprMax: 2,
      positionPattern: "TEST",
      actions: ["CHECK"],
      preferredAction: "BET_BIG",
      explanation: "",
    })).toEqual([
      "broken: preferredAction must be present in actions.",
      "broken: SPR bounds are invalid.",
      "broken: explanation is required.",
    ]);
  });

  it("najde pravidla podle action node, textury a SPR", () => {
    const dry = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["dry", "rainbow"],
      spr: 5,
    });
    const dynamic = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["connected", "two-tone"],
      spr: 5,
    });

    expect(dry.map((rule) => rule.preferredAction)).toEqual(["BET_SMALL"]);
    expect(dynamic.map((rule) => rule.preferredAction)).toEqual(["CHECK"]);
  });
});
