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
  answers: [{ key: "OPEN_2X", label: "Raise 2x" }],
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
    expect(root.querySelector<HTMLElement>(".range-matrix-title")?.textContent)
      .toBe("Preflop matice range");
    expect(root.querySelector<HTMLElement>(".range-matrix-meta")?.textContent)
      .toContain("Hero: AKs");
    expect(root.querySelector<HTMLElement>(".range-matrix-view")?.style.background)
      .toContain("linear-gradient");
    expect(root.querySelector<HTMLElement>(".range-matrix-view")?.style.overflowX)
      .toBe("auto");
    expect(root.querySelector<HTMLElement>(".matrix")?.style.minWidth).toBe("640px");
    expect(root.querySelectorAll<HTMLElement>(".matrix-header--row")).toHaveLength(13);
    expect(root.querySelector<HTMLElement>(".matrix-header--row")?.dataset.axis).toBe("row");
    expect(root.querySelector<HTMLElement>(".matrix-header--row")?.style.position)
      .toBe("sticky");
    expect(root.querySelector<HTMLElement>(".matrix-header--row")?.style.left)
      .toMatch(/^0(px)?$/);
    expect(root.querySelector<HTMLElement>(".matrix-header--corner")?.dataset.axis)
      .toBe("corner");
    expect(root.querySelector<HTMLElement>('.matrix-cell[data-hand="AA"]')?.dataset.action)
      .toBe("3BET");
    expect(root.querySelector(".matrix-legend")).not.toBeNull();
    expect(root.querySelector('.legend-item[data-action="FOLD"]')).not.toBeNull();
    expect(root.querySelector('.legend-item[data-action="OPEN"]')).not.toBeNull();
    expect(root.querySelector('.legend-item[data-action="OPEN"]')?.textContent)
      .toContain("Open / RFI");
    expect(root.querySelector<HTMLElement>('.legend-item[data-action="OPEN"]')
      ?.dataset.count).toMatch(/^\d+$/);
    expect(root.querySelector<HTMLElement>('.legend-item[data-action="OPEN"]')
      ?.dataset.share).toMatch(/^\d+%$/);
    expect(root.querySelectorAll(".legend-count").length).toBeGreaterThan(1);
    expect([...root.querySelectorAll<HTMLElement>(".legend-count")]
      .some((node) => /\d+\/169 \(\d+%\)/.test(node.textContent ?? ""))).toBe(true);

    const openLegend = root.querySelector<HTMLElement>('.legend-item[data-action="OPEN"]');
    expect(openLegend?.getAttribute("role")).toBe("button");
    expect(openLegend?.getAttribute("tabindex")).toBe("0");
    expect(openLegend?.getAttribute("aria-pressed")).toBe("false");
    openLegend?.click();
    expect(openLegend?.classList.contains("legend-item--active")).toBe(true);
    expect(openLegend?.getAttribute("aria-pressed")).toBe("true");
    expect([...root.querySelectorAll<HTMLElement>(".matrix-cell")]
      .some((cell) => cell.dataset.action !== "OPEN" &&
        cell.classList.contains("matrix-cell--muted"))).toBe(true);
    openLegend?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(openLegend?.classList.contains("legend-item--active")).toBe(false);
    expect(openLegend?.getAttribute("aria-pressed")).toBe("false");
    expect([...root.querySelectorAll<HTMLElement>(".matrix-cell")]
      .some((cell) => cell.classList.contains("matrix-cell--muted"))).toBe(false);

    hero?.click();
    const detail = root.querySelector<HTMLElement>(".matrix-cell-detail");
    expect(detail).not.toBeNull();
    expect(detail?.hidden).toBe(false);
    expect(detail?.dataset.hand).toBe("AKs");
    expect(detail?.dataset.action).toBe("OPEN");
    expect(detail?.textContent).toContain("handa Hero");
    expect(detail?.textContent).toContain("Přísná akce");
    expect(detail?.textContent).toContain("Raise 2x");
    expect(detail?.textContent).toContain("Tolerované akce");
    expect(hero?.classList.contains("matrix-cell--selected")).toBe(true);

    const aces = root.querySelector<HTMLElement>('.matrix-cell[data-hand="AA"]');
    aces?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(detail?.dataset.hand).toBe("AA");
    expect(detail?.textContent).toContain("3-bet");
    expect(aces?.classList.contains("matrix-cell--selected")).toBe(true);
  });

  it("pri nedostupnych datech zobrazi indikaci bez mrizky", () => {
    const root = document.createElement("div");
    renderMatrix(spot, missingStore, root);

    const unavailable = root.querySelector<HTMLElement>(".matrix-unavailable");
    expect(unavailable).not.toBeNull();
    expect(unavailable?.textContent).toBe("Pro tento spot nejsou dostupná data range.");
    expect(unavailable?.textContent).not.toContain("k dispozici");
    expect(root.querySelectorAll(".matrix-cell")).toHaveLength(0);
  });
});
