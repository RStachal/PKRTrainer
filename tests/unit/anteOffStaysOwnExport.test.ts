import { describe, expect, it } from "vitest";

import { createMttProductionLazyLoader } from "../../src/data/ranges/mttProductionLazyLoader";
import { REFINEMENT_AXES, refinementValueOf } from "../../src/data/ranges/rangePack";
import type { RangePack } from "../../src/data/ranges/rangePack";

/**
 * Rozhodnutí vlastníka 7a (22. 9. 2026): **RYE vrstva patří jen do profilů
 * s ante ON**, ante OFF zůstává u vlastního exportu. Zdroj počítá s BB ante,
 * takže jeho range pod ante OFF tvrdí něco o jiné hře.
 *
 * ## Proč to musí být brána, a ne jen věta
 *
 * Do 13. 10. 2026 to pravidlo drželo **jen jako próza** v komentáři
 * `buildRyeRefinedCandidate.mts`. Produkce ho přitom dodržuje: dodávané packy
 * s ante OFF nesou 11 zpřesněných záznamů a **ani jeden z RYE**.
 *
 * Jenže v `artifacts/rye-import/candidate` leží kandidáti pro oba ante OFF
 * profily ze **17. 9. 2026**, tedy z doby **před** tím rozhodnutím, a každý
 * z nich nese **61 RYE záznamů**. Povýšit „kandidáta" by tedy to rozhodnutí
 * tiše zrušilo a nic by to nezachytilo - `validate:range-import` se ptá na
 * povolení a dosažitelnost, ne na to, do jakého profilu zdroj patří.
 *
 * Našlo se to tak, že jsem ten import chtěl udělat a spočítal si „v raw je 11
 * zpřesněných, v kandidátovi 69, chybí 58". Chybělo 58 **záznamů, které tam
 * nepatří**. Rozdíl mezi „nedodaný obsah" a „obsah pro jiný profil" se z počtu
 * nepozná; pozná se z provenience, a proto se na ni ptá tenhle test.
 */

function isRangePack(pack: unknown): pack is RangePack {
  return (
    typeof pack === "object" &&
    pack !== null &&
    Array.isArray((pack as { records?: unknown }).records)
  );
}

function isRefined(record: RangePack["records"][number]): boolean {
  return REFINEMENT_AXES.some((axis) => refinementValueOf(record, axis) !== undefined);
}

describe("ante OFF zůstává u vlastního exportu (rozhodnutí 7a)", () => {
  it("žádný dodávaný pack s ante OFF nenese záznam z RYE", async () => {
    const packs = await createMttProductionLazyLoader().loadAll();
    const offenders: string[] = [];
    let anteOffPacks = 0;

    for (const pack of packs) {
      if (!isRangePack(pack)) continue;
      const id = String(pack.id);
      if (!id.includes("ante-off")) continue;
      anteOffPacks += 1;

      for (const record of pack.records) {
        const provenance = String(
          (record as { provenance?: string }).provenance ?? "",
        );
        if (!provenance.includes("RYE")) continue;
        offenders.push(
          `${id}: ${String(record.context)}|${String(record.position)}|${String(record.bucket)} ← ${provenance.slice(0, 60)}`,
        );
      }
    }

    // Kdyby se profily přejmenovaly, test by prošel na prázdné množině a tiše
    // přestal hlídat. Proto se ptá i na to, že vůbec nějaký ante OFF našel.
    expect(anteOffPacks).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("profily s ante ON RYE záznamy nesou - jinak by test výš nic neměřil", async () => {
    const packs = await createMttProductionLazyLoader().loadAll();
    let ryeInAnteOn = 0;

    for (const pack of packs) {
      if (!isRangePack(pack)) continue;
      if (!String(pack.id).includes("ante-on")) continue;
      for (const record of pack.records) {
        const provenance = String(
          (record as { provenance?: string }).provenance ?? "",
        );
        if (provenance.includes("RYE") && isRefined(record)) ryeInAnteOn += 1;
      }
    }

    /*
     * Tohle je **falsifikace prvního testu**, ne měření obsahu.
     *
     * První test by prošel i tehdy, kdyby se RYE vrstva ztratila ze všech
     * profilů - „nikde v ante OFF" je pak pravda z prázdna. Tenhle řádek proto
     * drží druhou stranu: aspoň jeden profil s ante ON tu vrstvu nést musí,
     * jinak se nehlídá pravidlo, ale zmizení obsahu.
     *
     * Dolní mez je schválně nízká a ne dnešních 62 na pack - počet má růst, až
     * vlastník povolí další osu, a brána se o to nemá otírat.
     */
    expect(ryeInAnteOn).toBeGreaterThan(0);
  });
});
