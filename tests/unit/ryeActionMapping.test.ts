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

  it("pravidlo „All in | Call“ bez jména souboru zůstává zavřené", () => {
    // Slova samotná situaci neřeknou. Bez jména se legenda čte jako čelení
    // all-inu, kde `All in` není hrdinova akce a slovník ho nezná - stránka
    // se nevydá, místo aby jam zmizel do foldu.
    //
    // Kdyby to někdo chtěl „spravit" přidáním `all in` do slovníku `VS_ALLIN`,
    // udělal by z jamů dorovnání.
    const context = contextForVocabulary(["All in", "Call"]);
    expect(context).toBe("VS_ALLIN");
    expect(mapAction("VS_ALLIN", "Call")).toEqual({ action: "CALL_JAM", lost: "" });
    expect(
      mapAction("VS_ALLIN", "All in"),
      "kdyby to začalo mapovat, musí se nejdřív rozhodnout kontext",
    ).toBeUndefined();
  });

  it("„All in | Call“ se jménem souboru rozhodne tak, jak rozhodl majitel", () => {
    // Bod 249, 14. 9. 2026: `MUL-*` je squeeze multiway a `All in` je vlastní
    // squeeze-jam; `ICM*-r` je obrana proti raisu a `All in` je 3bet-jam.
    // V obou kontextech se obě barvy přeloží, takže stránky projdou celé.
    expect(contextForVocabulary(["All in", "Call"], "MUL-20BB-BB-vs-MP_LP.html")).toBe("SQUEEZE");
    expect(mapAction("SQUEEZE", "All in")?.action).toBe("JAM");
    expect(mapAction("SQUEEZE", "Call")?.action).toBe("CALL");
    expect(contextForVocabulary(["All in", "Call"], "ICM11-bb13bb-sb9bb-r.html")).toBe("VS_OPEN");
    expect(mapAction("VS_OPEN", "All in")?.action).toBe("JAM");
    // `-ai` je opravdu čelení all-inu; `-l` by byl `VS_LIMP`, který slovník
    // nezná a žádná stránka s touhle legendou ho nepotřebuje.
    expect(contextForVocabulary(["All in", "Call"], "ICM11-bb13bb-sb9bb-ai.html")).toBe("VS_ALLIN");
    expect(contextForVocabulary(["All in", "Call"], "ICM11-bb13bb-sb9bb-l.html")).toBe("VS_ALLIN");
    // Jméno rozhoduje jen tuhle legendu; push/fold se jím nemění.
    expect(contextForVocabulary(["All in"], "MUL-20BB-BB-vs-MP_LP.html")).toBe("PUSH_FOLD");
  });

  it("push/fold slovník svoje barvy přeloží celé", () => {
    // Protiklad k předchozímu: kontext, který vybere táž výjimková tabulka a
    // svoje barvy zná. Tady se nic nezahazuje a stránka projde.
    expect(contextForVocabulary(["All in"])).toBe("PUSH_FOLD");
    expect(mapAction("PUSH_FOLD", "All in")?.action).toBe("JAM");
  });
});
