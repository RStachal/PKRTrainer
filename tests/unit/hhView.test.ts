// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { renderHHView } from "../../src/ui/hhView";

const validHh = [
  "PokerStars Hand #1: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #1 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

const validFlopHh = [
  "PokerStars Hand #2: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: checks",
  "Hero: bets 40",
  "*** SUMMARY ***",
].join("\n");

describe("hhView - DOM import", () => {
  it("zobrazi chyby a necitelna pole pro prazdny vstup bez padu", () => {
    const root = document.createElement("div");
    renderHHView(root);

    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const errors = root.querySelector<HTMLElement>(".hh-errors");
    const unreadable = root.querySelector<HTMLElement>(".hh-unreadable");
    const css = root.querySelector("style")?.textContent ?? "";
    expect(css).toContain("linear-gradient(180deg,rgba(18,25,38,.98)");
    expect(css).toContain("@media (max-width:640px)");
    expect(css).toContain(".hh-analysis__matrix");
    expect(root.querySelector<HTMLTextAreaElement>(".hh-input")?.placeholder)
      .toBe("Paste hand history here...");
    expect(root.querySelector<HTMLButtonElement>(".hh-analyze")?.textContent).toBe("Analyze");
    expect(errors?.hidden).toBe(false);
    expect(errors?.textContent).toContain("Input is empty");
    expect(unreadable?.hidden).toBe(false);
    expect(unreadable?.textContent).toContain("position");
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(root.textContent).not.toContain("Analyzovat");
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("vykresli kompatibilni HH jako stul a zavola callback", () => {
    const root = document.createElement("div");
    const importedIds: string[] = [];
    const reviewCounts: number[] = [];
    renderHHView(root, {
      onSpotBuilt: (spot) => importedIds.push(spot.id),
      onReviewBuilt: (records) => {
        reviewCounts.push(records.length);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelector(".poker-table")).not.toBeNull();
    expect(root.querySelectorAll(".seat")).toHaveLength(9);
    expect(root.querySelectorAll(".hole-card")).toHaveLength(2);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.spotId)
      .toContain("HJ|50|AKo");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.position)
      .toBe("HJ");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.hand)
      .toBe("AKo");
    expect(root.querySelector<HTMLElement>(".hh-analysis__facts")?.dataset.stack)
      .toBe("50");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewSavedToDrillStats)
      .toBe("false");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.chosen).toBe("FOLD");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.correct).toMatch(/true|false/);
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("1");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Your action");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Fold");
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.textContent).toContain("Result");
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);
    expect(root.querySelector<HTMLElement>(".hh-analysis .matrix-cell--hero")?.dataset.hand)
      .toBe("AKo");
    expect(importedIds).toHaveLength(1);
    expect(importedIds[0]).toContain("HJ|50|AKo");
    expect(reviewCounts).toEqual([1]);
    expect(root.querySelector(".hh-postflop-analysis")).toBeNull();
  });

  it("zobrazi flop review z importovane HH bez ulozeni do drill statistik", () => {
    const root = document.createElement("div");
    const reviews: unknown[][] = [];
    renderHHView(root, {
      onReviewBuilt: (records) => {
        reviews.push([...records]);
      },
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validFlopHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const flop = root.querySelector<HTMLElement>(".hh-postflop-analysis");
    expect(flop).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.reviewRecordCount).toBe("2");
    expect(flop?.dataset.reviewSavedToDrillStats).toBe("false");
    expect(flop?.dataset.street).toBe("FLOP");
    expect(flop?.dataset.potType).toBe("SINGLE_RAISED");
    expect(flop?.dataset.positionPattern).toBe("BTN_VS_BB");
    expect(flop?.dataset.board).toBe("Ah-7d-2c");
    expect(flop?.dataset.recommended).toMatch(/^(CHECK|BET_SMALL|BET_BIG)$/);
    expect(flop?.textContent).toContain("Flop review");
    expect(flop?.textContent).toContain("Ah 7d 2c");
    expect(flop?.textContent).toContain("Single-raised pot");
    expect(flop?.textContent).toContain("Button vs BB");
    expect(flop?.textContent).toContain("Recommended");
    expect(flop?.textContent).not.toContain("SINGLE_RAISED");
    expect(flop?.textContent).not.toContain("BTN_VS_BB");
    expect(flop?.textContent).not.toContain("StrategyPack");
    expect(flop?.textContent).not.toContain("http");
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toHaveLength(2);
    expect(reviews[0][0]).toMatchObject({
      street: "PREFLOP",
      savedToDrillStats: false,
      chosen: expect.any(String),
    });
    expect(reviews[0][1]).toMatchObject({
      street: "FLOP",
      savedToDrillStats: false,
      board: ["Ah", "7d", "2c"],
      positionPattern: "BTN_VS_BB",
    });
  });

  it("vycisti HH analyzu po nevalidnim vstupu", () => {
    const root = document.createElement("div");
    renderHHView(root);

    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);

    textarea!.value = "";
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    expect(root.querySelector<HTMLElement>(".hh-analysis")?.dataset.spotId).toBeUndefined();
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(0);
    expect(root.querySelector(".poker-table")).toBeNull();
  });
});
