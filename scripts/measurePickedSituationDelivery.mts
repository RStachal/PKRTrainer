import {
  generatePostflopSpot,
  type PostflopStreet,
} from "../src/core/postflopGenerator";
import { postflopIntentFromFilters, type PostflopIntent } from "../src/core/postflopIntent";
import type { Position, StackBucket } from "../src/core/types";
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
  cataloguePatternFor,
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
 * ## Situace se berou z filtrů, ne ze seznamu kontextů
 *
 * První verze tohohle skriptu brala situace z `POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS`
 * - a to je **jiný seznam**, než co vyrobí výběr hráče. Filtry
 * (`postflopIntentFromFilters`) staví u obrany blindu hrubé vzory (`EP_VS_BB`),
 * kdežto ten seznam má jemné (`SRP_CO_VS_BB`), takže měření hlásilo pokrytí,
 * které hráč nedostal. Teď se prochází všech 45 kombinací pozic, které filtry
 * umí, přesně tak, jak je pohled dostane.
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
/** Hloubky, které hráč ve filtrech vybírá. */
const DEPTHS: readonly StackBucket[] = [25, 40, 50, 100] as StackBucket[];
/** Volby v nabídce situací pohledu, viz `selectedActionNode`. */
const SITUATIONS = ["initiative", "facing-bet", "oop-lead"] as const;
const SEATS: readonly Position[] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

/** Všechny výběry pozic, které filtry umí: jedna sedačka nebo dvojice. */
const POSITION_PICKS: readonly Position[][] = (() => {
  const picks: Position[][] = SEATS.map((seat) => [seat]);
  for (let i = 0; i < SEATS.length; i += 1) {
    for (let j = i + 1; j < SEATS.length; j += 1) picks.push([SEATS[i], SEATS[j]]);
  }
  return picks;
})();

interface Tally {
  dealt: number;
  withBuckets: number;
  actionEv: number;
  priced: number;
}

const emptyTally = (): Tally => ({ dealt: 0, withBuckets: 0, actionEv: 0, priced: 0 });

/** Tentýž záměr, jaký pohled dostane z filtrů. */
function intentFor(index: number): PostflopIntent {
  const positions = POSITION_PICKS[index % POSITION_PICKS.length];
  const bucket = DEPTHS[Math.floor(index / POSITION_PICKS.length) % DEPTHS.length];
  return postflopIntentFromFilters({ positions, contexts: [], buckets: [bucket] } as never);
}

