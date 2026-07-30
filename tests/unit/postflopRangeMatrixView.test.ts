// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  flopzillaLaneLabel,
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

  function render(): HTMLElement {
    const root = document.createElement("div");
    renderPostflopRangeMatrix(postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
    })), root);
    return root;
  }

  it("vykresli 13x13 matici s legendou a hero hand", () => {
    const root = render();

    expect(root.querySelector(".postflop-flopzilla")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla")?.dataset.heroCategory)
      .toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla")?.dataset.heroCategoryLabel)
      .toBeTruthy();
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__title")?.textContent)
      .toBe("Matice range");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toContain("Hero AKs");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toMatch(/Hero AKs: [A-Za-z+ ]+/);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__meta")?.textContent)
      .toContain("Board");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__hint")?.textContent)
      .toContain("Scroll horizontally on mobile");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__matrix")?.getAttribute("role"))
      .toBe("grid");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__matrix")?.getAttribute("aria-label"))
      .toContain("Matice range pro board");
    expect(root.querySelectorAll<HTMLElement>(".postflop-flopzilla__header-cell--row"))
      .toHaveLength(13);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__header-cell--row")?.dataset.axis)
      .toBe("row");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__header-cell--corner")?.dataset.axis)
      .toBe("corner");
    expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero")?.dataset.hand)
      .toBe("AKs");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero")
      ?.getAttribute("aria-label")).toContain("Hero hand");
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

    const heroCell = root.querySelector<HTMLElement>(".postflop-flopzilla__cell--hero");
    heroCell?.click();
    const detail = root.querySelector<HTMLElement>(".postflop-flopzilla__detail");
    expect(detail).not.toBeNull();
    expect(detail?.hidden).toBe(false);
    expect(detail?.dataset.hand).toBe("AKs");
    expect(detail?.dataset.category).toBeTruthy();
    expect(detail?.dataset.lane).toMatch(/^(VALUE|BLUFF|CHECK)$/);
    expect(detail?.textContent).toContain("Hero hand");
    expect(detail?.textContent).toContain("Category");
    expect(detail?.textContent).toContain("Lane");
    expect(detail?.textContent).toContain("Plan");
    expect(heroCell?.classList.contains("postflop-flopzilla__cell--selected")).toBe(true);
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

  it("nepojmenuje lane akci, ktera u celeni sazce neni legalni", () => {
    // The three lanes are named for a betting node. Facing a bet, checking is not
    // a legal action at all, so calling that lane "Check" described a move the
    // player cannot make - and it covers both calling and folding, which is the
    // entire decision there. The lane keys stay; only the words follow the node.
    expect(flopzillaLaneLabel("CHECK")).toBe("Check");
    expect(flopzillaLaneLabel("CHECK", "SINGLE_RAISED_POT_CBET")).toBe("Check");
    for (const node of ["FLOP_FACING_BET", "TURN_FACING_BET", "RIVER_FACING_BET"] as const) {
      expect(flopzillaLaneLabel("CHECK", node)).toBe("Call or fold");
      expect(flopzillaLaneLabel("VALUE", node)).toBe("Value raise");
      expect(flopzillaLaneLabel("BLUFF", node)).toBe("Bluff raise");
    }
  });

  it("nese solvenou akci v bunce, aby sel call odlisit od foldu", () => {
    // Call and fold share the one lane, so the lane alone cannot tell them apart.
    // The per-hand action has to reach the cell or the distinction is lost.
    const root = document.createElement("div");
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      board: dryAceBoard,
      // Facing a bet is the node where the lane cannot express the decision.
      actionNode: "FLOP_FACING_BET",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
      strategyResolver: () => ({
        action: "CALL",
        explanation: "Facing-bet lane fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "lane-fixture",
          packVersion: "v1",
          packVerifiedAt: "2026-07-28",
          ruleId: "lane-fixture-rule",
          confidence: "HIGH",
          matchedTextures: ["dry"],
          sprMin: 0,
          sprMax: 20,
          positionPattern: "BTN_VS_BB",
          sourceUrls: [],
          assumptions: ["Facing-bet lane fixture."],
          selectionScore: 1,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
          rangeBuckets: [
            { lane: "CHECK", label: "call", action: "CALL", handClasses: ["AKs"], features: [] },
            { lane: "CHECK", label: "fold", action: "FOLD", handClasses: ["72o"], features: [] },
          ],
        },
      }),
    }));

    renderPostflopRangeMatrix(spot, root);

    const cellFor = (hand: string) => root.querySelector<HTMLElement>(
      `.postflop-flopzilla__cell[data-hand="${hand}"]`,
    );
    // Same lane, opposite decisions - only the action separates them.
    expect(cellFor("AKs")?.dataset.lane).toBe("CHECK");
    expect(cellFor("72o")?.dataset.lane).toBe("CHECK");
    expect(cellFor("AKs")?.dataset.action).toBe("CALL");
    expect(cellFor("72o")?.dataset.action).toBe("FOLD");
    expect(cellFor("AKs")?.getAttribute("aria-label")).toContain("CALL");
    expect(cellFor("72o")?.title).toContain("FOLD");
  });

  it("mapuje Flopzilla kategorie do value/bluff/check lanes", () => {
    expect(flopzillaLaneForCategory("SET_PLUS")).toBe("VALUE");
    expect(flopzillaLaneForCategory("FLUSH_DRAW")).toBe("BLUFF");
    expect(flopzillaLaneForCategory("AIR")).toBe("CHECK");
  });
  it("nepojmenovava hracovi matici cizim produktem", () => {
    // The matrix is modelled on a third-party tool's taxonomy, which is fine as
    // an internal shape but has no business being the name a paying player reads.
    const root = render();

    expect(root.textContent).not.toContain("Flopzilla");
    expect(root.querySelector(".postflop-flopzilla__matrix")?.getAttribute("aria-label") ?? "")
      .not.toContain("Flopzilla");
  });

  it("da kazde bunce text, ktery je na jejim pozadi videt", () => {
    // Half the palette taken from the owner's charts is light. Keeping the old
    // uniform white label would have made the widest part of every range - the
    // air and the folds - unreadable.
    const root = render();
    const cells = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")];
    expect(cells.length).toBe(169);

    const luminance = (rgb: string): number => {
      const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map((n) => Number(n) / 255);
      const ch = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };

    for (const cell of cells) {
      const bg = luminance(cell.style.background);
      const fg = luminance(cell.style.color);
      // Not a contrast-ratio assertion, just the property that matters: the two
      // must sit on opposite sides of mid-grey.
      expect(Math.abs(bg - fg), `${cell.dataset.hand}`).toBeGreaterThan(0.35);
    }
  });
});
