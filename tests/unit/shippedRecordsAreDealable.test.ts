import { describe, expect, it } from "vitest";

import { positionsForContext } from "../../src/core/drillEngine";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import { loadCompleteMttProductionRegistry } from "../../scripts/loadMttProductionRegistry.mts";

/**
 * Záznam, na který se trenažér nikdy nezeptá, je mrtvý obsah.
 *
 * ## Proč to potřebuje vlastní test
 *
 * Protože se to nedá poznat ani z packu, ani z brány. Pack je tvarem v pořádku,
 * validace projde, počet záznamů vypadá jako pokrytí - a přitom část z nich
 * popisuje spot, který nemůže nastat. Nikdo si toho nevšimne, dokud se někdo
 * nezeptá **z druhé strany**: na co se drill podle vlastních pravidel ptá.
 *
 * Změřeno 27. 8. 2026, když se to poprvé zeptalo: **66 záznamů** ve dvou
 * odvozených six-max packech (`VS_OPEN|UTG`, `VS_4BET|UTG`, `VS_LIMP|UTG` po
 * jedenácti hloubkách). Vzniklo to mapováním sedaček - devítistolový lojack se
 * přenesl na šest-maxový UTG, který je ale první u stolu, takže před ním nikdo
 * nejedná. Jinde nula.
 *
 * Nikoho to nezranilo, protože drill ty dvojice sám vylučuje. To je ale slabá
 * ochrana: platí jen do chvíle, kdy dostane six-max vlastní množiny pozic.
 *
 * Pravidla se sem **neopisují**, ptá se `positionsForContext`. Kopie by udělala
 * dvě místa, kde se opravuje jedna změna.
 */
describe("dodávané záznamy jdou rozdat", () => {
  it("žádný pack nenese dvojici (kontext, pozice), na kterou se drill nezeptá", async () => {
    await loadCompleteMttProductionRegistry();
    const dead: string[] = [];
    for (const pack of allMttPreflopRangePacks) {
      for (const record of pack.records) {
        const allowed = positionsForContext(record.context);
        if (!allowed.includes(record.position)) {
          dead.push(`${pack.id}: ${record.context}|${record.position}|${record.bucket}`);
        }
      }
    }
    // Vypisuje se prvních pár, ať se pozná vzor, ne jen počet.
    expect(dead.slice(0, 8)).toEqual([]);
    expect(dead.length).toBe(0);
  });
});
