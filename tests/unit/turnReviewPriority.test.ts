import { describe, expect, it } from "vitest";

import { defenceGapOf, profileTurnFamilies } from "../../src/data/ranges/turnFamilyAnomaly";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";

/**
 * Pořadí fronty ke čtení.
 *
 * Čtení je jediná cesta z LOW do produkce a je to práce pro člověka. Osmnáct
 * rodin nikdo nepřečte najednou, takže na pořadí záleží: seřazené podle jména
 * znamená, že se začne u té první, tedy náhodně.
 *
 * Odchylka obrany od kurzů, které sázka nabízí, je jediné číslo o téhle
 * strategii, které nevzniklo čtením - proto je to nejlepší dostupné vodítko,
 * kde začít. Neříká, že je rodina špatně; říká, kde se nejvíc liší od toho, co
 * teorie čeká.
 */
describe("fronta ke čtení má měřenou prioritu", () => {
  it("spočítá odchylku obrany pro dodávané rodiny", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    expect(runtimeSolvedTurnPacks.length).toBeGreaterThan(0);

    const gaps = runtimeSolvedTurnPacks.map((pack) => defenceGapOf(pack));
    const known = gaps.filter((gap): gap is number => gap !== undefined);
    // Většina rodin čelící rozhodnutí drží, takže číslo mají.
    expect(known.length).toBeGreaterThan(gaps.length / 2);
    // A žádné z nich není nesmyslné: odchylka je podíl, ne procenta.
    for (const gap of known) expect(gap).toBeLessThan(1);
  });

  it("profil rodiny to číslo nese, aby podle něj šlo řadit", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    const profiles = profileTurnFamilies(runtimeSolvedTurnPacks);
    expect(profiles.length).toBe(runtimeSolvedTurnPacks.length);
    expect(profiles.some((row) => row.defenceGap !== undefined)).toBe(true);

    // Řazení musí rozlišit: kdyby všechny rodiny vyšly stejně, seznam by nic
    // neseřadil a sloupec by jen zabíral místo.
    const values = profiles
      .map((row) => row.defenceGap)
      .filter((gap): gap is number => gap !== undefined);
    expect(new Set(values.map((gap) => gap.toFixed(3))).size).toBeGreaterThan(1);
  });

  it("rodina bez čelících rozhodnutí číslo nedostane", () => {
    // Nula by lhala: znamenala by „sedí přesně", ne „nemáme co měřit".
    const empty = { rules: [] } as never;
    expect(defenceGapOf(empty)).toBeUndefined();
  });
});
