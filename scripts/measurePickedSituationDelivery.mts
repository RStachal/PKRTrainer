import {
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  generatePostflopSpot,
  type PostflopStreet,
} from "../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../src/data/ranges/postflopStrategyRegistry";
import { postflopSpotToTrainingSpot } from "../src/core/postflopTrainingSpot";
import { postflopDecisionPrices } from "../src/core/postflopDecisionPrice";
import { DISPLAYABLE_ACTION_EV_SOURCES, isActionEvSetUsable } from "../src/core/actionEv";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";

/**
 * Co hráč dostane, **když si situaci vybere sám**.
 *
 *   npm run mtt:picked-situation
 *
 * ## Proč to musí vzniknout
 *
 * `mtt:post-answer` měří doručení „rozdáno z katalogu, tak jak rozdává
 * trenažér" - a to je pravda jen pro **jednu ze dvou cest**. V
 * `postflopView.ts` stojí:
 *
 *     const dealsSolved = options.initialPositionContext == null;
 *
 * Katalog vyřešených spotů se tedy použije jen tehdy, když si hráč situaci
 * **nevybral**. Jakmile si ji vybere, deska se losuje a katalog se obchází -
 * a komentář o pár řádků níž říká, co to znamená: „bez katalogu se na
 * vyřešenou desku trefil hráč v **0,0 %** rozdání", u flopu 18,8 %, protože
 * tam odpovídají chartové packy na třídu textury.
 *
 * Vrstva 0 orchestrace („dojde odpověď k hráči") tedy měla slepé místo přesně
 * tam, kde hráč něco volí. Nalezeno 14. 10. 2026, když vlastník poslal snímek
 * matice barvené podle **síly ruky** místo podle akce a napsal, že to
 * nevypadá, že máme solving hotový. `mtt:post-answer` přitom hlásí matici
 * podle akce ve 100 % spotů - obojí je pravda, každé o jiné cestě.
 *
 * ## Co se měří
 *
 * Totéž co u katalogové cesty, aby se ta dvě čísla dala položit vedle sebe:
 * podíl spotů, kde pravidlo nese kbelíky (a matice se tedy barví podle akce),
 * kde dojde EV akcí, a kde dojde cena.
 */

/*
 * Vyřešené packy se musí načíst **stejně jako v `mtt:post-answer`**, jinak
 * měří tenhle skript prázdnou knihovnu a vrátí nuly, které vypadají jako
 * nález. Stalo se mi to 14. 10. 2026 při prvním běhu: katalog hlásil 0 spotů
 * a já byl krok od toho ohlásit „matice po akcích je v 0 %" jako změřený fakt.
 */
await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

const STREETS: readonly PostflopStreet[] = ["FLOP", "TURN", "RIVER"];
const SPOTS_PER_STREET = 300;

interface Row {
  street: string;
  dealt: number;
  withBuckets: number;
  actionEv: number;
  priced: number;
  solvedSource: number;
}

function measure(street: PostflopStreet): Row {
  const row: Row = {
    street,
    dealt: 0,
    withBuckets: 0,
    actionEv: 0,
    priced: 0,
    solvedSource: 0,
  };
  const resolver = createDefaultPostflopStrategyResolver();

  for (let index = 0; index < SPOTS_PER_STREET; index += 1) {
    // Situace se bere z téhož seznamu, který nabízí UI, a cyklicky, aby se
    // neměřila jedna oblíbená dvojice sedaček.
    const context = POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS[
      index % POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS.length
    ];
    let generated;
    try {
      generated = generatePostflopSpot({
        seed: 2000 + index,
        street,
        strategyResolver: resolver,
        // Tohle je ten rozdíl proti `mtt:post-answer`: vybraná situace a
        // **žádná konfigurace z katalogu**, tedy přesně stav, do kterého se
        // produkt dostane po „Change situation".
        positionContext: context,
      } as never);
    } catch {
      continue;
    }
    if (generated.strategySource === undefined) continue;

    const spot = postflopSpotToTrainingSpot(generated);
    row.dealt += 1;

    const source = spot.explanation.source;
    if (source.kind === "STRATEGY_PACK") row.solvedSource += 1;

    // Kbelíky jsou to, co `postflopRangeMatrixView` potřebuje, aby matici
    // obarvil podle akce; bez nich spadne na sílu ruky. Čtou se **stejnou
    // cestou** jako v `mtt:post-answer` (`source.rangeBuckets`), jinak by se
    // ta dvě čísla nedala položit vedle sebe - a při prvním pokusu jsem je
    // bral z `explanation.buckets`, což je pole, které neexistuje, takže
    // vycházela nula i tam, kde kbelíky jsou.
    const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
    if (buckets.length > 0) row.withBuckets += 1;

    // Stejná podmínka jako v `mtt:post-answer`: ne „tabulka existuje", ale
    // „bublina se ukáže". Jinak by se ta dvě čísla nedala porovnat.
    const legal = spot.actions.map((item) => item.action);
    if (isActionEvSetUsable(spot.actionEvs, legal, DISPLAYABLE_ACTION_EV_SOURCES)) {
      row.actionEv += 1;
    }
    if (postflopDecisionPrices(spot).length > 0) row.priced += 1;
  }
  return row;
}

function pct(part: number, total: number): string {
  return total === 0 ? "-" : `${((100 * part) / total).toFixed(1)} %`;
}

function main(): void {
  console.log("Co hráč dostane, když si situaci vybere sám");
  console.log(`vzorek: ${SPOTS_PER_STREET} pokusů na ulici, situace z nabídky UI`);
  console.log("");
  console.log(
    "ulice".padEnd(7)
    + "rozdáno".padStart(9)
    + "vyřešený zdroj".padStart(16)
    + "matice akcí".padStart(13)
    + "EV akcí".padStart(10)
    + "cena".padStart(9),
  );

  const rows = STREETS.map(measure);
  for (const row of rows) {
    console.log(
      row.street.padEnd(7)
      + String(row.dealt).padStart(9)
      + pct(row.solvedSource, row.dealt).padStart(16)
      + pct(row.withBuckets, row.dealt).padStart(13)
      + pct(row.actionEv, row.dealt).padStart(10)
      + pct(row.priced, row.dealt).padStart(9),
    );
  }

  console.log("");
  console.log(
    "Porovnej s `npm run mtt:post-answer`, který měří katalogovou cestu.\n"
    + "Rozdíl mezi těmi dvěma tabulkami není vada kódu - je to **cena volby**:\n"
    + "jakmile si hráč vybere situaci, deska se losuje a vyřešený obsah\n"
    + "odpovídá jen na desky, které solver skutečně spočítal.",
  );
}

main();
