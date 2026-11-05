import { describe, expect, it } from "vitest";

import { renderHandGrid, renderHandGridBlock } from "../../src/data/ranges/handGridRender";

/**
 * Mřížka existuje kvůli review, které je jediná věc držící obsah na LOW.
 *
 * Range předkládaná jako čárkami oddělený seznam padesáti tříd neřekne o tvaru
 * nic. Že se sází celý horní trojúhelník ale bez nízkých suited spojek, je z
 * mřížky vidět hned a ze seznamu nikdy.
 */
describe("mřížka ruk", () => {
  it("dá barevné ruce nad úhlopříčku a nebarevné pod ni", () => {
    // Konvence, ne volba: obrácení by udělalo mřížku, která vypadá správně a
    // ukazuje opak.
    const grid = renderHandGrid([{ action: "BET", handClasses: ["AKs"], combos: 4 }]);
    const rows = grid.lines.slice(1);
    // Řádek A, sloupec K je nad úhlopříčkou, takže AKs.
    expect(rows[0].includes("#")).toBe(true);
    // Řádek K, sloupec A by byl AKo - ten v range není.
    const kingRow = rows[1];
    expect(kingRow.trimStart().startsWith("K ·")).toBe(true);
  });

  it("rozlišuje ruku, kterou range nedrží, od ruky, která se skládá", () => {
    // Prázdno je informace. Kdyby splývalo se skládáním, čtenář by nepoznal
    // range, které chybí celá část mřížky.
    const block = renderHandGridBlock([
      { action: "CHECK", handClasses: ["AA"], combos: 6 },
    ]);
    expect(block).toContain("ruka, kterou range vůbec nedrží");
    expect(block).toContain("·");
  });

  it("dá nejširší akci první znak, aby výjimky byly vidět", () => {
    const grid = renderHandGrid([
      { action: "BET", handClasses: ["AA"], combos: 6 },
      { action: "CHECK", handClasses: ["KK", "QQ", "JJ"], combos: 18 },
    ]);
    expect(grid.legend[0].action).toBe("CHECK");
    expect(grid.legend[0].symbol).toBe("#");
  });

  it("umí pořadí zachovat, když samo něco znamená", () => {
    // Pásma „sází na většině desek" až „nikdy nesází" mají vlastní smysluplné
    // pořadí; přerovnat je podle počtu ruk by z legendy udělalo hádanku.
    const grid = renderHandGrid([
      { action: "sází na většině desek", handClasses: ["AA"], combos: 6 },
      { action: "nikdy nesází", handClasses: ["KK", "QQ", "JJ"], combos: 18 },
    ], { preserveOrder: true });
    expect(grid.legend[0].action).toBe("sází na většině desek");
  });

  it("nakreslí všech třináct řádků i s hlavičkou", () => {
    const grid = renderHandGrid([{ action: "CHECK", handClasses: ["AA"], combos: 6 }]);
    expect(grid.lines).toHaveLength(14);
  });
});
