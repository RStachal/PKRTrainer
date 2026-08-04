import { describe, expect, it } from "vitest";

import { buildPreflopExplanation } from "../../src/core/preflopExplanation";
import type { TableState } from "../../src/core/types";

// The explanation used to name an action and stop. These hold the line that turns
// it into teaching: the price the decision is being offered at.

const table = (over: Partial<TableState> = {}): TableState => ({
  heroPos: "BTN",
  pushFold: true,
  effectiveStackBB: 10,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "ALLIN",
  isBvB: false,
  ...over,
});

describe("the price shown with a preflop decision", () => {
  it("prices a call against an all-in from the spot alone", () => {
    // Villain is in for 10BB into 1.5 of blinds, so the hero calls 10 into 11.5.
    const text = buildPreflopExplanation({
      context: "VS_ALLIN", heroPos: "BTN", effStack: 10, hand: "A5s",
      recommended: ["CALL_JAM"], tableState: table(), startingPotBB: 1.5,
    });
    expect(text).toContain("46,5 %");
    expect(text).toContain("Pot odds");
  });

  it("prices a shove in the folds it needs, which at 10BB is more than anyone gives", () => {
    // Risking 10 to win 1.5 needs 87 percent folds to pay for itself. Nobody folds
    // that often, so the number teaches something real: a short shove is justified
    // by the equity it has when called, not by fold equity alone.
    const text = buildPreflopExplanation({
      context: "PUSH_FOLD", heroPos: "BTN", effStack: 10, hand: "A5s",
      recommended: ["JAM"], tableState: table({ facing: "NONE" }), startingPotBB: 1.5,
    });
    expect(text).toContain("87,0 %");
    expect(text).toContain("foldů");
  });

  it("stays silent where the spot fixes no price", () => {
    // An open has no price until a sizing is chosen, and the drill does not choose
    // one. Showing a number here would be inventing the question.
    const text = buildPreflopExplanation({
      context: "RFI", heroPos: "BTN", effStack: 50, hand: "A5s",
      recommended: ["OPEN_25X"],
      tableState: table({ pushFold: false, effectiveStackBB: 50, facing: "NONE" }),
      startingPotBB: 1.5,
    });
    expect(text).not.toContain("Pot odds");
    expect(text).not.toContain("foldů");
  });

  it("prices the ante-on pot differently, because the pot is different", () => {
    const anteOff = buildPreflopExplanation({
      context: "VS_ALLIN", heroPos: "BTN", effStack: 10, hand: "A5s",
      recommended: ["CALL_JAM"], tableState: table(), startingPotBB: 1.5,
    });
    const anteOn = buildPreflopExplanation({
      context: "VS_ALLIN", heroPos: "BTN", effStack: 10, hand: "A5s",
      recommended: ["CALL_JAM"], tableState: table(), startingPotBB: 2.5,
    });
    expect(anteOff).not.toBe(anteOn);
    // More dead money means the call needs less.
    expect(anteOn).toContain("44,4 %");
  });

  it("says nothing about a fold in push/fold, only about the jam", () => {
    const text = buildPreflopExplanation({
      context: "PUSH_FOLD", heroPos: "UTG", effStack: 10, hand: "72o",
      recommended: ["FOLD"],
      tableState: table({ heroPos: "UTG", facing: "NONE" }), startingPotBB: 1.5,
    });
    expect(text).not.toContain("foldů, aby se zaplatil");
  });
});
