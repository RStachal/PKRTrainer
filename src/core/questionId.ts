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
}

/**
 * Stabilní ID Spotu z jeho parametrů. Čistá deterministická funkce.
 *
 * Formát: `${context}|${heroPos}|${effStack}|${hand}|${ante}`.
 *
 * @param p Parametry Spotu (kontext, pozice, efektivní stack, ruka, ante).
 * @returns Stabilní Question_ID jako řetězec.
 */
export function questionId(p: QuestionIdParams): string {
  return `${p.context}|${p.heroPos}|${p.effStack}|${p.hand}|${p.ante}`;
}
