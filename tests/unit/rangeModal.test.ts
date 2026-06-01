// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderRangeModalButton } from "../../src/ui/rangeModal";
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
  answers: [{ key: "OPEN_2X", label: "Raise 2x" }],
  correctKeys: ["OPEN_2X"],
  strictCorrect: ["OPEN_2X"],
  explanation: "Testovaci spot.",
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

describe("rangeModal - DOM", () => {
  it("otevre Flopzilla-style modal s range matici a zavre jej", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    expect(document.querySelector(".range-modal")).not.toBeNull();
    expect(document.querySelectorAll(".range-modal .matrix-cell")).toHaveLength(169);
    expect(document.querySelector<HTMLElement>(".range-modal .matrix-cell--hero")?.dataset.hand)
      .toBe("AKs");

    document.querySelector<HTMLButtonElement>(".range-modal__close")?.click();
    expect(document.querySelector(".range-modal")).toBeNull();
  });

  it("zamkne scroll pozadi a zavre modal klavesou Escape", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    document.body.style.overflow = "auto";

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.querySelector<HTMLElement>(".range-modal__matrix")?.textContent)
      .toContain("AKs");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(".range-modal")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
});
