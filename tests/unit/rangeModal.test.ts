// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("rangeModal - DOM", () => {
  it("otevre Flopzilla-style modal s range matici a zavre jej", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    const model = document.querySelector<HTMLElement>(".range-modal__evidence");

    expect(document.querySelector(".range-modal")).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>(".range-modal-open")?.textContent)
      .toContain("Show range");
    expect(document.querySelectorAll(".range-modal .matrix-cell")).toHaveLength(169);
    expect(document.querySelector<HTMLElement>(".range-modal .matrix-cell--hero")?.dataset.hand)
      .toBe("AKs");
    expect(model?.textContent).toContain("Model range");
    expect(model?.textContent).toContain("chipEV");
    expect(model?.textContent).toContain("ante OFF");
    expect(model?.textContent).not.toContain("ante zapnuto");
    expect(model?.textContent).not.toContain("bez ante");
    expect(model?.textContent).toContain("Předpoklady:");
    expect(document.querySelector<HTMLElement>(".range-modal .range-matrix-title")?.textContent)
      .toBe("Preflop range matrix");
    expect(document.querySelectorAll(".range-modal .legend-count").length)
      .toBeGreaterThan(1);
    expect(document.querySelector<HTMLElement>(".range-modal .legend-item")?.dataset.count)
      .toMatch(/^\d+$/);
    expect(document.querySelector<HTMLElement>(".range-modal .legend-item")?.dataset.share)
      .toMatch(/^\d+%$/);
    expect(document.querySelector<HTMLElement>(".range-modal .legend-count")?.textContent)
      .toMatch(/\d+\/169 \(\d+%\)/);
    expect(model?.textContent).not.toContain("Zdroje:");
    expect(model?.textContent).not.toContain("RangePack");
    expect(model?.textContent).not.toContain("mtt-full-ring");
    expect(document.querySelectorAll(".range-modal__evidence a")).toHaveLength(0);
    expect(document.querySelector(".range-modal style")?.textContent)
      .toContain("prefers-reduced-motion");
    expect(document.querySelector(".range-modal style")?.textContent)
      .toContain("transform:none");

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
    expect(document.querySelector<HTMLButtonElement>(".range-modal__close")?.textContent)
      .toBe("Close");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector(".range-modal")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("vykresli hracsky model range z bundlu bez runtime fetch a bez citaci zdroju", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const root = document.createElement("div");
    document.body.appendChild(root);

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    const modelText = document.querySelector<HTMLElement>(".range-modal__evidence")?.textContent;
    expect(modelText).toContain("Model range");
    expect(modelText).toContain("Předpoklady:");
    expect(modelText).not.toContain("https://");
    expect(modelText).not.toContain("RangePack");
    expect(fetchSpy).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>(".range-modal__close")?.click();
  });
});
