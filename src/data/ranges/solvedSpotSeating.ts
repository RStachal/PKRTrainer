import { POSITION_ORDER, type Position } from "../../core/types";
import type {
  PostflopPositionContext,
  PostflopPositionPattern,
} from "../../core/postflopGenerator";

/**
 * Do které židle posadit hráče, kterému se chystáme ukázat vyřešenou strategii.
 *
 * Stojí to zvlášť, protože to potřebuje katalog každé ulice a **je to pravidlo,
 * které projekt už jednou dostal špatně**. Druhá kopie by znamenala druhé místo,
 * kde se ta chyba opravuje.
 */

/** `UTG_1`, jak to píší solvy, na `UTG+1`, jak to píše produkt. */
export function seatToPosition(seat: string): Position {
  return seat.replace(/_(\d)$/, "+$1") as Position;
}

export interface SolvedSeating {
  heroSeat: string;
  villainSeat: string;
  /** Vzal ta sedačka iniciativu před flopem? */
  heroIsAggressor: boolean;
  /** Hraje ta sedačka po flopu poslední? */
  heroInPosition: boolean;
  positionPattern: PostflopPositionPattern;
}

/**
 * Židle postavená z toho, co solve o sedačkách říká - ne vyhledaná podle vzoru.
 *
 * Vyhledání podle vzoru nestačí a bylo aktivně špatně. Každý jednou zvýšený
 * kontext je psaný ze strany toho, kdo zvýšil, takže `SRP_CO_VS_BB` posadí
 * hrdinu na cutoff - jenže tyhle solvy drží rozhodnutí big blindu. Hráč by
 * seděl na cutoffu, v pozici, s iniciativou, a dostával odpovědi hráče naproti.
 *
 * Solve pojmenuje obě sedačky i to, která zvýšila, takže se židle staví z toho.
 * Vyhledání zůstává jako záloha pro spoty, jejichž sedačky se přečíst nedají, a
 * ty se prostě nerozdají.
 */
export function positionContextForSolvedSeats(
  spot: SolvedSeating,
  contexts: readonly PostflopPositionContext[],
): PostflopPositionContext | undefined {
  const hero = seatToPosition(spot.heroSeat);
  const villain = seatToPosition(spot.villainSeat);
  if (!POSITION_ORDER.includes(hero) || !POSITION_ORDER.includes(villain)) {
    return contexts.find((item) => item.positionPattern === spot.positionPattern);
  }
  return {
    heroPosition: hero,
    villainPosition: villain,
    aggressorPosition: spot.heroIsAggressor ? hero : villain,
    callerPosition: spot.heroIsAggressor ? villain : hero,
    inPosition: spot.heroInPosition,
    callerType: spot.heroIsAggressor
      ? (villain === "BB" ? "BIG_BLIND" : "IN_POSITION_CALLER")
      : (hero === "BB" ? "BIG_BLIND" : "OUT_OF_POSITION_CALLER"),
    positionPattern: spot.positionPattern,
  };
}

/**
 * Vyber jeden spot, vážený tím, jak často se na něj doopravdy dojde.
 *
 * `reach` je podíl range, který se do toho uzlu dostane, takže vážením se
 * rozdávají spoty v poměru, v jakém je hráč potkává. Rovnoměrný výběr by strávil
 * stejně času na uzlu, na který se dojde jednou z padesáti, jako na tom, na
 * který jednou ze tří.
 */
export function pickSolvedSpotByReach<T extends { reach: number }>(
  random: number,
  spots: readonly T[],
): T | undefined {
  if (spots.length === 0) return undefined;

  const total = spots.reduce((sum, spot) => sum + Math.max(spot.reach, 0), 0);
  // Samé nuly nedávají čím vážit a rovnoměrný výběr je lepší než nerozdat nic.
  if (total <= 0) return spots[Math.min(Math.floor(random * spots.length), spots.length - 1)];

  let cursor = Math.min(Math.max(random, 0), 0.999999) * total;
  for (const spot of spots) {
    cursor -= Math.max(spot.reach, 0);
    if (cursor < 0) return spot;
  }
  return spots[spots.length - 1];
}
