import { describe, expect, it } from "vitest";

import { decodeEvTable, encodeEvTable } from "../../src/core/evCodec";

/**
 * Zápis EV tabulky.
 *
 * EV musí být po kombinacích, protože uvnitř jedné třídy ruk se rozchází až o
 * čtrnáct blindů - průměr přes třídu by hráči lhal. Po kombinacích je to ale
 * kolem 134 tisíc hodnot na rodinu, což jako obyčejná JSON čísla nevejde do
 * rozpočtu chunku. Tenhle zápis to řeší a nesmí přitom ztratit nic, co hráč
 * uvidí.
 */
describe("zápis EV tabulky", () => {
  it("vrátí, co dostal, na desetinu blindu", () => {
    const values = [0, 1.2, -3.4, 12.5, -0.1, 150];
    expect(decodeEvTable(encodeEvTable(values), values.length)).toEqual(values);
  });

  it("chybějící hodnotu odliší od nuly", () => {
    // Nula je platné EV a u složení dokonce to nejčastější. Kdyby se chybějící
    // akce ukládala jako nula, hráč by u nedostupné akce viděl číslo.
    const decoded = decodeEvTable(encodeEvTable([null, 0, null, -0]), 4);
    expect(decoded[0]).toBeNull();
    expect(decoded[1]).toBe(0);
    expect(decoded[2]).toBeNull();
    expect(decoded[3]).toBe(0);
  });

  it("zaokrouhlí na desetinu, ne na celé", () => {
    // Trenažér ukazuje jedno desetinné místo; jemnější uložení by platilo za
    // přesnost, kterou nikdo neuvidí, hrubší by ubralo, co vidí.
    expect(decodeEvTable(encodeEvTable([1.24, 1.26]), 2)).toEqual([1.2, 1.3]);
  });

  it("zvládne hloubku, jakou knihovna má", () => {
    // Nejhlubší spot je 150 BB, pot může být násobek. Strop int16 je 3276,7.
    const values = [3000, -3000, 1500.5];
    expect(decodeEvTable(encodeEvTable(values), values.length)).toEqual(values);
  });

  it("hodnotu mimo rozsah ořízne, místo aby přetekla", () => {
    // Přetečení by z velkého kladného EV udělalo velké záporné - tichá záměna
    // nejlepší akce za nejhorší.
    const decoded = decodeEvTable(encodeEvTable([99999, -99999]), 2);
    expect(decoded[0]).toBeGreaterThan(3000);
    expect(decoded[1]).toBeLessThan(-3000);
  });

  it("kratší zápis nedopočítá nulu", () => {
    // Poškozený nebo useknutý řetězec musí vrátit "nevím", ne EV nula.
    const encoded = encodeEvTable([1.5, 2.5]);
    expect(decodeEvTable(encoded, 4)).toEqual([1.5, 2.5, null, null]);
  });

  it("velká tabulka se zapíše i přečte", () => {
    // Osm tisíc hodnot je hranice, za kterou naivní `fromCharCode(...bytes)`
    // přeteče zásobník argumentů; tabulka rodiny je řádově větší.
    //
    // Hodnoty se skládají z celých desetin, ne výpočtem typu `index / 10 - 10`:
    // ten dá -9.700000000000001, což se po zaokrouhlení na desetinu legitimně
    // nerovná sobě samému a test by padal na plovoucí aritmetice, ne na kodeku.
    const values = Array.from({ length: 50000 }, (_, index) => Math.round(index % 200 - 100) / 10);
    const decoded = decodeEvTable(encodeEvTable(values), values.length);
    // Porovnání po prvcích, ne `toEqual` nad padesáti tisíci: to sestavuje
    // rozdílový výpis a trvá déle než celý zbytek sady.
    expect(decoded.length).toBe(values.length);
    const mismatch = values.findIndex((value, index) => decoded[index] !== value);
    expect(mismatch, `první rozdíl na indexu ${mismatch}`).toBe(-1);
  });

  it("je podstatně menší než totéž v JSON", () => {
    // Kvůli tomuhle to celé vzniklo: rozdíl musí být řádový, ne kosmetický.
    const values = Array.from({ length: 20000 }, (_, index) => (index % 300) / 10 - 15);
    const asJson = JSON.stringify(values).length;
    const encoded = encodeEvTable(values).length;
    expect(encoded).toBeLessThan(asJson * 0.55);
  });
});
