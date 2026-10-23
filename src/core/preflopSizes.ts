import type { Position, StackBucket } from "./types";

/**
 * Velikosti sázek, které produkt sám neučí - na jednom místě.
 *
 * ## Proč to má vlastní modul
 *
 * Produkt učí **jednu velikost otevření na hloubku** a dál už nic. Tří-bet a
 * čtyři-bet tedy nemá odkud vzít, a přesto je potřebuje: bez nich se nedá
 * spočítat pot, a bez potu ani cena pěti-betového jamu. Jsou to proto **volby,
 * ne měření**, a mají být vidět na jednom místě, ne rozeseté po výpočtech.
 *
 * Standardní turnajový tvar je zhruba 2,2× v pozici a 3× mimo ni; čtyři-bet
 * o něco menší, protože je sám o sobě velký.
 *
 * Vytaženo z `drillEngine` 28. 8. 2026, když k témuž potřeboval sáhnout i výpočet
 * ceny rozhodnutí. Dvě kopie týchž násobků by znamenaly, že se cena a EV jednou
 * rozejdou o velikost, kterou si každá spočítala jinak - a nikdo by nepoznal
 * proč.
 */

export const THREE_BET_MULTIPLE_IP = 2.2;
export const THREE_BET_MULTIPLE_OOP = 3;
export const FOUR_BET_MULTIPLE = 2.2;

/** Sedačky, které po flopu hrají poslední, a tak tři-betují menší. */
export function isInPositionForThreeBet(heroPos: Position): boolean {
  return heroPos === "BTN" || heroPos === "CO";
}

export interface PreflopRaiseSizes {
  threeBetBB: number;
  fourBetBB: number;
}

/**
 * Tří-bet a čtyři-bet na dané hloubce, zastropované efektivním stackem.
 *
 * Strop není kosmetika. Při 20 BB vyjde tří-bet krát 2,2 na šestnáct blindů a
 * čtyři-bet nad celý stack - to už není velký raise, to je all-in, a pot
 * spočítaný z takového čísla dá jamu cenu vyšší, než kolik je vůbec na stole.
 * Zastropování tu situaci popíše správně: mělký čtyři-bet je fakticky shove.
 */
export function preflopRaiseSizes(
  heroPos: Position,
  effStack: StackBucket | number,
  openBB: number,
): PreflopRaiseSizes {
  const threeBetBB = Math.min(
    effStack,
    openBB * (isInPositionForThreeBet(heroPos) ? THREE_BET_MULTIPLE_IP : THREE_BET_MULTIPLE_OOP),
  );
  return { threeBetBB, fourBetBB: Math.min(effStack, threeBetBB * FOUR_BET_MULTIPLE) };
}
