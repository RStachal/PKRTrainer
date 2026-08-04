import { describe, expect, it } from "vitest";

import { offeredPreflopActionKeysForContext } from "../../src/core/preflopActionOptions";

describe("preflop action options", () => {
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
