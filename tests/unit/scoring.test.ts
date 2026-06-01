import { describe, it, expect } from "vitest";

import { grade } from "../../src/core/scoring";
import type { ActionKey, Card, Spot, TableState } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "h" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "OPEN",
  isBvB: false,
};

function spotWith(
  strictCorrect: ActionKey[],
  correctKeys: ActionKey[],
  explanation = "Testovací zdůvodnění.",
): Spot {
  return {
    id: "VS_OPEN|BTN|25|AKo|OFF",
    context: "VS_OPEN",
    heroPos: "BTN",
    effStack: 25,
    ante: "OFF",
    pushFold: false,
    hand: "AKo",
    heroCards,
    tableState,
    answers: [
      { key: "FOLD", label: "Fold" },
      { key: "CALL", label: "Call / Dorovnat" },
      { key: "3BET", label: "3-bet" },
    ],
    correctKeys,
    strictCorrect,
    explanation,
  };
}

describe("scoring - rezimy a zduvodneni", () => {
  it("podporuje LENIENT i STRICT nad rozdilnymi sadami", () => {
    const spot = spotWith(["3BET"], ["CALL", "3BET"]);

    expect(grade(spot, "CALL", "LENIENT").correct).toBe(true);
    expect(grade(spot, "CALL", "STRICT").correct).toBe(false);
    expect(grade(spot, "3BET", "STRICT").correct).toBe(true);
  });

  it("pri prazdnem zduvodneni dokonci vyhodnoceni a oznaci ho jako nedostupne", () => {
    const spot = spotWith(["3BET"], ["3BET"], "   ");
    const result = grade(spot, "FOLD", "STRICT");

    expect(result.correct).toBe(false);
    expect(result.explanationAvailable).toBe(false);
    expect(result.recommended).toEqual(["3BET"]);
  });
});
