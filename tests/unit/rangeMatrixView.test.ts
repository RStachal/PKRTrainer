// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { renderMatrix } from "../../src/ui/rangeMatrixView";
import type { RangeStore } from "../../src/data/rangeStore";
import type { Card, Spot, TableState } from "../../src/core/types";

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "s" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "NONE",
  isBvB: false,
};

const spot: Spot = {
  id: "RFI|BTN|25|AKs|OFF",
  context: "RFI",
  heroPos: "BTN",
  effStack: 25,
  ante: "OFF",
  pushFold: false,
  hand: "AKs",
  heroCards,
  tableState,
  answers: [{ key: "OPEN_2X", label: "Raise 2×" }],
  correctKeys: ["OPEN_2X"],
  strictCorrect: ["OPEN_2X"],
  explanation: "Testovací spot.",
};

const loadedStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: {
      AKs: ["OPEN_2X"],
      AA: ["3BET"],
    },
    strict: {
      AKs: ["OPEN_2X"],
      AA: ["3BET"],
    },
  }),
};

const missingStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => undefined,
};

describe("rangeMatrixView - DOM", () => {
  it("vykresli 169 bunek, zvyrazni ruku spotu a zobrazi legendu", () => {
    const root = document.createElement("div");
    renderMatrix(spot, loadedStore, root);

    const cells = root.querySelectorAll<HTMLElement>(".matrix-cell");
    expect(cells).toHaveLength(169);

    const hero = root.querySelector<HTMLElement>(".matrix-cell--hero");
    expect(hero?.dataset.hand).toBe("AKs");
    expect(hero?.dataset.action).toBe("OPEN");
    expect(root.querySelector<HTMLElement>('.matrix-cell[data-hand="AA"]')?.dataset.action)
      .toBe("3BET");
    expect(root.querySelector(".matrix-legend")).not.toBeNull();
    expect(root.querySelector('.legend-item[data-action="FOLD"]')).not.toBeNull();
    expect(root.querySelector('.legend-item[data-action="OPEN"]')).not.toBeNull();
  });

  it("pri nedostupnych datech zobrazi indikaci bez mrizky", () => {
    const root = document.createElement("div");
    renderMatrix(spot, missingStore, root);

    expect(root.querySelector(".matrix-unavailable")).not.toBeNull();
    expect(root.querySelectorAll(".matrix-cell")).toHaveLength(0);
  });
});
