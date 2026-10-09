import { describe, expect, it } from "vitest";

import {
  bucketForSource, contextForVocabulary, mapAction, situationFromFileName, villainGroupSeats,
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
    // `flatCallers: []`, ne chybějící: u push/fold **nikdo nedorovnal**, a to je
    // odpověď. Chybějící seznam znamená „ze jména se to nepozná" a zpřesněná cesta
    // takový záznam odmítá - naměřeno 7. 10. 2026, že záměna těch dvou shodila čtyři
    // schválené BBSTR záznamy (69 přijatých → 63).
    // `PU-10bb-BU` nemá `-vs-`, takže do 15. 9. 2026 propadalo jako „bez
    // situace" a draft neměl ani jednu skutečnou push/fold stránku.
    expect(situationFromFileName("PU-10bb-BU.html")).toEqual({ seat: "BTN", stackBB: 10, villains: 0, flatCallers: [] });
    expect(situationFromFileName("PU-10bb-UTG1.html")).toEqual({ seat: "UTG+1", stackBB: 10, villains: 0, flatCallers: [] });
    // BB nemá push/fold první do potu; jméno s ním se nevydá.
    expect(situationFromFileName("PU-10bb-BB.html")).toBeUndefined();
  });

  it("jméno nese i toho, kdo otevření dorovnal - ne jen kolik jich bylo", () => {
    /*
     * Rozhodnutí 4a z 1. 10. 2026. Do 7. 10. parser soupeře **počítal a jejich
     * jména zahodil**, takže se mřížky lišící se jen dorovnávajícím srazily
     * v jedné buňce (7 z 8 srážek) a která přistane, neurčovalo žádné pravidlo.
     *
     * Že na dorovnávajícím záleží, je změřené na mřížkách z 1. 10.: BTN na
     * 100 bb squeezuje 67 kombinací proti flatu z EP, 84 proti MP a 102 proti CO.
     */
    const mul = situationFromFileName("MUL-40BB-BTN-vs-EP_MP.html");
    expect(mul?.opener).toEqual({ source: "EP" });
    expect(mul?.flatCallers).toEqual([{ source: "MP", seat: "LJ" }]);

    // `EP` zůstává **nepřeložené**: je to skupina, a vlastník v T4 upozornil, že
    // „EP jako dorovnávající při otvírači UTG je UTG+1 nebo UTG+2". Přeložit ji
    // tady, kde není vidět, kdo otevřel, by dalo dorovnávajícímu sedačku
    // otvírače. `MP` skupina není, takže se přeloží (zdroj jmenuje devět sedaček).
    const squeeze = situationFromFileName("SQU-40BBMais-HJ-vs-EP-MP.html");
    expect(squeeze?.opener).toEqual({ source: "EP" });
    expect(squeeze?.flatCallers).toEqual([{ source: "MP", seat: "LJ" }]);

    // Dva dorovnávající, proto je klíč seznam a ne jedno pole (T4, bod 1).
    const two = situationFromFileName("SQU-40BBMais-BB-vs-CO-BU-SB.html");
    expect(two?.opener).toEqual({ source: "CO", seat: "CO" });
    expect(two?.flatCallers).toEqual([
      { source: "BU", seat: "BTN" },
      { source: "SB", seat: "SB" },
    ]);

    // Otevření bez dorovnání není squeeze spot: prázdný seznam to říká.
    const heads = situationFromFileName("F3B-100BB-BTN-vs-UTG.html");
    expect(heads?.opener).toEqual({ source: "UTG", seat: "UTG" });
    expect(heads?.flatCallers).toEqual([]);

    // Tvar s hloubkou u sedačky jmenuje hrdinu první, takže otvírač je druhý.
    const paired = situationFromFileName("ICM-btn35bb-co60bb.html");
    expect(paired?.seat).toBe("BTN");
    expect(paired?.opener).toEqual({ source: "CO", seat: "CO" });
    expect(paired?.flatCallers).toEqual([]);
  });

  it("spojovník za podtržítkem je lomítko skupiny, ne druhý dorovnávající", () => {
    /*
     * **Opraveno 9. 10. 2026 a vyvrací to, co tu stálo od 7. 10.** Tehdy tu bylo
     * napsáno „EP otevřel, CO a BTN dorovnali, tedy tři soupeři". Změřeno z
     * nabídky zdroje i z velikostí squeeze: jsou **dva**.
     *
     * Nabídka ta jména popisuje sama a píše v nich lomítko:
     *
     *   MUL-40BB-BB-vs-EP_CO-BTN   „BB VS EP OPEN & CO/BU FLATCALL"
     *   MUL-40BB-BB-vs-EP_EP-MP    „BB VS EP OPEN & EP/MP FLATCALL"
     *   MUL-40BB-BB-vs-EP_SB       „BB VS EP OPEN & SB FLATCALL"
     *
     * Rozhodující je ale velikost squeeze, protože ta je mechanická funkce potu.
     * BB na 40 bb squeezuje na **11 bb** proti jednomu jmenovanému dorovnávajícímu
     * (`EP_SB`, `MP_SB`, `CO_BTN`, `BTN_SB`) **i** proti skupině (`EP_EP-MP`,
     * `EP_CO-BTN`, `MP_LP`). Druhý dorovnávající by pot zvětšil a squeeze zvedl;
     * nezvedl, takže skupina je jeden hráč. U SB na 40 bb je to ještě ostřejší:
     * proti `EP_EP-MP` se squeezuje na 9 bb, kdežto proti `EP_LP` a `CO_BTN` na 10
     * - dva dorovnávající by velikost nikdy nesnížili.
     *
     * Pořád platí, proč se pomlčka za `vs` čte: bez ní se čtení zastavilo na
     * `EP_CO` a skupina přišla o půlku jména. Dělící znak je ale **podtržítko**,
     * ne pomlčka: `OTVÍRAČ_DOROVNÁVAJÍCÍ`, a pomlčka uvnitř segmentu je lomítko.
     */
    const mixed = situationFromFileName("MUL-40BB-BB-vs-EP_CO-BTN.html");
    expect(mixed?.seat).toBe("BB");
    expect(mixed?.villains).toBe(2);
    expect(mixed?.opener).toEqual({ source: "EP" });
    expect(mixed?.flatCallers).toEqual([{ source: "CO-BTN" }]);

    const early = situationFromFileName("MUL-40BB-SB-vs-EP_EP-MP.html");
    expect(early?.villains).toBe(2);
    expect(early?.flatCallers).toEqual([{ source: "EP-MP" }]);

    // Jeden jmenovaný dorovnávající se nesmí splést se skupinou: `CO_BTN` je
    // „CO OPEN & BU FLATCALL", tedy dvě sedačky oddělené podtržítkem.
    const named = situationFromFileName("MUL-40BB-BB-vs-CO_BTN.html");
    expect(named?.villains).toBe(2);
    expect(named?.opener).toEqual({ source: "CO", seat: "CO" });
    expect(named?.flatCallers).toEqual([{ source: "BTN", seat: "BTN" }]);
  });

  it("u squeeze stránek zůstává pomlčka seznamem hráčů", () => {
    /*
     * SQU podtržítko nepoužívá a jeho pomlčka **je** oddělovač hráčů - dokazuje to
     * sám zdroj dvěma jmény, která jako skupina nemají smysl:
     *
     *   SQU-40BBMais-HJ-vs-MP-MP             „HJ vs MP/MP"
     *   SQU-40BBMais-MP-vs-EP-EP-or-EP-MP    „MP vs EP/EP or EP/MP"
     *
     * „Jeden ze skupiny {MP, MP}" nic neznamená; „otvírač MP a dorovnávající MP"
     * ano. Proto se oprava skupin nesmí přelít do tvaru 4.
     */
    const twice = situationFromFileName("SQU-40BBMais-HJ-vs-MP-MP.html");
    expect(twice?.opener).toEqual({ source: "MP", seat: "LJ" });
    expect(twice?.flatCallers).toEqual([{ source: "MP", seat: "LJ" }]);

    const three = situationFromFileName("SQU-40BBMais-SB-vs-HJ-CO-BU.html");
    expect(three?.villains).toBe(3);
    expect(three?.flatCallers).toEqual([
      { source: "CO", seat: "CO" },
      { source: "BU", seat: "BTN" },
    ]);
  });

  it("otevírací stránka: každá barva je otevření s plánem proti 3betu v poznámce, OpenJam je shove, limp/raise SB se nevydá", () => {
    // Nabídka „Openraising" (rozhodnutí 6a, 22. 9. 2026): barva říká, co
    // s rukou po 3betu, ne jestli se otevírá - otevírá se každá barvená.
    expect(situationFromFileName("OP-100BB-BU.html")).toEqual({ seat: "BTN", stackBB: 100, villains: 0, flatCallers: [] });
    expect(situationFromFileName("OP-30BB-BTN.html")).toEqual({ seat: "BTN", stackBB: 30, villains: 0, flatCallers: [] });
    expect(situationFromFileName("OP-40BB-MP.html")).toEqual({ seat: "LJ", stackBB: 40, villains: 0, flatCallers: [] });
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

describe("skupina dorovnávajících na konkrétní sedačky", () => {
  it("EP při otvírači UTG jsou UTG+1 a UTG+2", () => {
    // Doslova vlastníkova věta z T4: „EP jako dorovnávající při otvírači UTG je
    // UTG+1 nebo UTG+2". UTG je sám otvírač a dorovnat po sobě nemůže.
    expect(villainGroupSeats("EP", "UTG", "BB")).toEqual(["UTG+1", "UTG+2"]);
    expect(villainGroupSeats("EP", "UTG", "BTN")).toEqual(["UTG+1", "UTG+2"]);
  });

  it("sedačky za hrdinou se nepočítají", () => {
    // Filtr „mezi otvíračem a hrdinou" je součást toho zadání: hrdina na UTG+2
    // má před sebou jen UTG+1.
    expect(villainGroupSeats("EP", "UTG", "UTG+2")).toEqual(["UTG+1"]);
    expect(villainGroupSeats("EP", "UTG", "UTG+1")).toEqual([]);
  });

  it("LP je CO a BTN - rozhodnutí vlastníka 1a z 8. 10. 2026", () => {
    /*
     * Do 8. 10. tu stálo „nerozbaluje se, protože se nedá změřit", a byla to
     * pravda: devět stránek s `LP` procházelo pro `{CO, BTN}` i pro `{HJ, CO}`.
     * Rozhodl to vlastník (odpověď 1a) a doložil dvěma věcmi, které jsem předtím
     * nepřečetl: jeho poznámky z koučinku píšou „Late Position: CO - BTN", a zdroj
     * sám staví `LP` do téže řady jako vypsané `CO/BU` - u hrdiny BB je položka
     * „EP OPEN & CO/BU FLATCALL", u SB na tomtéž místě „EP OPEN & LP FLATCALL".
     *
     * Proti tomu stojí, že `HJ` má při otvírači MP vlastní stránku, takže `LP`
     * není HJ; a šířka range to podpírá (BB na 40 bb: `@CO+BU` 119 tříd, `@LP`
     * 123, `@SB` 129 - LP sedí vedle CO/BU, ne vedle raných pozic).
     */
    expect(villainGroupSeats("LP", "LJ", "BB")).toEqual(["CO", "BTN"]);
    // Hrdina BTN: z LP zbyde CO, protože BTN je sám hrdina.
    expect(villainGroupSeats("LP", "LJ", "BTN")).toEqual(["CO"]);
  });

  it("složená skupina ze jména MUL se rozbalí na jednu sedačku", () => {
    /*
     * `EP_EP-MP` a `EP_CO-BTN` nesou skupinu v samotném jméně (nabídka: „EP/MP
     * FLATCALL", „CO/BU FLATCALL"). Rozbalují se tedy stejně jako `EP` a `LP` -
     * na **jednu** sedačku, ne na dvě.
     *
     * `CO-BTN` je přitom totéž co `LP`: zdroj píše jednu věc dvakrát jinak.
     */
    expect(villainGroupSeats("CO-BTN", "UTG", "BB")).toEqual(["CO", "BTN"]);
    expect(villainGroupSeats("EP-MP", "UTG", "BB")).toEqual(["UTG+1", "UTG+2", "LJ"]);
    // Hrdina HJ: z `EP/MP` zbydou ty tři, co leží mezi UTG a HJ.
    expect(villainGroupSeats("EP-MP", "UTG", "HJ")).toEqual(["UTG+1", "UTG+2", "LJ"]);
    // Hrdina LJ: LJ je sám hrdina, takže zbydou dvě rané.
    expect(villainGroupSeats("EP-MP", "UTG", "LJ")).toEqual(["UTG+1", "UTG+2"]);
  });

  it("MP skupina není - je to jedno místo u stolu", () => {
    // V devítce sedaček zdroje (`UTG UTG1 UTG2 MP HJ CO BU SB BB`) je MP mezi
    // UTG+2 a HJ, takže `SEAT_ALIASES` ho mapuje na LJ. Rozbalovat se nemá.
    expect(villainGroupSeats("MP", "UTG", "BB")).toEqual([]);
  });

  it("neznámá zkratka nic nevymýšlí", () => {
    expect(villainGroupSeats("XX", "UTG", "BB")).toEqual([]);
    expect(villainGroupSeats("EP", "neexistuje", "BB")).toEqual([]);
  });
});
