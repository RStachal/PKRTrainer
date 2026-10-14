import { mulberry32 } from "../../core/rng";
import {
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  type PostflopPositionPattern,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { PostflopPotType, PostflopStreet } from "../../core/postflopGenerator";
import {
  pickSolvedFlopSpot,
  solvedFlopSpotConfig,
  solvedFlopSpots,
} from "./solvedFlopSpotCatalogue";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "./solvedTurnSpotCatalogue";
import {
  pickSolvedRiverSpot,
  solvedRiverSpotConfig,
  solvedRiverSpots,
} from "./solvedRiverSpotCatalogue";
import { primeRiverEvForPack } from "./riverEvPrefetch";
import { primeTurnEvForFamily } from "./turnEvPrefetch";

/**
 * Rozdávání z katalogu vyřešených spotů - jedno místo pro trenažér i bránu.
 *
 * ## Proč to bydlí tady a ne v `postflopView.ts`
 *
 * Do 14. 10. 2026 byly tyhle funkce soukromé v pohledu, a brána doručení
 * (`mtt:post-answer`) proto rozdávala **vlastní kopií** - a když pohled přidal
 * druhou cestu (vybraná situace obcházela katalog), brána o ní nevěděla a
 * zůstala zelená, zatímco hráč dostával matici bez akcí. Změřeno: 100 % na
 * katalogové cestě proti **0,0 %** po „Change situation".
 *
 * Teď je volá pohled i měřicí skripty, takže se ty dvě cesty nemůžou rozejít.
 *
 * ## Filtr podle vybrané situace
 *
 * Každá funkce bere volitelnou `DealSituation` - vzor pozic a hloubku, které si
 * hráč zafixoval. Bez ní rozdává z celého katalogu jako dřív; s ní jen ze spotů
 * té situace, a když žádný není, vrací `undefined` a volající spadne na
 * losovanou desku. Vyřešený obsah pro vzor existuje u **35 z 61** nabízených
 * situací (`npm run mtt:catalogue-situations`); s hloubkou je to méně a je to
 * tak správně.
 *
 * **Přednačtení musí dostat tutéž situaci jako rozdání.** Kdyby předčítalo
 * z nefiltrovaného katalogu a rozdávalo z filtrovaného, losovalo by ze dvou
 * různých seznamů tímtéž seedem, načetlo by tabulku EV jiné rodiny a první
 * rozdaný spot by EV neukázal - a zvenku by to vypadalo, jako by řetěz nebyl.
 */

/**
 * Co si hráč ve výběru situace zafixoval - a na co se tedy katalog smí ptát.
 *
 * **Vzor pozic i hloubka**, ne jen vzor. `postflopIntentFromFilters` fixuje
 * obojí, a katalogová konfigurace se v pohledu rozprostře **za** hodnoty
 * z filtrů, takže by je přepsala. Filtr jen podle vzoru by hráči, který si
 * vybral 40 bb, rozdal vyřešený spot z 25 bb - tedy odpověděl na otázku,
 * kterou nepoložil. Komentář v `postflopView.ts` to říká přesně: to je horší
 * selhání než heuristika na otázku, kterou položil.
 *
 * Pot se nefiltruje schválně: ten si hráč nevybírá, `defaultPostflopPotBB`
 * ho bere z typu potu (SRP 6, 3BP 18), a vyřešený pot je přesnější než tahle
 * výchozí hodnota. Typ potu nese vzor sám (`SRP_…`, `3BP_…`).
 */
export interface DealSituation {
  positionPattern: PostflopPositionPattern;
  /** Jmenovitá hloubka v BB, jak se jmenují koše (25, 40, 50…). */
  stackBB?: number;
}

function matches(
  spot: {
    actionNode: PostflopActionNode;
    positionPattern: PostflopPositionPattern;
    effectiveStackBB: number;
  },
  actionNode: PostflopActionNode,
  situation: DealSituation | undefined,
): boolean {
  if (spot.actionNode !== actionNode) return false;
  if (situation === undefined) return true;
  if (spot.positionPattern !== situation.positionPattern) return false;
  // `effectiveStackBB` katalogového spotu je **jmenovitá** hloubka rodiny
  // (20, 25, 35, 40 … 150) - ověřeno 14. 10. 2026 proti jménu rodiny na všech
  // třech ulicích, nula neshod. Hloubka se zprvu četla ze `sourceDirectory`
  // regulárním výrazem ukotveným na začátek, jenže u riveru je to celá cesta
  // (`artifacts/decomposition/MTT9_100BB_…`), takže se river nenašel nikdy
  // a filtr na něm vracel nulu.
  return situation.stackBB === undefined || spot.effectiveStackBB === situation.stackBB;
}

/**
 * Vyřešený flop pro tenhle seed, nebo nic, když žádný není načtený.
 *
 * Stejná úvaha jako u turnu a stejně měřená: dodává se 47 flopových rodin a
 * trenažér rozdával náhodnou desku, takže se na vyřešenou trefil zhruba nikdy -
 * změřeno 0,0 % z 1500 rozdaných flopů - **a to číslo bylo chybné**: měřicí
 * skript se ptal na neexistující pole a hlásil nulu vždy. Po opravě
 * (26. 8. 2026) je to u flopu 18,8 %, protože chartové packy odpovídají na
 * třídu textury. Katalog má smysl dál - vyřešený flop odpovídá na konkrétní
 * desku, kterou někdo spočítal, a na tu se hráč náhodou netrefí.
 */
export function solvedFlopConfigForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
) {
  const candidates = solvedFlopSpots().filter((spot) =>
    matches(spot, actionNode, situation));
  if (candidates.length === 0) return undefined;
  const rng = mulberry32(seed);
  rng();
  const spot = pickSolvedFlopSpot(rng(), candidates);
  if (spot === undefined) return undefined;
  return solvedFlopSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng());
}

