import { describe, expect, it } from "vitest";

import {
  depthStrataLimit,
  missingOpenerDimensionLimit,
  preflopDepthStrata,
} from "../../scripts/lib/preflopDepthStrata.mts";
import { shippedPreflopPack } from "../../scripts/lib/rangeChartComparison.mts";
import { loadCompleteMttProductionRegistry } from "../../scripts/loadMttProductionRegistry.mts";

/**
 * Kolik hloubek preflop doopravdy rozlišuje - a který pack se přitom měří.
 *
 * Obojí je tu kvůli jedné pasti, která stála celou první várku porovnání s
 * nezávislým zdrojem. Katalog obsahuje kandidátský i produkční pack a výběr
 * bral první, co projde filtrem. Před načtením produkčního registru je to
 * kandidát, po něm produkční verze, takže totéž volání vracelo jednou 507
 * záznamů a jindy 487 - podle toho, co se stihlo naimportovat dřív. Měření pak
 * popisovalo obsah, který hráč nedostane, a znělo přitom úplně stejně
 * důvěryhodně.
 */
describe("hloubkové vrstvy preflopu", () => {
  it("bez načteného registru se neměří nic, místo aby se měřil kandidát", () => {
    // Musí být první v souboru: jakmile se registr jednou načte, do konce běhu
    // už načtený zůstane a tenhle stav se znovu nevyrobí.
    expect(shippedPreflopPack("OFF")).toBeUndefined();
  });

  it("po načtení registru se měří dodávaný pack", async () => {
    await loadCompleteMttProductionRegistry();
    expect(shippedPreflopPack("OFF")?.id).toContain("-production-");
  });

  it("počítá různé ranges, ne kbelíky", async () => {
    await loadCompleteMttProductionRegistry();
    const strata = preflopDepthStrata("OFF");
    expect(strata.length).toBeGreaterThan(0);
    for (const row of strata) {
      expect(row.buckets).toBeGreaterThan(0);
      // Různých ranges nemůže být víc než hloubek, ze kterých se berou.
      expect(row.distinctRanges).toBeGreaterThan(0);
      expect(row.distinctRanges).toBeLessThanOrEqual(row.buckets);
    }
  });

  it("výběr rukou nemůže rozlišit víc hloubek než celá odpověď", async () => {
    // Invariant, ne dnešní číslo. Otisk výběru zahazuje jméno akce, takže může
    // hloubky jen slévat, nikdy rozdělovat. Kdyby to někdy vyšlo naopak, měří
    // se něco jiného, než co se tvrdí - a to je ta třída chyby, kde brána vrací
    // čísla, která vypadají jako důkaz.
    await loadCompleteMttProductionRegistry();
    for (const row of preflopDepthStrata("OFF")) {
      expect(row.distinctSelections).toBeGreaterThan(0);
      expect(row.distinctSelections).toBeLessThanOrEqual(row.distinctRanges);
    }
  });

  it("brána mlčí jen tehdy, když každá hloubka má vlastní range", async () => {
    await loadCompleteMttProductionRegistry();
    const strata = preflopDepthStrata("OFF");
    const limit = depthStrataLimit("OFF");
    const everyDepthDistinct = strata.every((row) => row.distinctRanges === row.buckets);

    if (everyDepthDistinct) {
      expect(limit).toBeUndefined();
      return;
    }
    // Dnešní stav: hloubek je víc než odpovědí, a brána to musí říct nahlas i s
    // čísly. Test nefixuje konkrétní počet - ten se smí zlepšit - fixuje jen to,
    // že se mezera nesmí přestat hlásit, dokud existuje.
    expect(limit).toBeDefined();
    const buckets = Math.max(...strata.map((row) => row.buckets));
    const most = Math.max(
      ...strata.filter((row) => row.distinctRanges < row.buckets).map((row) => row.distinctRanges),
    );
    expect(limit).toContain(`${buckets} stack depths`);
    expect(limit).toContain(`at most ${most}`);
  });

  it("obrana proti openu ví, kdo otevřel - u obou ante", async () => {
    await loadCompleteMttProductionRegistry();
    // Druhá větev, na kterou test čekal od 26. 8. 2026: 16. 9. 2026 dostal
    // pack ante OFF zpřesněné záznamy s otvíračem (bod 253), 17. 9. i ante ON
    // a turbo (rozhodnutí vlastníka o reuse), takže limit přestal platit.
    expect(missingOpenerDimensionLimit("OFF")).toBeUndefined();
    expect(missingOpenerDimensionLimit("ON")).toBeUndefined();
  });
});
