// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  renderPostflopRangeMatrix,
} from "../../src/ui/postflopRangeMatrixView";
import type { Card } from "../../src/core/types";

const dryAceBoard: Card[] = [
  { rank: "A", suit: "c" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "s" },
];

const lowBoard: Card[] = [
  { rank: "7", suit: "c" },
  { rank: "3", suit: "d" },
  { rank: "2", suit: "s" },
];

const drawBoard: Card[] = [
  { rank: "T", suit: "h" },
  { rank: "9", suit: "h" },
  { rank: "2", suit: "c" },
];

describe("postflopRangeMatrixView", () => {
  it("klasifikuje hand classes proti flopu do Flopzilla kategorii", () => {
    expect(classifyFlopHand("AA", dryAceBoard)).toBe("SET_PLUS");
    expect(classifyFlopHand("KK", lowBoard)).toBe("OVERPAIR");
    expect(classifyFlopHand("AKo", dryAceBoard)).toBe("TOP_PAIR");
    expect(classifyFlopHand("72o", dryAceBoard)).toBe("TWO_PAIR");
    expect(classifyFlopHand("54s", dryAceBoard)).toBe("GUTSHOT");
    expect(classifyFlopHand("QJs", drawBoard)).toBe("FLUSH_DRAW");
    expect(classifyFlopHand("87o", drawBoard)).toBe("OESD");
  });

  it("vykresli 13x13 Flopzilla-style matrix s legendou a hero hand", () => {
    const root = document.createElement("div");
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
    }));

    renderPostflopRangeMatrix(spot, root);

    expect(root.querySelector(".postflop-flopzilla")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla")?.dataset.heroCategory)
      .toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla")?.dataset.heroCategoryLabel)
      .toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__title")?.textContent)
      .toBe("Flopzilla range matrix");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toContain("Hero AKs");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toMatch(/Hero AKs: [A-Za-z+ ]+/);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toContain("Board");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__hint")?.textContent)
      .toContain("Swipe horizontally");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__matrix")?.getAttribute("role"))
      .toBe("grid");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__matrix")?.getAttribute("aria-label"))
      .toContain("Flopzilla range matrix for board");
    expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero")?.dataset.hand)
      .toBe("AKs");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero")
      ?.getAttribute("aria-label")).toContain("hero hand");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell[data-hand='AA']")
      ?.dataset.category).toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell[data-hand='AA']")
      ?.dataset.categoryLabel).toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell[data-hand='AA']")
      ?.dataset.lane).toMatch(/^(VALUE|BLUFF|CHECK)$/);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell[data-hand='AA']")
      ?.dataset.laneLabel).toMatch(/^(Value|Bluffs|Check)$/);
    expect(root.querySelectorAll(".postflop-flopzilla__legend-item").length)
      .toBeGreaterThan(3);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__legend-item")
      ?.dataset.count).toMatch(/^\d+$/);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__legend-item")
      ?.dataset.share).toMatch(/^\d+%$/);
    expect(root.querySelectorAll(".postflop-flopzilla__legend-count").length)
      .toBeGreaterThan(3);
    expect([...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__legend-count")]
      .some((node) => /\d+\/169 \(\d+%\)/.test(node.textContent ?? ""))).toBe(true);
  });

  it("umi legendou zvyraznit kategorii a ztlumit ostatni bunky", () => {
    const root = document.createElement("div");
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
    }));

    renderPostflopRangeMatrix(spot, root);

    const item = root.querySelector<HTMLElement>(".postflop-flopzilla__legend-item");
    expect(item).not.toBeNull();
    expect(item?.getAttribute("role")).toBe("button");
    expect(item?.getAttribute("tabindex")).toBe("0");
    expect(item?.getAttribute("aria-pressed")).toBe("false");

    const category = item!.dataset.category;
    item!.click();

    expect(item?.classList.contains("postflop-flopzilla__legend-item--active")).toBe(true);
    expect(item?.getAttribute("aria-pressed")).toBe("true");
    const cells = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")];
    expect(cells.some((cell) => cell.dataset.category !== category &&
      cell.classList.contains("postflop-flopzilla__cell--muted"))).toBe(true);
    expect(cells.every((cell) => cell.dataset.category === category ||
      cell.classList.contains("postflop-flopzilla__cell--muted"))).toBe(true);

    item!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(item?.classList.contains("postflop-flopzilla__legend-item--active")).toBe(false);
    expect(item?.getAttribute("aria-pressed")).toBe("false");
    expect(cells.some((cell) => cell.classList.contains("postflop-flopzilla__cell--muted")))
      .toBe(false);
  });

  it("mapuje Flopzilla kategorie do value/bluff/check lanes", () => {
    expect(flopzillaLaneForCategory("SET_PLUS")).toBe("VALUE");
    expect(flopzillaLaneForCategory("FLUSH_DRAW")).toBe("BLUFF");
    expect(flopzillaLaneForCategory("AIR")).toBe("CHECK");
  });
});
