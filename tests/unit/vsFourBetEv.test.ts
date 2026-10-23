import { beforeAll, describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { loadPreflopEquity } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import type { ActionKey, Filters } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Pětibetový jam proti čtyřbetu - poslední kontext, kde se nabízel shove bez ceny.
 *
 * Překážka nebyla v datech. Pot potřebuje velikost tří-betu a čtyři-betu a klíče
 * `3BET`/`4BET` říkají jen to, že se zvedalo - takže chyběl jeden krok, ne jedno
 * měření. Volba je zapsaná v `drillEngine` jako volba a tyhle testy hlídají, že
 * z ní nevznikají nesmysly.
 */

const filters: Filters = {
  positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "STRICT",
};

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

describe("EV pětibetového jamu proti čtyřbetu", () => {
  beforeAll(async () => {
    await loadPreflopEquity();
  });

  it("ocení každý nabídnutý jam", () => {
    const active = store();
    let jams = 0;
    let priced = 0;
    for (let seed = 1; seed <= 1500; seed += 1) {
      const spot = generateSpot(mulberry32(seed), "VS_4BET", filters, active);
      if (spot === null) continue;
      if (!spot.answers.some((answer) => answer.key === ("JAM" as ActionKey))) continue;
      jams += 1;
      if (spot.actionEvs !== undefined) priced += 1;
    }
    expect(jams).toBeGreaterThan(100);
    expect(priced).toBe(jams);
  });

  it("nedává jamu cenu, která by nemohla nastat", () => {
    const active = store();
    for (let seed = 1; seed <= 800; seed += 1) {
      const spot = generateSpot(mulberry32(seed), "VS_4BET", filters, active);
      const evs = spot?.actionEvs;
      if (!evs) continue;
      const jam = evs.values.find((value) => value.action === ("JAM" as ActionKey));
      expect(jam).toBeDefined();
      // Prohrát jde nejvýš to, co hrdina vloží, tedy ne víc než efektivní stack.
      // Vyhrát jde pot plus to, co doplatí soupeř - pot je proti stacku malý,
      // takže dvojnásobek stacku je bezpečná horní mez. Kdyby se strop překročil,
      // počítá se s penězi, které u stolu nejsou; první verze tohohle testu měla
      // mez chybně na jednom stacku a chytila tím skutečnou chybu: riskovaná
      // částka se brala z hrdinova zbytku místo ze soupeřova, takže jam při
      // 150 BB "vyhrával" 112 blindů, které soupeř neměl čím doplatit.
      expect(jam!.evBb).toBeGreaterThan(-spot!.effStack);
      expect(jam!.evBb).toBeLessThan(spot!.effStack * 2);
      expect(evs.values.some((value) => value.action === ("FOLD" as ActionKey) && value.evBb === 0)).toBe(true);
    }
  });

  it("oceňuje silné ruce nad skládáním a nejhorší pod ním", () => {
    const active = store();
    const byHand = new Map<string, number>();
    for (let seed = 1; seed <= 4000; seed += 1) {
      const spot = generateSpot(mulberry32(seed), "VS_4BET", filters, active);
      const evs = spot?.actionEvs;
      if (!evs || !spot) continue;
      const jam = evs.values.find((value) => value.action === ("JAM" as ActionKey));
      if (jam === undefined) continue;
      if (!byHand.has(spot.hand)) byHand.set(spot.hand, jam.evBb);
    }
    // Proti čtyřbetové range jsou esa jasný jam a nejslabší ruce jasný fold.
    // Kdyby to vyšlo obráceně, byl by prohozený pot se stackem nebo range.
    const aces = byHand.get("AA");
    if (aces !== undefined) expect(aces).toBeGreaterThan(0);
    const worst = [...byHand.entries()].filter(([hand]) => hand.endsWith("o") && hand[0] !== "A");
    expect(worst.length).toBeGreaterThan(0);
    expect(Math.min(...worst.map(([, ev]) => ev))).toBeLessThan(0);
    // A pořadí musí sedět: esa nad krály. Kdyby ne, je prohozená range soupeře.
    const kings = byHand.get("KK");
    if (aces !== undefined && kings !== undefined) expect(aces).toBeGreaterThan(kings);
  });
});
