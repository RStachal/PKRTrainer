import type { Card, Rank, Suit } from "../../core/types";
import type {
  PostflopPositionContext,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import { runtimeSolvedFlopPacks } from "./flopSolvedRuntimeRegistry";
import { actionNodeForSolvedHero } from "./solvedHeroActionNode";
import { heroCardsFromClasses } from "./solvedTurnSpotCatalogue";
import {
  pickSolvedSpotByReach,
  positionContextForSolvedSeats,
} from "./solvedSpotSeating";

/**
 * Flopy, které někdo doopravdy vyřešil, nabídnuté jako něco k rozdání.
 *
 * Tentýž důvod, pro který vznikl turnový katalog, jen o ulici dřív a v mnohem
 * větším měřítku: **flopových rodin se dodává 47 a trenažér rozdával náhodné
 * desky**, takže se na vyřešenou trefil zhruba nikdy. Změřeno 21. 8. 2026 na
 * vzorku 1500 rozdaných flopů: odpověď 0,0 %. Resolver je přitom správně - a
 * zvenku vypadá správný resolver s nedosažitelným obsahem úplně stejně jako
 * žádný obsah. Hráč dostane heuristiku tak jako tak.
 *
 * Packy se proto čtou obráceně: místo „rozdej desku a zeptej se, jestli ji někdo
 * řešil" se zeptáme, co je vyřešené, a to se rozdá.
 *
 * ## Co to udělá s deskami, které hráč uvidí
 *
 * Zúží je, a to je skutečná cena, kterou je fér pojmenovat. 238 flopů místo
 * celého prostoru znamená, že kdo bude drilovat jen tohle, uvidí stejné textury
 * opakovaně.
 *
 * Vyměňuje se to za to, co se hráči říká na ostatních deskách, a to je
 * heuristika - poctivě označená, ale heuristika. Deska s přesnou odpovědí učí
 * spot líp než deska s přibližnou, a nebyly vybrané pro pohodlí: rozklad je
 * volil tak, aby pokryly prostor textur, přes který běžel.
 *
 * Katalog je zdroj spotů, ne náhrada generátoru. Kdo chce náhodnou desku, dostane ji.
 */

export interface SolvedFlopSpot {
  positionPattern: PostflopPositionPattern;
  potType: PostflopPotType;
  actionNode: PostflopActionNode;
  board: readonly Card[];
  effectiveStackBB: number;
  potBB: number;
  /** Třídy ruk, které solve dal hrdinovi do range. */
  heroHandClasses: readonly string[];
  /** Podíl range, který se do tohohle uzlu dostane, 0 až 1. */
  reach: number;
  /** Adresář, ve kterém spot vznikl, kvůli dohledání odpovědi. */
  sourceDirectory: string;
  heroSeat: string;
  villainSeat: string;
  heroIsAggressor: boolean;
  heroInPosition: boolean;
}

function card(text: string): Card | undefined {
  if (text.length < 2) return undefined;
  return {
    rank: text[0].toUpperCase() as Rank,
    suit: text[1].toLowerCase() as Suit,
  };
}

/**
 * Každý vyřešený flop, který je zrovna načtený, jako spot k rozdání.
 *
 * Pravidlo, ze kterého se nedá poskládat celý spot, se vynechá, ne doplní
 * výchozími hodnotami. Spot rozdaný na špatné hloubce nebo se špatným potem by
 * došel k resolveru, byl odmítnut a tiše se stal heuristickým drilem pod jménem
 * katalogu - tedy přesně tím, čemu má katalog zabránit.
 */
export function solvedFlopSpots(): readonly SolvedFlopSpot[] {
  const spots: SolvedFlopSpot[] = [];
  for (const pack of runtimeSolvedFlopPacks) {
    for (const rule of pack.rules) {
      const solved = rule.spot;
      if (solved === undefined) continue;
      if (solved.potBB === undefined) continue;

      const hero = solved.hero;
      if (hero === undefined) continue;
      // Uzel se čte z tvaru uzlu, ne ze jména rodiny: `..._CBET_...` pojmenovává
      // flopový c-bet, který rodinu definuje, ne nutně rozhodnutí, které drží.
      const actionNode = actionNodeForSolvedHero(hero, "FLOP", rule.potType);
      if (actionNode === undefined) continue;

      const board = solved.flop.map(card).filter((item): item is Card => item !== undefined);
      if (board.length !== 3) continue;

      const heroHandClasses = [...new Set(rule.buckets.flatMap((bucket) => bucket.handClasses))];
      if (heroHandClasses.length === 0) continue;

      spots.push({
        positionPattern: rule.positionPattern as PostflopPositionPattern,
        potType: rule.potType as PostflopPotType,
        actionNode,
        board,
        effectiveStackBB: rule.stackBB,
        potBB: solved.potBB,
        heroHandClasses,
        reach: solved.reach ?? 1,
        sourceDirectory: rule.sourceDirectory,
        heroSeat: hero.seat,
        villainSeat: hero.villainSeat,
        heroIsAggressor: hero.isAggressor,
        heroInPosition: hero.side === "IP",
      });
    }
  }
  return spots;
}

/** Váženo dosahem, stejně jako u turnu: častější spot se rozdá častěji. */
export function pickSolvedFlopSpot(
  random: number,
  spots: readonly SolvedFlopSpot[] = solvedFlopSpots(),
): SolvedFlopSpot | undefined {
  return pickSolvedSpotByReach(random, spots);
}

/**
 * Karty, které hrdina v tomhle spotu může držet.
 *
 * Bez nich rozdá generátor cokoli, a ruka mimo vyřešenou range není jen
 * nezodpověditelná - hrdina ji tu držet nemůže, protože s ní by se sem nedostal.
 * U turnu to stálo tři čtvrtiny spotů: vybrala se vyřešená deska a pak se
 * položila otázka, na kterou solver nikdy neodpovídal.
 */
export function solvedFlopHeroCards(
  spot: SolvedFlopSpot,
  random = 0.5,
): [Card, Card] | undefined {
  return heroCardsFromClasses(spot.heroHandClasses, spot.board, random);
}

/**
 * Konfigurace generátoru, která tenhle spot rozdá, nebo nic, když sedačky neznáme.
 *
 * Generátor dostává sedačky, ne vzor, takže vzor, pro který běžící formát nemá
 * kontext, se rozdat nedá. Vrátit tehdy `undefined` je smysl téhle funkce:
 * alternativou je spot, jehož sedačky nesouhlasí s jeho strategií.
 */
export function solvedFlopSpotConfig(
  spot: SolvedFlopSpot,
  contexts: readonly PostflopPositionContext[],
  random = 0.5,
): {
  street: "FLOP";
  board: Card[];
  heroCards?: [Card, Card];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  actionNode: PostflopActionNode;
  positionContext: PostflopPositionContext;
} | undefined {
  const positionContext = positionContextForSolvedSeats(spot, contexts);
  if (positionContext === undefined) return undefined;
  const heroCards = solvedFlopHeroCards(spot, random);
  return {
    street: "FLOP",
    board: [...spot.board],
    ...(heroCards ? { heroCards } : {}),
    potType: spot.potType,
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    actionNode: spot.actionNode,
    positionContext,
  };
}
