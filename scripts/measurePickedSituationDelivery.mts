import {
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  generatePostflopSpot,
  type PostflopPositionContext,
  type PostflopPotType,
  type PostflopStreet,
} from "../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../src/data/ranges/postflopStrategyRegistry";
import { postflopSpotToTrainingSpot } from "../src/core/postflopTrainingSpot";
import { postflopDecisionPrices } from "../src/core/postflopDecisionPrice";
import { DISPLAYABLE_ACTION_EV_SOURCES, isActionEvSetUsable } from "../src/core/actionEv";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import {
  primeRiverEvForSeed,
  primeTurnEvForSeed,
  selectedActionNode,
  solvedFlopConfigForSeed,
  solvedRiverConfigForSeed,
  solvedTurnConfigForSeed,
  type DealSituation,
} from "../src/data/ranges/solvedSpotDealing";

/**
 * Co hráč dostane, **když si situaci vybere sám** - před opravou a po ní.
 *
 *   npm run mtt:picked-situation
 *
 * ## Proč to vzniklo
 *
 * `mtt:post-answer` měří doručení „rozdáno z katalogu, tak jak rozdává
 * trenažér" - a do 14. 10. 2026 to platilo jen pro **jednu ze dvou cest**.
 * Pohled měl `dealsSolved = options.initialPositionContext == null`, takže
 * katalog vyřešených spotů obešel, jakmile si hráč situaci vybral, a losoval
 * desku. Vrstva 0 orchestrace („dojde odpověď k hráči") tak měla slepé místo
 * přesně tam, kde hráč něco volí.
 *
 * Nalezeno, když vlastník poslal snímek matice barvené podle **síly ruky**
 * místo podle akce a napsal, že to nevypadá, že máme solving hotový.
 * `mtt:post-answer` přitom hlásil matici podle akce ve 100 % spotů - obojí byla
 * pravda, každé o jiné cestě.
 *
 * ## Proč to rozdává přes `solvedSpotDealing`
 *
 * Rozdávání z katalogu je od té opravy **sdílený modul**, který volá pohled
 * i tenhle skript. Dřív byly ty funkce soukromé v pohledu a brána rozdávala
 * kopií - a kopie se rozejde při první změně, přesně jak se to stalo.
 *
 * ## Co se tiskne
 *
 * Dva sloupce pro každou metriku: „bez katalogu" je cesta do 14. 10. (vybraná
 * situace, losovaná deska), „s katalogem" je dnešní cesta (katalog filtrovaný
 * podle vzoru a hloubky, a teprve když nic nemá, losovaná deska). Rozdíl je
 * tedy měřený dopad opravy, ne odhad.
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
/** Hloubky, které hráč ve filtrech vybírá; 40 je i výchozí, když nevybere nic. */
const DEPTHS = [25, 40, 50, 100] as const;
/** Volby v nabídce situací pohledu, viz `selectedActionNode`. */
const SITUATIONS = ["initiative", "facing-bet", "oop-lead"] as const;

interface Tally {
  dealt: number;
  withBuckets: number;
  actionEv: number;
  priced: number;
}

const emptyTally = (): Tally => ({ dealt: 0, withBuckets: 0, actionEv: 0, priced: 0 });

function potTypeOf(context: PostflopPositionContext): PostflopPotType {
  return String(context.positionPattern).startsWith("3BP_") ? "THREE_BET_POT" : "SINGLE_RAISED";
}

