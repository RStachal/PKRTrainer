import { R2V, isPair, isSuited } from "./poker";
import type { Card, HandLabel, Rank } from "./types";

/**
 * Board-aware flop hand classification.
 *
 * This is core poker logic rather than presentation: the same categories drive
 * the range matrix a player sees and the VALUE/BLUFF/CHECK lane recorded in
 * imported solver content. Classifying a hand without the board cannot tell
 * ace-high apart from top pair, so both consumers must share this function.
 */

export type FlopzillaCategory =
  | "SET_PLUS"
  | "MADE_FLUSH"
  | "MADE_STRAIGHT"
  | "TWO_PAIR"
  | "OVERPAIR"
  | "TOP_PAIR"
  | "PAIR"
  | "UNDERPAIR"
  | "FLUSH_DRAW"
  | "OESD"
  | "GUTSHOT"
  | "BACKDOOR_DRAW"
  | "OVERCARDS"
  | "AIR";

export type FlopzillaLane = "VALUE" | "BLUFF" | "CHECK";

/** Categories that are a made hand strong enough to bet for value. */
export const MADE_VALUE_CATEGORIES: readonly FlopzillaCategory[] = [
  "SET_PLUS",
  "MADE_FLUSH",
  "MADE_STRAIGHT",
  "TWO_PAIR",
  "OVERPAIR",
  "TOP_PAIR",
];

interface ParsedHand {
  high: Rank;
  low: Rank;
  pair: boolean;
  suited: boolean;
}

export function classifyFlopHand(
  hand: HandLabel,
  board: readonly Card[],
): FlopzillaCategory {
  const parsed = parseHand(hand);
  const boardRanks = board.map((card) => card.rank);
  const boardValues = boardRanks.map((rank) => R2V[rank]);
  const topBoard = Math.max(...boardValues);
  const handValues = parsed.pair
    ? [R2V[parsed.high], R2V[parsed.high]]
    : [R2V[parsed.high], R2V[parsed.low]];
  // Kolik karet ještě přijde. Na flopu dvě, na turnu jedna, na riveru žádná -
  // a bez toho čísla se draw hlásí i tam, kde už není co dotáhnout.
  const cardsToCome = Math.max(0, 5 - board.length);

  // Barva se testuje **první**, protože bije pár i dva páry. Dokud se testovala
  // až za párováním, vycházela nutová barva jako top pair.
  const flushCategory = flushDrawCategory(parsed, board, cardsToCome);
  if (flushCategory === "MADE_FLUSH") return "MADE_FLUSH";

  if (parsed.pair) {
    const pairValue = R2V[parsed.high];
    if (boardRanks.includes(parsed.high)) return "SET_PLUS";
    if (pairValue > topBoard) return "OVERPAIR";
    if (pairValue < Math.min(...boardValues)) return "UNDERPAIR";
    return "PAIR";
  }

  const highOnBoard = boardRanks.includes(parsed.high);
  const lowOnBoard = boardRanks.includes(parsed.low);
  if (highOnBoard && lowOnBoard) return "TWO_PAIR";
  if (highOnBoard || lowOnBoard) {
    const pairedRank = highOnBoard ? parsed.high : parsed.low;
    if (R2V[pairedRank] === topBoard) return "TOP_PAIR";
    return "PAIR";
  }

  // Postupka se počítá jen tehdy, když ji hrdinovy karty **zlepší**. Draw
  // ležící celý na desce není hrdinův draw; dřív se počítal jemu.
  const boardStraight = straightRank(straightDrawCategory(boardValues));
  const handStraight = straightDrawCategory([...boardValues, ...handValues]);
  const improves = straightRank(handStraight) > boardStraight;
  if (improves && handStraight === "MADE_STRAIGHT") return "MADE_STRAIGHT";

  if (flushCategory === "FLUSH_DRAW") return "FLUSH_DRAW";

  if (cardsToCome > 0 && improves && (handStraight === "OESD" || handStraight === "GUTSHOT")) {
    return handStraight;
  }

  if (parsed.suited && cardsToCome > 0) return "BACKDOOR_DRAW";
  if (handValues.every((value) => value > topBoard)) return "OVERCARDS";
  return "AIR";
}

/** Pořadí síly pro porovnání „zlepšuje to hrdinova ruka?". */
function straightRank(category: "MADE_STRAIGHT" | "OESD" | "GUTSHOT" | null): number {
  if (category === "MADE_STRAIGHT") return 3;
  if (category === "OESD") return 2;
  return category === "GUTSHOT" ? 1 : 0;
}

export function flopzillaLaneForCategory(category: FlopzillaCategory): FlopzillaLane {
  switch (category) {
    case "SET_PLUS":
    case "MADE_FLUSH":
    case "MADE_STRAIGHT":
    case "TWO_PAIR":
    case "OVERPAIR":
    case "TOP_PAIR":
      return "VALUE";
    case "FLUSH_DRAW":
    case "OESD":
    case "GUTSHOT":
    case "BACKDOOR_DRAW":
    case "OVERCARDS":
      return "BLUFF";
    case "PAIR":
    case "UNDERPAIR":
    case "AIR":
      return "CHECK";
  }
}

