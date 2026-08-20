// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { evaluateActionEv, type ActionEvSet } from "../../src/core/actionEv";
import {
  formatActionEvBb,
  revealActionEvButtonBubbles,
  setActionEvButtonContent,
} from "../../src/ui/actionEvButtonBubbles";

type TestAction = "FOLD" | "CALL" | "3BET";

const actionEvs: ActionEvSet<TestAction> = {
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

describe("action EV button bubbles", () => {
  it("odkryje EV u kazde nabizene akce az po vyhodnoceni", () => {
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });

    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.hidden === true
    ))).toBe(true);

    const evaluation = evaluateActionEv(actionEvs, "CALL");
    expect(evaluation).not.toBeNull();
    expect(revealActionEvButtonBubbles(buttons, actionEvs, evaluation ?? undefined)).toBe(3);

    expect(buttons.filter((button) => button.dataset.evAvailable === "true")).toHaveLength(3);
    expect(buttons.filter((button) => (
      button.querySelector(".action-ev-bubble--best") !== null
    ))).toHaveLength(2);
    expect(buttons.filter((button) => (
      button.querySelector(".action-ev-bubble--chosen") !== null
    ))).toHaveLength(1);
    expect(buttons[1].querySelector(".action-ev-bubble")?.textContent).toBe("EV +0.204 BB");
    expect(buttons[0].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("8");
    expect(buttons[1].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("100");
    expect(buttons[2].querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct)
      .toBe("100");
    expect(buttons[1].querySelector(".action-ev-bubble__meter")).not.toBeNull();
    expect(buttons[1].querySelector(".action-ev-bubble__fill")).not.toBeNull();
    expect(buttons[1].getAttribute("aria-label")).toBe("CALL, EV +0.204 BB");
  });

  it("zobrazi vsechny ekvivalentne nejlepsi akce stejne plnym metrem", () => {
    const equivalent: ActionEvSet<TestAction> = {
      ...actionEvs,
      values: [
        { action: "FOLD", evBb: 0.201 },
        { action: "CALL", evBb: 0.204 },
        { action: "3BET", evBb: 0.21 },
      ],
    };
    const buttons = equivalent.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });
    const evaluation = evaluateActionEv(equivalent, "CALL");

    expect(evaluation?.bestActions).toEqual(["FOLD", "CALL", "3BET"]);
    expect(revealActionEvButtonBubbles(buttons, equivalent, evaluation ?? undefined)).toBe(3);
    expect(buttons.map((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct
    ))).toEqual(["100", "100", "100"]);
  });

  it("zustane fail-closed pri neuplnem EV setu", () => {
    const buttons = actionEvs.values.map(({ action }) => {
      const button = document.createElement("button");
      button.dataset.action = action;
      setActionEvButtonContent(button, action);
      return button;
    });
    const incomplete = { ...actionEvs, values: actionEvs.values.slice(1) };
    const evaluation = evaluateActionEv(actionEvs, "CALL");

    expect(revealActionEvButtonBubbles(buttons, incomplete, evaluation ?? undefined)).toBe(0);
    expect(buttons.every((button) => button.dataset.evAvailable === "false")).toBe(true);
    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.hidden === true
    ))).toBe(true);
    expect(buttons.every((button) => (
      button.querySelector<HTMLElement>(".action-ev-bubble")?.dataset.evStrengthPct === undefined
    ))).toBe(true);
  });

  it("odkryje EV i u zdrojů, které aplikace doopravdy vyrábí", () => {
    // Tenhle test tu chyběl a stálo to celou funkci. Bubliny procházely bránou
    // pro import packů, která vyžaduje `SOLVER` - jenže push/fold EV se počítá
    // za běhu a nese `ALL_IN_EQUITY`, riverová `SOLVED_TREE`. Obojí brána
    // zahazovala, takže hráč neviděl **žádné** EV, přestože se podle ní
    // známkovalo. Fixtura výš má `SOLVER`, takže o tom mlčela.
    for (const source of ["ALL_IN_EQUITY", "SOLVED_TREE"] as const) {
      const set: ActionEvSet<TestAction> = { ...actionEvs, source };
      const buttons = set.values.map(({ action }) => {
        const button = document.createElement("button");
        button.dataset.action = action;
        setActionEvButtonContent(button, action);
        return button;
      });
      const evaluation = evaluateActionEv(set, "CALL");
      expect(revealActionEvButtonBubbles(buttons, set, evaluation ?? undefined), source).toBe(3);
      expect(buttons.every((button) => button.dataset.evAvailable === "true"), source).toBe(true);
    }
  });

  it("formatuje kladne, zaporne i nulove BB hodnoty stabilne", () => {
    expect(formatActionEvBb(0.2044)).toBe("+0.204");
    expect(formatActionEvBb(-0.006)).toBe("-0.006");
    expect(formatActionEvBb(0)).toBe("0.000");
  });
});
