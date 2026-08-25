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

  it("umi legendou zvyraznit skupinu akci a ztlumit ostatni bunky", () => {
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

    // Legenda je od 25. 8. 2026 legendou **akcí**, ne kategorií rukou: hráč se
    // ptá „kterými koly tady blafuju", a na to kategorie odpovědět neuměla.
    const group = item!.dataset.group;
    expect(group).toBeTruthy();
    item!.click();

    expect(item?.classList.contains("postflop-flopzilla__legend-item--active")).toBe(true);
    expect(item?.getAttribute("aria-pressed")).toBe("true");
    const cells = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")];
    expect(cells.some((cell) => cell.dataset.group !== group &&
      cell.classList.contains("postflop-flopzilla__cell--muted"))).toBe(true);
    expect(cells.every((cell) => cell.dataset.group === group ||
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

  it("odlisi blaf od hodnoty, kdyz obe sazi stejnou akci", () => {
    // Tohle je ta vlastnost, kvůli které se matice přebarvila. Obě ruce sázejí
    // `BET_BIG`, takže podle akce samotné jsou k nerozeznání - a podle síly ruky
    // byly k nerozeznání od stejně silných rukou, které se vzdávají. Rozdíl umí
    // vyjádřit jedině lajna, a musí ho vyjádřit **barvou**, ne popiskem.
    const root = document.createElement("div");
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      board: dryAceBoard,
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
      strategyResolver: () => ({
        action: "BET_BIG",
        explanation: "Bluff versus value fixture.",
        source: {
          kind: "STRATEGY_PACK",
          provenance: "SOLVER_BACKED",
          packId: "bluff-fixture",
          packVersion: "v1",
          packVerifiedAt: "2026-08-25",
          ruleId: "bluff-fixture-rule",
          confidence: "HIGH",
          matchedTextures: [],
          sprMin: 0,
          sprMax: 20,
          positionPattern: "BTN_VS_BB",
          sourceUrls: [],
          assumptions: ["Bluff versus value fixture."],
          selectionScore: 1,
          tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
          rangeBuckets: [
            { lane: "VALUE", label: "Sázka pro hodnotu", action: "BET_BIG", handClasses: ["AKs"], features: [] },
            { lane: "BLUFF", label: "Blaf", action: "BET_BIG", handClasses: ["76s"], features: [] },
            { lane: "CHECK", label: "Check", action: "CHECK", handClasses: ["72o"], features: [] },
          ],
        },
      }),
    }));

    renderPostflopRangeMatrix(spot, root);

    const cellFor = (hand: string) => root.querySelector<HTMLElement>(
      `.postflop-flopzilla__cell[data-hand="${hand}"]`,
    );
    expect(cellFor("AKs")?.dataset.group).toBe("VALUE_BIG");
    expect(cellFor("76s")?.dataset.group).toBe("BLUFF");
    expect(cellFor("AKs")?.style.background).not.toBe(cellFor("76s")?.style.background);
    // Blaf má vlastní položku legendy, tak jako na vlastníkových chartech.
    const legendLabels = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__legend-item")]
      .map((item) => item.dataset.group);
    expect(legendLabels).toContain("BLUFF");
    expect(legendLabels).toContain("VALUE_BIG");
    // Ruka, kterou pravidlo nedrží, není totéž co ruka, kterou skládáš.
    expect(cellFor("32o")?.dataset.group).toBe("NONE");
    expect(root.querySelector<HTMLElement>(".postflop-flopzilla__legend")?.dataset.axis)
      .toBe("action");
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
    // Popisek mluví na hráče, ne interním enumem: `FOLD` mu neřekne nic a
    // prozrazuje, jak je aplikace uvnitř poskládaná.
    expect(cellFor("72o")?.title).toContain("Složení");
    expect(cellFor("AKs")?.title).toContain("Dorovnání");
    // A hlavně: odlišit je musí **barva**, ne až popisek po najetí myší. Tohle
    // je ta vlastnost, kvůli které se matice přebarvila - dorovnání a složení
    // sedí ve stejné lajně a dokud barvila kategorie ruky, splývaly.
    expect(cellFor("AKs")?.style.background).not.toBe(cellFor("72o")?.style.background);
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

/**
 * EV po kombinacích v matici.
 *
 * Buňka je třída ruky, ale číslo, které se v ní ukáže, musí patřit konkrétní
 * kombinaci. Průměr přes třídu by neodpovídal žádné ruce: `76` se dvěma srdci na
 * srdcové desce je jiná ruka než `76` bez nich a měřeno se uvnitř třídy EV
 * rozchází až o čtrnáct blindů.
 */
describe("EV kombinací v matici", () => {
  function spotWithEv() {
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 42,
      street: "FLOP",
      heroCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "s" }],
    }));
    return {
      ...spot,
      comboEvs: [
        // Dvě kombinace téže třídy s velmi odlišnou EV - přesně ten případ,
        // kdy by průměr lhal.
        { combo: "AsKs", values: [
          { action: "CHECK" as const, evBb: 1.2 },
          { action: "BET_BIG" as const, evBb: 8.4 },
        ] },
        { combo: "AdKd", values: [
          { action: "CHECK" as const, evBb: 1.1 },
          { action: "BET_BIG" as const, evBb: -2.5 },
        ] },
        { combo: "7h6h", values: [{ action: "CHECK" as const, evBb: 0.4 }] },
      ],
    };
  }

  it("v buňce vypíše každou kombinaci zvlášť, ne jejich průměr", () => {
    const root = document.createElement("div");
    renderPostflopRangeMatrix(spotWithEv(), root);

    const cell = root.querySelector<HTMLElement>('[data-hand="AKs"]');
    expect(cell?.dataset.evCombos, "buňka nese počet kombinací s EV").toBe("2");
    cell?.click();

    const rows = [...root.querySelectorAll<HTMLElement>(".postflop-flopzilla__detail-ev-row")];
    expect(rows.map((row) => row.dataset.combo)).toEqual(["AsKs", "AdKd"]);
    // Osm a půl blindu proti minus dvěma a půl: průměr by byl kolem tří a
    // neodpovídal by ani jedné z těch ruk.
    expect(rows[0].textContent).toContain("+8.4 BB");
    expect(rows[1].textContent).toContain("-2.5 BB");
  });

  it("na desetinu, ne na tisícinu: víc přesnosti ta data nemají", () => {
    const root = document.createElement("div");
    renderPostflopRangeMatrix(spotWithEv(), root);
    root.querySelector<HTMLElement>('[data-hand="AKs"]')?.click();
    const text = root.querySelector(".postflop-flopzilla__detail-ev")?.textContent ?? "";
    expect(text).not.toMatch(/\d\.\d{2}/);
  });

  it("hrdinovu kombinaci odliší od ostatních", () => {
    const root = document.createElement("div");
    renderPostflopRangeMatrix(spotWithEv(), root);
    root.querySelector<HTMLElement>('[data-hand="AKs"]')?.click();
    const hero = root.querySelector<HTMLElement>(".postflop-flopzilla__detail-ev-row--hero");
    expect(hero?.dataset.combo).toBe("AsKs");
  });

  it("buňka bez EV se netváří, že ji má", () => {
    const root = document.createElement("div");
    renderPostflopRangeMatrix(spotWithEv(), root);
    const cell = root.querySelector<HTMLElement>('[data-hand="QQ"]');
    expect(cell?.dataset.evCombos).toBeUndefined();
    cell?.click();
    expect(root.querySelector(".postflop-flopzilla__detail-ev")).toBeNull();
  });

  it("spot bez tabulky matici nerozbije", () => {
    // Většina spotů EV nemá: flop a turn ji nedrží vůbec a river jen tam, kde
    // tabulka dorazila.
    const root = document.createElement("div");
    const spot = postflopSpotToTrainingSpot(generatePostflopSpot({
      seed: 7, street: "FLOP",
      heroCards: [{ rank: "A", suit: "s" }, { rank: "K", suit: "s" }],
    }));
    renderPostflopRangeMatrix(spot, root);
    expect(root.querySelectorAll(".postflop-flopzilla__cell").length).toBe(169);
    expect(root.querySelector("[data-ev-combos]")).toBeNull();
  });
});
