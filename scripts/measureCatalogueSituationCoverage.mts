import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../src/core/postflopGenerator";
import { solvedFlopSpotConfig, solvedFlopSpots } from "../src/data/ranges/solvedFlopSpotCatalogue";
import { solvedTurnSpotConfig, solvedTurnSpots } from "../src/data/ranges/solvedTurnSpotCatalogue";
import { solvedRiverSpotConfig, solvedRiverSpots } from "../src/data/ranges/solvedRiverSpotCatalogue";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";

/**
 * Kolik vybíratelných situací umí katalog obsloužit - po ulicích, vzorech,
 * hloubkách a uzlech.
 *
 *   npm run mtt:catalogue-situations
 *
 * ## Proč to vzniklo
 *
 * Když si hráč vybere situaci, rozdává se od 14. 10. 2026 z katalogu
 * filtrovaného podle **vzoru pozic, hloubky a uzlu** (`solvedSpotDealing.ts`);
 * do té doby se katalog obcházel a matice se barvila podle akce v 0 % spotů.
 * Jestli filtr něco najde, záleží na tom, co katalog obsahuje - a tenhle skript
 * to tiskne, aby bylo vidět, kde chybí **cesta** a kde **obsah**.
 *
 * Packy se načítají stejně jako v `mtt:post-answer`; bez toho je katalog
 * prázdný a skript vrátí nuly, které vypadají jako nález.
 */

await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

interface CatalogueSpot {
  positionPattern: string;
  actionNode: string;
  sourceDirectory: string;
}

function depthOf(spot: CatalogueSpot): string {
  return /^MTT9_(\d+)BB_/.exec(spot.sourceDirectory)?.[1] ?? "?";
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}

function line(map: Map<string, number>, numeric = false): string {
  return [...map.entries()]
    .sort((a, b) => (numeric ? Number(a[0]) - Number(b[0]) : a[0].localeCompare(b[0])))
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ");
}

function main(): void {
  const offered = POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS;
  const offeredPatterns = new Set(offered.map((ctx) => String(ctx.positionPattern)));

  console.log("Vyřešený katalog proti nabídce situací");
  console.log(`UI nabízí ${offered.length} situací v ${offeredPatterns.size} vzorech\n`);

  /*
   * Spot, ke kterému `positionContextForSolvedSeats` nenajde kontext, se
   * **nedá rozdat vůbec** - ani z výchozí katalogové cesty. Vylosuje se,
   * konfigurace vrátí `undefined` a pohled tiše spadne na losovanou desku.
   * `mtt:post-answer` takové spoty vyřazuje ze jmenovatele
   * (`if (config === undefined) continue`), takže jeho 100 % se počítá jen
   * z toho, co se rozdat dá. Tady se to počítá zvlášť.
   */
  const config = {
    FLOP: (spot: unknown) => solvedFlopSpotConfig(spot as never, offered),
    TURN: (spot: unknown) => solvedTurnSpotConfig(spot as never, offered),
    RIVER: (spot: unknown) => solvedRiverSpotConfig(spot as never, offered),
  } as const;

  const streets: ["FLOP" | "TURN" | "RIVER", readonly CatalogueSpot[]][] = [
    ["FLOP", solvedFlopSpots() as unknown as readonly CatalogueSpot[]],
    ["TURN", solvedTurnSpots() as unknown as readonly CatalogueSpot[]],
    ["RIVER", solvedRiverSpots() as unknown as readonly CatalogueSpot[]],
  ];

  for (const [street, spots] of streets) {
    const undealable = spots.filter((spot) => config[street](spot) === undefined);
    const undealableByPattern = countBy(undealable, (spot) => spot.positionPattern);
    const patterns = new Set(spots.map((spot) => spot.positionPattern));
    const covered = offered.filter((ctx) => patterns.has(String(ctx.positionPattern))).length;
    console.log(`${street}: ${spots.length} spotů, ${patterns.size} vzorů`);
    console.log(
      `  nabízené situace se vzorem v katalogu: ${covered} z ${offered.length}`
      + ` = ${((100 * covered) / offered.length).toFixed(1)} %`,
    );
    console.log(`  hloubky (bb):  ${line(countBy(spots, depthOf), true)}`);
    console.log(`  uzly:          ${line(countBy(spots, (spot) => spot.actionNode))}`);
    const orphan = [...patterns].filter((pattern) => !offeredPatterns.has(pattern)).sort();
    if (orphan.length > 0) {
      console.log(`  vzory, které UI nenabízí (vyřešené a nedosažitelné): ${orphan.join(", ")}`);
    }
    console.log(
      `  nedá se rozdat vůbec (chybí kontext): ${undealable.length} z ${spots.length}`
      + ` = ${spots.length === 0 ? "-" : ((100 * undealable.length) / spots.length).toFixed(1)} %`,
    );
    if (undealable.length > 0) console.log(`    po vzorech: ${line(undealableByPattern)}`);
    console.log("");
  }
}

main();
