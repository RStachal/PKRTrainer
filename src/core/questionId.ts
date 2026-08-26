/**
 * Deterministické odvození Question_ID.
 *
 * Question_ID je stabilní identifikátor Spotu odvozený výhradně z jeho
 * parametrů. Funkce je čistá: totožné parametry vždy vedou na shodné ID
 * napříč relacemi i opakovaným spuštěním aplikace, a libovolná změna v
 * některém z parametrů vede na jiné ID.
 *
 * _Requirements: 6.4_
 */

import type { ActionContext, Position, StackBucket, HandLabel, AnteMode } from "./types";

/** Parametry, ze kterých se Question_ID odvozuje. */
export interface QuestionIdParams {
  /** Akční kontext / kategorie tréninku. */
  context: ActionContext;
  /** Pozice hrdiny. */
  heroPos: Position;
  /** Efektivní hloubka v BB (Hloubkový_koš). */
  effStack: StackBucket;
  /** Třída startovní ruky, např. "AKs", "T9o", "77". */
  hand: HandLabel;
  /** Režim ante ("ON" | "OFF"). */
  ante: AnteMode;
  /**
   * Sedačka, která jednala před hrdinou; jen když spot dostal zpřesněnou
   * odpověď. Bez ní se ID nemění.
   */
  vsSeat?: Position;
  /** Rozložení stacků u stolu, pro které odpověď platí. Viz `vsSeat`. */
  stackSetupId?: string;
}

/**
 * Stabilní ID Spotu z jeho parametrů. Čistá deterministická funkce.
 *
 * Formát: `${context}|${heroPos}|${effStack}|${hand}[|vsSEAT][|#SETUP]|${ante}`.
 *
 * ## Proč zpřesnění stojí **před** ante
 *
 * `parseAnteFromQuestionId` čte **poslední** segment a čeká `ON`/`OFF`.
 * Připojit zpřesnění na konec by tichounce rozbilo ante u každého uloženého
 * výsledku - dashboard by přestal rozlišovat ante a nikdo by nepoznal proč.
 * Ante proto zůstává poslední a zpřesnění se vsouvá před něj.
 *
 * ## Proč se ID bez zpřesnění nemění
 *
 * Spot, který zpřesněnou odpověď nedostal, má ID **bajt po bajtu stejné** jako
 * dřív. Uložená historie hráče tím zůstává platná, což je tvrdé pravidlo o
 * migraci: změnit Question_ID plošně by znamenalo, že lidem zmizí statistiky.
 *
 * Nové ID vznikne jen tam, kde odpověď doopravdy závisí na tom, kdo jednal před
 * hrdinou - a tam je to správně jiná otázka, takže si zaslouží jiné ID.
 *
 * @param p Parametry Spotu (kontext, pozice, efektivní stack, ruka, ante).
 * @returns Stabilní Question_ID jako řetězec.
 */
export function questionId(p: QuestionIdParams): string {
  const versus = p.vsSeat ? `|vs${p.vsSeat}` : "";
  const setup = p.stackSetupId ? `|#${p.stackSetupId}` : "";
  return `${p.context}|${p.heroPos}|${p.effStack}|${p.hand}${versus}${setup}|${p.ante}`;
}
