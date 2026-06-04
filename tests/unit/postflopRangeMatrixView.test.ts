// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  classifyFlopHand,
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
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__hint")?.textContent)
      .toContain("Swipe horizontally");
    expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero")?.dataset.hand)
      .toBe("AKs");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell[data-hand='AA']")
      ?.dataset.category).toBeTruthy();
    expect(root.querySelectorAll(".postflop-flopzilla__legend-item").length)
      .toBeGreaterThan(3);
  });
});