async function deal(
  street: PostflopStreet,
  index: number,
  useCatalogue: boolean,
): Promise<ReturnType<typeof postflopSpotToTrainingSpot> | undefined> {
  const contexts = POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS;
  const context = contexts[index % contexts.length];
  const stackBB = DEPTHS[Math.floor(index / contexts.length) % DEPTHS.length];
  const potType = potTypeOf(context);
  const actionNode = selectedActionNode(street, SITUATIONS[index % SITUATIONS.length], potType);
  const seed = 2000 + index;

  const situation: DealSituation = { positionPattern: context.positionPattern, stackBB };

  // Tatáž větev jako v `postflopView.ts` - konfigurace z katalogu, a když
  // pro situaci nic nemá, prázdný objekt a losovaná deska.
  const config = useCatalogue
    ? (street === "TURN"
      ? solvedTurnConfigForSeed(seed, actionNode, situation)
      : street === "FLOP"
        ? solvedFlopConfigForSeed(seed, actionNode, situation)
        : solvedRiverConfigForSeed(seed, actionNode, situation)) ?? {}
    : {};

  if (useCatalogue) {
    const priming = street === "RIVER"
      ? primeRiverEvForSeed(seed, actionNode, situation)
      : street === "TURN"
        ? primeTurnEvForSeed(seed, actionNode, situation)
        : undefined;
    if (priming) await priming;
  }

  try {
    const generated = generatePostflopSpot({
      seed,
      street,
      potType,
      actionNode,
      effectiveStackBB: stackBB,
      positionContext: context,
      strategyResolver: createDefaultPostflopStrategyResolver(),
      ...(config as object),
    } as never);
    if (generated.strategySource === undefined) return undefined;
    return postflopSpotToTrainingSpot(generated);
  } catch {
    return undefined;
  }
}

function count(tally: Tally, spot: ReturnType<typeof postflopSpotToTrainingSpot>): void {
  tally.dealt += 1;
  const source = spot.explanation.source;
  // Stejná cesta jako `mtt:post-answer`: `source.rangeBuckets`, ne
  // `explanation.buckets` - to pole neexistuje a dává nulu i tam, kde kbelíky
  // jsou (spáleno 14. 10. 2026).
  const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
  if (buckets.length > 0) tally.withBuckets += 1;
  const legal = spot.actions.map((item) => item.action);
  if (isActionEvSetUsable(spot.actionEvs, legal, DISPLAYABLE_ACTION_EV_SOURCES)) {
    tally.actionEv += 1;
  }
  if (postflopDecisionPrices(spot).length > 0) tally.priced += 1;
}

function pct(part: number, total: number): string {
  return total === 0 ? "-" : `${((100 * part) / total).toFixed(1)} %`;
}

async function main(): Promise<void> {
  console.log("Co hráč dostane, když si situaci vybere sám");
  console.log(
    `vzorek: ${SPOTS_PER_STREET} pokusů na ulici; situace z nabídky UI, hloubky `
    + `${DEPTHS.join("/")} bb, volby ${SITUATIONS.join("/")}`,
  );
  console.log("");
  console.log(
    "".padEnd(7)
    + "matice podle akce".padStart(26)
    + "EV akcí".padStart(22)
    + "cena akce".padStart(22),
  );
  console.log(
    "ulice".padEnd(7)
    + "bez katalogu".padStart(14) + "s katalogem".padStart(12)
    + "bez katalogu".padStart(14) + "s katalogem".padStart(12)
    + "bez katalogu".padStart(14) + "s katalogem".padStart(12),
  );

  for (const street of STREETS) {
    const before = emptyTally();
    const after = emptyTally();
    for (let index = 0; index < SPOTS_PER_STREET; index += 1) {
      const old = await deal(street, index, false);
      if (old !== undefined) count(before, old);
      const fresh = await deal(street, index, true);
      if (fresh !== undefined) count(after, fresh);
    }
    console.log(
      street.padEnd(7)
      + pct(before.withBuckets, before.dealt).padStart(14)
      + pct(after.withBuckets, after.dealt).padStart(12)
      + pct(before.actionEv, before.dealt).padStart(14)
      + pct(after.actionEv, after.dealt).padStart(12)
      + pct(before.priced, before.dealt).padStart(14)
      + pct(after.priced, after.dealt).padStart(12),
    );
  }

  console.log("");
  console.log(
    "„Bez katalogu“ je cesta do 14. 10. 2026: vybraná situace, losovaná deska.\n"
    + "„S katalogem“ je dnešní: katalog filtrovaný podle vzoru a hloubky, a\n"
    + "losovaná deska jen tam, kde pro tu situaci vyřešený obsah není.\n"
    + "Zbytek do 100 % je otázka šířky solvingu, ne cesty.",
  );
}

await main();
