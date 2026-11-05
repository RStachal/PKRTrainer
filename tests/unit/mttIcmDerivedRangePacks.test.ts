import { describe, expect, it } from "vitest";

import {
  buildMttIcmDerivedRangePacks,
  icmAdjustmentFor,
  mttBubbleFactor,
  mttIcmDerivedRangePack,
} from "../../src/data/ranges/mttIcmDerivedRangePacks";
import { mttPreflopAnteOffRangePack, mttPreflopAnteOnRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { ALL_HAND_CLASSES } from "../../src/core/poker";
import type { ActionKey } from "../../src/core/types";

const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
const TOTAL = ALL_HAND_CLASSES.reduce((sum, hand) => sum + COMBOS(hand), 0);
const AGGRESSIVE = new Set<ActionKey>([
  "OPEN_2X", "OPEN_25X", "OPEN_3X", "ISO_2X", "ISO_25X", "ISO_3X",
  "3BET", "4BET", "SQUEEZE", "JAM",
]);
const PASSIVE = new Set<ActionKey>(["CALL", "CALL_JAM", "LIMP", "OVERLIMP"]);

function widthPct(record: { strict: Record<string, string[]> }, keys: Set<ActionKey>): number {
  let combos = 0;
  for (const [hand, actions] of Object.entries(record.strict)) {
    if (actions.some((action) => keys.has(action as ActionKey))) combos += COMBOS(hand);
  }
  return (combos / TOTAL) * 100;
}

/**
 * Odvozené bublinové range: směr je celý obsah tvrzení.
 *
 * ICM utahuje dorovnání a rozšiřuje agresi, protože bubble faktor zdražuje
 * riziko, ne agresi. Obrácené znaménko by z packu udělalo návod, jak na bublině
 * prohrát turnaj - a zvenku by vypadal úplně stejně. Tyhle testy hlídají hlavně
 * to.
 */
describe("odvozené ICM range pro bublinu", () => {
  const chip = mttPreflopAnteOffRangePack;
  const icm = mttIcmDerivedRangePack("REGULAR", "OFF", mttPreflopAnteOffRangePack);

  it("spočítá bubble faktor modelem, ne odhadem", () => {
    const factor = mttBubbleFactor();
    // Čtyři rovné stacky placené do tří míst: riziko výrazně převyšuje zisk.
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(3);
  });

  it("utahuje dorovnání a rozšiřuje agresi, ne naopak", () => {
    let tightened = 0;
    let widened = 0;
    for (let index = 0; index < chip.records.length; index += 1) {
      const before = chip.records[index];
      const after = icm.records[index];
      const callBefore = widthPct(before, PASSIVE);
      const callAfter = widthPct(after, PASSIVE);
      const aggBefore = widthPct(before, AGGRESSIVE);
      const aggAfter = widthPct(after, AGGRESSIVE);

      // Nikdy opačně: dorovnání se nesmí rozšířit, agrese se nesmí utáhnout.
      expect(callAfter).toBeLessThanOrEqual(callBefore + 0.01);
      expect(aggAfter).toBeGreaterThanOrEqual(aggBefore - 0.01);

      if (callAfter < callBefore - 0.01) tightened += 1;
      if (aggAfter > aggBefore + 0.01) widened += 1;
    }
    // A musí se to opravdu dít, ne jen „neporušovat směr". Dřívější verze
    // nerozšířila ani jeden záznam, protože kandidáty brala jen z ruk, které
    // agresivní klíč už nesly - přepínač, co nic nechytí, vypadá stejně jako
    // přepínač, co má nechat věci být.
    expect(tightened).toBeGreaterThan(200);
    expect(widened).toBeGreaterThan(200);
  });

  it("přidá jen akci, kterou strom v tom spotu opravdu nabízí", () => {
    for (let index = 0; index < chip.records.length; index += 1) {
      const offered = new Set(Object.values(chip.records[index].strict).flat());
      for (const actions of Object.values(icm.records[index].strict)) {
        for (const action of actions) {
          if (!AGGRESSIVE.has(action as ActionKey)) continue;
          expect(offered.has(action)).toBe(true);
        }
      }
    }
  });

  it("řekne, pro který scénář platí, a že je odvozený", () => {
    for (const pack of buildMttIcmDerivedRangePacks(mttPreflopAnteOffRangePack, mttPreflopAnteOnRangePack)) {
      expect(pack.confidence).toBe("LOW");
      expect(pack.dimensions.evModel).toBe("DOLAR_EV");
      expect(pack.assumptions.some((line) => line.startsWith("ODVOZENO"))).toBe(true);
      expect(pack.assumptions.some((line) => line.includes("peněžní bublina"))).toBe(true);
      // Bez téhle věty by pack tvrdil, že platí pro ICM obecně - a to není pravda
      // pro většinu situací, které by tak označil.
      expect(pack.assumptions.some((line) => line.includes("Mimo tento scénář"))).toBe(true);
    }
  });

  it("drží úpravu v mezích i pro nesmyslný bubble faktor", () => {
    expect(icmAdjustmentFor(1).callWidthFactor).toBe(1);
    expect(icmAdjustmentFor(1).aggressiveWidthFactor).toBe(1);
    const extreme = icmAdjustmentFor(50);
    expect(extreme.callWidthFactor).toBeGreaterThanOrEqual(0.33);
    expect(extreme.aggressiveWidthFactor).toBeLessThanOrEqual(2);
    // Bubble faktor pod jedničkou znamená, že vyřazení soupeře je cennější než
    // riziko. Utahovat tam dorovnání by bylo obráceně.
    expect(icmAdjustmentFor(0.9).callWidthFactor).toBe(1);
  });
});
