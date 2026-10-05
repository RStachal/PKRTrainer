import { describe, expect, it } from "vitest";

import {
  bucketForSource, contextForVocabulary, mapAction, situationFromFileName,
} from "../../scripts/lib/ryeActionMapping.mts";

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

  it("`3bet/call` ve squeeze spotu je SQUEEZE, ve vs-open pořád 3BET", () => {
    /*
     * Vlastníkovo čtení mřížek 1. 10. 2026, osm stránek (id154-161) odmítnutých
     * s „sloučení akcí vadí".
     *
     * Ve squeeze spotu už před hrdinou leží otevření **a** dorovnání, takže
     * navýšení na 9 bb je jedna a tatáž akce, ať ji zdroj píše `3bet/call to
     * 9bb` (hodnota) nebo `Bluff Squeeze to 9bb` (blaf). Do 1. 10. šlo první na
     * 3BET a druhé na SQUEEZE, takže jedna mřížka měla na tutéž akci dvě různé
     * správné odpovědi - a trenažér hodnotí přesnou shodou.
     *
     * Druhá polovina testu je ta důležitější: v `VS_OPEN` se nic nezměnilo.
     * Tam hrdina čelí otevření, žádné dorovnání před ním není a `3bet/call` je
     * doopravdy 3bet.
     */
    expect(mapAction("SQUEEZE", "3bet/call")?.action).toBe("SQUEEZE");
    expect(mapAction("SQUEEZE", "3bet/call to 9bb")?.action).toBe("SQUEEZE");
    expect(mapAction("SQUEEZE", "Bluff Squeeze to 9bb")?.action).toBe("SQUEEZE");
    expect(mapAction("VS_OPEN", "3bet/call")?.action).toBe("3BET");
    // Velikost se ztrácí do poznámky, ne do akce - squeeze má produkt jeden.
    expect(mapAction("SQUEEZE", "3bet/call to 9bb")?.lost).toContain("velikost 9 bb");
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
    expect(contextForVocabulary(["All in", "Call"], "ICM11-bb13bb-sb9bb-l.html")).toBeUndefined();
  });

  it("samotný jam situaci neřekne - rozhoduje jméno, a co jméno neřekne, se nevydá", () => {
    // Vlastníkova strojová kontrola 15. 9. 2026: všech devět push/fold
    // záznamů draftu byly jamy **proti otevření** - `F3B` je nabídka
    // „Flatting & 3Betting", `ICM11-sb9bb-btn55bb` je SB proti otevření BTN,
    // `MUL` je squeeze. Do té doby se `All in` a `Jam` samy o sobě četly jako
    // push/fold a produkt by se ptal na situaci bez otvírače.
    expect(contextForVocabulary(["Jam"], "F3B-20BB-SB-vs-BTN.html")).toBe("VS_OPEN");
    expect(contextForVocabulary(["All in"], "ICM11-sb9bb-btn55bb.html")).toBe("VS_OPEN");
    expect(contextForVocabulary(["All in"], "MUL-20BB-BB-vs-CO_BTN.html")).toBe("SQUEEZE");
    // Skutečný push/fold je jen `PU-`: hrdina jde první do potu.
    expect(contextForVocabulary(["Jam"], "PU-10bb-BU.html")).toBe("PUSH_FOLD");
    expect(mapAction("PUSH_FOLD", "Jam")?.action).toBe("JAM");
    // Soupeř **za** hrdinou by znamenal, že první do potu jde hrdina - to
    // není čelení otevření a žádný kontext to nepopisuje. Bez jména totéž.
    expect(contextForVocabulary(["All in"], "ICM11-utg50bb-sb9bb.html")).toBeUndefined();
    expect(contextForVocabulary(["All in"])).toBeUndefined();
    expect(contextForVocabulary(["Jam"])).toBeUndefined();
  });

  it("push/fold jméno bez soupeře se čte jako situace", () => {
    // `PU-10bb-BU` nemá `-vs-`, takže do 15. 9. 2026 propadalo jako „bez
    // situace" a draft neměl ani jednu skutečnou push/fold stránku.
    expect(situationFromFileName("PU-10bb-BU.html")).toEqual({ seat: "BTN", stackBB: 10, villains: 0 });
    expect(situationFromFileName("PU-10bb-UTG1.html")).toEqual({ seat: "UTG+1", stackBB: 10, villains: 0 });
    // BB nemá push/fold první do potu; jméno s ním se nevydá.
    expect(situationFromFileName("PU-10bb-BB.html")).toBeUndefined();
  });

  it("otevírací stránka: každá barva je otevření s plánem proti 3betu v poznámce, OpenJam je shove, limp/raise SB se nevydá", () => {
    // Nabídka „Openraising" (rozhodnutí 6a, 22. 9. 2026): barva říká, co
    // s rukou po 3betu, ne jestli se otevírá - otevírá se každá barvená.
    expect(situationFromFileName("OP-100BB-BU.html")).toEqual({ seat: "BTN", stackBB: 100, villains: 0 });
    expect(situationFromFileName("OP-30BB-BTN.html")).toEqual({ seat: "BTN", stackBB: 30, villains: 0 });
    expect(situationFromFileName("OP-40BB-MP.html")).toEqual({ seat: "LJ", stackBB: 40, villains: 0 });
    expect(contextForVocabulary(["Call 3B", "Fold vs 3B", "4B Bluff"], "OP-100BB-BU.html")).toBe("RFI");
    expect(mapAction("RFI", "Call 3B or 4B")).toEqual({ action: "OPEN", lost: "plán proti 3betu: Call 3B or 4B" });
    expect(mapAction("RFI", "Broke vs BU - BB")).toEqual({ action: "OPEN", lost: "plán proti 3betu: Broke vs BU - BB" });
    expect(mapAction("RFI", "Call 3B (&lt;4x)")?.action).toBe("OPEN");
    expect(mapAction("RFI", "OpenJam")).toEqual({ action: "JAM", lost: "" });
    // Limp/raise strategie SB je blind proti blindu s vlastním slovníkem; tady
    // se nevydá, místo aby limpy spadly do otevření.
    expect(mapAction("RFI", "Limp / Call")).toBeUndefined();
    expect(mapAction("RFI", "Raise / Fold vs 3B")).toBeUndefined();
  });

  it("hloubka dál než pětinu od kbelíku nedostane žádný", () => {
    // 15. 9. 2026: `ICM7-bb7bb-*` v kbelíku 5 bb dostalo „moc těsné", zatímco
    // 35→30, 13→15, 18→20 a 45→40 prošly. Nejbližší kbelík není totéž co
    // kbelík, který range vystihuje.
    expect(bucketForSource(7)).toBeUndefined();
    expect(bucketForSource(35)).toBe(30);
    expect(bucketForSource(13)).toBe(15);
    expect(bucketForSource(18)).toBe(20);
    expect(bucketForSource(9)).toBe(10);
    // Hranice je včetně: osm blindů je přesně pětina od desíti a ještě projde.
    expect(bucketForSource(8)).toBe(10);
    expect(bucketForSource(7.5)).toBeUndefined();
  });
});