/**
 * Lane for a hand that the solver actually puts money in with.
 *
 * A betting hand is VALUE only when it is a made hand on that board; anything
 * else that bets is pressure rather than value, which is what BLUFF means here.
 * Weak made hands such as a middle pair therefore bet as a bluff instead of
 * being promoted to value by their rank alone.
 */
export function bettingLaneForHand(
  hand: HandLabel,
  board: readonly Card[],
): Exclude<FlopzillaLane, "CHECK"> {
  return MADE_VALUE_CATEGORIES.includes(classifyFlopHand(hand, board)) ? "VALUE" : "BLUFF";
}

/**
 * Lane for a betting hand across the board set a rule aggregates.
 *
 * A rule can span several flops, so the label must describe the hand's usual
 * role rather than its role on one sampled board. VALUE requires the hand to be
 * made on a strict majority of those boards; otherwise it is a bluff.
 */
export function aggregateBettingLaneForHand(
  hand: HandLabel,
  boards: readonly (readonly Card[])[],
): Exclude<FlopzillaLane, "CHECK"> {
  if (boards.length === 0) return "BLUFF";
  const valueCount = boards.filter((board) => bettingLaneForHand(hand, board) === "VALUE").length;
  return valueCount * 2 > boards.length ? "VALUE" : "BLUFF";
}

function parseHand(hand: HandLabel): ParsedHand {
  const high = hand[0] as Rank;
  const low = hand[1] as Rank;
  return {
    high,
    low,
    pair: isPair(hand),
    suited: isSuited(hand),
  };
}

/**
 * Barva: udělaná, nebo rozehraná.
 *
 * Do 28. 8. 2026 tahle funkce **udělanou barvu neznala** - hledala na desce
 * přesně dvě karty barvy, takže tři a víc vracelo `null` a ruka propadla dál.
 * `AKs` na `Ah 7h 2h` tak vyšlo jako TOP_PAIR a `76s` na téže desce jako PAIR,
 * čímž se **malá barva dostala do blafovací lajny**.
 *
 * Draw se navíc smí hlásit jen tehdy, když je co dotáhnout. Na dokončené desce
 * není `FLUSH_DRAW` neúplná informace, je to nepravda.
 */
function flushDrawCategory(
  hand: ParsedHand,
  board: readonly Card[],
  cardsToCome: number,
): "MADE_FLUSH" | "FLUSH_DRAW" | null {
  if (!hand.suited) return null;
  const suitCounts = new Map<string, number>();
  for (const card of board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }
  const counts = [...suitCounts.values()];
  // Tři karty barvy na desce a obě hrdinovy v ní: třída `76s` si tu barvu vybere.
  if (counts.some((count) => count >= 3)) return "MADE_FLUSH";
  if (cardsToCome > 0 && counts.some((count) => count === 2)) return "FLUSH_DRAW";
  return null;
}

/**
 * Stav postupky pro danou množinu hodnot.
 *
 * Počítá se přes **doplňující karty**, ne přes pozici mezery v okně. Staré
 * pravidlo („chybí na kraji okna ⇒ oboustranka") hlásilo oboustranku i u
 * `A-2-3-4`, jenže pod eso se postupka prodloužit nedá - tam je jediná
 * doplňující karta, tedy vnitřní. Změřeno na `72o` proti `Ah Kh 9c 3d 4s`:
 * vycházelo OESD u ruky, která nemá ani vzdálený draw.
 *
 * Nová definice je ta učebnicová: kolik různých hodnot postupku dokončí.
 * Dvě a víc je oboustranka, jedna je vnitřní, žádná není draw.
 */
function straightDrawCategory(values: readonly number[]): "MADE_STRAIGHT" | "OESD" | "GUTSHOT" | null {
  const valueSet = new Set<number>(values);
  if (valueSet.has(14)) valueSet.add(1);

  const hasStraight = (set: ReadonlySet<number>): boolean => {
    for (let start = 1; start <= 10; start += 1) {
      if ([0, 1, 2, 3, 4].every((offset) => set.has(start + offset))) return true;
    }
    return false;
  };
  if (hasStraight(valueSet)) return "MADE_STRAIGHT";

  let outs = 0;
  for (let rank = 2; rank <= 14; rank += 1) {
    if (valueSet.has(rank)) continue;
    const candidate = new Set(valueSet);
    candidate.add(rank);
    if (rank === 14) candidate.add(1);
    if (hasStraight(candidate)) outs += 1;
  }
  if (outs >= 2) return "OESD";
  return outs === 1 ? "GUTSHOT" : null;
}
