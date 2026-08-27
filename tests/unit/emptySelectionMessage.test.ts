import { describe, expect, it } from "vitest";

import { bucketsWithSpots } from "../../src/core/drillEngine";
import { CS } from "../../src/ui/cs";

/**
 * Prázdný výsledek, který řekne, co funguje.
 *
 * Nabídka trenažéru je širší než obsah: push/fold i obrana proti all-inu se
 * nabízejí na 5 až 25 BB, knihovna je má na 5 a 10. Relace „push/fold, 20 BB"
 * proto rozdá **nula spotů**. Změřeno 27. 8. 2026: ze 541 dvojic, na které se
 * drill podle vlastních pravidel ptá, jich 39 (7,2 %) nemá odpověď - všechny
 * v těchhle dvou kontextech.
 *
 * Hláška „vybrané filtry neodpovídají žádnému spotu" to svádí číst jako chybu
 * výběru. Mezera je ale na naší straně, takže se to tak má i říct.
 */
describe("prázdný výběr řekne, co funguje", () => {
  it("push/fold má obsah jen na mělkých hloubkách", () => {
    expect(bucketsWithSpots(["PUSH_FOLD"], "OFF")).toEqual([5, 10]);
    expect(bucketsWithSpots(["VS_ALLIN"], "OFF")).toEqual([5, 10]);
  });

  it("hluboké kontexty mají obsah na všech nabízených hloubkách", () => {
    // Kdyby tenhle seznam někdy zřídnul, znamená to, že se nabídka rozešla
    // s obsahem i tam, kde dosud seděla.
    expect(bucketsWithSpots(["RFI"], "OFF")).toEqual([15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150]);
  });

  it("bez vybraného kontextu se sečte, co má kterýkoli z nich", () => {
    const all = bucketsWithSpots([], "OFF");
    expect(all).toContain(5);
    expect(all).toContain(150);
  });

  it("hláška jmenuje hloubky a nezmiňuje nic vnitřního", () => {
    const message = CS.filters.emptyDepths([5, 10]);
    expect(message).toContain("5, 10");
    // Hráč nemá co číst o kontextech, packech ani zdrojích.
    for (const forbidden of ["PUSH_FOLD", "VS_ALLIN", "pack", "zdroj"]) {
      expect(message).not.toContain(forbidden);
    }
  });
});
