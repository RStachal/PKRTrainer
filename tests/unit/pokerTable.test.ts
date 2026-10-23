// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { villainActionBeforeHero, type PostflopTrainingSpot } from "../../src/core/postflopTrainingSpot";
import type { Card, Spot, TableState } from "../../src/core/types";
import { setAppLanguage } from "../../src/ui/cs";
import { pokerTable, postflopPokerTable } from "../../src/ui/kit/pokerTable";

/**
 * Stůl nové obrazovky tréninku. Rozmístění bere z `tableModel.ts` stejně jako
 * starý stůl; tady se hlídá, že ho kreslí celé a že ho popíše čtečce.
 */

const heroCards: [Card, Card] = [
  { rank: "9", suit: "s" },
  { rank: "6", suit: "s" },
];

function spot(tableState: Partial<TableState>, heroPos: Spot["heroPos"]): Spot {
  return {
    id: "test",
    context: "RFI",
    heroPos,
    effStack: 30,
    ante: "ON",
    pushFold: false,
    hand: "96s",
    heroCards,
    tableState: {
      heroPos,
      pushFold: false,
      effectiveStackBB: 30,
      limpsBefore: 0,
      callsBefore: 0,
      facing: "NONE",
      isBvB: false,
      ...tableState,
    },
    answers: [{ key: "FOLD", label: "Fold" }],
    correctKeys: ["FOLD"],
    strictCorrect: ["FOLD"],
    explanation: "Testovací spot.",
    startingPot: 2.5,
  };
}

const seat = (table: HTMLElement, position: string) =>
  table.querySelector<HTMLElement>(`.dx-table__seat[data-position="${position}"]`)!;

afterEach(() => setAppLanguage("CZ"));

describe("stůl nové obrazovky", () => {
  it("nakreslí devět sedadel s hráčem dole uprostřed a složená sedadla před ním", () => {
    const table = pokerTable(document, spot({}, "CO"), "ON");
    expect(table.querySelectorAll(".dx-table__seat")).toHaveLength(9);
    const hero = seat(table, "CO");
    expect(hero.dataset.hero).toBe("true");
    expect(hero.style.getPropertyValue("--seat-x")).toBe("50%");
    expect(hero.style.getPropertyValue("--seat-y")).toBe("90%");
    expect(["UTG", "UTG+1", "UTG+2", "LJ", "HJ"].map((position) => seat(table, position).dataset.folded))
      .toEqual(["true", "true", "true", "true", "true"]);
    expect(["BTN", "SB", "BB"].map((position) => seat(table, position).dataset.folded))
      .toEqual(["false", "false", "false"]);
    expect(seat(table, "BTN").querySelector(".dx-table__dealer")?.textContent).toBe("D");
    expect(table.querySelector(".dx-table__pot")?.textContent).toBe("Pot 2,5 BB");
  });

  it("dá otevření jmenovanému protihráči a obarví ho barvou akce", () => {
    const table = pokerTable(document, spot({ facing: "OPEN", vsSeat: "HJ" }, "BTN"), "ON");
    const badge = seat(table, "HJ").querySelector<HTMLElement>(".dx-table__badge");
    expect(badge?.textContent).toBe("OPEN 2.5x");
    expect(badge?.style.getPropertyValue("--action-accent")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(seat(table, "CO").dataset.folded).toBe("true");
  });

  it("je pro čtečku jeden obrázek s popisem situace", () => {
    const table = pokerTable(document, spot({ facing: "OPEN", vsSeat: "HJ" }, "BTN"), "ON");
    expect(table.getAttribute("role")).toBe("img");
    expect(table.getAttribute("aria-label")).toBe("Stůl: jsi na BTN, 30 BB, pot 2,5 BB; HJ OPEN 2.5x.");
    setAppLanguage("EN");
    const english = pokerTable(document, spot({}, "CO"), "ON");
    expect(english.getAttribute("aria-label")).toBe("Table: you are CO, 30 BB, pot 2.5 BB; no action before you.");
  });
});

describe("postflopový stůl", () => {
  function postflopSpot(actionNode: string, inPosition: boolean, facingBetBB?: number): PostflopTrainingSpot {
    return {
      street: "FLOP",
      actionNode,
      heroCards,
      board: [
        { rank: "K", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
      ],
      potBB: 6,
      effectiveStackBB: 40,
      heroPosition: inPosition ? "BTN" : "BB",
      villainPosition: inPosition ? "BB" : "BTN",
      inPosition,
      explanation: {
        source: facingBetBB === undefined
          ? { kind: "FALLBACK", ruleId: "postflop-generator-heuristic" }
          : { kind: "STRATEGY_PACK", facingBetBB },
      },
    } as unknown as PostflopTrainingSpot;
  }

  it("dá desku doprostřed, aktivní nechá jen hráče a soupeře", () => {
    const table = postflopPokerTable(document, postflopSpot("SINGLE_RAISED_POT_CBET", true));
    expect([...table.querySelectorAll(".dx-table__board .dx-card")].map((node) => (node as HTMLElement).dataset.card))
      .toEqual(["Ks", "7d", "2c"]);
    expect(table.querySelector(".dx-table__pot")?.textContent).toBe("Pot 6 BB");
    expect([...table.querySelectorAll<HTMLElement>('.dx-table__seat[data-folded="false"]')]
      .map((node) => node.dataset.position)).toEqual(["BTN", "BB"]);
    expect(seat(table, "BTN").dataset.hero).toBe("true");
  });

  it("popíše čtečce desku i akci soupeře", () => {
    expect(postflopPokerTable(document, postflopSpot("SINGLE_RAISED_POT_CBET", true)).getAttribute("aria-label"))
      .toBe("Stůl: jsi na BTN proti BB, 40 BB, pot 6 BB; deska pikový král, kárová sedmička, křížová dvojka; BB checknul.");
    expect(postflopPokerTable(document, postflopSpot("FLOP_FACING_BET", false, 2)).getAttribute("aria-label"))
      .toBe("Stůl: jsi na BB proti BTN, 40 BB, pot 6 BB; deska pikový král, kárová sedmička, křížová dvojka; BTN vsadil 2 BB.");
    setAppLanguage("EN");
    expect(postflopPokerTable(document, postflopSpot("SINGLE_RAISED_POT_CBET", false)).getAttribute("aria-label"))
      .toBe("Table: you are BB against BTN, 40 BB, pot 6 BB; board King of spades, Seven of diamonds, Two of clubs; you act first.");
  });
});

describe("akce soupeře před hráčem", () => {
  it("plyne z uzlu a pozice", () => {
    expect(villainActionBeforeHero({ actionNode: "FLOP_FACING_BET", inPosition: true })).toBe("BET");
    expect(villainActionBeforeHero({ actionNode: "RIVER_FACING_BET", inPosition: false })).toBe("BET");
    expect(villainActionBeforeHero({ actionNode: "TURN_BARREL", inPosition: true })).toBe("CHECK");
    expect(villainActionBeforeHero({ actionNode: "TURN_OOP_LEAD", inPosition: false })).toBe("NONE");
  });
});
