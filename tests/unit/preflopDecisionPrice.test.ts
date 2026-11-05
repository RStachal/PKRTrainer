import { describe, expect, it } from "vitest";

import { buildPool } from "../../src/core/drillEngine";
import { preflopDecisionPrices } from "../../src/core/preflopDecisionPrice";
import { rangeStore } from "../../src/data/rangeStore";
import type { ActionContext } from "../../src/core/types";

/**
 * Cena akce na skutečných spotech, ne na vymyšlených.
 *
 * Adaptér má jednu úlohu: dosadit do výpočtu jen velikosti, které produkt učí
 * nebo nese jako přiznaný předpoklad. Testuje se proto přes `buildPool`, tedy
 * přes to, co trenažér doopravdy rozdává - kdyby se sem stavěly ruční spoty,
 * ověřovalo by se, že umím zadat vstup, ne že to sedí na produkt.
 */
const filters = {
  positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "LENIENT",
} as never;

function firstSpot(context: ActionContext, match?: (spot: { heroPos: string; effStack: number }) => boolean) {
  const pool = buildPool(20260828, context, filters, rangeStore);
  const spot = match === undefined ? pool[0] : pool.find(match);
  expect(spot, `pool pro ${context} je prázdný`).toBeDefined();
  return spot!;
}

describe("cena rozhodnutí na rozdávaných spotech", () => {
  it("obrana velkého blindu počítá s tím, že blind už je v potu", () => {
    const spot = firstSpot("VS_OPEN", (item) => item.heroPos === "BB" && item.effStack === 50);
    const prices = preflopDecisionPrices(spot, rangeStore);
    const call = prices.find((price) => price.action === "CALL");
    // Otevření 2,5 BB, pot 0,5 + 1 + 2,5, dorovnat 1,5 - ne 2,5.
    expect(call?.kind).toBe("EQUITY_NEEDED");
    expect(call?.required).toBeCloseTo(0.2727, 3);
  });

  it("mimo blindy stojí dorovnání celé otevření", () => {
    const spot = firstSpot("VS_OPEN", (item) => item.heroPos === "BTN" && item.effStack === 50);
    const call = preflopDecisionPrices(spot, rangeStore).find((price) => price.action === "CALL");
    expect(call?.required).toBeCloseTo(2.5 / (4 + 2.5), 3);
  });

  it("každý rozdávaný spot dostane aspoň jednu cenu", () => {
    // Měřeno 28. 8. 2026 na celém poolu: cenu má 46,2 % nabízených akcí, ale
    // **100 % spotů** má aspoň jednu. Kdyby tohle přestalo platit, znamenalo by
    // to, že se na obrazovce objeví spot úplně bez čísla.
    for (const context of ["RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "VS_LIMP", "SQUEEZE"] as const) {
      const pool = buildPool(20260828, context, filters, rangeStore);
      const withoutPrice = pool.filter((spot) => (
        preflopDecisionPrices(spot, rangeStore).every((price) => price.kind === "BASELINE")
      ));
      expect(withoutPrice.length, `${context}: ${withoutPrice.length} spotů bez ceny`).toBe(0);
    }
  });

  it("požadavek nikdy nevyjde mimo nulu až jedničku", () => {
    // Práh je podíl. Kdyby vyšel nad sto procent, znamenalo by to, že se do potu
    // dosadila velikost, kterou spot neunese - přesně to, čemu má stropování na
    // efektivní stack bránit.
    for (const context of ["VS_3BET", "VS_4BET", "VS_OPEN"] as const) {
      for (const spot of buildPool(20260828, context, filters, rangeStore)) {
        for (const price of preflopDecisionPrices(spot, rangeStore)) {
          if (price.required === undefined) continue;
          expect(price.required, `${spot.id} / ${price.action}`).toBeGreaterThan(0);
          expect(price.required, `${spot.id} / ${price.action}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
