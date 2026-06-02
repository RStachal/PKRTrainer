import { describe, expect, it } from "vitest";

import {
  POSTFLOP_STRATEGY_ACTIONS,
  flopSingleRaisedPrototypeStrategyPack,
  matchingPostflopRules,
  positionPatternMatches,
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
    expect(flopSingleRaisedPrototypeStrategyPack.id)
      .toBe("mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1");
    expect(flopSingleRaisedPrototypeStrategyPack.sourceEvidence.length).toBeGreaterThanOrEqual(2);
    expect(flopSingleRaisedPrototypeStrategyPack.sourceEvidence.map((source) => source.operator))
      .toEqual(expect.arrayContaining(["GTO Wizard", "Upswing Poker"]));
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
      positionPattern: "BTN_VS_BB",
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
      positionPattern: "BTN_VS_BB",
    });
    const dynamic = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["connected", "two-tone"],
      spr: 5,
      positionPattern: "OOP_RAISER_VS_IP_CALLER",
    });
    const paired = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["paired", "rainbow"],
      spr: 5,
    });
    const monotone = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["monotone"],
      spr: 5,
    });
    const aceHigh = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["ace-high", "disconnected", "dry", "rainbow"],
      spr: 5,
    });
    const drawHeavy = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["straight-possible", "flush-draw-heavy", "connected", "two-tone"],
      spr: 5,
    });

    expect(dry.map((rule) => rule.preferredAction)).toEqual(["BET_SMALL"]);
    expect(dynamic.map((rule) => rule.preferredAction)).toEqual(["CHECK"]);
    expect(paired.map((rule) => rule.id)).toContain("flop-srp-paired-small-cbet");
    expect(monotone.map((rule) => rule.id)).toContain("flop-srp-monotone-check");
    expect(aceHigh.map((rule) => rule.id))
      .toContain("flop-srp-ace-high-disconnected-small-cbet");
    expect(drawHeavy.map((rule) => rule.id))
      .toContain("flop-srp-straight-flush-draw-heavy-check");
  });

  it("filtruje pravidla podle postflop pozicniho patternu", () => {
    expect(positionPatternMatches("IP_OR_RANGE_ADVANTAGE", "BTN_VS_BB"))
      .toBe(true);
    expect(positionPatternMatches("IP_OR_RANGE_ADVANTAGE", "SB_VS_BB"))
      .toBe(false);
    expect(positionPatternMatches("OOP_OR_DYNAMIC_BOARD", "OOP_RAISER_VS_IP_CALLER"))
      .toBe(true);
    expect(positionPatternMatches("EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE", "BTN_VS_BB"))
      .toBe(false);

    const sbDry = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["dry", "rainbow"],
      spr: 5,
      positionPattern: "SB_VS_BB",
    });

    expect(sbDry).toEqual([]);
  });
});