async function deal(
  street: PostflopStreet,
  index: number,
  useCatalogue: boolean,
): Promise<ReturnType<typeof postflopSpotToTrainingSpot> | undefined> {
  const intent = intentFor(index);
  const context = intent.positionContext;
  // Výběr, ze kterého filtry kontext nesložily, se do téhle cesty nepočítá:
  // pohled ho bere jako „nic nevybráno" a rozdá z celého katalogu. Počítá
  // se zvlášť jako zahozená volba.
  if (context === null) return undefined;
  const actionNode = selectedActionNode(street, SITUATIONS[index % SITUATIONS.length], intent.potType);
  const seed = 2000 + index;

  const situation: DealSituation = {
    positionPattern: cataloguePatternFor(context),
    stackBB: intent.effectiveStackBB,
  };

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
      potType: intent.potType,
      actionNode,
      potBB: intent.potBB,
      effectiveStackBB: intent.effectiveStackBB,
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

const SAMPLE = POSITION_PICKS.length * DEPTHS.length;

async function main(): Promise<void> {
  const discarded = POSITION_PICKS.filter((positions) =>
    postflopIntentFromFilters({ positions, contexts: [] } as never).positionContext === null);
  console.log("Co hráč dostane, když si situaci vybere sám");
  console.log(
    `vzorek: ${SAMPLE} pokusů na ulici = ${POSITION_PICKS.length} výběrů pozic z filtrů`
    + ` x hloubky ${DEPTHS.join("/")} bb; volby ${SITUATIONS.join("/")}`,
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

  const measured = new Map<PostflopStreet, Tally>();
  for (const street of STREETS) {
    const before = emptyTally();
    const after = emptyTally();
    for (let index = 0; index < SAMPLE; index += 1) {
      const old = await deal(street, index, false);
      if (old !== undefined) count(before, old);
      const fresh = await deal(street, index, true);
      if (fresh !== undefined) count(after, fresh);
    }
    measured.set(street, after);
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
    `zahozená volba (filtry z ní kontext nesložily, pohled rozdá cokoli): `
    + `${discarded.length} z ${POSITION_PICKS.length} výběrů pozic - `
    + discarded.map((positions) => positions.join("+")).join(", "),
  );
  console.log("");
  console.log(
    "„Bez katalogu“ je cesta do 14. 10. 2026: vybraná situace, losovaná deska.\n"
    + "„S katalogem“ je dnešní: katalog filtrovaný podle vzoru a hloubky, a\n"
    + "losovaná deska jen tam, kde pro tu situaci vyřešený obsah není.\n"
    + "Zbytek do 100 % je otázka šířky solvingu, ne cesty.",
  );

  const failures = belowFloor(measured);
  console.log("");
  if (failures.length === 0) {
    console.log("Doručení vybrané situace drží nad dnem.");
  } else {
    console.log("DORUČENÍ VYBRANÉ SITUACE SPADLO POD DNO:");
    for (const line of failures) console.log(`  ${line}`);
    console.log("");
    console.log("Hráč, který si situaci vybere, dostane méně vyřešeného obsahu než dřív.");
    process.exitCode = 1;
  }
}

/**
 * Dna pro cestu s katalogem.
 *
 * Do 15. 10. 2026 tenhle skript jen tiskl, a tak nehlídal nic - přitom právě
 * tahle cesta stála do 14. 10. na nule, aniž by to kterákoli brána poznala.
 * Dna jsou kolem 80 % naměřeného, stejně jako u `mtt:post-answer`: chytí
 * rozbitou cestu, ne kolísání obsahu. Rozdávání je deterministické (semínka
 * 2000+), takže čísla se mění jen se změnou packů.
 *
 * | ulice | matice podle akce | EV akcí | cena akce | (naměřeno 15. 10. 2026) |
 * |---|---|---|---|---|
 * | flop | 45,5 % -> dno 36 | 0,0 % -> bez dna | 14,2 % -> dno 11 | |
 * | turn | 21,6 % -> dno 17 | 16,5 % -> dno 13 | 9,7 % -> dno 7 | |
 * | river | 27,8 % -> dno 22 | 19,3 % -> dno 15 | 9,7 % -> dno 7 | |
 *
 * EV akcí na flopu dno nemá: flopové EV skrz riverové vrstvy neexistuje (deník
 * 247), a nula je tedy správný stav, ne propad. Každé dno jde přepsat
 * proměnnou `PICKED_SITUATION_MIN_<ULICE>_<METRIKA>_PCT`.
 */
const FLOORS: Record<PostflopStreet, { matrix: number; ev?: number; price: number }> = {
  FLOP: { matrix: 36, price: 11 },
  TURN: { matrix: 17, ev: 13, price: 7 },
  RIVER: { matrix: 22, ev: 15, price: 7 },
};

function belowFloor(measured: ReadonlyMap<PostflopStreet, Tally>): string[] {
  const floor = (name: string, fallback: number): number => {
    const raw = process.env[name];
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const failures: string[] = [];
  for (const street of STREETS) {
    const tally = measured.get(street) ?? emptyTally();
    const share = (part: number) => (tally.dealt === 0 ? 0 : (100 * part) / tally.dealt);
    const checks: [string, string, number, number | undefined][] = [
      ["MATRIX", "matice podle akce", share(tally.withBuckets), FLOORS[street].matrix],
      ["EV", "EV akcí", share(tally.actionEv), FLOORS[street].ev],
      ["PRICE", "cena akce", share(tally.priced), FLOORS[street].price],
    ];
    for (const [key, label, value, fallback] of checks) {
      if (fallback === undefined) continue;
      const limit = floor(`PICKED_SITUATION_MIN_${street}_${key}_PCT`, fallback);
      if (value < limit) failures.push(`${label} na ${street} ${value.toFixed(1)} % pod dnem ${limit} %`);
    }
  }
  return failures;
}

await main();
