// Generováno příkazem `npm run mtt:strength-order`.
// Needitovat ručně.

import type { HandLabel } from "../../core/types";

/**
 * Startovní ruce seřazené podle equity proti celému balíčku, nejsilnější první.
 *
 * Stejné pořadí, jaké vrací `strengthOrder()`, jen dostupné synchronně.
 */
export const PREFLOP_STRENGTH_ORDER: readonly HandLabel[] = ["AA","KK","QQ","JJ","TT","99","88","AKs","77","AQs","AKo","AJs","AQo","ATs","66","KQs","AJo","KJs","A9s","ATo","KTs","A8s","KQo","55","KJo","A7s","A9o","QJs","K9s","KTo","A8o","QTs","A6s","A5s","A4s","A7o","QJo","K8s","A3s","44","K9o","Q9s","JTs","QTo","A6o","K7s","A5o","A2s","K6s","A4o","Q8s","K8o","J9s","A3o","K5s","Q9o","JTo","K7o","A2o","K4s","33","Q7s","T9s","J8s","K6o","K3s","Q8o","Q6s","J9o","K2s","K5o","Q5s","T8s","J7s","K4o","Q4s","Q7o","T9o","J8o","22","K3o","Q3s","Q6o","98s","T7s","J6s","K2o","Q2s","Q5o","J5s","T8o","J7o","97s","J4s","Q4o","T6s","J3s","98o","Q3o","87s","T7o","J6o","J2s","96s","Q2o","T5s","J5o","T4s","97o","86s","J4o","T6o","T3s","95s","76s","J3o","87o","T2s","85s","96o","J2o","T5o","94s","75s","T4o","93s","86o","65s","84s","T3o","95o","92s","76o","74s","T2o","85o","54s","64s","83s","94o","75o","82s","93o","73s","65o","53s","63s","84o","92o","43s","74o","72s","54o","64o","52s","62s","83o","82o","42s","73o","53o","63o","32s","43o","72o","52o","62o","42o","32o"];
