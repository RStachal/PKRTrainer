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
    expect(buttons[1].getAttribute("aria-label")).toBe("CALL, EV +0.204 BB");
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
  });

  it("formatuje kladne, zaporne i nulove BB hodnoty stabilne", () => {
    expect(formatActionEvBb(0.2044)).toBe("+0.204");
    expect(formatActionEvBb(-0.006)).toBe("-0.006");
    expect(formatActionEvBb(0)).toBe("0.000");
  });
});
