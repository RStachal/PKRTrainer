import { generateSpot } from "../src/core/drillEngine";
import { mulberry32 } from "../src/core/rng";
import type { ActionContext, Filters } from "../src/core/types";
import { createRangeStoreFromRangePack } from "../src/data/rangeStore";
import { mttPreflopRangePackForProfile } from "../src/data/ranges/mttPreflopRangePacks";
import { createMttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";

/**
 * Kolik rozdaných spotů dostane otázku s jmenovaným otvíračem **a** zpřesněnou
 * odpovědí (záznam s `vsSeat`) - nad produkčními packy, tou cestou, kterou si
 * pack bere `main.ts`.
 *
 *   npm run mtt:refined-delivery [-- --spots=4000]
 *
 * ## Proč to není `mtt:rye-answers`
 *
 * Ten hlásí dopad („tříd, kde by se odpověď lišila"), a to je číslo o vyrobené
 * práci. Pravidlo 4 chce doručení: kolik spotů hráč doopravdy dostane s tou
 * odpovědí. Bod 253 to změřil jednorázově (22,4 % VS_OPEN nad kandidátem) a při
 * dalším dodání (17. 9. 2026, 4 mřížky) se to muselo odvozovat znovu.
 *
 * ## Past, kvůli které se tu registrují produkční packy
 *
 * `mttPreflopRangePackForProfile` vrací produkční pack jen tehdy, když ho
 * někdo předtím zaregistroval - v aplikaci to dělá lazy loader. V CLI bez něj
 * vrátí převedený legacy pack (`…-ante-off-v1`, 1.0.0), který má z zpřesněných
 * záznamů jen obranu BB proti SB. Změřeno 17. 9. 2026 dvakrát nad týmž
 * obsahem: bez registrace 8,8 % (11 buněk), s registrací 30,4 % (26 buněk).
 * Číslo bez registrace vypadá jako měření a je o jiném packu.
 */

const spots = Number(process.argv.find((arg) => arg.startsWith("--spots="))?.split("=")[1] ?? "4000");
const CONTEXTS: ActionContext[] = ["VS_OPEN", "SQUEEZE", "VS_3BET"];

await createMttProductionLazyLoader().loadAll();

console.log(`Zpřesněná odpověď v rozdaných spotech (${spots} spotů na kontext a profil)`);
console.log("");
for (const blindSpeed of ["REGULAR", "TURBO"] as const) {
  for (const ante of ["OFF", "ON"] as const) {
    const pack = mttPreflopRangePackForProfile({
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed, street: "PREFLOP", evModel: "CHIP_EV", ante, rakeMode: "NONE",
    });
    if (pack === undefined) {
      console.log(`${blindSpeed} / ante ${ante}: bez packu`);
      continue;
    }
    const store = createRangeStoreFromRangePack(pack);
    const refinedInPack = pack.records.filter((record) => record.vsSeat !== undefined).length;
    console.log(`${pack.id} (${pack.version}, zpřesněných záznamů ${refinedInPack})`);
    for (const context of CONTEXTS) {
      const rng = mulberry32(20260917);
      const filters: Filters = { positions: [], buckets: [], contexts: [], ante, scoringMode: "LENIENT" };
      let dealt = 0;
      let refined = 0;
      const cells = new Set<string>();
      for (let index = 0; index < spots; index += 1) {
        const spot = generateSpot(rng, context, filters, store);
        if (spot === null) continue;
        dealt += 1;
        const vsSeat = spot.tableState.vsSeat;
        if (vsSeat === undefined) continue;
        const entry = store.lookup({ position: spot.heroPos, bucket: spot.effStack, context, ante, vsSeat });
        if (entry?.vsSeat !== vsSeat) continue;
        refined += 1;
        cells.add(`${spot.heroPos}|${spot.effStack}`);
      }
      const share = dealt === 0 ? 0 : (100 * refined) / dealt;
      console.log(
        `  ${context.padEnd(8)} rozdáno ${String(dealt).padStart(5)}, se zpřesněnou odpovědí ${String(refined).padStart(5)}`
        + ` (${share.toFixed(1).padStart(5)} %), buněk ${cells.size}`,
      );
    }
  }
}
