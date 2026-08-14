import type { Card, Rank, Suit } from "../../core/types";
import type {
  PostflopPositionPattern,
  PostflopPotType,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import { runtimeSolvedRiverPacks } from "./riverSolvedRuntimeRegistry";
import type { RiverStrategyRule } from "./riverStrategyRuleBuilder";
import { actionNodeForSolvedHero } from "./solvedHeroActionNode";
import { heroCardsFromClasses } from "./solvedTurnSpotCatalogue";

/**
 * Vyřešené rivery, nabídnuté jako něco, co jde rozdat.
 *
 * Turn tenhle katalog dostal, protože bez něj byl vyřešený obsah nedosažitelný:
 * pack odpovídá na jednu desku a všechno ostatní odmítá, takže trenažér
 * rozdávající náhodné desky ho nepotká skoro nikdy. Zvenku vypadá správný
 * resolver s nedosažitelným obsahem úplně stejně jako obsah, který neexistuje.
 *
 * Na riveru je to horší, ne stejné. Deska má pět karet místo čtyř, takže i kdyby
 * trenažér mířil na vyřešený flop a turn, pátá karta se dosud dolosovávala z
 * balíčku - a šance, že padne zrovna ta vyřešená, je jedna ku čtyřiceti čtyřem.
 * Riverový obsah se tedy dodával, stahoval a hráč ho nemohl potkat.
 *
 * Komentář v lince to říkal na rovinu: „river se dolosuje - ten vyřešený stejně
 * není". Když se to psalo, byla to pravda. Přestala platit ve chvíli, kdy
 * riverové rodiny vznikly, a tenhle katalog je tou opravou.
 */

export interface SolvedRiverSpot {
  positionPattern: PostflopPositionPattern;
  potType: PostflopPotType;
  actionNode: PostflopActionNode;
  /** Pět karet, na kterých se hrálo. */
  board: readonly Card[];
  effectiveStackBB: number;
  potBB: number;
  /** Třídy ruk, které solver hrdinovi v tomhle uzlu přiřkl. */
  heroHandClasses: readonly string[];
  /** Jak často se sem hra dostane, 0 až 1. */
  reach: number;
  sourceDirectory: string;
  heroSeat: string;
  villainSeat: string;
  heroIsAggressor: boolean;
  heroInPosition: boolean;
}

const RANKS = new Set("23456789TJQKA");
const SUITS = new Set("cdhs");

/** "9s" na kartu, nebo nic, když to karta není. */
function card(text: string): Card | undefined {
  const rank = text[0]?.toUpperCase();
  const suit = text[1]?.toLowerCase();
  if (rank === undefined || suit === undefined) return undefined;
  if (!RANKS.has(rank) || !SUITS.has(suit)) return undefined;
  return { rank: rank as Rank, suit: suit as Suit };
}

export function solvedRiverSpots(): readonly SolvedRiverSpot[] {
  const spots: SolvedRiverSpot[] = [];
  for (const pack of runtimeSolvedRiverPacks) {
    for (const rule of pack.rules as readonly RiverStrategyRule[]) {
      const solved = rule.spot;
      const hero = solved?.hero;
      if (solved === undefined || hero === undefined || solved.potBB === undefined) continue;

      // Uzel sám říká, které rozhodnutí drží; jméno rodiny to neříká a spoléhat
      // na ně už jednou znamenalo servírovat strategii druhého hráče.
      const actionNode = actionNodeForSolvedHero(hero, "RIVER");
      if (actionNode === undefined) continue;

      const board = [...rule.riverSpot.turnBoard, rule.riverSpot.riverCard]
        .map(card)
        .filter((item): item is Card => item !== undefined);
      if (board.length !== 5) continue;

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
        reach: solved.reach,
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

/**
 * Vyřešený river na těchhle čtyřech kartách, když nějaký je.
 *
 * Tohle je celý smysl katalogu pro linku: turn se vybere z turnového katalogu a
 * pátá karta se pak nedolosuje, ale vezme se ta, kterou někdo doopravdy vyřešil.
 * Bez shody se vrací prázdno a linka dolosuje jako dřív - vyrobit river, který
 * nikdo nespočítal, by bylo horší než heuristika.
 */
export function solvedRiversForTurnBoard(
  turnBoard: readonly Card[],
  spots: readonly SolvedRiverSpot[] = solvedRiverSpots(),
): readonly SolvedRiverSpot[] {
  if (turnBoard.length < 4) return [];
  const wanted = turnBoard.slice(0, 4).map((item) => `${item.rank}${item.suit}`.toLowerCase());
  const flop = [...wanted.slice(0, 3)].sort().join(",");
  return spots.filter((spot) => {
    const board = spot.board.map((item) => `${item.rank}${item.suit}`.toLowerCase());
    // Flop bez pořadí, turnová karta na svém místě - stejné pravidlo jako v
    // resolveru, protože jinak by katalog nabídl spot, který resolver odmítne.
    if ([...board.slice(0, 3)].sort().join(",") !== flop) return false;
    return board[3] === wanted[3];
  });
}

/**
 * Karty, které hrdina v tomhle spotu může držet.
 *
 * Bez nich rozdá generátor cokoli, a ruka mimo vyřešenou range není jen
 * nezodpověditelná - hrdina ji tu držet nemůže, protože s ní by se na river
 * nedostal. U turnu to stálo tři čtvrtiny spotů: vybrala se vyřešená deska a
 * pak se položila otázka, na kterou solver nikdy neodpovídal. Měřeno na riveru:
 * bez tohohle odpovědělo 3 spoty z 52.
 *
 * Losování je společné s turnem, ne opsané.
 */
export function solvedRiverHeroCards(
  spot: SolvedRiverSpot,
  random = 0.5,
): [Card, Card] | undefined {
  return heroCardsFromClasses(spot.heroHandClasses, spot.board, random);
}

/** Váženo dosahem, stejně jako u turnu: častější spot se rozdá častěji. */
export function pickSolvedRiverSpot(
  random: number,
  spots: readonly SolvedRiverSpot[] = solvedRiverSpots(),
): SolvedRiverSpot | undefined {
  if (spots.length === 0) return undefined;

  const total = spots.reduce((sum, spot) => sum + Math.max(spot.reach, 0), 0);
  if (total <= 0) return spots[Math.min(Math.floor(random * spots.length), spots.length - 1)];

  let cursor = Math.min(Math.max(random, 0), 0.999999) * total;
  for (const spot of spots) {
    cursor -= Math.max(spot.reach, 0);
    if (cursor < 0) return spot;
  }
  return spots[spots.length - 1];
}
