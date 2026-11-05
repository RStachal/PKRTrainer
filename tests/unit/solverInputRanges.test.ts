import { describe, expect, it } from "vitest";

import {
  MIXED_CALL_WEIGHT,
  srpSolverInputRanges,
  toSolverRangeSpec,
} from "../../src/data/ranges/solverInputRanges";
import { loadCompleteMttProductionRegistry } from "../../scripts/loadMttProductionRegistry.mts";

/**
 * Ranže pro solver odvozené z našich preflop packů.
 *
 * Odemyká rozšíření na chybějící dvojice sedaček: rozklad jich drží pět,
 * trenažér se ptá na dvaatřicet vzorů. Ručně psané ranže v expansion skriptech
 * jsou únosné pro šest rodin a neúnosné pro sedmadvacet dvojic krát hloubky.
 *
 * Co se tu hlídá především: **strany stolu**. Prohozené OOP a IP by daly solve,
 * který vypadá v pořádku a dává hráči odpovědi soupeře - a poznalo by se to až u
 * stolu.
 */
describe("ranže pro solver z preflop packů", () => {
  it("otvírač v pozdější pozici je po flopu v pozici", async () => {
    await loadCompleteMttProductionRegistry();
    // BTN otevírá, BB brání. Postflop jde BB první, takže BTN je v pozici.
    const ranges = srpSolverInputRanges({
      openerSeat: "BTN", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    expect(ranges).toBeDefined();
    expect(ranges?.ipSeat).toBe("BTN");
    expect(ranges?.oopSeat).toBe("BB");
  });

  it("blind je po flopu mimo pozici i proti rané pozici", async () => {
    await loadCompleteMttProductionRegistry();
    // Preflop jde UTG první, postflop poslední z těch dvou - blindy hrají první.
    const ranges = srpSolverInputRanges({
      openerSeat: "UTG", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    expect(ranges?.oopSeat).toBe("BB");
    expect(ranges?.ipSeat).toBe("UTG");
  });

  it("otvírací range je širší v pozdější pozici", async () => {
    await loadCompleteMttProductionRegistry();
    const utg = srpSolverInputRanges({
      openerSeat: "UTG", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    const btn = srpSolverInputRanges({
      openerSeat: "BTN", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    // Kdyby se ranže braly z nesprávné sedačky, tohle by neplatilo - a je to
    // vlastnost, kterou odvození nezná, takže je to nezávislá kontrola.
    const utgOpen = Object.keys(utg?.ipSeat === "UTG" ? utg.ip : utg?.oop ?? {}).length;
    const btnOpen = Object.keys(btn?.ipSeat === "BTN" ? btn.ip : btn?.oop ?? {}).length;
    expect(btnOpen).toBeGreaterThan(utgOpen);
  });

  it("dnešní packy dávají čisté váhy, protože nenesou smíšené akce", async () => {
    await loadCompleteMttProductionRegistry();
    const ranges = srpSolverInputRanges({
      openerSeat: "CO", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    const defence = ranges?.oopSeat === "BB" ? ranges.oop : ranges?.ip ?? {};
    expect(Object.keys(defence).length).toBeGreaterThan(0);
    // Změřeno: z 1980 tříd ve VS_OPEN nedělá ani jedna call i 3bet. Váha půl je
    // proto pojistka pro budoucí smíšené packy, ne dnešní chování - a test to
    // musí tvrdit takhle, ne předstírat, že se ta větev používá.
    for (const weight of Object.values(defence)) expect(weight).toBe(1);
    expect(MIXED_CALL_WEIGHT).toBeGreaterThan(0);
    expect(MIXED_CALL_WEIGHT).toBeLessThan(1);
  });

  it("nese varování, ne mlčení", async () => {
    await loadCompleteMttProductionRegistry();
    const ranges = srpSolverInputRanges({
      openerSeat: "CO", defenderSeat: "BB", bucket: 40 as never, ante: "OFF",
    });
    // Odvozená obrana zdědí, že VS_OPEN neví, kdo otevřel. Kdo tuhle range
    // použije k solvu, to musí vědět dřív, než se odsolvuje.
    expect(ranges?.caveats.join(" ")).toContain("nerozlišuje, kdo otevřel");
    expect(ranges?.caveats.length).toBeGreaterThanOrEqual(2);
  });

  it("chybějící hloubku nepředstírá", async () => {
    await loadCompleteMttProductionRegistry();
    expect(srpSolverInputRanges({
      openerSeat: "BTN", defenderSeat: "BB", bucket: 7 as never, ante: "OFF",
    })).toBeUndefined();
  });

  it("zápis pro solver je opakovatelný", () => {
    // Seřazeno, aby dvě spuštění dala tentýž soubor: jinak by každý běh vypadal
    // jako změna vstupu a nešlo by poznat, co se doopravdy změnilo.
    const spec = toSolverRangeSpec({ KK: 1, AA: 1, QQ: 0.5 });
    expect(spec).toBe("AA:1,KK:1,QQ:0.5");
  });
});