/**
 * Vyřešený river pro tenhle seed, jako **jednotlivý spot**.
 *
 * Katalog se dosud používal jen uvnitř linky. Hráč, který si vybral river jako
 * samostatný dril, dostával náhodnou pětikartovou desku - a šance, že padne
 * jedna z 908 vyřešených, je mizivá. Sedmnáct riverových rodin se dodávalo,
 * stahovalo a nikdo je nemohl potkat.
 */
export function pickRiverSpotForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
) {
  const candidates = solvedRiverSpots().filter((spot) =>
    matches(spot, actionNode, situation));
  if (candidates.length === 0) return undefined;
  const rng = mulberry32(seed);
  rng();
  const spot = pickSolvedRiverSpot(rng(), candidates);
  // `rng` jde zpátky s ním: konfigurace si z něj bere další los, takže dva
  // nezávislé generátory by daly jinou desku než jaké se předtím načetla EV.
  return spot === undefined ? undefined : { spot, rng };
}

export function solvedRiverConfigForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
) {
  const picked = pickRiverSpotForSeed(seed, actionNode, situation);
  if (picked === undefined) return undefined;
  return solvedRiverSpotConfig(
    picked.spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, picked.rng(),
  );
}

/**
 * Načíst tabulku EV rodiny, ze které se bude rozdávat, a teprve pak rozdat.
 *
 * Vlastní práce bydlí v `riverEvPrefetch`, protože po ní sahá i
 * `mtt:post-answer` - brána musí měřit tutéž cestu, kterou jde produkt.
 * Kdyby to zůstalo tady, měřilo by se něco vedle.
 */
export function primeRiverEvForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
): Promise<unknown> | undefined {
  const picked = pickRiverSpotForSeed(seed, actionNode, situation);
  return picked === undefined ? undefined : primeRiverEvForPack(picked.spot.packId);
}

/**
 * Spot, ze kterého se turn rozdá - jedno místo pro obojí.
 *
 * Předčítání tabulky i samotné rozdání musí sáhnout po **téže** rodině. Kdyby
 * si každé losovalo zvlášť, předčetla by se jiná než ta rozdaná a EV by chyběla
 * přesně tak, jako by řetěz nebyl - a zvenku by to vypadalo stejně.
 */
export function pickTurnSpotForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
) {
  const candidates = solvedTurnSpots().filter((spot) =>
    matches(spot, actionNode, situation));
  if (candidates.length === 0) return undefined;
  const rng = mulberry32(seed);
  rng();
  const spot = pickSolvedTurnSpot(rng(), candidates);
  return spot === undefined ? undefined : { spot, rng };
}

export function solvedTurnConfigForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
) {
  const picked = pickTurnSpotForSeed(seed, actionNode, situation);
  if (picked === undefined) return undefined;
  return solvedTurnSpotConfig(
    picked.spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, picked.rng(),
  );
}

/** Totéž co `primeRiverEvForSeed`, jen o ulici dřív. */
export function primeTurnEvForSeed(
  seed: number,
  actionNode: PostflopActionNode,
  situation?: DealSituation,
): Promise<unknown> | undefined {
  const picked = pickTurnSpotForSeed(seed, actionNode, situation);
  return picked === undefined ? undefined : primeTurnEvForFamily(picked.spot.sourceDirectory);
}

/**
 * Na které rozhodnutí se rozdává - podle ulice a volby v nabídce situací.
 *
 * Bydlí tady, ne v pohledu, aby měřicí skripty rozdávaly na tytéž uzly jako
 * trenažér; kopie by se při první změně nabídky tiše rozešla.
 */
export function selectedActionNode(
  street: PostflopStreet,
  situation: string,
  potType: PostflopPotType | undefined,
): PostflopActionNode {
  if (situation === "facing-bet") {
    if (street === "FLOP") return "FLOP_FACING_BET";
    if (street === "TURN") return "TURN_FACING_BET";
    return "RIVER_FACING_BET";
  }
  if (situation === "oop-lead" && street === "TURN") return "TURN_OOP_LEAD";
  if (street === "TURN") return "TURN_BARREL";
  if (street === "RIVER") return "RIVER_PRESSURE";
  return potType === "THREE_BET_POT"
    ? "THREE_BET_POT_CBET"
    : "SINGLE_RAISED_POT_CBET";
}
