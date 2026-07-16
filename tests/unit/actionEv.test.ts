import { describe, expect, it } from "vitest";
import {
  bestActionsForActionEv,
  evaluateActionEv,
  isActionEvSetComplete,
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
