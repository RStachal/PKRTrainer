import { describe, expect, it } from "vitest";
import {
  bestActionsForActionEv,
  evaluateActionEv,
  isActionEvSetComplete,
  isActionEvSetUsable,
  DISPLAYABLE_ACTION_EV_SOURCES,
  validateActionEvSet,
  type ActionEvSet,
} from "../../src/core/actionEv";
import { validateRangeRecord } from "../../src/data/ranges/schema";

type Action = "FOLD" | "CALL" | "3BET";

const set: ActionEvSet<Action> = {
  source: "SOLVER",
  unit: "BB",
  equivalentThresholdBb: 0.01,
  acceptableThresholdBb: 0.05,
  values: [
    { action: "FOLD", evBb: 0 },
    { action: "CALL", evBb: 0.204 },
    { action: "3BET", evBb: 0.21 },
  ],
};

/**
 * Neúplná sada: co se smí zobrazit, i když nepokrývá všechny nabízené akce.
 *
 * Úplnost je správný požadavek na import packu a špatný na zobrazení. Změřeno:
 * trvat na ní znamenalo ukázat EV jen ve 20 % riverových spotů, protože trenažér
 * nabízí akce, které solve neobsahuje - typicky zvýšení tam, kde solver žádnou
 * větev se zvýšením nepočítal.
 */
describe("použitelná sada EV", () => {
  const partial: ActionEvSet<"CHECK" | "BET_SMALL" | "BET_BIG"> = {
    source: "SOLVED_TREE",
    unit: "BB",
    equivalentThresholdBb: 0.1,
    acceptableThresholdBb: 0.3,
    values: [{ action: "CHECK", evBb: 1.2 }, { action: "BET_SMALL", evBb: 2.4 }],
  };
  const offered = ["CHECK", "BET_SMALL", "BET_BIG"] as const;

  it("projde, i když jedné nabízené akci hodnota chybí", () => {
    expect(isActionEvSetUsable(partial, offered, DISPLAYABLE_ACTION_EV_SOURCES)).toBe(true);
    // Přísná brána ji naopak pustit nesmí: chrání import packů.
    expect(isActionEvSetComplete(partial, offered, DISPLAYABLE_ACTION_EV_SOURCES)).toBe(false);
  });

  it("duplicitní akci nepustí", () => {
    // Tohle byla skutečná vada: `covered` vznikalo z přeložených solverových
    // akcí a překlad slévá dvě velikosti sázky do jedné, takže se akce v sadě
    // objevila dvakrát. Padlo na tom 104 z 300 spotů.
    const duplicated = {
      ...partial,
      values: [...partial.values, { action: "BET_SMALL" as const, evBb: 9 }],
    };
    expect(isActionEvSetUsable(duplicated, offered, DISPLAYABLE_ACTION_EV_SOURCES)).toBe(false);
  });

  it("jedna hodnota nestačí: není co seřadit", () => {
    const single = { ...partial, values: [partial.values[0]] };
    expect(isActionEvSetUsable(single, offered, DISPLAYABLE_ACTION_EV_SOURCES)).toBe(false);
  });

  it("akci, kterou uzel nenabízí, nepustí ani v neúplné sadě", () => {
    const foreign = {
      ...partial,
      values: [...partial.values, { action: "FOLD" as never, evBb: 0 }],
    };
    expect(isActionEvSetUsable(foreign, offered, DISPLAYABLE_ACTION_EV_SOURCES)).toBe(false);
  });

  it("nepovolený zdroj neprojde ani neúplný", () => {
    expect(isActionEvSetUsable(partial, offered, ["SOLVER"])).toBe(false);
  });
});

describe("action EV", () => {
  it("keeps every action value and recognizes equivalent best actions", () => {
    expect(bestActionsForActionEv(set)).toEqual(["CALL", "3BET"]);
    expect(evaluateActionEv(set, "3BET")).toMatchObject({
      outcome: "BEST",
      chosenEvBb: 0.21,
      bestEvBb: 0.21,
      evLossBb: 0,
      bestActions: ["CALL", "3BET"],
    });
    const call = evaluateActionEv(set, "CALL");
    expect(call).toMatchObject({
      outcome: "EQUIVALENT",
      bestActions: ["CALL", "3BET"],
    });
    expect(call?.evLossBb).toBeCloseTo(0.006, 9);
  });

  it("separates acceptable deviations from mistakes", () => {
    const widerSet: ActionEvSet<Action> = {
      ...set,
      values: [
        { action: "FOLD", evBb: 0.17 },
        { action: "CALL", evBb: 0.19 },
        { action: "3BET", evBb: 0.21 },
      ],
    };
    expect(evaluateActionEv(widerSet, "CALL")?.outcome).toBe("ACCEPTABLE");
    expect(evaluateActionEv(widerSet, "FOLD")?.outcome).toBe("ACCEPTABLE");

    const mistakeSet = {
      ...widerSet,
      values: widerSet.values.map((item) => (
        item.action === "FOLD" ? { ...item, evBb: 0.1 } : item
      )),
    };
    expect(evaluateActionEv(mistakeSet, "FOLD")?.outcome).toBe("MISTAKE");
  });

  it("rejects partial, duplicate and non-finite action EV data", () => {
    expect(isActionEvSetComplete(set, ["FOLD", "CALL", "3BET"])).toBe(true);
    expect(isActionEvSetComplete(set, ["FOLD", "CALL", "3BET", "JAM"] as Action[])).toBe(false);

    const invalid = {
      ...set,
      values: [
        { action: "CALL", evBb: Number.NaN },
        { action: "CALL", evBb: 0.2 },
      ],
    } as ActionEvSet<Action>;
    expect(validateActionEvSet(invalid, ["FOLD", "CALL", "3BET"])).toEqual(expect.arrayContaining([
      "action CALL is duplicated",
      "action CALL evBb must be finite",
      "action FOLD is missing an EV",
      "action 3BET is missing an EV",
    ]));
  });

  it("validates EV completeness against the actions offered by the range node", () => {
    const errors = validateRangeRecord({
      position: "BTN",
      bucket: 25,
      context: "VS_OPEN",
      lenient: { AKo: ["CALL"] } as never,
      strict: { AKo: ["CALL"] } as never,
      actionEvs: {
        AKo: {
          source: "SOLVER",
          unit: "BB",
          equivalentThresholdBb: 0.01,
          acceptableThresholdBb: 0.05,
          values: [{ action: "CALL", evBb: 0.2 }],
        },
      },
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("action FOLD is missing an EV"),
      expect.stringContaining("action 3BET is missing an EV"),
    ]));
  });
});
