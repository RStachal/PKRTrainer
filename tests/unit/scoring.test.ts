import { describe, it, expect } from "vitest";

import { grade } from "../../src/core/scoring";
import type { ActionEvSet } from "../../src/core/actionEv";
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
  actionEvs?: ActionEvSet<ActionKey>,
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
      { key: "CALL", label: "Call" },
      { key: "3BET", label: "3-bet" },
    ],
    correctKeys,
    strictCorrect,
    explanation,
    ...(actionEvs ? { actionEvs } : {}),
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

  it("uzna vice EV-rovnocennych akci ve strict rezimu a malou odchylku jen v lenient", () => {
    const actionEvs: ActionEvSet<ActionKey> = {
      source: "SOLVER",
      unit: "BB",
      equivalentThresholdBb: 0.01,
      acceptableThresholdBb: 0.05,
      values: [
        { action: "FOLD", evBb: 0.1 },
        { action: "CALL", evBb: 0.204 },
        { action: "3BET", evBb: 0.21 },
      ],
    };
    const spot = spotWith(["3BET"], ["3BET"], "Solver EV comparison.", actionEvs);

    expect(grade(spot, "CALL", "STRICT")).toMatchObject({
      correct: true,
      strict: ["CALL", "3BET"],
      recommended: ["CALL", "3BET"],
      actionEv: { outcome: "EQUIVALENT" },
    });
    expect(grade(spot, "FOLD", "LENIENT")).toMatchObject({
      correct: false,
      actionEv: { outcome: "MISTAKE" },
    });

    const acceptableSet: ActionEvSet<ActionKey> = {
      ...actionEvs,
      values: actionEvs.values.map((item) => (
        item.action === "FOLD" ? { ...item, evBb: 0.17 } : item
      )),
    };
    const acceptableSpot = spotWith(["3BET"], ["3BET"], "Solver EV comparison.", acceptableSet);
    expect(grade(acceptableSpot, "FOLD", "STRICT").correct).toBe(false);
    expect(grade(acceptableSpot, "FOLD", "LENIENT")).toMatchObject({
      correct: true,
      actionEv: { outcome: "ACCEPTABLE" },
    });
  });
});
