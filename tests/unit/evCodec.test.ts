import { describe, expect, it } from "vitest";

import {
  decodeComboMask,
  decodeEvDeltas,
  encodeComboMask,
  encodeEvDeltas,
} from "../../src/core/evCodec";

/**
 * Zápis EV tabulky.
 *
 * EV musí být po kombinacích, protože uvnitř jedné třídy ruk se rozchází až o
 * čtrnáct blindů - průměr přes třídu by hráči lhal. Po kombinacích je to ale
 * kolem 134 tisíc hodnot na rodinu, a záleží nejen na tom, jak jsou velké, ale
 * i jak se komprimují: rozpočet chunku má strop na raw i na gzip.
 */
describe("zápis EV tabulky", () => {
  it("vrátí, co dostal, na desetinu blindu", () => {
    const values = [0, 1.2, -3.4, 12.5, -0.1, 150];
    expect(decodeEvDeltas(encodeEvDeltas(values, 3), 3)).toEqual(values);
  });

  it("chybějící hodnotu odliší od nuly", () => {
    // Nula je platné EV a u složení dokonce to nejčastější. Kdyby se chybějící
    // akce ukládala jako nula, hráč by u nedostupné akce viděl číslo.
    const decoded = decodeEvDeltas(encodeEvDeltas([null, 0, null, -0], 2), 2);
    expect(decoded[0]).toBeNull();
    expect(decoded[1]).toBe(0);
    expect(decoded[2]).toBeNull();
    expect(decoded[3]).toBe(0);
  });

  it("mezera neposune hodnoty za sebou", () => {
    // Rozdíl se počítá proti poslední známé hodnotě téže akce. Kdyby chybějící
    // hodnota základ posunula nebo vynulovala, propsala by se jedna mezera do
    // všech hodnot za ní - a vypadaly by naprosto věrohodně.
    const values = [1, 5, null, 6, 3, 7];
    expect(decodeEvDeltas(encodeEvDeltas(values, 2), 2)).toEqual(values);
  });

  it("rozdíl se počítá po akcích, ne přes sousední hodnotu", () => {
    // Vedle sebe v poli leží různé akce, které spolu nesouvisejí. Tři
    // kombinace, dvě akce: každá akce má vlastní řadu.
    const values = [10, -10, 10.5, -9.5, 11, -9];
    expect(decodeEvDeltas(encodeEvDeltas(values, 2), 2)).toEqual(values);
  });

  it("zaokrouhlí na desetinu, ne na celé", () => {
    // Trenažér ukazuje jedno desetinné místo; jemnější uložení by platilo za
    // přesnost, kterou nikdo neuvidí, hrubší by ubralo, co vidí.
    expect(decodeEvDeltas(encodeEvDeltas([1.24, 1.26], 1), 1)).toEqual([1.2, 1.3]);
  });

  it("zvládne hloubku, jakou knihovna má", () => {
    // Nejhlubší spot je 150 BB, pot může být násobek. Strop int16 je 3276,7.
    const values = [3000, -3000, 1500.5];
    expect(decodeEvDeltas(encodeEvDeltas(values, 1), 1)).toEqual(values);
  });

  it("hodnotu mimo rozsah ořízne, místo aby přetekla", () => {
    // Přetečení by z velkého kladného EV udělalo velké záporné - tichá záměna
    // nejlepší akce za nejhorší.
    const decoded = decodeEvDeltas(encodeEvDeltas([99999, -99999], 1), 1);
    expect(decoded[0]).toBeGreaterThan(3000);
    expect(decoded[1]).toBeLessThan(-3000);
  });

  it("velká tabulka se zapíše i přečte", () => {
    // Tabulka rodiny má desítky tisíc hodnot; tohle je její řád.
    const values = Array.from({ length: 50000 }, (_, index) => Math.round(index % 200 - 100) / 10);
    const decoded = decodeEvDeltas(encodeEvDeltas(values, 4), 4);
    // Porovnání po prvcích, ne `toEqual` nad padesáti tisíci: to sestavuje
    // rozdílový výpis a trvá déle než celý zbytek sady.
    expect(decoded.length).toBe(values.length);
    const mismatch = values.findIndex((value, index) => decoded[index] !== value);
    expect(mismatch, `první rozdíl na indexu ${mismatch}`).toBe(-1);
  });

  it("je znatelně menší než tytéž hodnoty zapsané naplno", () => {
    // Kvůli tomuhle to celé vzniklo. Sousední kombinace jsou podobné ruce, takže
    // rozdíly jsou malá čísla a často nuly - a právě to gzip umí, kdežto base64
    // nad celými čísly ne: to spadlo na 170 KiB proti stropu 128.
    const values = Array.from({ length: 20000 }, (_, index) => (
      Math.round((index % 300) / 7) / 10 + Math.floor(index / 300) / 10
    ));
    const asWritten = JSON.stringify(values).length;
    const asDeltas = JSON.stringify(encodeEvDeltas(values, 4)).length;
    expect(asDeltas).toBeLessThan(asWritten * 0.8);
  });
});

/**
 * Bitmapa kombinací.
 *
 * V prvním odhadu velikosti EV souboru jsem na seznamy indexů úplně zapomněl a
 * spletl se čtyřikrát: 175 kB proti skutečným 685. Samotné indexy zabíraly 205
 * kB na rodinu, tedy třetinu souboru.
 */
describe("bitmapa kombinací", () => {
  it("vrátí, co dostala, vzestupně", () => {
    const indices = [0, 5, 7, 8, 200, 314];
    expect(decodeComboMask(encodeComboMask(indices, 315), 315)).toEqual(indices);
  });

  it("pořadí na vstupu nerozhoduje, výstup je vždy vzestupný", () => {
    // Hodnoty jdou ve stejném pořadí jako indexy, takže „vzestupně" není
    // kosmetika - kdyby se pořadí lišilo, EV by se přiřadilo jiné ruce.
    expect(decodeComboMask(encodeComboMask([9, 2, 40], 64), 64)).toEqual([2, 9, 40]);
  });

  it("prázdná množina projde", () => {
    expect(decodeComboMask(encodeComboMask([], 315), 315)).toEqual([]);
  });

  it("index mimo rozsah zahodí, místo aby přepsal cizí bit", () => {
    expect(decodeComboMask(encodeComboMask([-1, 5, 999], 64), 64)).toEqual([5]);
  });

  it("je řádově menší než seznam indexů v JSON", () => {
    // Kvůli tomuhle to vzniklo: 195 z 315 kombinací je typické pravidlo.
    const indices = Array.from({ length: 195 }, (_, i) => i);
    const mask = encodeComboMask(indices, 315).length;
    expect(mask).toBeLessThan(JSON.stringify(indices).length / 5);
  });
});
