import { describe, expect, it } from "vitest";

import { offeredPreflopActionKeysForContext } from "../../src/core/preflopActionOptions";

describe("preflop action options", () => {
  it("bere velikost isa i z benevolentní odpovědi, když striktní je limp", () => {
    // BB proti limpu na 15 bb: zdroj hraje 73s z poloviny jako iso 3,5x a
    // z poloviny limp, takže striktně je to limp a velikost isa v něm není.
    // Do 23. 9. 2026 dostalo tlačítko výchozí ISO_25X, kdežto správná odpověď
    // zněla ISO_3X - hráč tu ruku nemohl zahrát správně, ať klikl na cokoli,
    // a celá stránka kvůli tomu propadla sítkem (nález vlastníka).
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "BB", 15, ["LIMP"], ["ISO_3X", "LIMP"]))
      .toEqual(["LIMP", "ISO_3X", "JAM"]);
    // Bez benevolentní odpovědi zůstává výchozí velikost, jak byla.
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "BB", 15, ["LIMP"]))
      .toEqual(["LIMP", "ISO_25X", "JAM"]);
    // Striktní odpověď je silnější: co se má hrát vždycky, určuje tlačítko.
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "BB", 15, ["ISO_25X"], ["ISO_3X"]))
      .toEqual(["LIMP", "ISO_25X", "JAM"]);
  });

  it("returns the counterfactual actions actually offered for each common node", () => {
    expect(offeredPreflopActionKeysForContext("RFI", "BTN", 25, ["OPEN_2X"]))
      .toEqual(["OPEN_2X", "LIMP", "FOLD"]);
    // Short of thirty big blinds an open shove is on the table, because the
    // 10-20BB sheets shove hands rather than raising them.
    expect(offeredPreflopActionKeysForContext("RFI", "BTN", 15, ["OPEN_2X"]))
      .toEqual(["OPEN_2X", "LIMP", "JAM", "FOLD"]);
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "CO", 25, ["ISO_3X"]))
      .toEqual(["ISO_3X", "OVERLIMP", "FOLD"]);
    // The big blind may shove over a limp while short, and may not once deep -
    // the chart draws a shove at 15-25BB and none from 30BB up.
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "BB", 25, ["ISO_3X"]))
      .toEqual(["LIMP", "ISO_3X", "JAM"]);
    expect(offeredPreflopActionKeysForContext("VS_LIMP", "BB", 100, ["ISO_3X"]))
      .toEqual(["LIMP", "ISO_3X"]);
    // At 25BB a shove over an open is on the table, so it is offered. Deep, it is
    // not - the charts draw no re-jam past 30BB and offering an action nobody
    // should ever take is its own kind of wrong.
    expect(offeredPreflopActionKeysForContext("VS_OPEN", "BTN", 25, ["3BET"]))
      .toEqual(["FOLD", "CALL", "3BET", "JAM"]);
    expect(offeredPreflopActionKeysForContext("VS_OPEN", "BTN", 100, ["3BET"]))
      .toEqual(["FOLD", "CALL", "3BET"]);
    expect(offeredPreflopActionKeysForContext("SQUEEZE", "BTN", 25, ["SQUEEZE"]))
      .toEqual(["FOLD", "CALL", "3BET", "SQUEEZE", "JAM"]);
  });

  it("uses stack and BvB state guards before the normal context branch", () => {
    expect(offeredPreflopActionKeysForContext("PUSH_FOLD", "BTN", 10, ["JAM"]))
      .toEqual(["JAM", "FOLD"]);
    expect(offeredPreflopActionKeysForContext("VS_ALLIN", "BB", 10, ["CALL_JAM"]))
      .toEqual(["CALL_JAM", "FOLD"]);
    expect(offeredPreflopActionKeysForContext("BVB", "SB", 25, ["OPEN_25X"]))
      .toEqual(["OPEN_25X", "LIMP", "FOLD"]);
    expect(offeredPreflopActionKeysForContext("BVB", "BB", 25, ["3BET"]))
      .toEqual(["FOLD", "CALL", "3BET", "JAM"]);
  });
});
