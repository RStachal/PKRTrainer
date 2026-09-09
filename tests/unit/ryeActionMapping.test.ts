import { describe, expect, it } from "vitest";

import { contextForVocabulary, mapAction } from "../../scripts/lib/ryeActionMapping.mts";

/**
 * Slovník, na kterém stojí import ranží.
 *
 * Pravidlo, které se tu hlídá, je jediné: **kontext vybraný pro stránku musí
 * umět přeložit všechny její barvy.** Když neumí, ruce té barvy nemají v draftu
 * kam sednout a spadnou do foldu - a mřížka se přitom vydá jako úplná, protože
 * kontrola proti legendě běží ještě před překladem.
 *
 * Přesně to našlo majitelovo druhé čtení 9. 9. 2026 na dvou stránkách (bod 225):
 * zdroj u nich drží „All in 75 · Call 48", draft ukázal jam nula a 75 rukou ve
 * foldu.
 */
describe("slovník importu ranží", () => {
  it("překlad vrátí nedefinováno, ne náhradní akci", () => {
    // Nikdy nesmí vzniknout tichá náhrada. Zamlčený překlad je horší než žádný:
    // žádný se dá spočítat, zamlčený vypadá jako odpověď.
    expect(mapAction("VS_OPEN", "tohle zdroj neříká")).toBeUndefined();
  });

  it("pravidlo „All in | Call“ vybere kontext, který „All in“ neumí", () => {
    // Tohle je stav, kvůli kterému import ty dvě stránky odmítá. Není to
    // v pořádku, jen je to poctivě zavřené: `VS_ALLIN` je slovníková výjimka,
    // která té dvojici barev přiřkne čelení all-inu, jenže tam jam není
    // hrdinova akce, takže ho slovník nezná.
    //
    // Kdyby to někdo chtěl „spravit" přidáním `all in` do slovníku `VS_ALLIN`,
    // udělal by z jamů dorovnání. Opravit se to dá jen tím, že se rozhodne, čemu
    // ty stránky odpovídají - obě jsou ve skutečnosti squeeze nebo obrana proti
    // otevření, ne čelení all-inu. Do té doby se nevydávají.
    const context = contextForVocabulary(["All in", "Call"]);
    expect(context).toBe("VS_ALLIN");
    expect(mapAction("VS_ALLIN", "Call")).toEqual({ action: "CALL_JAM", lost: "" });
    expect(
      mapAction("VS_ALLIN", "All in"),
      "kdyby to začalo mapovat, musí se nejdřív rozhodnout kontext",
    ).toBeUndefined();
  });

  it("push/fold slovník svoje barvy přeloží celé", () => {
    // Protiklad k předchozímu: kontext, který vybere táž výjimková tabulka a
    // svoje barvy zná. Tady se nic nezahazuje a stránka projde.
    expect(contextForVocabulary(["All in"])).toBe("PUSH_FOLD");
    expect(mapAction("PUSH_FOLD", "All in")?.action).toBe("JAM");
  });
});
